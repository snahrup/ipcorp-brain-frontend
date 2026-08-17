import { createHash } from "node:crypto";
import {
  appendEvent,
  completeWorkItem,
  createWorkItem,
  listEvents,
  projectWorkItems,
  recordTurnReceipt,
  TURN_PHASES,
} from "../workbench-state/index.mjs";

const DEFAULT_LEASE_MS = 30 * 60 * 1_000;
const ACTIVITY_EVENT_TYPES = Object.freeze({
  PHASE_CHANGED: "activity.phase_changed",
  STOPPED: "activity.run_stopped",
  INTERRUPTED: "activity.run_interrupted",
});

function requiredString(value, label) {
  if (!value || typeof value !== "string") {
    throw new Error(`Activity lifecycle ${label} is required.`);
  }
  return value;
}

function iso(value, label) {
  const text = value instanceof Date ? value.toISOString() : value;
  requiredString(text, label);
  if (Number.isNaN(Date.parse(text))) {
    throw new Error(`Activity lifecycle ${label} must be an ISO timestamp.`);
  }
  return text;
}

function positiveLeaseMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error("Activity lifecycle leaseMs must be positive.");
  }
  return number;
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function eventId(action, run, details = {}) {
  return `activity:${requiredString(run?.id, "run id")}:${action}:${stableHash(details).slice(0, 20)}`;
}

function runStartedAt(run) {
  return iso(run?.startedAt, "run startedAt");
}

function runClaimedAt(run) {
  return iso(run?.resumedAt || run?.startedAt, "run claim timestamp");
}

function phaseAt(run) {
  return iso(
    run?.phase?.startedAt || run?.lastActivityAt || run?.resumedAt || run?.startedAt,
    "phase timestamp"
  );
}

function finishAt(run) {
  return iso(
    run?.finishedAt || run?.lastActivityAt || run?.resumedAt || run?.startedAt,
    "finish timestamp"
  );
}

