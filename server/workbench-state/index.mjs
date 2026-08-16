import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { appendFile, mkdir, open, readFile, rm, stat, unlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const WORKBENCH_STATE_SCHEMA_VERSION = 1;

export const WORKBENCH_STATE_MODES = Object.freeze(["production", "development", "test"]);

export const TURN_PHASES = Object.freeze([
  "host_execute",
  "typed_result",
  "validation",
  "durable_writeback",
  "quota_spend",
  "scheduler_ack",
]);

export const WORK_ITEM_EVENT_TYPES = Object.freeze({
  CREATED: "work_item.created",
  CLAIMED: "work_item.claimed",
  LEASE_RENEWED: "work_item.lease_renewed",
  RELEASED: "work_item.released",
  RESUMED: "work_item.resumed",
  COMPLETED: "work_item.completed",
  QUARANTINED: "work_item.quarantined",
});

// A pid alone is not identity on Windows, which recycles them. A lease records this instead,
// so a recycled pid cannot be mistaken for the original owner still being alive.
const PROCESS_IDENTITY = `${process.pid}-${randomUUID()}`;

export function processIdentity() {
  return PROCESS_IDENTITY;
}

// Completion of externally acting work goes through completeWorkItem, which checks the
// verification receipt. This token is module-private, so a caller outside this file cannot
// append a completion event directly.
const COMPLETION_TOKEN = Symbol("workbench-state-completion");

function appDataRoot() {
  return process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
}

function productionRoot() {
  return join(appDataRoot(), "IPCorpBrain", "workbench-state");
}

function developmentRoot() {
  return join(appDataRoot(), "IPCorpBrain", "workbench-state-dev");
}

function normalizePath(path) {
  return resolve(isAbsolute(path) ? path : join(process.cwd(), path));
}

function isSameOrWithin(parent, target) {
  const from = normalizePath(parent).toLowerCase();
  const to = normalizePath(target).toLowerCase();
  const child = relative(from, to);
  return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
}

function assertMode(mode) {
  if (!WORKBENCH_STATE_MODES.includes(mode)) {
    throw new Error(`Workbench state mode must be one of: ${WORKBENCH_STATE_MODES.join(", ")}`);
  }
}

export function resolveWorkbenchStateRoot({ mode = "production", root } = {}) {
  assertMode(mode);

  if (mode === "test" && !root) {
    throw new Error("Workbench state test mode requires an explicit temporary root.");
  }

  const selected =
    root ||
    (mode === "production" ? productionRoot() : mode === "development" ? developmentRoot() : null);
  const resolved = normalizePath(selected);
  const production = normalizePath(productionRoot());

  if (mode === "test" && isSameOrWithin(production, resolved)) {
    throw new Error("Workbench state test mode refuses the production root.");
  }

  if (mode === "test" && !isSameOrWithin(tmpdir(), resolved)) {
    throw new Error(
      "Workbench state test mode requires a root under the operating system temp folder."
    );
  }

  if (mode === "production" && process.env.NODE_ENV === "test") {
    throw new Error("Workbench state production mode is disabled while NODE_ENV=test.");
  }

  return {
    mode,
    root: resolved,
    paths: {
      events: join(resolved, "events.ndjson"),
      conflicts: join(resolved, "event-conflicts.ndjson"),
      leases: join(resolved, "leases"),
      snapshots: join(resolved, "snapshots"),
      writerLock: join(resolved, "events.writer.lock"),
    },
  };
}

async function ensureParent(path) {
  await mkdir(dirname(path), { recursive: true });
}

async function ensureStateRoot(paths) {
  await mkdir(dirname(paths.events), { recursive: true });
  await mkdir(paths.leases, { recursive: true });
  await mkdir(paths.snapshots, { recursive: true });
}

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

function eventBody(event) {
  const { sequence, contentHash, ...body } = event;
  return { schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION, ...body };
}

function hashValue(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function requiredString(value, label) {
  if (!value || typeof value !== "string") throw new Error(`Workbench state ${label} is required.`);
  return value;
}

function iso(value, label = "timestamp") {
  const text = requiredString(value, label);
  if (Number.isNaN(Date.parse(text)))
    throw new Error(`Workbench state ${label} must be an ISO timestamp.`);
  return text;
}

function nowIso(value) {
  return value ? iso(value, "now") : new Date().toISOString();
}

/**
 * A filesystem-safe segment that cannot collide. Replacing unsafe characters with an
 * underscore alone folds "meeting/2026-08-14" and "meeting_2026-08-14" onto one path, so two
 * different work items would share saved state. The short hash of the original id keeps them
 * apart while the readable part stays readable.
 */
export function stateSegmentFor(value) {
  const original = requiredString(value, "id");
  const readable = original.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 96);
  const digest = createHash("sha256").update(original).digest("hex").slice(0, 12);
  return `${readable}.${digest}`;
}

async function readLines(path) {
  try {
    const raw = await readFile(path, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function readJsonLines(path) {
  const lines = await readLines(path);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(
        `Workbench state file ${path} has invalid JSON on line ${index + 1}: ${error.message}`
      );
    }
  });
}

async function appendJsonLine(path, value) {
  await ensureParent(path);
  await appendFile(path, `${stableStringify(value)}\n`, "utf8");
}

async function removeIfExists(path) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await unlink(path);
      return;
    } catch (error) {
      if (error?.code === "ENOENT") return;
      if (!["EPERM", "EACCES"].includes(error?.code) || attempt === 19) throw error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
  }
}

