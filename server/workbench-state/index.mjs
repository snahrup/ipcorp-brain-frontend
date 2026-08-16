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
});

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

function safeFilePart(value) {
  return requiredString(value, "id").replace(/[^a-zA-Z0-9._-]/g, "_");
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
    join(paths.leases, `${safeFilePart(workItemId)}.mutation.lock`),
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
      return appendEvent(this, {
        id: options?.eventId || `evt-${randomUUID()}`,
        type: WORK_ITEM_EVENT_TYPES.RESUMED,
        at: nowIso(options.now),
        workItemId,
        payload: {
          reason: options.reason || "resume requested",
        },
      });
    },
  };
}

export async function appendEvent(state, event) {
  if (!state?.paths?.events) throw new Error("appendEvent needs an opened Workbench state.");
  requiredString(event?.id, "event id");
  requiredString(event?.type, "event type");
  iso(event?.at, "event at");

  return withEventWriterLock(state.paths, () => appendEventLocked(state, event));
}

async function appendEventLocked(state, event) {
  const body = eventBody(event);
  const contentHash = hashValue(body);
  const events = await listEvents(state);
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
          retryEvent = {
            id: options.eventId,
            type: WORK_ITEM_EVENT_TYPES.CLAIMED,
            at,
            workItemId,
            payload: {
              leaseId:
                existingEvent.type === WORK_ITEM_EVENT_TYPES.CLAIMED &&
                existingEvent.workItemId === workItemId
                  ? existingEvent.payload.leaseId
                  : "conflicting-lease-id",
              owner,
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
        const lease = {
          schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
          leaseId,
          workItemId,
          owner,
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
            owner: lease.owner,
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
        owner: event.payload.owner,
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

    if (event.type === WORK_ITEM_EVENT_TYPES.COMPLETED) {
      item.status = "completed";
      item.completedAt = event.at;
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
