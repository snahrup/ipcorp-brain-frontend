import { createHash } from "node:crypto";

import {
  auditWeeklyEffort,
  classifyEvidenceEligibility,
  MDM_PROJECT_KEY,
  mondayOf,
  normalizeEvidenceRefs,
  POLICY_VERSION,
  validateJiraNarrative,
  validateLink,
  validateSubtask,
} from "./policy.mjs";

export const LEDGER_SCHEMA_VERSION = "1.0.0";
export const LEDGER_SCOPE = Object.freeze({
  projectKey: MDM_PROJECT_KEY,
  initiative: "MDM",
});

export const OPERATION_KIND = Object.freeze({
  ISSUE_CREATE: "issue.create",
  ISSUE_UPDATE: "issue.update",
  COMMENT_CREATE: "comment.create",
  WORKLOG_CREATE: "worklog.create",
  WORKLOG_UPDATE: "worklog.update",
  WORKLOG_DELETE: "worklog.delete",
  ISSUE_LINK_CREATE: "issue-link.create",
  ISSUE_LINK_DELETE: "issue-link.delete",
  WATCHER_ADD: "watcher.add",
  ISSUE_TRANSITION: "issue.transition",
  ISSUE_VERIFY: "issue.verify",
});

export const OPERATION_KINDS = Object.freeze(Object.values(OPERATION_KIND));
export const OPERATION_STATES = Object.freeze([
  "pending",
  "running",
  "succeeded",
  "failed",
  "blocked",
  "skipped",
]);

export const ASSERTION_OPERATORS = Object.freeze(["equals", "deepEquals", "contains", "absent"]);

export const ALLOWED_STATUS_TRANSITIONS = Object.freeze({
  Backlog: Object.freeze(["Research / Discovery", "Planning", "Cancelled"]),
  "Research / Discovery": Object.freeze(["Planning", "In Progress", "Backlog", "Cancelled"]),
  Planning: Object.freeze(["In Progress", "Backlog", "Cancelled"]),
  "In Progress": Object.freeze(["In Review", "Blocked", "Done", "Cancelled"]),
  "In Review": Object.freeze(["In Progress", "Blocked", "Done", "Cancelled"]),
  Blocked: Object.freeze(["In Progress", "Backlog", "Cancelled"]),
  Done: Object.freeze([]),
  Cancelled: Object.freeze([]),
});

const MUTATION_KINDS = new Set(
  OPERATION_KINDS.filter(
    (kind) => ![OPERATION_KIND.ISSUE_TRANSITION, OPERATION_KIND.ISSUE_VERIFY].includes(kind)
  )
);

const RESUMABLE_STATE_TRANSITIONS = Object.freeze({
  pending: Object.freeze(["running", "blocked", "skipped"]),
  running: Object.freeze(["succeeded", "failed", "pending", "skipped"]),
  failed: Object.freeze(["pending", "blocked", "skipped"]),
  blocked: Object.freeze(["pending", "skipped"]),
  succeeded: Object.freeze([]),
  skipped: Object.freeze([]),
});

const ISSUE_REF_PATTERN = /^(?:MT-\d+|NEW:[A-Za-z0-9._-]+)$/;
const EXISTING_ISSUE_PATTERN = /^MT-\d+$/;
const NEW_ISSUE_PATTERN = /^NEW:[A-Za-z0-9._-]+$/;