function integer(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function safeCounts(run) {
  const counts = run?.counts || {};
  return Object.fromEntries(
    Object.entries(counts)
      .filter(([, value]) => Number.isFinite(Number(value)))
      .map(([key, value]) => [key, integer(value)])
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function safeSourceStates(run) {
  return Object.values(run?.sources || {})
    .filter((source) => source && typeof source === "object")
    .map((source) => ({
      id: requiredString(source.id, "source id"),
      state: typeof source.state === "string" ? source.state : "unknown",
      itemCount: integer(source.itemCount),
      newCount: integer(source.newCount),
      updatedCount: integer(source.updatedCount ?? source.changedCount),
      unchangedCount: integer(source.unchangedCount),
      confirmedThrough:
        typeof source.confirmedThrough === "string" ? source.confirmedThrough : null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function safeMeetingJobs(run) {
  return (Array.isArray(run?.meetings) ? run.meetings : [])
    .map((meeting) => {
      const jobId =
        meeting?.jobId ||
        meeting?.meetingJobId ||
        meeting?.meetingJob?.id ||
        meeting?.receipt?.jobId ||
        null;
      if (!jobId || typeof jobId !== "string") return null;
      return {
        jobId,
        status:
          typeof meeting.status === "string"
            ? meeting.status
            : typeof meeting.meetingJob?.status === "string"
              ? meeting.meetingJob.status
              : "unknown",
        currentStep:
          meeting.currentStep ||
          meeting.currentStage ||
          meeting.meetingJob?.currentStep ||
          meeting.receipt?.currentStep ||
          null,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.jobId.localeCompare(right.jobId));
}

function safeReceiptRef(value) {
  if (!value || typeof value !== "object") return null;
  const ref = {};
  for (const key of ["kind", "id", "jobId", "receiptId", "hash"]) {
    if (typeof value[key] === "string" && value[key]) ref[key] = value[key];
  }
  return Object.keys(ref).length ? ref : null;
}

function safeReceiptRefs(run) {
  const refs = Array.isArray(run?.receiptRefs) ? run.receiptRefs : [];
  const meetingRefs = (Array.isArray(run?.meetings) ? run.meetings : [])
    .map((meeting) => safeReceiptRef(meeting?.receipt))
    .filter(Boolean);
  return [...refs.map(safeReceiptRef).filter(Boolean), ...meetingRefs].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  );
}

function safeRunSummary(run) {
  return {
    runId: requiredString(run?.id, "run id"),
    status: typeof run?.status === "string" ? run.status : "unknown",
    startedAt: runStartedAt(run),
    finishedAt: typeof run?.finishedAt === "string" ? run.finishedAt : null,
    resumable: run?.resumable === true,
    resumeCount: integer(run?.resumeCount),
    phase: {
      id: typeof run?.phase?.id === "string" ? run.phase.id : "unknown",
      name:
        typeof run?.phase?.label === "string"
          ? run.phase.label
          : typeof run?.phase?.id === "string"
            ? run.phase.id
            : "Unknown phase",
      index: integer(run?.phase?.index),
      total: integer(run?.phase?.total),
      startedAt: typeof run?.phase?.startedAt === "string" ? run.phase.startedAt : null,
    },
    counts: safeCounts(run),
    sourceStates: safeSourceStates(run),
    meetingJobs: safeMeetingJobs(run),
    receiptRefs: safeReceiptRefs(run),
  };
}

async function defaultOwnerAlive(owner) {
  const match = String(owner || "").match(/(?:^|[-:])(\d+)$/);
  if (!match) return null;
  const pid = Number(match[1]);
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return null;
  }
}

function assertOpenedState(state) {
  if (!state?.paths?.events || typeof state.claimWorkItem !== "function") {
    throw new Error("Activity lifecycle needs an opened Workbench state.");
  }
}

function createCompletionPhases(run) {
  const summary = safeRunSummary(run);
  return TURN_PHASES.map((name) => {
    if (name === "host_execute") {
      return {
        name,
        status: "success",
        runId: summary.runId,
        startedAt: summary.startedAt,
        finishedAt: summary.finishedAt,
      };
    }
    if (name === "typed_result") {
      return { name, status: "success", counts: summary.counts };
    }
    if (name === "validation") {
      return {
        name,
        status: "success",
        sourceStates: summary.sourceStates,
        meetingJobs: summary.meetingJobs,
      };
    }
    if (name === "durable_writeback") {
      return { name, status: "success", receiptRefs: summary.receiptRefs };
    }
    if (name === "quota_spend") {
      return { name, status: "success", mode: "not_applicable" };
    }
    return { name, status: "success", mode: "manual_run" };
  });
}

export function createActivityLifecycle(options = {}) {
  const state = options.state;
  assertOpenedState(state);
  const owner = requiredString(options.owner || `activity-reconciliation-${process.pid}`, "owner");
  const leaseMs = positiveLeaseMs(options.leaseMs || DEFAULT_LEASE_MS);
  // No clock here on purpose: every timestamp this module records comes from the run record
  // it was handed, so the run stays reproducible from its own evidence.
  const isOwnerAlive =
    typeof options.isOwnerAlive === "function" ? options.isOwnerAlive : defaultOwnerAlive;
  // The lease this instance holds, remembered from its own claim. Completion presents this
  // rather than re-reading the current lease, which would compare a value to itself.
  const claimedLeases = new Map();

  async function itemFor(runId) {
    return (await projectWorkItems(state)).find((item) => item.id === runId) || null;
  }

  async function prepareRun(run) {
    const workItemId = requiredString(run?.id, "run id");
    const createdAt = runStartedAt(run);
    return createWorkItem(state, {
      id: workItemId,
      title: `Activity reconciliation ${workItemId}`,
      kind: "activity-reconciliation",
      priority: "normal",
      createdAt,
      eventId: eventId("created", run, { createdAt }),
      evidence: [{ kind: "activity-run", runId: workItemId, startedAt: createdAt }],
    });
  }

  async function releaseLease(run, eventType) {
    const workItemId = requiredString(run?.id, "run id");
    const item = await itemFor(workItemId);
    if (!item?.lease) return { status: "missing", lease: null };
    const at = finishAt(run);
    if (item.lease.owner !== owner && Date.parse(item.lease.expiresAt) > Date.parse(at)) {
      const alive = await isOwnerAlive(item.lease.owner);
      if (alive !== false) return { status: "busy", lease: item.lease };
    }
    return state.releaseWorkItem(workItemId, {
      owner: item.lease.owner,
      leaseId: item.lease.leaseId,
      now: at,
      eventId: eventId(`release-${eventType}`, run, {
        leaseId: item.lease.leaseId,
        at,
      }),
    });
  }

  async function claimRun(run) {
    await prepareRun(run);
    const workItemId = run.id;
    const at = runClaimedAt(run);
    const claimId = eventId("claim", run, {
      owner,
      resumeCount: integer(run.resumeCount),
      at,
    });
    let item = await itemFor(workItemId);
    let recoveredOwner = null;

    if (item?.lease && item.lease.owner !== owner) {
      const active = Date.parse(item.lease.expiresAt) > Date.parse(at);
      if (active) {
        const alive = await isOwnerAlive(item.lease.owner);
        if (alive !== false) return { status: "busy", lease: item.lease };
        recoveredOwner = item.lease.owner;
        const released = await state.releaseWorkItem(workItemId, {
          owner: item.lease.owner,
          leaseId: item.lease.leaseId,
          now: at,
          eventId: eventId("dead-owner-release", run, {
            leaseId: item.lease.leaseId,
            owner: item.lease.owner,
            at,
          }),
        });
        if (!["released", "duplicate"].includes(released.status)) {
          return { ...released, recoveredOwner: null };
        }
      }
    }

    item = await itemFor(workItemId);
    if (integer(run.resumeCount) > 0 && (!item?.lease || item.lease.owner !== owner)) {
      await state.resumeWorkItem(workItemId, {
        reason: recoveredOwner ? "dead owner recovery" : "activity run resumed",
        now: at,
        eventId: eventId("resumed", run, {
          resumeCount: integer(run.resumeCount),
          recoveredOwner,
          at,
        }),
      });
    }

    const result = await state.claimWorkItem(workItemId, {
      owner,
      leaseMs,
      now: at,
      eventId: claimId,
    });
    if (result?.lease?.leaseId) {
      claimedLeases.set(workItemId, {
        leaseId: result.lease.leaseId,
        leaseGeneration: result.lease.leaseGeneration ?? null,
      });
    }
    return { ...result, recoveredOwner };
  }

  async function phaseChanged(run) {
    const workItemId = requiredString(run?.id, "run id");
    const summary = safeRunSummary(run);
    const at = phaseAt(run);
    const item = await itemFor(workItemId);
    if (!item?.lease) {
      return { event: { status: "missing" }, lease: { status: "missing", lease: null } };
    }
    if (item.lease.owner !== owner) {
      return { event: { status: "busy" }, lease: { status: "busy", lease: item.lease } };
    }
    const lease = await state.renewWorkItemLease(workItemId, {
      owner,
      leaseId: item.lease.leaseId,
      leaseMs,
      now: at,
      eventId: eventId("renew", run, {
        leaseId: item.lease.leaseId,
        phase: summary.phase,
      }),
    });
    if (!["renewed", "duplicate"].includes(lease.status)) {
      return { event: { status: lease.status }, lease };
    }
    const event = await appendEvent(state, {
      id: eventId("phase", run, summary),
      type: ACTIVITY_EVENT_TYPES.PHASE_CHANGED,
      at,
      workItemId,
      payload: summary,
    });
    return { event, lease };
  }

  async function finishRun(run, type) {
    const workItemId = requiredString(run?.id, "run id");
    const at = finishAt(run);
    const summary = safeRunSummary(run);
    const event = await appendEvent(state, {
      id: eventId(type, run, summary),
      type,
      at,
      workItemId,
      payload: summary,
    });
    const release = await releaseLease(run, type);
    return { event, release };
  }

  async function runStopped(run) {
    return finishRun(run, ACTIVITY_EVENT_TYPES.STOPPED);
  }

  async function runInterrupted(run) {
    return finishRun(run, ACTIVITY_EVENT_TYPES.INTERRUPTED);
  }

  async function runCompleted(run) {
    const workItemId = requiredString(run?.id, "run id");
    if (!["completed", "partial_success"].includes(run?.status)) {
      throw new Error("Activity lifecycle can only complete a completed or partial-success run.");
    }
    const at = finishAt(run);
    const summary = safeRunSummary(run);
    const receiptId = `activity-receipt:${workItemId}`;
    const receiptEventId = eventId("receipt", run, {
      receiptId,
      status: run.status,
      finishedAt: at,
      summary,
    });
    const receipt = await recordTurnReceipt(state, {
      id: receiptId,
      workItemId,
      status: "complete",
      phases: createCompletionPhases(run),
      at,
      eventId: receiptEventId,
    });
    // AS-08. Completion goes through completeWorkItem, which rechecks that this caller still
    // holds the current lease. Activity reconciliation performs no live external effect, so
    // it needs no destination readback, but it cannot complete work it has lost.
    //
    // This module presents ITS OWN identity, never whatever the state currently says. Reading
    // the current lease and handing it straight back would compare the lease to itself and
    // always match, which is a check in name only.
    const held = claimedLeases.get(workItemId) || null;
    const current = (await projectWorkItems(state)).find((entry) => entry.id === workItemId);
    const completion = await completeWorkItem(state, {
      eventId: eventId("completed", run, {
        receiptId,
        receiptEventId,
        status: run.status,
        finishedAt: at,
      }),
      workItemId,
      owner,
      leaseId: held?.leaseId ?? current?.lease?.leaseId ?? null,
      leaseGeneration: held?.leaseGeneration ?? current?.lease?.leaseGeneration ?? null,
      now: at,
      verification: {
        runId: workItemId,
        runStatus: run.status,
        finishedAt: at,
        receiptId,
        receiptEventId,
        counts: summary.counts,
        sourceStates: summary.sourceStates,
        meetingJobs: summary.meetingJobs,
        receiptRefs: summary.receiptRefs,
      },
    });
    return { receipt, completion, run: await projectRun(workItemId) };
  }

  async function projectRun(runId) {
    requiredString(runId, "run id");
    const [item, events] = await Promise.all([
      itemFor(runId),
      listEvents(state).then((rows) => rows.filter((event) => event.workItemId === runId)),
    ]);
    if (!item && events.length === 0) return null;
    const receiptEvent = events.filter((event) => event.type === "turn_receipt.recorded").at(-1);
    return {
      workItemId: runId,
      item,
      phaseEvents: events.filter((event) => event.type === ACTIVITY_EVENT_TYPES.PHASE_CHANGED),
      lifecycleEvents: events.filter((event) =>
        [ACTIVITY_EVENT_TYPES.STOPPED, ACTIVITY_EVENT_TYPES.INTERRUPTED].includes(event.type)
      ),
      receipt: receiptEvent?.payload || null,
    };
  }

  return {
    prepareRun,
    claimRun,
    phaseChanged,
    runStopped,
    runInterrupted,
    runCompleted,
    projectRun,
  };
}
