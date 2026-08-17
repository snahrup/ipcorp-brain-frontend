// Phase 1: action identity, public field rules, and the saved-state secret scan.
//
// The rule the review made mandatory: a follow-up has one permanent lineage, and evidence
// hashes live on revisions rather than in the lineage id. Putting the evidence hash in the
// action id meant a corrected transcript produced a second action instead of a new revision
// of the existing one.

import { createHash } from "node:crypto";

export const ACTION_IDENTITY_SCHEMA_VERSION = 1;

function ordered(value) {
  if (Array.isArray(value)) return value.map((entry) => ordered(entry));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, ordered(value[key])])
  );
}

function stableStringify(value) {
  return JSON.stringify(ordered(value));
}

export function hashValue(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function requiredString(value, label) {
  if (!value || typeof value !== "string") throw new Error(`Action identity ${label} is required.`);
  return value;
}

/**
 * The permanent lineage. Deliberately built from what the follow-up *is*, never from what the
 * evidence currently says. Changing the transcript must not change this value.
 */
export function createActionId(input) {
  const lineage = {
    meetingId: requiredString(input?.meetingId, "meetingId"),
    workClass: requiredString(input?.workClass, "workClass"),
    owner: requiredString(input?.owner, "owner"),
    intent: requiredString(input?.intent, "intent"),
  };
  return `act-${hashValue(lineage).slice(0, 32)}`;
}

/**
 * One revision of an action: the exact evidence and the exact payload it produced.
 */
export function createActionRevision(input) {
  const actionId = createActionId(input);
  const evidenceHash = hashValue(input?.evidence ?? {});
  const payloadHash = hashValue(input?.payload ?? {});
  return {
    schemaVersion: ACTION_IDENTITY_SCHEMA_VERSION,
    actionId,
    actionRevisionId: `rev-${hashValue({ actionId, evidenceHash, payloadHash }).slice(0, 32)}`,
    evidenceHash,
    payloadHash,
    meetingId: input.meetingId,
    workClass: input.workClass,
    owner: input.owner,
    intent: input.intent,
  };
}

export function matchActionLineage(left, right) {
  if (!left?.actionId || !right?.actionId) return false;
  return left.actionId === right.actionId;
}

/**
 * One approved destination operation for one revision. Also serves as the repeat-suppression
 * key, because the same revision asking the same destination for the same operation is the
 * same request.
 */
export function createEffectId(input) {
  return `eff-${hashValue({
    actionRevisionId: requiredString(input?.actionRevisionId, "actionRevisionId"),
    destination: requiredString(input?.destination, "destination"),
    operation: requiredString(input?.operation, "operation"),
  }).slice(0, 32)}`;
}

export function createEffectAttemptId(input) {
  return `att-${hashValue({
    effectId: requiredString(input?.effectId, "effectId"),
    attempt: Number(input?.attempt || 1),
    owner: input?.owner || null,
  }).slice(0, 24)}`;
}

/**
 * A page or event model may only carry fields that were explicitly approved. An unapproved
 * field is named and refused rather than quietly dropped, so a new field cannot reach the
 * browser because nobody noticed it.
 */
export function buildPublicModel({ allow, record }) {
  if (!Array.isArray(allow) || allow.length === 0) {
    throw new Error("A public model needs an explicit allowlist.");
  }
  const approved = new Set(allow);
  const rejected = Object.keys(record || {}).filter((key) => !approved.has(key));
  if (rejected.length) {
    throw new Error(
      `Public model refused fields that are not on its allowlist: ${rejected.join(", ")}.`
    );
  }
  const model = {};
  for (const key of allow) {
    if (Object.hasOwn(record || {}, key)) model[key] = record[key];
  }
  return { model, allow: [...approved] };
}

const SECRET_PATTERNS = Object.freeze([
  { name: "atlassian-token", pattern: /ATATT[A-Za-z0-9_\-=]{10,}/ },
  { name: "openai-key", pattern: /\bsk-[A-Za-z0-9]{20,}/ },
  { name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "bearer-token", pattern: /\bBearer\s+[A-Za-z0-9_\-.]{20,}/i },
  { name: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "private-key-block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "inline-password", pattern: /\b(?:password|passwd|pwd)\s*[:=]\s*\S{6,}/i },
]);

/**
 * Walks any saved record or page payload looking for credential material. Fails closed: a
 * finding reports where it was seen and which pattern matched, and never echoes the secret.
 */
export function scanForSecrets(value, path = "$") {
  const findings = [];

  const seen = new WeakSet();

  const walk = (node, at) => {
    if (typeof node === "string") {
      for (const { name, pattern } of SECRET_PATTERNS) {
        if (pattern.test(node)) findings.push({ path: at, pattern: name });
      }
      return;
    }
    if (node === null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);

    // A Buffer survives structuredClone and serializes as its bytes, so credential material
    // stored in one reaches the browser just as readably as a string would.
    if (ArrayBuffer.isView(node) || node instanceof ArrayBuffer) {
      walk(Buffer.from(node instanceof ArrayBuffer ? node : node.buffer).toString("utf8"), at);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((entry, index) => {
        walk(entry, `${at}[${index}]`);
      });
      return;
    }
    if (node instanceof Map) {
      for (const [key, entry] of node.entries()) {
        walk(String(key), `${at}.<key>`);
        walk(entry, `${at}.${String(key)}`);
      }
      return;
    }
    if (node instanceof Set) {
      let index = 0;
      for (const entry of node.values()) {
        walk(entry, `${at}[${index}]`);
        index += 1;
      }
      return;
    }
    for (const [key, entry] of Object.entries(node)) {
      // A key can hold the secret just as easily as a value.
      walk(key, `${at}.<key>`);
      walk(entry, `${at}.${key}`);
    }
  };

  walk(value, path);
  return { ok: findings.length === 0, findings };
}
