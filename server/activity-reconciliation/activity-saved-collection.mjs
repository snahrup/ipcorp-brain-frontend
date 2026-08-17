// Phase 2: activity source collection on the shared saved-step engine.
//
// Each selected source is its own saved step. The engine then provides what the old
// single-shot collect path could not prove: a completed source is skipped on its validated
// artifact after an interruption, the same run id resumes after stop or process loss, a stop
// reaches a reader that is still running, and a stale worker cannot write a late result.
//
// One deliberate translation: a reader that fails does NOT fail its step. The failure becomes
// a failed-source artifact, because one unreachable stream must not erase the results of the
// seven that answered. A failed RUN remains possible only through the engine itself.

import { runSavedStepJob } from "../workbench-state/step-runner.mjs";
import { ACTIVITY_SOURCES } from "./activity-reconciliation.mjs";

function requiredString(value, label) {
  if (!value || typeof value !== "string") {
    throw new Error(`Activity saved collection ${label} is required.`);
  }
  return value;
}

function sourceStepName(sourceId) {
  return `source:${sourceId}`;
}

/**
 * The identity a source step's skip decision rests on. The window and the saved position are
 * the two inputs that decide what a reader would fetch, so when both are unchanged the saved
 * artifact is still the truth and the reader is not called; when either moves the step reruns.
 */
function sourceStepInput(source, context) {
  return {
    sourceId: source.id,
    window: context.input.windows?.[source.id] ?? null,
    position: context.input.positions?.[source.id] ?? null,
  };
}

function normalizeResult(sourceId, result) {
  const value = result && typeof result === "object" ? result : {};
  return {
    id: sourceId,
    state: typeof value.state === "string" ? value.state : "malformed",
    items: Array.isArray(value.items) ? value.items : [],
    detail: typeof value.detail === "string" ? value.detail : null,
    confirmedThrough: typeof value.confirmedThrough === "string" ? value.confirmedThrough : null,
  };
}

function failedResult(sourceId, error) {
  return {
    id: sourceId,
    state: error?.code === "m365_timeout" ? "timed_out" : "failed",
    items: [],
    detail: error?.message ? String(error.message) : "The source reader failed.",
    confirmedThrough: null,
  };
}

/**
 * Runs one activity collection as a saved-step job.
 *
 * options:
 * - state: an opened Workbench state (test mode in checks, production in the gateway).
 * - runId: the activity run id. It IS the work item id, so a resume finds the same job.
 * - owner: the claiming owner.
 * - windows: per-source scan windows, keyed by source id.
 * - positions: per-source saved positions, keyed by source id.
 * - selectedSourceIds: which sources this run reads. Others are not steps at all.
 * - readSource: async ({ sourceId, window, position, signal }) => a source result.
 *   Called once per source. A throw becomes a failed-source artifact unless the signal
 *   aborted, in which case the engine quarantines it as stopped work.
 * - resume, now, leaseMs, stopPollMs: passed through to the engine.
 *
 * Returns { status, workItemId, sources } where sources maps each selected source id to its
 * saved result. `status` is the engine's job status: completed, stopped, busy, failed.
 */
export async function runSavedActivityCollection(options) {
  const runId = requiredString(options?.runId, "runId");
  if (typeof options.readSource !== "function") {
    throw new TypeError("Activity saved collection needs a readSource function.");
  }

  const selectedIds = Array.isArray(options.selectedSourceIds)
    ? options.selectedSourceIds
    : ACTIVITY_SOURCES.map((source) => source.id);
  const selected = ACTIVITY_SOURCES.filter((source) => selectedIds.includes(source.id));
  if (!selected.length) {
    throw new Error("Activity saved collection needs at least one selected source.");
  }

  const steps = selected.map((source) => ({
    name: sourceStepName(source.id),
    getInput: (context) => sourceStepInput(source, context),
    run: async ({ stepInput, signal }) => {
      try {
        const result = await options.readSource({
          sourceId: source.id,
          window: stepInput.window,
          position: stepInput.position,
          signal,
        });
        return normalizeResult(source.id, result);
      } catch (error) {
        // A cancelled reader is stopped work, not a failed source. Rethrowing lets the
        // engine quarantine anything it produced after the stop.
        if (signal?.aborted || error?.name === "AbortError") throw error;
        return failedResult(source.id, error);
      }
    },
    validate: async ({ output }) =>
      output?.id === source.id && typeof output.state === "string" && Array.isArray(output.items),
  }));

  const job = await runSavedStepJob(options.state, {
    workItemId: runId,
    title: `Activity collection ${runId}`,
    kind: "activity-collection",
    owner: requiredString(options?.owner, "owner"),
    input: {
      runId,
      windows: options.windows || {},
      positions: options.positions || {},
      selectedSourceIds: selected.map((source) => source.id),
    },
    steps,
    resume: Boolean(options.resume),
    now: options.now,
    leaseMs: options.leaseMs,
    stopPollMs: options.stopPollMs,
  });

  const sources = {};
  for (const step of job.job?.steps || []) {
    if (!step.name.startsWith("source:")) continue;
    const sourceId = step.name.slice("source:".length);
    sources[sourceId] = {
      status: step.status,
      outputRefs: step.outputRefs || [],
      attempts: step.attempts,
    };
  }
  return { status: job.status, workItemId: runId, lease: job.lease ?? null, sources };
}

export { sourceStepName };
