import { createHash } from "node:crypto";
import { buildPublicModel, scanForSecrets } from "./workbench-state/action-identity.mjs";

export const TODAY_SNAPSHOT_VERSION = 1;
export const TODAY_SNAPSHOT_SOURCE_IDS = ["jira", "agentBoard", "reconciliation", "loop"];

const SOURCE_LABELS = {
  jira: "Jira work",
  agentBoard: "Agent Board",
  reconciliation: "Activity reconciliation",
  loop: "Loop state",
};

const DATA_KEYS = {
  jira: "jira",
  agentBoard: "agentBoard",
  reconciliation: "reconciliation",
  loop: "loop",
};

/** The only fields this page model may hand the browser. Adding one is a deliberate act. */
export const TODAY_SNAPSHOT_PUBLIC_FIELDS = Object.freeze([
  "version",
  "snapshotId",
  "capturedAt",
  "partial",
  "notes",
  "sources",
  ...Object.values(DATA_KEYS),
]);

export function buildTodaySnapshot(input = {}) {
  const capturedAt = normalizeIso(input.capturedAt ?? new Date());
  const sources = {};
  const notes = [];
  const data = {};

  for (const sourceId of TODAY_SNAPSHOT_SOURCE_IDS) {
    const source = normalizeSource(sourceId, input[sourceId], capturedAt);

    // AS-09. Fail closed. A source whose data carries credential material is blocked and
    // named rather than served. The field path is reported; the value never is.
    const scan = source.data === null ? { ok: true, findings: [] } : scanForSecrets(source.data);
    if (!scan.ok) {
      const where = scan.findings.map((finding) => finding.path).join(", ");
      const detail = `${SOURCE_LABELS[sourceId] ?? sourceId} was withheld because a secret scan matched at ${where}.`;
      sources[sourceId] = {
        ...source.observation,
        status: "blocked",
        detail,
      };
      data[DATA_KEYS[sourceId]] = null;
      notes.push({ source: sourceId, status: "blocked", message: detail });
      continue;
    }

    sources[sourceId] = source.observation;
    data[DATA_KEYS[sourceId]] = source.data;
    if (source.note) notes.push(source.note);
  }

  const partial = Object.values(sources).some((source) => source.status !== "ok");
  const snapshotSeed = {
    version: TODAY_SNAPSHOT_VERSION,
    capturedAt,
    sourceStatuses: Object.fromEntries(
      Object.entries(sources).map(([id, source]) => [
        id,
        {
          status: source.status,
          observedAt: source.observedAt,
          error: source.error ?? null,
        },
      ])
    ),
  };

  // AS-09. The browser payload may only carry approved top-level fields. This used to spread
  // whatever each source returned straight into the response, so a new field could reach the
  // browser because nobody noticed it. An unapproved field is named and refused.
  const { model } = buildPublicModel({
    allow: TODAY_SNAPSHOT_PUBLIC_FIELDS,
    record: {
      version: TODAY_SNAPSHOT_VERSION,
      snapshotId: buildSnapshotId(capturedAt, snapshotSeed),
      capturedAt,
      partial,
      notes,
      sources,
      ...data,
    },
  });

  // Scanning each source's data was not enough. An error string and a status detail are
  // exactly where a token lands when a call fails to authenticate, and neither was covered.
  // The assembled payload is scanned as a whole, and anything still matching is redacted in
  // place rather than served.
  const finalScan = scanForSecrets(model);
  if (!finalScan.ok) {
    for (const finding of finalScan.findings) redactAtPath(model, finding.path);
    model.notes = [
      ...model.notes,
      {
        source: "snapshot",
        status: "blocked",
        message: `Redacted ${finalScan.findings.length} field(s) that matched the secret scan: ${finalScan.findings
          .map((finding) => finding.path)
          .join(", ")}.`,
      },
    ];
  }
  return model;
}

/** Replaces the value at a scan finding's path with a marker. The value is never echoed. */
function redactAtPath(root, path) {
  const parts = String(path)
    .replace(/^\$\.?/, "")
    .split(/\.|\[(\d+)\]/)
    .filter((part) => part !== undefined && part !== "");
  if (!parts.length) return;
  let node = root;
  for (const part of parts.slice(0, -1)) {
    if (node === null || typeof node !== "object") return;
    node = node[/^\d+$/.test(part) ? Number(part) : part];
  }
  const last = parts.at(-1);
  if (node && typeof node === "object") {
    node[/^\d+$/.test(last) ? Number(last) : last] = "[redacted: secret scan]";
  }
}

function normalizeSource(sourceId, input, capturedAt) {
  const label = SOURCE_LABELS[sourceId] ?? sourceId;
  if (!input) {
    const detail = `${label} was not provided to the Today snapshot.`;
    return {
      observation: {
        id: sourceId,
        label,
        status: "missing",
        observedAt: null,
        error: null,
        detail,
      },
      data: null,
      note: {
        source: sourceId,
        status: "missing",
        message: detail,
      },
    };
  }

  const status = normalizeStatus(input);
  const observedAtValue =
    "observedAt" in input
      ? input.observedAt
      : "capturedAt" in input
        ? input.capturedAt
        : capturedAt;
  const observedAt = normalizeOptionalIso(observedAtValue);
  const value = "data" in input ? input.data : "value" in input ? input.value : null;
  const detail = normalizeDetail(input.detail);
  const error = status === "error" ? (normalizeError(input.error) ?? `${label} failed.`) : null;
  const noteMessage = error ?? (status === "ok" ? null : (detail ?? defaultNote(label, status)));

  return {
    observation: {
      id: sourceId,
      label,
      status,
      observedAt,
      error,
      detail: detail ?? "",
    },
    data: cloneValue(value),
    note: noteMessage ? { source: sourceId, status, message: noteMessage } : null,
  };
}

function normalizeStatus(input) {
  const raw = String(input.status ?? "").toLowerCase();
  if (input.ok === false || raw === "error" || raw === "failed") return "error";
  if (raw === "partial") return "partial";
  if (raw === "unavailable") return "unavailable";
  if (raw === "missing") return "missing";
  return "ok";
}

function buildSnapshotId(capturedAt, seed) {
  const stamp = capturedAt.replaceAll("-", "").replaceAll(":", "").replace(".", "");
  const hash = createHash("sha256").update(JSON.stringify(seed)).digest("hex").slice(0, 12);
  return `today-${stamp}-${hash}`;
}

function normalizeIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`Invalid snapshot time: ${value}`);
  return date.toISOString();
}

function normalizeOptionalIso(value) {
  if (value === null) return null;
  return normalizeIso(value);
}

function normalizeError(error) {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  return String(error);
}

function normalizeDetail(detail) {
  if (detail === null || typeof detail === "undefined") return null;
  return String(detail);
}

function defaultNote(label, status) {
  if (status === "partial") return `${label} returned a partial result.`;
  if (status === "unavailable") return `${label} is unavailable.`;
  if (status === "missing") return `${label} was not provided to the Today snapshot.`;
  return `${label} did not return a current result.`;
}

function cloneValue(value) {
  if (value === null || typeof value === "undefined") return null;
  return structuredClone(value);
}