async function withExclusiveFileLock(lockPath, operation, label) {
  const deadline = Date.now() + 5_000;
  await ensureParent(lockPath);
  while (Date.now() < deadline) {
    let handle;
    try {
      handle = await open(
        lockPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600
      );
      await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`, "utf8");
    } catch (error) {
      const createdLock = Boolean(handle);
      await handle?.close();
      if (createdLock) await removeIfExists(lockPath);
      if (!["EEXIST", "EPERM", "EACCES"].includes(error?.code)) throw error;
      const details = await stat(lockPath).catch(() => null);
      if (details && Date.now() - details.mtimeMs > 30_000) {
        await removeIfExists(lockPath);
        continue;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 15));
      continue;
    }

    try {
      return await operation();
    } finally {
      await handle.close();
      await removeIfExists(lockPath);
    }
  }
  throw new Error(`${label} stayed busy for five seconds.`);
}

function withLeaseMutationLock(paths, workItemId, operation) {
  return withExclusiveFileLock(
    join(paths.leases, `${stateSegmentFor(workItemId)}.mutation.lock`),
    operation,
    `Workbench lease ${workItemId}`
  );
}

function withEventWriterLock(paths, operation) {
  return withExclusiveFileLock(paths.writerLock, operation, "Workbench event writer");
}

export function createSourceObservation(input) {
  return {
    schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
    id: requiredString(input?.id, "source observation id"),
    source: requiredString(input?.source, "source observation source"),
    observedAt: iso(input?.observedAt, "source observation observedAt"),
    status: input?.status || "ok",
    reference: input?.reference || null,
    facts: Array.isArray(input?.facts) ? input.facts : [],
    notes: Array.isArray(input?.notes) ? input.notes : [],
  };
}

export function createVerificationEvidence(input) {
  return {
    schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
    id: requiredString(input?.id, "verification evidence id"),
    workItemId: requiredString(input?.workItemId, "verification evidence workItemId"),
    checkedAt: iso(input?.checkedAt, "verification evidence checkedAt"),
    result: input?.result || "unknown",
    command: input?.command || null,
    details: input?.details || null,
  };
}

export function createApprovalRecord(input) {
  return {
    schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
    id: requiredString(input?.id, "approval id"),
    workItemId: requiredString(input?.workItemId, "approval workItemId"),
    requestedAt: iso(input?.requestedAt, "approval requestedAt"),
    status: input?.status || "pending",
    decidedAt: input?.decidedAt ? iso(input.decidedAt, "approval decidedAt") : null,
    summary: input?.summary || "",
  };
}

export function createPageSnapshot(input) {
  return {
    schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
    id: requiredString(input?.id, "page snapshot id"),
    page: requiredString(input?.page, "page snapshot page"),
    capturedAt: iso(input?.capturedAt, "page snapshot capturedAt"),
    sources: Array.isArray(input?.sources) ? input.sources : [],
    partialResults: Array.isArray(input?.partialResults) ? input.partialResults : [],
    payload: input?.payload || {},
  };
}

export function createTurnReceipt(input) {
  return {
    schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
    id: requiredString(input?.id, "turn receipt id"),
    workItemId: input?.workItemId || null,
    status: input?.status || "running",
    phases: Array.isArray(input?.phases) ? input.phases : [],
  };
}

export async function openWorkbenchState(options = {}) {
  const resolved = resolveWorkbenchStateRoot(options);
  await ensureStateRoot(resolved.paths);

  return {
    schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
    mode: resolved.mode,
    root: resolved.root,
    paths: resolved.paths,

    async claimWorkItem(workItemId, options) {
      return mutateWorkItemLease(this, workItemId, "claim", options);
    },

    async renewWorkItemLease(workItemId, options) {
      return mutateWorkItemLease(this, workItemId, "renew", options);
    },

    async releaseWorkItem(workItemId, options = {}) {
      return mutateWorkItemLease(this, workItemId, "release", options);
    },

    async resumeWorkItem(workItemId, options = {}) {
      return resumeWorkItemGuarded(this, workItemId, options);
    },

    async isOwnerWriteCurrent(workItemId, options = {}) {
      return isOwnerWriteCurrent(this, workItemId, options);
    },
  };
}

function leaseLooksAlive(item, at) {
  if (!item?.lease?.expiresAt) return false;
  return Date.parse(item.lease.expiresAt) > Date.parse(at);
}

/**
 * AS-05. Is the process that holds this lease genuinely still there?
 *
 * Returns true, false, or null when it cannot be determined. Owners are named with their pid
 * as a suffix, which is what makes the probe possible. A pid that matches this process but
 * carries a different start identity is a recycled pid, which Windows does freely, so the
 * original owner is gone even though the pid answers.
 */
export async function defaultOwnerAlive(lease) {
  if (lease?.ownerIdentity && lease.ownerIdentity !== PROCESS_IDENTITY) {
    const [identityPid] = String(lease.ownerIdentity).split("-");
    if (Number(identityPid) === process.pid) return false;
  }

  const match = String(lease?.owner || "").match(/(?:^|[-:])(\d+)$/);
  if (!match) return null;
  const pid = Number(match[1]);
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return null;
  }
}

/**
 * AS-05. Resume used to append its event unconditionally, and the projector then cleared the
 * lease. A slow worker could keep running while another process resumed and claimed the same
 * work, and the original worker could still save output and mark the step successful.
 *
 * A live owner is now refused. Taking over requires either an expired lease or a caller that
 * can show the owner is genuinely gone, together with a named recovery condition.
 */
export async function resumeWorkItemGuarded(state, workItemId, options = {}) {
  requiredString(workItemId, "work item id");
  const at = nowIso(options.now);

  return withLeaseMutationLock(state.paths, workItemId, async () => {
    const item = (await projectWorkItems(state)).find((entry) => entry.id === workItemId);
    if (!item) return { status: "missing", lease: null };

    if (item.lease) {
      const expired = !leaseLooksAlive(item, at);
      const probe =
        typeof options.isOwnerAlive === "function"
          ? await options.isOwnerAlive(item.lease)
          : await defaultOwnerAlive(item.lease);
      // A probe that cannot decide falls back to the clock. A probe that says the owner is
      // gone allows takeover even while the lease still looks current, which is the whole
      // point of startup recovery after a crash.
      const ownerAlive = probe === null || probe === undefined ? !expired : Boolean(probe);

      if (!expired && ownerAlive) {
        return {
          status: "refused",
          reason: "a live owner holds this work item",
          lease: item.lease,
        };
      }
      if (ownerAlive && !options.recoveryCondition) {
        return {
          status: "refused",
          reason: "taking over a living owner needs an approved recovery condition",
          lease: item.lease,
        };
      }
    }

    const appended = await appendEvent(state, {
      id: options?.eventId || `evt-${randomUUID()}`,
      type: WORK_ITEM_EVENT_TYPES.RESUMED,
      at,
      workItemId,
      payload: {
        reason: options.reason || "resume requested",
        recoveryCondition: options.recoveryCondition || "lease_expired",
        replacedLeaseGeneration: item.lease?.leaseGeneration ?? null,
      },
    });
    return { status: appended.status === "conflict" ? "conflict" : "resumed", event: appended };
  });
}

/**
 * AS-04. The single question every durable write must ask before it writes: am I still the
 * owner? A stale generation is refused even when the lease id still matches, because the work
 * has since been claimed by someone else.
 */
export async function isOwnerWriteCurrent(state, workItemId, options = {}) {
  requiredString(workItemId, "work item id");
  const at = nowIso(options.now);
  const item = (await projectWorkItems(state)).find((entry) => entry.id === workItemId);
  if (!item) return { ok: false, reason: "missing_work_item", lease: null };
  if (!item.lease) return { ok: false, reason: "no_current_lease", lease: null };

  const current = item.lease;
  if (Number(options.leaseGeneration) !== Number(current.leaseGeneration)) {
    return { ok: false, reason: "stale_lease_generation", lease: current };
  }
  if (options.leaseId && options.leaseId !== current.leaseId) {
    return { ok: false, reason: "stale_lease_id", lease: current };
  }
  if (options.owner && options.owner !== current.owner) {
    return { ok: false, reason: "not_owner", lease: current };
  }
  // The fencing value is what actually decides ownership: any takeover raises the generation,
  // so a matching generation proves nobody else has claimed this work. The wall clock is a
  // weaker signal, and a caller holding the current generation with a lapsed clock has still
  // not lost the work to anyone. Mid-run writes ask for the stricter check, because renewing
  // the heartbeat is the right response there. Completion checks generation under the lease
  // mutation lock instead, where a concurrent claim cannot slip in.
  if (options.requireUnexpired !== false && !leaseLooksAlive(item, at)) {
    return { ok: false, reason: "lease_expired", lease: current };
  }
  return { ok: true, reason: null, lease: current };
}

/**
 * AS-07. Output that came back after a stop, or a saved record that no longer parses, is set
 * aside rather than served. The record is kept so a person can look at it.
 */
export async function quarantineRecord(state, input) {
  const at = nowIso(input?.now);
  const workItemId = requiredString(input?.workItemId, "work item id");
  const appended = await appendEvent(state, {
    id: input?.eventId || `evt-${randomUUID()}`,
    type: WORK_ITEM_EVENT_TYPES.QUARANTINED,
    at,
    workItemId,
    payload: {
      reason: requiredString(input?.reason, "quarantine reason"),
      recordHash: hashValue(input?.record ?? {}),
      details: input?.details || null,
    },
  });
  return { status: appended.status === "conflict" ? "conflict" : "quarantined", event: appended };
}

function verificationProblem(item, verification) {
  if (!item.externallyActing) return null;
  if (!verification) return "externally acting work needs a verification receipt";
  if (!verification.actionRevisionId) return "the verification receipt needs the action revision";
  if (!verification.effectReceiptId) return "the verification receipt needs the effect receipt";
  if (!verification.destinationReadback) {
    return "the verification receipt needs a destination readback";
  }
  if (!Array.isArray(verification.checks) || verification.checks.length === 0) {
    return "the verification receipt needs the checks required for this work class";
  }
  if (verification.unresolvedUncertainty) {
    return "completion is refused while an uncertain effect is unresolved";
  }
  return null;
}

/**
 * AS-08. The only way to complete a work item. Externally acting work must show its receipt,
 * and the caller must still hold the current lease.
 */
export async function completeWorkItem(state, input) {
  const at = nowIso(input?.now);
  const workItemId = requiredString(input?.workItemId, "work item id");
  return withLeaseMutationLock(state.paths, workItemId, () =>
    completeWorkItemLocked(state, workItemId, at, input)
  );
}

async function completeWorkItemLocked(state, workItemId, at, input) {
  const events = await listEvents(state);
  const item = projectWorkItemsFromEvents(events).find((entry) => entry.id === workItemId);
  if (!item) return { status: "rejected", reason: "unknown work item" };

  // An exact replay of a completion that already happened is a no-op, not a second
  // completion. Completing clears the lease, so without this a retried call would look like
  // a caller with no lease trying to complete finished work.
  if (item.status === "completed") {
    const prior = events.find(
      (event) => event.type === WORK_ITEM_EVENT_TYPES.COMPLETED && event.workItemId === workItemId
    );
    if (prior && (!input?.eventId || prior.id === input.eventId)) {
      return { status: "duplicate", event: { status: "duplicate", event: prior } };
    }
    return { status: "rejected", reason: "this work item is already completed" };
  }

  const ownership = await isOwnerWriteCurrent(state, workItemId, {
    owner: input?.owner,
    leaseId: input?.leaseId,
    leaseGeneration: input?.leaseGeneration,
    now: at,
    requireUnexpired: false,
  });
  if (!ownership.ok) {
    return { status: "rejected", reason: `completion refused: ${ownership.reason}` };
  }

  const problem = verificationProblem(item, input?.verification);
  if (problem) return { status: "rejected", reason: problem };

  const event = {
    id: input?.eventId || `evt-${randomUUID()}`,
    type: WORK_ITEM_EVENT_TYPES.COMPLETED,
    at,
    workItemId,
    payload: {
      receiptHash: hashValue(input?.verification ?? { internal: true }),
      verification: input?.verification || null,
      completedBy: input?.owner || null,
      leaseGeneration: ownership.lease.leaseGeneration,
    },
  };
  event[COMPLETION_TOKEN] = true;
  const appended = await appendEvent(state, event);
  if (appended.status === "conflict") return { status: "conflict", conflict: appended.conflict };
  return { status: "completed", event: appended };
}

export async function appendEvent(state, event) {
  if (!state?.paths?.events) throw new Error("appendEvent needs an opened Workbench state.");
  requiredString(event?.id, "event id");
  requiredString(event?.type, "event type");
  iso(event?.at, "event at");

  // AS-08. Completion must carry a verification receipt, and that is checked in
  // completeWorkItem. An ordinary caller appending the raw event is refused here rather than
  // trusted to behave.
  if (event.type === WORK_ITEM_EVENT_TYPES.COMPLETED && event[COMPLETION_TOKEN] !== true) {
    return {
      status: "rejected",
      reason: "Completion must go through completeWorkItem so the verification receipt is checked.",
    };
  }

  return withEventWriterLock(state.paths, () => appendEventLocked(state, event));
}

async function appendEventLocked(state, event) {
  const body = eventBody(event);
  const contentHash = hashValue(body);
  const events = await listEvents(state);

  // AS-01. One work-item id has one definition. A second create with different content is a
  // recorded conflict, never a silent replacement of the first.
  if (event.type === WORK_ITEM_EVENT_TYPES.CREATED && event.workItemId) {
    const priorCreate = events.find(
      (row) => row.type === WORK_ITEM_EVENT_TYPES.CREATED && row.workItemId === event.workItemId
    );
    if (priorCreate && priorCreate.id !== event.id) {
      if (priorCreate.contentHash === contentHash) {
        return { status: "duplicate", event: priorCreate };
      }
      const conflict = {
        schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
        id: `conflict-${randomUUID()}`,
        eventId: event.id,
        workItemId: event.workItemId,
        recordedAt: new Date().toISOString(),
        reason: "work_item_redefinition",
        existingHash: priorCreate.contentHash,
        attemptedHash: contentHash,
        attemptedEvent: body,
      };
      await appendJsonLine(state.paths.conflicts, conflict);
      return { status: "conflict", conflict };
    }
  }

  const existing = events.find((row) => row.id === event.id);
  if (existing) {
    if (existing.contentHash === contentHash) return { status: "duplicate", event: existing };

    const conflict = {
      schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
      id: `conflict-${randomUUID()}`,
      eventId: event.id,
      recordedAt: new Date().toISOString(),
      existingHash: existing.contentHash,
      attemptedHash: contentHash,
      attemptedEvent: body,
    };
    await appendJsonLine(state.paths.conflicts, conflict);
    return { status: "conflict", conflict };
  }

  const stored = {
    ...body,
    sequence: events.length + 1,
    contentHash,
  };
  await appendJsonLine(state.paths.events, stored);
  return { status: "appended", event: stored };
}

function positiveLeaseDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("Workbench leaseMs must be positive.");
  return duration;
}

async function mutateWorkItemLease(state, workItemId, action, options = {}) {
  requiredString(workItemId, "work item id");
  return withLeaseMutationLock(state.paths, workItemId, () =>
    withEventWriterLock(state.paths, async () => {
      const events = await listEvents(state);
      const item = projectWorkItemsFromEvents(events).find((entry) => entry.id === workItemId);
      if (!item) return { status: "missing", lease: null };

      const at = nowIso(options.now);
      const existingEvent = options.eventId
        ? events.find((event) => event.id === options.eventId)
        : null;

      if (existingEvent) {
        let retryEvent;
        if (action === "claim") {
          const owner = requiredString(options.owner, "lease owner");
          const duration = positiveLeaseDuration(options.leaseMs);
          const sameClaim =
            existingEvent.type === WORK_ITEM_EVENT_TYPES.CLAIMED &&
            existingEvent.workItemId === workItemId;
          // A retry with the same event id must rebuild the same payload, including the lease
          // generation and owner identity, or the idempotent replay reads as a conflict.
          retryEvent = {
            id: options.eventId,
            type: WORK_ITEM_EVENT_TYPES.CLAIMED,
            at,
            workItemId,
            payload: {
              leaseId: sameClaim ? existingEvent.payload.leaseId : "conflicting-lease-id",
              leaseGeneration: sameClaim ? existingEvent.payload.leaseGeneration : 0,
              owner,
              ownerIdentity: sameClaim
                ? existingEvent.payload.ownerIdentity
                : options.ownerIdentity || PROCESS_IDENTITY,
              claimedAt: at,
              expiresAt: new Date(Date.parse(at) + duration).toISOString(),
            },
          };
        } else if (action === "renew") {
          const owner = requiredString(options.owner, "lease owner");
          const leaseId = requiredString(options.leaseId, "lease id");
          const duration = positiveLeaseDuration(options.leaseMs);
          retryEvent = {
            id: options.eventId,
            type: WORK_ITEM_EVENT_TYPES.LEASE_RENEWED,
            at,
            workItemId,
            payload: {
              leaseId,
              owner,
              renewedAt: at,
              expiresAt: new Date(Date.parse(at) + duration).toISOString(),
            },
          };
        } else if (action === "release") {
          const leaseId = requiredString(options.leaseId, "lease id");
          retryEvent = {
            id: options.eventId,
            type: WORK_ITEM_EVENT_TYPES.RELEASED,
            at,
            workItemId,
            payload: {
              leaseId,
              owner: options.owner || existingEvent.payload?.owner || item.lease?.owner || null,
              releasedAt: at,
            },
          };
        }

        if (retryEvent) {
          const retry = await appendEventLocked(state, retryEvent);
          if (retry.status === "conflict") return { ...retry, lease: item.lease };
          return {
            status: "duplicate",
            lease:
              item.lease ||
              (existingEvent.payload?.leaseId
                ? {
                    schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
                    workItemId,
                    ...existingEvent.payload,
                  }
                : null),
          };
        }
      }

      if (action === "claim") {
        const owner = requiredString(options.owner, "lease owner");
        const duration = positiveLeaseDuration(options.leaseMs);
        if (item.lease && Date.parse(item.lease.expiresAt) > Date.parse(at)) {
          return { status: "busy", lease: item.lease };
        }

        const leaseId =
          existingEvent?.type === WORK_ITEM_EVENT_TYPES.CLAIMED &&
          existingEvent.workItemId === workItemId
            ? existingEvent.payload.leaseId
            : randomUUID();
        // AS-04. Every claim raises the generation. A worker whose lease expired still holds
        // its old generation, so its later writes are refused on sight.
        const leaseGeneration =
          events
            .filter(
              (event) =>
                event.type === WORK_ITEM_EVENT_TYPES.CLAIMED && event.workItemId === workItemId
            )
            .reduce((max, event) => Math.max(max, Number(event.payload?.leaseGeneration || 0)), 0) +
          1;
        const lease = {
          schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
          leaseId,
          leaseGeneration,
          workItemId,
          owner,
          ownerIdentity: options.ownerIdentity || PROCESS_IDENTITY,
          claimedAt: at,
          renewedAt: at,
          expiresAt: new Date(Date.parse(at) + duration).toISOString(),
        };
        const result = await appendEventLocked(state, {
          id: options.eventId || `evt-${randomUUID()}`,
          type: WORK_ITEM_EVENT_TYPES.CLAIMED,
          at,
          workItemId,
          payload: {
            leaseId: lease.leaseId,
            leaseGeneration: lease.leaseGeneration,
            owner: lease.owner,
            ownerIdentity: lease.ownerIdentity,
            claimedAt: lease.claimedAt,
            expiresAt: lease.expiresAt,
          },
        });
        if (result.status === "conflict") return { ...result, lease: item.lease };
        return { status: result.status === "duplicate" ? "duplicate" : "claimed", lease };
      }

      const leaseId = requiredString(options.leaseId, "lease id");
      if (!item.lease) return { status: "missing", lease: null };
      if ((options.owner && item.lease.owner !== options.owner) || item.lease.leaseId !== leaseId) {
        return { status: "busy", lease: item.lease };
      }

      if (action === "renew") {
        const owner = requiredString(options.owner, "lease owner");
        const duration = positiveLeaseDuration(options.leaseMs);
        if (Date.parse(item.lease.expiresAt) <= Date.parse(at)) {
          return { status: "expired", lease: item.lease };
        }
        const lease = {
          ...item.lease,
          owner,
          renewedAt: at,
          expiresAt: new Date(Date.parse(at) + duration).toISOString(),
        };
        const result = await appendEventLocked(state, {
          id: options.eventId || `evt-${randomUUID()}`,
          type: WORK_ITEM_EVENT_TYPES.LEASE_RENEWED,
          at,
          workItemId,
          payload: {
            leaseId: lease.leaseId,
            owner: lease.owner,
            renewedAt: lease.renewedAt,
            expiresAt: lease.expiresAt,
          },
        });
        if (result.status === "conflict") return { ...result, lease: item.lease };
        return { status: result.status === "duplicate" ? "duplicate" : "renewed", lease };
      }

      if (action === "release") {
        const result = await appendEventLocked(state, {
          id: options.eventId || `evt-${randomUUID()}`,
          type: WORK_ITEM_EVENT_TYPES.RELEASED,
          at,
          workItemId,
          payload: {
            leaseId: item.lease.leaseId,
            owner: item.lease.owner,
            releasedAt: at,
          },
        });
        if (result.status === "conflict") return { ...result, lease: item.lease };
        return {
          status: result.status === "duplicate" ? "duplicate" : "released",
          lease: item.lease,
        };
      }

      throw new Error(`Unknown Workbench lease action: ${action}.`);
    })
  );
}

export async function listEvents(state) {
  if (!state?.paths?.events) throw new Error("listEvents needs an opened Workbench state.");
  return readJsonLines(state.paths.events);
}

export async function createWorkItem(state, input) {
  const createdAt = nowIso(input?.createdAt);
  return appendEvent(state, {
    id: input?.eventId || `evt-${randomUUID()}`,
    type: WORK_ITEM_EVENT_TYPES.CREATED,
    at: createdAt,
    workItemId: requiredString(input?.id, "work item id"),
    payload: {
      title: requiredString(input?.title, "work item title"),
      kind: input?.kind || "general",
      priority: input?.priority || "normal",
      externallyActing: Boolean(input?.externallyActing),
      createdAt,
      sourceObservationIds: Array.isArray(input?.sourceObservationIds)
        ? input.sourceObservationIds
        : [],
      dependencies: Array.isArray(input?.dependencies) ? input.dependencies : [],
      resumeWhen: input?.resumeWhen || null,
      evidence: Array.isArray(input?.evidence) ? input.evidence : [],
    },
  });
}

export async function projectWorkItems(state) {
  return projectWorkItemsFromEvents(await listEvents(state));
}

function projectWorkItemsFromEvents(events) {
  const items = new Map();
  for (const event of events) {
    if (!event.workItemId) continue;
    let item = items.get(event.workItemId);

    if (event.type === WORK_ITEM_EVENT_TYPES.CREATED) {
      item = {
        schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
        id: event.workItemId,
        title: event.payload.title,
        kind: event.payload.kind,
        priority: event.payload.priority,
        status: "pending",
        externallyActing: Boolean(event.payload.externallyActing),
        createdAt: event.payload.createdAt || event.at,
        updatedAt: event.at,
        lease: null,
        resumeWhen: event.payload.resumeWhen || null,
        dependencies: event.payload.dependencies || [],
        sourceObservationIds: event.payload.sourceObservationIds || [],
        evidence: event.payload.evidence || [],
        history: [],
      };
      items.set(event.workItemId, item);
    }

    if (!item) continue;

    item.updatedAt = event.at;
    item.history.push({
      sequence: event.sequence,
      id: event.id,
      type: event.type,
      at: event.at,
    });

    if (event.type === WORK_ITEM_EVENT_TYPES.CLAIMED) {
      item.status = "claimed";
      item.lease = {
        leaseId: event.payload.leaseId,
        leaseGeneration: Number(event.payload.leaseGeneration || 1),
        owner: event.payload.owner,
        ownerIdentity: event.payload.ownerIdentity || null,
        claimedAt: event.payload.claimedAt || event.at,
        expiresAt: event.payload.expiresAt,
      };
    }

    if (event.type === WORK_ITEM_EVENT_TYPES.LEASE_RENEWED && item.lease) {
      item.lease = {
        ...item.lease,
        owner: event.payload.owner || item.lease.owner,
        renewedAt: event.payload.renewedAt || event.at,
        expiresAt: event.payload.expiresAt,
      };
    }

    if (event.type === WORK_ITEM_EVENT_TYPES.RELEASED) {
      item.status = "pending";
      item.lease = null;
    }

    if (event.type === WORK_ITEM_EVENT_TYPES.RESUMED) {
      item.status = "pending";
      item.lease = null;
      item.resumeReason = event.payload.reason || null;
    }

    if (event.type === WORK_ITEM_EVENT_TYPES.QUARANTINED) {
      item.status = "quarantined_output";
      item.quarantine = [
        ...(item.quarantine || []),
        {
          at: event.at,
          reason: event.payload.reason,
          recordHash: event.payload.recordHash,
          details: event.payload.details || null,
        },
      ];
    }

    if (event.type === WORK_ITEM_EVENT_TYPES.COMPLETED) {
      item.status = "completed";
      item.completedAt = event.at;
      item.verification = event.payload.verification || null;
      item.lease = null;
    }
  }

  return [...items.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function validateTurnReceipt(input) {
  const receipt = createTurnReceipt(input);
  const phaseNames = receipt.phases.map((phase) => phase?.name);
  const missing = TURN_PHASES.filter((phase) => !phaseNames.includes(phase));
  const unknown = [...new Set(phaseNames.filter((phase) => !TURN_PHASES.includes(phase)))];
  const duplicates = [
    ...new Set(phaseNames.filter((phase, index) => phaseNames.indexOf(phase) !== index)),
  ];
  const failed = receipt.phases
    .filter((phase) => TURN_PHASES.includes(phase?.name) && phase.status !== "success")
    .map((phase) => phase.name);

  const indices = phaseNames
    .filter((name) => TURN_PHASES.includes(name))
    .map((name) => TURN_PHASES.indexOf(name));
  const outOfOrder = indices.some(
    (index, position) => position > 0 && index < indices[position - 1]
  );

  let reason = null;
  if (missing.length) reason = `Turn receipt is missing required phases: ${missing.join(", ")}.`;
  else if (unknown.length) reason = `Turn receipt has unknown phases: ${unknown.join(", ")}.`;
  else if (duplicates.length)
    reason = `Turn receipt repeats required phases: ${duplicates.join(", ")}.`;
  else if (failed.length) reason = `Turn receipt has failed phases: ${failed.join(", ")}.`;
  else if (outOfOrder) reason = "Turn receipt phases are not in the required order.";

  const complete =
    missing.length === 0 &&
    unknown.length === 0 &&
    duplicates.length === 0 &&
    failed.length === 0 &&
    !outOfOrder;
  return {
    ok: complete,
    complete,
    receipt,
    missing,
    unknown,
    duplicates,
    failed,
    outOfOrder,
    reason,
  };
}

export async function recordTurnReceipt(state, input) {
  const validation = validateTurnReceipt(input);
  if (input?.status === "complete" && !validation.ok) {
    throw new Error(validation.reason || "Turn receipt cannot be complete.");
  }

  return appendEvent(state, {
    id: input?.eventId || `evt-${randomUUID()}`,
    type: "turn_receipt.recorded",
    at: input?.at || new Date().toISOString(),
    workItemId: input?.workItemId || null,
    payload: validation.receipt,
  });
}

export async function resetWorkbenchStateRootForTests(root) {
  const resolved = resolveWorkbenchStateRoot({ mode: "test", root });
  await rm(resolved.root, { recursive: true, force: true });
}