export class LedgerValidationError extends Error {
  constructor(errors) {
    super(`Operation ledger is invalid:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    this.name = "LedgerValidationError";
    this.errors = [...errors];
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Deterministic JSON-compatible canonicalization. Object keys are sorted,
 * array order is retained, undefined object properties are omitted, and Date
 * values are converted to ISO strings. The function never mutates its input.
 */
export function canonicalize(value, inArray = false) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Canonical values cannot contain non-finite numbers.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "undefined") return inArray ? null : undefined;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime()))
      throw new TypeError("Canonical values cannot contain invalid dates.");
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry, true));
  }
  if (!isPlainObject(value)) {
    throw new TypeError("Canonical values must be JSON-compatible plain objects.");
  }

  const result = {};
  for (const key of Object.keys(value).sort()) {
    const normalized = canonicalize(value[key], false);
    if (normalized !== undefined) result[key] = normalized;
  }
  return result;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function digest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function stableToken(prefix, value, length = 24) {
  return `${prefix}_${digest(value).slice(0, length)}`;
}

export function createStableRunId({
  sourceSnapshotId,
  runKey = "default",
  scope = LEDGER_SCOPE,
  schemaVersion = LEDGER_SCHEMA_VERSION,
  policyVersion = POLICY_VERSION,
}) {
  if (!String(sourceSnapshotId || "").trim()) {
    throw new TypeError("sourceSnapshotId is required to derive a stable run ID.");
  }
  return stableToken("mdmrun", {
    schemaVersion,
    policyVersion,
    scope,
    sourceSnapshotId: String(sourceSnapshotId).trim(),
    runKey: String(runKey || "default").trim(),
  });
}

function operationIdentity(operation) {
  return {
    scope: LEDGER_SCOPE,
    kind: operation.kind,
    groupId: operation.groupId,
    parentGroupId: operation.parentGroupId || null,
    target: operation.target || null,
    effect: operation.effect,
  };
}

export function createStableIdempotencyKey(operation) {
  return stableToken("mdmopkey", operationIdentity(operation), 32);
}

export function createStableOperationId(runId, operation) {
  if (!String(runId || "").trim()) throw new TypeError("runId is required.");
  return stableToken("mdmop", {
    runId,
    idempotencyKey: createStableIdempotencyKey(operation),
  });
}

export function computePreviewHash(ledgerOrOperations) {
  const operations = Array.isArray(ledgerOrOperations)
    ? ledgerOrOperations
    : ledgerOrOperations?.operations;
  const effects = (Array.isArray(operations) ? operations : [])
    .map((operation) => ({
      kind: operation.kind,
      target: operation.target || null,
      effect: operation.effect,
    }))
    .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  return `sha256:${digest({ scope: LEDGER_SCOPE, effects })}`;
}

function immutableOperation(operation) {
  return {
    id: operation.id,
    idempotencyKey: operation.idempotencyKey,
    kind: operation.kind,
    groupId: operation.groupId,
    parentGroupId: operation.parentGroupId || null,
    target: operation.target || null,
    sourceScope: operation.sourceScope,
    evidenceRefs: operation.evidenceRefs,
    effect: operation.effect,
    preconditions: operation.preconditions,
    verification: operation.verification,
    dependsOn: operation.dependsOn,
  };
}

export function computeLedgerIntegrityHash(ledger) {
  return `sha256:${digest({
    schemaVersion: ledger?.schemaVersion,
    policyVersion: ledger?.policyVersion,
    scope: ledger?.scope,
    run: {
      id: ledger?.run?.id,
      sourceSnapshotId: ledger?.run?.sourceSnapshotId,
      runKey: ledger?.run?.runKey,
    },
    preview: ledger?.preview,
    evidenceSources: ledger?.evidenceSources,
    weeklySettlements: ledger?.weeklySettlements,
    operations: (ledger?.operations || []).map(immutableOperation),
  })}`;
}

function normalizeState(state) {
  return {
    status: state?.status || "pending",
    attempts: Number.isInteger(state?.attempts) && state.attempts >= 0 ? state.attempts : 0,
    updatedAt: state?.updatedAt || null,
    retryable: state?.retryable !== false,
    ...(state?.result === undefined ? {} : { result: canonicalize(state.result) }),
    ...(state?.error === undefined ? {} : { error: canonicalize(state.error) }),
  };
}

function normalizeAssertion(assertion) {
  return canonicalize({
    path: assertion?.path,
    operator: assertion?.operator,
    expected: assertion?.expected,
  });
}

function normalizeEvidenceSource(source) {
  return canonicalize({
    ref: String(source?.ref || "").trim(),
    recordId: String(source?.recordId || "").trim(),
    provider: String(source?.provider || "").trim(),
    sourceRef: String(source?.sourceRef || "").trim(),
    workspace: String(source?.workspace || "").trim(),
    title: String(source?.title || "").trim(),
    text: String(source?.text || source?.visibleText || "").trim(),
    contentHash: String(source?.contentHash || "").trim(),
    eventAt: source?.eventAt || null,
    capturedAt: source?.capturedAt || null,
    sourceScope: source?.sourceScope || "engagement",
    evidenceEligible: source?.evidenceEligible !== false,
  });
}

function normalizeWeeklySettlement(settlement) {
  return canonicalize({
    weekOf: settlement?.weekOf,
    status: settlement?.status || "settled",
    expectedTotalHours: settlement?.expectedTotalHours,
    worklogs: (Array.isArray(settlement?.worklogs) ? settlement.worklogs : []).map((worklog) => ({
      id: worklog?.id,
      issueRef: worklog?.issueRef,
      started: worklog?.started,
      hours: worklog?.hours,
      evidenceRefs: normalizeEvidenceRefs(worklog?.evidenceRefs).sort(),
    })),
  });
}

function normalizeOperation(raw, runId) {
  const operation = canonicalize({
    id: raw?.id,
    idempotencyKey: raw?.idempotencyKey,
    kind: raw?.kind,
    groupId: raw?.groupId,
    parentGroupId: raw?.parentGroupId || null,
    target: raw?.target || null,
    sourceScope: raw?.sourceScope || "engagement",
    evidenceRefs: normalizeEvidenceRefs(raw?.evidenceRefs).sort(),
    effect: raw?.effect || {},
    preconditions: raw?.preconditions || {},
    verification: {
      mode: raw?.verification?.mode,
      assertions: (raw?.verification?.assertions || []).map(normalizeAssertion),
    },
    dependsOn: normalizeEvidenceRefs(raw?.dependsOn).sort(),
    state: normalizeState(raw?.state),
  });
  operation.idempotencyKey =
    String(raw?.idempotencyKey || "").trim() || createStableIdempotencyKey(operation);
  operation.id = String(raw?.id || "").trim() || createStableOperationId(runId, operation);
  return operation;
}

function referencedIssueRefs(operation) {
  const refs = [];
  if (operation.kind === OPERATION_KIND.ISSUE_CREATE) {
    refs.push(operation.effect?.issueRef);
    if (operation.effect?.parentRef) refs.push(operation.effect.parentRef);
  } else if (
    [OPERATION_KIND.ISSUE_LINK_CREATE, OPERATION_KIND.ISSUE_LINK_DELETE].includes(operation.kind)
  ) {
    refs.push(operation.effect?.fromRef, operation.effect?.toRef);
  } else {
    refs.push(operation.target?.issueRef);
  }
  return normalizeEvidenceRefs(refs);
}

function addDependency(operation, operationId) {
  if (!operationId || operationId === operation.id) return;
  operation.dependsOn = normalizeEvidenceRefs([...(operation.dependsOn || []), operationId]).sort();
}

function enrichPreconditionsAndDependencies(operations) {
  const creators = new Map();
  for (const operation of operations) {
    if (operation.kind !== OPERATION_KIND.ISSUE_CREATE) continue;
    const issueRef = operation.effect?.issueRef;
    if (NEW_ISSUE_PATTERN.test(issueRef || "")) creators.set(issueRef, operation.id);
  }

  for (const operation of operations) {
    const existing = Array.isArray(operation.preconditions?.issues)
      ? operation.preconditions.issues
      : [];
    const byRef = new Map(existing.map((entry) => [entry?.issueRef, canonicalize(entry)]));

    for (const issueRef of referencedIssueRefs(operation)) {
      if (!ISSUE_REF_PATTERN.test(issueRef)) continue;
      const isOwnCreate =
        operation.kind === OPERATION_KIND.ISSUE_CREATE && operation.effect?.issueRef === issueRef;
      if (isOwnCreate) {
        byRef.set(issueRef, {
          ...(byRef.get(issueRef) || {}),
          issueRef,
          exists: false,
        });
        continue;
      }
      if (NEW_ISSUE_PATTERN.test(issueRef)) {
        const creatorId = creators.get(issueRef);
        if (creatorId) {
          byRef.set(issueRef, {
            ...(byRef.get(issueRef) || {}),
            issueRef,
            createdByOperationId: creatorId,
          });
          addDependency(operation, creatorId);
        }
      }
    }
    operation.preconditions = canonicalize({
      ...operation.preconditions,
      issues: Array.from(byRef.values()).sort((left, right) =>
        String(left.issueRef).localeCompare(String(right.issueRef))
      ),
    });
  }
}

function addGroupDependencies(operations) {
  const groups = new Map();
  for (const operation of operations) {
    const group = groups.get(operation.groupId) || [];
    group.push(operation);
    groups.set(operation.groupId, group);
  }

  for (const [groupId, group] of groups) {
    const parentGroupId = group.find((operation) => operation.parentGroupId)?.parentGroupId;
    if (parentGroupId) {
      const parent = groups.get(parentGroupId) || [];
      const parentAnchor =
        parent.find((operation) => operation.kind === OPERATION_KIND.ISSUE_CREATE) ||
        parent.find((operation) => MUTATION_KINDS.has(operation.kind)) ||
        parent[0];
      for (const operation of group) addDependency(operation, parentAnchor?.id);
    }

    const mutations = group.filter((operation) => MUTATION_KINDS.has(operation.kind));
    const transitions = group
      .filter((operation) => operation.kind === OPERATION_KIND.ISSUE_TRANSITION)
      .sort(
        (left, right) =>
          Number(left.effect?.sequence || 0) - Number(right.effect?.sequence || 0) ||
          left.id.localeCompare(right.id)
      );
    const verifications = group.filter(
      (operation) => operation.kind === OPERATION_KIND.ISSUE_VERIFY
    );

    for (const transition of transitions) {
      for (const mutation of mutations) addDependency(transition, mutation.id);
    }
    for (let index = 1; index < transitions.length; index += 1) {
      addDependency(transitions[index], transitions[index - 1].id);
    }
    for (const verification of verifications) {
      for (const operation of group) addDependency(verification, operation.id);
    }

    const create = group.find((operation) => operation.kind === OPERATION_KIND.ISSUE_CREATE);
    if (create) {
      for (const operation of group) {
        if (operation !== create) addDependency(operation, create.id);
      }
    }

    groups.set(groupId, group);
  }
}

function phaseRank(operation) {
  if (operation.kind === OPERATION_KIND.ISSUE_CREATE) return 10;
  if (MUTATION_KINDS.has(operation.kind)) return 20;
  if (operation.kind === OPERATION_KIND.ISSUE_TRANSITION) {
    return 40 + Number(operation.effect?.sequence || 0);
  }
  if (operation.kind === OPERATION_KIND.ISSUE_VERIFY) return 1000;
  return 500;
}

function compareReady(left, right) {
  return (
    phaseRank(left) - phaseRank(right) ||
    String(left.groupId).localeCompare(String(right.groupId)) ||
    left.id.localeCompare(right.id)
  );
}

export function orderOperations(operations) {
  const normalized = (Array.isArray(operations) ? operations : []).map((operation) =>
    canonicalize(operation)
  );
  const seenIds = new Set();
  for (const operation of normalized) {
    if (seenIds.has(operation.id)) {
      throw new LedgerValidationError([`Duplicate operation ID: ${operation.id}.`]);
    }
    seenIds.add(operation.id);
  }
  const byId = new Map(normalized.map((operation) => [operation.id, operation]));
  const remaining = new Map(
    normalized.map((operation) => [operation.id, new Set(operation.dependsOn)])
  );
  const ordered = [];

  while (remaining.size) {
    const ready = Array.from(remaining.entries())
      .filter(([, dependencies]) =>
        Array.from(dependencies).every((dependency) => !remaining.has(dependency))
      )
      .map(([id]) => byId.get(id))
      .sort(compareReady);
    if (!ready.length) {
      throw new LedgerValidationError([
        `Dependency cycle prevents ordering: ${Array.from(remaining.keys()).sort().join(", ")}.`,
      ]);
    }
    for (const operation of ready) {
      ordered.push(operation);
      remaining.delete(operation.id);
    }
  }
  return ordered;
}

function stableExpectedOperationId(runId, operation) {
  return createStableOperationId(runId, operation);
}

function validateRequiredEvidence(ledger, errors) {
  const sourceByRef = new Map();
  for (const source of ledger.evidenceSources || []) {
    if (!source.ref) {
      errors.push("Evidence source is missing ref.");
      continue;
    }
    if (sourceByRef.has(source.ref)) errors.push(`Duplicate evidence source ref: ${source.ref}.`);
    sourceByRef.set(source.ref, source);
    if (!source.provider || !source.sourceRef) {
      errors.push(`Evidence source ${source.ref} requires provider and sourceRef.`);
    }
    const normalizedSource = {
      ...source,
      sourceRef: String(source.sourceRef || "").replaceAll("/", "\\"),
    };
    const eligibility = classifyEvidenceEligibility(normalizedSource);
    if (
      source.sourceScope !== "engagement" ||
      source.evidenceEligible === false ||
      !eligibility.eligible
    ) {
      errors.push(
        `Evidence source ${source.ref} is ${eligibility.reason || source.sourceScope} and cannot support MT work.`
      );
    }
  }

  const validateRefs = (refs, label) => {
    const normalized = normalizeEvidenceRefs(refs);
    if (!normalized.length) errors.push(`${label} requires evidence references.`);
    for (const ref of normalized) {
      if (!sourceByRef.has(ref)) errors.push(`${label} references missing evidence source ${ref}.`);
    }
  };

  for (const operation of ledger.operations || []) {
    validateRefs(operation.evidenceRefs, `Operation ${operation.id || "<missing-id>"}`);
  }
  for (const settlement of ledger.weeklySettlements || []) {
    for (const worklog of settlement.worklogs || []) {
      validateRefs(worklog.evidenceRefs, `Settled worklog ${worklog.id || "<missing-id>"}`);
    }
  }
}

function validateIssueRef(issueRef, label, errors) {
  if (!ISSUE_REF_PATTERN.test(String(issueRef || ""))) {
    errors.push(`${label} must be an MT issue or stable NEW reference.`);
  }
}

function validateIssuePreconditions(operation, operationById, errors) {
  const issuePreconditions = Array.isArray(operation.preconditions?.issues)
    ? operation.preconditions.issues
    : [];
  const byRef = new Map(issuePreconditions.map((entry) => [entry?.issueRef, entry]));

  for (const issueRef of referencedIssueRefs(operation)) {
    validateIssueRef(issueRef, `Operation ${operation.id} issue reference`, errors);
    const precondition = byRef.get(issueRef);
    if (!precondition) {
      errors.push(`Operation ${operation.id} is missing a precondition for ${issueRef}.`);
      continue;
    }
    const ownCreate =
      operation.kind === OPERATION_KIND.ISSUE_CREATE && operation.effect?.issueRef === issueRef;
    if (ownCreate) {
      if (precondition.exists !== false) {
        errors.push(`Issue create ${operation.id} must assert ${issueRef} is absent.`);
      }
      continue;
    }
    if (EXISTING_ISSUE_PATTERN.test(issueRef)) {
      if (precondition.exists !== true) {
        errors.push(`Operation ${operation.id} must assert existing issue ${issueRef} exists.`);
      }
      const versionExplicitlyUnavailable = precondition.expectedJiraVersionUnavailable === true;
      if (
        !versionExplicitlyUnavailable &&
        (!Number.isInteger(precondition.expectedJiraVersion) ||
          precondition.expectedJiraVersion < 1)
      ) {
        errors.push(
          `Operation ${operation.id} requires a positive expected Jira version for ${issueRef}, or expectedJiraVersionUnavailable: true when Jira does not expose one.`
        );
      }
    } else {
      const creator = operationById.get(precondition.createdByOperationId);
      if (
        !creator ||
        creator.kind !== OPERATION_KIND.ISSUE_CREATE ||
        creator.effect?.issueRef !== issueRef
      ) {
        errors.push(
          `Operation ${operation.id} must resolve ${issueRef} through its issue.create operation.`
        );
      } else if (!operation.dependsOn.includes(creator.id)) {
        errors.push(`Operation ${operation.id} must depend on creator ${creator.id}.`);
      }
    }
  }
}

function validateAssertions(operation, errors) {
  const verification = operation.verification;
  const assertions = Array.isArray(verification?.assertions) ? verification.assertions : [];
  const expectedMode = operation.kind === OPERATION_KIND.ISSUE_VERIFY ? "full" : "effect";
  if (verification?.mode !== expectedMode) {
    errors.push(`Operation ${operation.id} verification mode must be ${expectedMode}.`);
  }
  if (!assertions.length) {
    errors.push(`Operation ${operation.id} requires exact verification assertions.`);
    return;
  }
  const paths = new Set();
  for (const assertion of assertions) {
    if (!String(assertion?.path || "").trim()) {
      errors.push(`Operation ${operation.id} has a verification assertion without a path.`);
    } else if (paths.has(assertion.path)) {
      errors.push(`Operation ${operation.id} repeats verification path ${assertion.path}.`);
    }
    paths.add(assertion?.path);
    if (!ASSERTION_OPERATORS.includes(assertion?.operator)) {
      errors.push(
        `Operation ${operation.id} uses unsupported assertion operator ${assertion?.operator || "missing"}.`
      );
    }
    if (assertion?.operator !== "absent" && !Object.hasOwn(assertion || {}, "expected")) {
      errors.push(
        `Operation ${operation.id} assertion ${assertion?.path || "<missing-path>"} requires an exact expected value.`
      );
    }
    if (operation.kind === OPERATION_KIND.ISSUE_VERIFY && assertion?.operator === "contains") {
      errors.push(`Full verification ${operation.id} cannot use a partial contains assertion.`);
    }
  }
}

function validateState(operation, errors) {
  const state = operation.state;
  if (!OPERATION_STATES.includes(state?.status)) {
    errors.push(`Operation ${operation.id} has unsupported state ${state?.status || "missing"}.`);
  }
  if (!Number.isInteger(state?.attempts) || state.attempts < 0) {
    errors.push(`Operation ${operation.id} state attempts must be a non-negative integer.`);
  }
  if (state?.status === "succeeded" && state?.result?.verificationStatus !== "passed") {
    errors.push(`Succeeded operation ${operation.id} requires a passed verification result.`);
  }
  if (state?.status === "failed" && !state?.error) {
    errors.push(`Failed operation ${operation.id} requires error details.`);
  }
  if (
    state?.status === "skipped" &&
    (state?.result?.verificationStatus !== "passed" ||
      !String(state?.result?.skipReason || "").trim())
  ) {
    errors.push(
      `Skipped operation ${operation.id} requires passed verification and an explicit skip reason.`
    );
  }
}

function validateIssueFields(fields, label, errors) {
  const required = [
    "summary",
    "descriptionText",
    "startDate",
    "dueDate",
    "priority",
    "assigneeAccountId",
    "originalEstimate",
    "remainingEstimate",
  ];
  for (const field of required) {
    if (!String(fields?.[field] || "").trim()) errors.push(`${label} is missing ${field}.`);
  }
  if (!Array.isArray(fields?.labels) || fields.labels.length < 2) {
    errors.push(`${label} requires at least two labels.`);
  }
  errors.push(...validateJiraNarrative(fields?.descriptionText, `${label} description`));
}

function validateOperationEffect(operation, errors) {
  const effect = operation.effect || {};
  const targetRef = operation.target?.issueRef;
  switch (operation.kind) {
    case OPERATION_KIND.ISSUE_CREATE:
      if (!NEW_ISSUE_PATTERN.test(effect.issueRef || "")) {
        errors.push(`Issue create ${operation.id} requires a stable NEW issueRef.`);
      }
      if (!["Epic", "Task", "Subtask"].includes(effect.issueType)) {
        errors.push(`Issue create ${operation.id} has unsupported issueType.`);
      }
      validateIssueFields(effect.fields, `Issue create ${operation.id}`, errors);
      if (effect.issueType === "Subtask" && !effect.parentRef) {
        errors.push(`Subtask create ${operation.id} requires parentRef.`);
      }
      break;
    case OPERATION_KIND.ISSUE_UPDATE:
      validateIssueRef(targetRef, `Issue update ${operation.id} target`, errors);
      if (!isPlainObject(effect.fields) || !Object.keys(effect.fields).length) {
        errors.push(`Issue update ${operation.id} requires explicit changed fields.`);
      }
      if (
        !isPlainObject(operation.preconditions?.expectedFields) ||
        !Object.keys(operation.preconditions.expectedFields).length
      ) {
        errors.push(`Issue update ${operation.id} requires exact existing field preconditions.`);
      }
      if (effect.fields?.descriptionText) {
        errors.push(
          ...validateJiraNarrative(
            effect.fields.descriptionText,
            `Issue update ${operation.id} description`
          )
        );
      }
      break;
    case OPERATION_KIND.COMMENT_CREATE:
      validateIssueRef(targetRef, `Comment ${operation.id} target`, errors);
      if (!String(effect.body || "").trim()) errors.push(`Comment ${operation.id} requires body.`);
      errors.push(...validateJiraNarrative(effect.body, `Comment ${operation.id}`));
      if (operation.preconditions?.commentAbsentByIdempotencyKey !== true) {
        errors.push(`Comment ${operation.id} must assert idempotent absence.`);
      }
      break;
    case OPERATION_KIND.WORKLOG_CREATE:
    case OPERATION_KIND.WORKLOG_UPDATE:
      validateIssueRef(targetRef, `Worklog ${operation.id} target`, errors);
      if (
        operation.kind === OPERATION_KIND.WORKLOG_UPDATE &&
        !String(effect.worklogId || "").trim()
      ) {
        errors.push(`Worklog update ${operation.id} requires worklogId.`);
      }
      if (!String(effect.started || "").trim())
        errors.push(`Worklog ${operation.id} requires started.`);
      if (!Number.isInteger(effect.timeSpentSeconds) || effect.timeSpentSeconds <= 0) {
        errors.push(`Worklog ${operation.id} requires positive integer timeSpentSeconds.`);
      }
      if (!String(effect.comment || "").trim())
        errors.push(`Worklog ${operation.id} requires comment.`);
      errors.push(...validateJiraNarrative(effect.comment, `Worklog ${operation.id}`));
      if (
        operation.kind === OPERATION_KIND.WORKLOG_CREATE &&
        operation.preconditions?.worklogAbsentByIdempotencyKey !== true
      ) {
        errors.push(`Worklog create ${operation.id} must assert idempotent absence.`);
      }
      if (
        operation.kind === OPERATION_KIND.WORKLOG_UPDATE &&
        (operation.preconditions?.worklog?.exists !== true ||
          !isPlainObject(operation.preconditions?.worklog?.expected) ||
          !Object.keys(operation.preconditions.worklog.expected).length)
      ) {
        errors.push(
          `Worklog update ${operation.id} must assert the worklog exists with exact previous values.`
        );
      }
      break;
    case OPERATION_KIND.WORKLOG_DELETE:
      validateIssueRef(targetRef, `Worklog delete ${operation.id} target`, errors);
      if (!String(effect.worklogId || "").trim()) {
        errors.push(`Worklog delete ${operation.id} requires worklogId.`);
      }
      if (!isPlainObject(effect.previous) || !Object.keys(effect.previous).length) {
        errors.push(`Worklog delete ${operation.id} requires the exact previous value.`);
      }
      if (
        operation.preconditions?.worklog?.exists !== true ||
        !isPlainObject(operation.preconditions?.worklog?.expected) ||
        !Object.keys(operation.preconditions.worklog.expected).length
      ) {
        errors.push(
          `Worklog delete ${operation.id} must assert the worklog exists with exact previous values.`
        );
      }
      break;
    case OPERATION_KIND.ISSUE_LINK_CREATE:
    case OPERATION_KIND.ISSUE_LINK_DELETE: {
      const linkErrors = validateLink({
        type: effect.type,
        from: effect.fromRef,
        to: effect.toRef,
        evidenceRefs: operation.evidenceRefs,
      });
      errors.push(...linkErrors.map((error) => `Operation ${operation.id}: ${error}`));
      if (
        operation.kind === OPERATION_KIND.ISSUE_LINK_CREATE &&
        operation.preconditions?.linkAbsent !== true
      ) {
        errors.push(`Link create ${operation.id} must assert the link is absent.`);
      }
      if (
        operation.kind === OPERATION_KIND.ISSUE_LINK_DELETE &&
        (!String(effect.linkId || "").trim() ||
          operation.preconditions?.link?.exists !== true ||
          !isPlainObject(operation.preconditions?.link?.expected) ||
          !Object.keys(operation.preconditions.link.expected).length)
      ) {
        errors.push(
          `Link delete ${operation.id} requires linkId and exact existing-link preconditions.`
        );
      }
      break;
    }
    case OPERATION_KIND.WATCHER_ADD:
      validateIssueRef(targetRef, `Watcher ${operation.id} target`, errors);
      if (!String(effect.accountId || "").trim()) {
        errors.push(`Watcher add ${operation.id} requires accountId.`);
      }
      if (operation.preconditions?.watcherAbsent !== true) {
        errors.push(`Watcher add ${operation.id} must assert the watcher is absent.`);
      }
      break;
    case OPERATION_KIND.ISSUE_TRANSITION: {
      validateIssueRef(targetRef, `Transition ${operation.id} target`, errors);
      const allowed = ALLOWED_STATUS_TRANSITIONS[effect.fromStatus] || [];
      if (!allowed.includes(effect.toStatus)) {
        errors.push(
          `Unsupported Jira transition for ${operation.id}: ${effect.fromStatus || "missing"} -> ${effect.toStatus || "missing"}.`
        );
      }
      if (!Number.isInteger(effect.sequence) || effect.sequence < 1) {
        errors.push(`Transition ${operation.id} requires a positive sequence.`);
      }
      if (operation.preconditions?.expectedStatus !== effect.fromStatus) {
        errors.push(`Transition ${operation.id} must assert its exact fromStatus.`);
      }
      const statusAssertion = operation.verification?.assertions?.find(
        (assertion) => assertion.path === "fields.status.name"
      );
      if (statusAssertion?.operator !== "equals" || statusAssertion?.expected !== effect.toStatus) {
        errors.push(`Transition ${operation.id} must verify the exact destination status.`);
      }
      break;
    }
    case OPERATION_KIND.ISSUE_VERIFY:
      validateIssueRef(targetRef, `Full verify ${operation.id} target`, errors);
      if (!isPlainObject(effect.expectedIssue) || !Object.keys(effect.expectedIssue).length) {
        errors.push(`Full verify ${operation.id} requires expectedIssue.`);
      } else {
        for (const [path, expected] of Object.entries(effect.expectedIssue)) {
          const matchingAssertion = operation.verification?.assertions?.find(
            (assertion) => assertion.path === path
          );
          if (
            !matchingAssertion ||
            !["equals", "deepEquals"].includes(matchingAssertion.operator) ||
            canonicalJson(matchingAssertion.expected) !== canonicalJson(expected)
          ) {
            errors.push(
              `Full verify ${operation.id} must assert the exact expected value for ${path}.`
            );
          }
        }
      }
      break;
    default:
      errors.push(`Unsupported operation kind: ${operation.kind || "missing"}.`);
  }
}

function validateTransitionsByGroup(operations, errors) {
  const groups = new Map();
  for (const operation of operations) {
    const group = groups.get(operation.groupId) || [];
    group.push(operation);
    groups.set(operation.groupId, group);
  }
  for (const [groupId, group] of groups) {
    const transitions = group
      .filter((operation) => operation.kind === OPERATION_KIND.ISSUE_TRANSITION)
      .sort((left, right) => left.effect.sequence - right.effect.sequence);
    const seen = new Set();
    if (transitions.length && transitions[0].effect.sequence !== 1) {
      errors.push(`Group ${groupId} transition sequence must start at 1.`);
    }
    for (let index = 0; index < transitions.length; index += 1) {
      const transition = transitions[index];
      if (seen.has(transition.effect.sequence)) {
        errors.push(`Group ${groupId} repeats transition sequence ${transition.effect.sequence}.`);
      }
      seen.add(transition.effect.sequence);
      if (index > 0) {
        const previous = transitions[index - 1];
        if (transition.effect.sequence !== previous.effect.sequence + 1) {
          errors.push(`Group ${groupId} transition sequences must be contiguous.`);
        }
        if (transition.effect.fromStatus !== previous.effect.toStatus) {
          errors.push(`Group ${groupId} transition status chain is discontinuous.`);
        }
        if (!transition.dependsOn.includes(previous.id)) {
          errors.push(`Transition ${transition.id} must depend on ${previous.id}.`);
        }
      }
    }

    const mutations = group.filter((operation) => MUTATION_KINDS.has(operation.kind));
    for (const transition of transitions) {
      for (const mutation of mutations) {
        if (!transition.dependsOn.includes(mutation.id)) {
          errors.push(`Transition ${transition.id} must follow mutation ${mutation.id}.`);
        }
      }
    }

    const verifications = group.filter(
      (operation) => operation.kind === OPERATION_KIND.ISSUE_VERIFY
    );
    if ((mutations.length || transitions.length) && verifications.length !== 1) {
      errors.push(`Group ${groupId} requires exactly one final full verification operation.`);
    }
    for (const verification of verifications) {
      for (const operation of group) {
        if (operation.id !== verification.id && !verification.dependsOn.includes(operation.id)) {
          errors.push(`Full verify ${verification.id} must depend on ${operation.id}.`);
        }
      }
    }

    const finalTransition = transitions.at(-1);
    if (
      finalTransition?.effect?.toStatus === "In Progress" &&
      (finalTransition.effect.activeNow !== true || finalTransition.effect.stillDue !== true)
    ) {
      errors.push(
        `Group ${groupId} can end In Progress only with active-now and still-due evidence.`
      );
    }
    if (finalTransition?.effect?.toStatus === "Done") {
      const hasComment = group.some(
        (operation) => operation.kind === OPERATION_KIND.COMMENT_CREATE
      );
      const hasWorklog = group.some((operation) =>
        [OPERATION_KIND.WORKLOG_CREATE, OPERATION_KIND.WORKLOG_UPDATE].includes(operation.kind)
      );
      const setsZeroRemaining = mutations.some(
        (operation) =>
          [OPERATION_KIND.ISSUE_CREATE, OPERATION_KIND.ISSUE_UPDATE].includes(operation.kind) &&
          operation.effect?.fields?.remainingEstimate === "0h"
      );
      const finalVerification = verifications[0];
      const verifiesZeroRemaining =
        finalVerification?.effect?.expectedIssue?.["fields.timetracking.remainingEstimate"] ===
        "0h";
      if (!hasComment) errors.push(`Done group ${groupId} requires an evidence-backed comment.`);
      if (!hasWorklog) errors.push(`Done group ${groupId} requires worklog handling.`);
      if (!setsZeroRemaining || !verifiesZeroRemaining) {
        errors.push(`Done group ${groupId} must set and fully verify remainingEstimate as 0h.`);
      }
    }
  }
}

function validateSubtaskGroups(operations, errors) {
  const groups = new Map();
  for (const operation of operations) {
    const group = groups.get(operation.groupId) || [];
    group.push(operation);
    groups.set(operation.groupId, group);
  }
  for (const [groupId, group] of groups) {
    const create = group.find(
      (operation) =>
        operation.kind === OPERATION_KIND.ISSUE_CREATE && operation.effect?.issueType === "Subtask"
    );
    if (!create) continue;
    const comments = group
      .filter((operation) => operation.kind === OPERATION_KIND.COMMENT_CREATE)
      .map((operation) => ({
        body: operation.effect.body,
        evidenceRefs: operation.evidenceRefs,
      }));
    const worklogs = group.filter((operation) =>
      [OPERATION_KIND.WORKLOG_CREATE, OPERATION_KIND.WORKLOG_UPDATE].includes(operation.kind)
    );
    const fields = create.effect.fields || {};
    const subtaskErrors = validateSubtask({
      summary: fields.summary,
      description: fields.descriptionText,
      startDate: fields.startDate,
      dueDate: fields.dueDate,
      priority: fields.priority,
      labels: fields.labels,
      evidenceRefs: create.evidenceRefs,
      comments,
      worklogs,
      participants: create.effect.participants,
      collaborationEvidenceRefs: create.effect.collaborationEvidenceRefs,
    });
    errors.push(...subtaskErrors.map((error) => `Subtask group ${groupId}: ${error}`));
    if (create.effect.parentRef?.startsWith("NEW:") && !create.parentGroupId) {
      errors.push(`Subtask group ${groupId} requires parentGroupId for a NEW parent.`);
    }
    if (create.parentGroupId && !groups.has(create.parentGroupId)) {
      errors.push(
        `Subtask group ${groupId} references missing parent group ${create.parentGroupId}.`
      );
    }
  }
}

function validateWeeklySettlements(ledger, errors) {
  const seenWeeks = new Set();
  const seenWorklogIds = new Set();
  for (const settlement of ledger.weeklySettlements || []) {
    if (settlement.status !== "settled") {
      errors.push(`Week ${settlement.weekOf || "<missing>"} must use status settled.`);
      continue;
    }
    if (!settlement.weekOf || mondayOf(settlement.weekOf) !== settlement.weekOf) {
      errors.push(`Settled week ${settlement.weekOf || "<missing>"} must be a Monday ISO date.`);
      continue;
    }
    if (seenWeeks.has(settlement.weekOf)) {
      errors.push(`Duplicate settled week: ${settlement.weekOf}.`);
    }
    seenWeeks.add(settlement.weekOf);
    for (const worklog of settlement.worklogs || []) {
      if (!String(worklog.id || "").trim()) {
        errors.push(`Settled week ${settlement.weekOf} contains a worklog without an ID.`);
      } else if (seenWorklogIds.has(worklog.id)) {
        errors.push(`Duplicate settled worklog ID: ${worklog.id}.`);
      }
      seenWorklogIds.add(worklog.id);
      validateIssueRef(
        worklog.issueRef,
        `Settled worklog ${worklog.id || "<missing-id>"} issueRef`,
        errors
      );
      if (!Number.isFinite(Number(worklog.hours)) || Number(worklog.hours) <= 0) {
        errors.push(`Settled worklog ${worklog.id || "<missing-id>"} requires positive hours.`);
      }
      if (mondayOf(worklog.started) !== settlement.weekOf) {
        errors.push(
          `Settled worklog ${worklog.id || "<missing-id>"} falls outside ${settlement.weekOf}.`
        );
      }
    }
    const audits = auditWeeklyEffort(settlement.worklogs);
    const audit = audits.find((entry) => entry.weekOf === settlement.weekOf);
    if (!audit?.targetMet) {
      const detail = audit?.violations?.join(" ") || "No valid worklogs were supplied.";
      errors.push(`Settled week ${settlement.weekOf} is invalid: ${detail}`);
    }
    if (
      !Number.isFinite(Number(settlement.expectedTotalHours)) ||
      Number(settlement.expectedTotalHours) <= 0
    ) {
      errors.push(`Settled week ${settlement.weekOf} requires expectedTotalHours.`);
    } else if (Number(settlement.expectedTotalHours) !== audit?.totalHours) {
      errors.push(
        `Settled week ${settlement.weekOf} expected ${settlement.expectedTotalHours}h but totals ${audit?.totalHours ?? 0}h.`
      );
    }
    if (audit?.totalHours !== undefined && (audit.totalHours < 60 || audit.totalHours > 65)) {
      errors.push(`Settled week ${settlement.weekOf} must total between 60h and 65h.`);
    }
  }
}

export function validateOperationLedger(ledger) {
  const errors = [];
  if (ledger?.schemaVersion !== LEDGER_SCHEMA_VERSION) {
    errors.push(`Ledger schemaVersion must be ${LEDGER_SCHEMA_VERSION}.`);
  }
  if (ledger?.policyVersion !== POLICY_VERSION) {
    errors.push(`Ledger policyVersion must be ${POLICY_VERSION}.`);
  }
  if (
    ledger?.scope?.projectKey !== MDM_PROJECT_KEY ||
    ledger?.scope?.initiative !== LEDGER_SCOPE.initiative
  ) {
    errors.push("Ledger scope must explicitly be the MT MDM initiative.");
  }
  if (!String(ledger?.run?.sourceSnapshotId || "").trim()) {
    errors.push("Ledger run requires sourceSnapshotId.");
  } else {
    const expectedRunId = createStableRunId({
      sourceSnapshotId: ledger.run.sourceSnapshotId,
      runKey: ledger.run.runKey,
      scope: ledger.scope,
      schemaVersion: ledger.schemaVersion,
      policyVersion: ledger.policyVersion,
    });
    if (ledger.run.id !== expectedRunId) errors.push("Ledger run ID is not stable for its inputs.");
  }

  const operations = Array.isArray(ledger?.operations) ? ledger.operations : [];
  const ids = new Set();
  const keys = new Set();
  const operationById = new Map();
  for (const operation of operations) {
    if (ids.has(operation.id)) errors.push(`Duplicate operation ID: ${operation.id}.`);
    if (keys.has(operation.idempotencyKey)) {
      errors.push(`Duplicate idempotency key: ${operation.idempotencyKey}.`);
    }
    ids.add(operation.id);
    keys.add(operation.idempotencyKey);
    operationById.set(operation.id, operation);
  }

  for (const operation of operations) {
    if (!String(operation.groupId || "").trim()) {
      errors.push(`Operation ${operation.id || "<missing-id>"} requires groupId.`);
    }
    if (operation.sourceScope !== "engagement") {
      errors.push(`Operation ${operation.id} sourceScope must be engagement.`);
    }
    if (!OPERATION_KINDS.includes(operation.kind)) {
      errors.push(`Unsupported operation kind: ${operation.kind || "missing"}.`);
    }
    const expectedKey = createStableIdempotencyKey(operation);
    if (operation.idempotencyKey !== expectedKey) {
      errors.push(`Operation ${operation.id} has a non-stable idempotency key.`);
    }
    const expectedId = stableExpectedOperationId(ledger.run.id, operation);
    if (operation.id !== expectedId) errors.push(`Operation ${operation.id} has a non-stable ID.`);
    for (const dependency of operation.dependsOn || []) {
      if (!operationById.has(dependency)) {
        errors.push(`Operation ${operation.id} depends on missing operation ${dependency}.`);
      }
      if (dependency === operation.id) {
        errors.push(`Operation ${operation.id} cannot depend on itself.`);
      }
    }
    validateIssuePreconditions(operation, operationById, errors);
    validateAssertions(operation, errors);
    validateState(operation, errors);
    validateOperationEffect(operation, errors);
  }

  try {
    const ordered = orderOperations(operations);
    const actualIds = operations.map((operation) => operation.id);
    const orderedIds = ordered.map((operation) => operation.id);
    if (canonicalJson(actualIds) !== canonicalJson(orderedIds)) {
      errors.push("Operations are not stored in dependency order.");
    }
  } catch (error) {
    if (error instanceof LedgerValidationError) errors.push(...error.errors);
    else errors.push(error.message);
  }

  validateRequiredEvidence(ledger, errors);
  validateTransitionsByGroup(operations, errors);
  validateSubtaskGroups(operations, errors);
  validateWeeklySettlements(ledger, errors);

  const expectedPreviewHash = computePreviewHash(operations);
  if (ledger?.preview?.hash !== expectedPreviewHash) {
    errors.push("Preview hash does not match the canonicalized Jira effects.");
  }
  if (ledger?.preview?.operationCount !== operations.length) {
    errors.push("Preview operationCount does not match the ledger.");
  }
  const expectedIntegrityHash = computeLedgerIntegrityHash(ledger);
  if (ledger?.integrity?.hash !== expectedIntegrityHash) {
    errors.push(
      "Ledger integrity hash does not match its provenance, preconditions, verification, and effects."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    previewHash: expectedPreviewHash,
    integrityHash: expectedIntegrityHash,
  };
}

export function assertValidOperationLedger(ledger) {
  const result = validateOperationLedger(ledger);
  if (!result.valid) throw new LedgerValidationError(result.errors);
  return ledger;
}

export function buildOperationLedger(input, options = {}) {
  const scope = canonicalize(input?.scope || LEDGER_SCOPE);
  if (scope.projectKey !== MDM_PROJECT_KEY || scope.initiative !== LEDGER_SCOPE.initiative) {
    throw new LedgerValidationError(["Ledger scope must explicitly be the MT MDM initiative."]);
  }
  const sourceSnapshotId = String(input?.sourceSnapshotId || "").trim();
  const runKey = String(input?.runKey || "default").trim();
  const runId = createStableRunId({
    sourceSnapshotId,
    runKey,
    scope,
  });
  const operations = (Array.isArray(input?.operations) ? input.operations : []).map((operation) =>
    normalizeOperation(operation, runId)
  );

  enrichPreconditionsAndDependencies(operations);
  addGroupDependencies(operations);

  let orderedOperations;
  try {
    orderedOperations = orderOperations(operations);
  } catch (error) {
    if (options.validate === false) orderedOperations = operations;
    else throw error;
  }

  const ledger = canonicalize({
    schemaVersion: LEDGER_SCHEMA_VERSION,
    policyVersion: POLICY_VERSION,
    scope,
    run: {
      id: runId,
      sourceSnapshotId,
      runKey,
      generatedAt: input?.generatedAt || null,
    },
    preview: {
      algorithm: "sha256",
      canonicalization: "sorted-object-keys-v1",
      hash: computePreviewHash(orderedOperations),
      operationCount: orderedOperations.length,
    },
    evidenceSources: (Array.isArray(input?.evidenceSources) ? input.evidenceSources : [])
      .map(normalizeEvidenceSource)
      .sort((left, right) => left.ref.localeCompare(right.ref)),
    weeklySettlements: (Array.isArray(input?.weeklySettlements) ? input.weeklySettlements : [])
      .map(normalizeWeeklySettlement)
      .sort((left, right) => String(left.weekOf).localeCompare(String(right.weekOf))),
    operations: orderedOperations,
  });
  ledger.integrity = {
    algorithm: "sha256",
    coverage: "immutable-ledger-v1",
    hash: computeLedgerIntegrityHash(ledger),
  };

  if (options.validate !== false) assertValidOperationLedger(ledger);
  return ledger;
}

export function getRunnableOperations(ledger) {
  const byId = new Map((ledger?.operations || []).map((operation) => [operation.id, operation]));
  return (ledger?.operations || []).filter(
    (operation) =>
      operation.state?.status === "pending" &&
      (operation.dependsOn || []).every((dependency) =>
        ["succeeded", "skipped"].includes(byId.get(dependency)?.state?.status)
      )
  );
}

export function resumeOperationLedger(
  ledger,
  { retryFailed = true, resetRunning = true, at = null } = {}
) {
  const resumed = canonicalize(ledger);
  resumed.operations = resumed.operations.map((operation) => {
    const state = operation.state;
    const shouldResetRunning = resetRunning && state.status === "running";
    const shouldRetryFailed = retryFailed && state.status === "failed" && state.retryable !== false;
    if (!shouldResetRunning && !shouldRetryFailed) return operation;
    return {
      ...operation,
      state: {
        status: "pending",
        attempts: state.attempts,
        updatedAt: at,
        retryable: state.retryable !== false,
      },
    };
  });
  return resumed;
}

export function transitionOperationState(
  ledger,
  operationId,
  nextStatus,
  { at = null, result, error, retryable } = {}
) {
  const copy = canonicalize(ledger);
  const operation = copy.operations.find((entry) => entry.id === operationId);
  if (!operation) throw new TypeError(`Unknown operation ID: ${operationId}.`);
  const current = operation.state.status;
  if (!(RESUMABLE_STATE_TRANSITIONS[current] || []).includes(nextStatus)) {
    throw new TypeError(`Unsupported operation state transition: ${current} -> ${nextStatus}.`);
  }
  if (nextStatus === "succeeded" && result?.verificationStatus !== "passed") {
    throw new TypeError("Succeeded operations require a passed verification result.");
  }
  if (
    nextStatus === "skipped" &&
    (result?.verificationStatus !== "passed" || !String(result?.skipReason || "").trim())
  ) {
    throw new TypeError(
      "Skipped operations require passed verification and an explicit skip reason."
    );
  }
  if (nextStatus === "failed" && !error) {
    throw new TypeError("Failed operations require error details.");
  }
  operation.state = {
    status: nextStatus,
    attempts: operation.state.attempts + (nextStatus === "running" ? 1 : 0),
    updatedAt: at,
    retryable: retryable ?? operation.state.retryable,
    ...(result === undefined ? {} : { result: canonicalize(result) }),
    ...(error === undefined ? {} : { error: canonicalize(error) }),
  };
  return copy;
}
