import { createHash } from "node:crypto";
import { createMeetingCloseoutSteps } from "./meeting-closeout.mjs";
import { openWorkbenchState, projectWorkItems } from "./workbench-state/index.mjs";
import {
  listRecoverableSavedStepJobs,
  prepareSavedStepJob,
  projectSavedStepJob,
  readSavedStepJobInput,
  readSavedStepJobOutput,
  requestSavedStepJobStop,
  runSavedStepJob,
} from "./workbench-state/step-runner.mjs";

export const MEETING_CLOSEOUT_JOB_KIND = "meeting-closeout";
export const MEETING_CLOSEOUT_STEP_NAMES = Object.freeze([
  "discover",
  "reconcile_sources",
  "synthesize",
  "store",
  "generate_visual",
  "associate",
  "verify_display",
  "finalize",
]);

const activeRuns = new Map();
let productionStatePromise = null;

function ordered(value) {
  if (Array.isArray(value)) return value.map((entry) => ordered(entry));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, ordered(value[key])])
  );
}

function stableHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(ordered(value)))
    .digest("hex");
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeId(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function meetingIdentity(payload) {
  const meeting = payload?.meeting || {};
  return (
    safeId(meeting.id) ||
    safeId(`${meeting.start || "undated"}-${meeting.title || "meeting"}`) ||
    "meeting"
  );
}

export function meetingCloseoutJobId(payload) {
  return `meeting-closeout-${meetingIdentity(payload)}-${stableHash(payload || {}).slice(0, 16)}`;
}

async function resolveState(options = {}) {
  if (options.state) return options.state;
  if (options.stateOptions) return openWorkbenchState(options.stateOptions);
  if (!productionStatePromise) {
    productionStatePromise = openWorkbenchState({
      mode: "production",
      ...(process.env.MEETING_CLOSEOUT_JOB_STATE_DIR
        ? { root: process.env.MEETING_CLOSEOUT_JOB_STATE_DIR }
        : {}),
    });
  }
  return productionStatePromise;
}

function closeoutOptions(options) {
  return options.closeoutOptions || {};
}

function runnerOptions(payload, workItemId, options = {}) {
  const steps = createMeetingCloseoutSteps(closeoutOptions(options));
  return {
    workItemId,
    title: `Meeting closeout: ${text(payload?.meeting?.title) || "Untitled meeting"}`,
    kind: MEETING_CLOSEOUT_JOB_KIND,
    owner: options.owner || `meeting-closeout-gateway-${process.pid}`,
    leaseMs: options.leaseMs || 30 * 60 * 1000,
    input: payload,
    steps,
  };
}

function activeKey(state, workItemId) {
  return `${state.root}:${workItemId}`;
}

function ownerPid(owner) {
  const match = String(owner || "").match(/^meeting-closeout-gateway-(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function leaseCanBeCleared(item, now = Date.now()) {
  if (!item?.lease) return true;
  if (Date.parse(item.lease.expiresAt) <= now) return true;
  const pid = ownerPid(item.lease.owner);
  return pid !== null && !processIsAlive(pid);
}

function friendlyFailure(code) {
  const messages = {
    invalid_meeting: "Select a meeting before processing.",
    transcript_unavailable:
      "No complete meeting capture is available. Paste the Cluely capture and run it again.",
    transcript_cleanup_unavailable:
      "The pasted capture could not be cleaned safely. Review the capture and run it again.",
    transcript_abridged:
      "The available meeting capture is an excerpt, so the meeting remains unprocessed.",
    transcript_partial:
      "The available meeting capture is incomplete, so the meeting remains unprocessed.",
    transcript_consolidation_unavailable:
      "The available meeting captures could not be combined safely. Run it again after checking the sources.",
    synthesis_unavailable:
      "The review package could not be written from the meeting evidence. Run the failed stage again.",
    meeting_package_incomplete:
      "The package is still missing a required saved file or verified visual.",
  };
  return messages[code] || "The current stage failed. Resume the job to retry that stage.";
}

async function publicJob(state, workItemId) {
  const projected = await projectSavedStepJob(state, workItemId);
  if (!projected) return null;
  const savedInput = await readSavedStepJobInput(state, workItemId).catch(() => ({}));
  const knownSteps = new Map((projected.steps || []).map((step) => [step.name, step]));
  const steps = MEETING_CLOSEOUT_STEP_NAMES.map((name, index) => ({
    name,
    index,
    status: "pending",
    attempts: 0,
    inputHash: null,
    outputHash: null,
    outputRefs: [],
    lastEventAt: null,
    ...(knownSteps.get(name) || {}),
  }));
  const failedStep = steps.find((step) => step.status === "failed");
  const result =
    projected.status === "completed"
      ? await readSavedStepJobOutput(state, workItemId, "finalize").catch(() => null)
      : null;
  return {
    ...projected,
    isActive: activeRuns.has(activeKey(state, workItemId)),
    steps,
    meeting: {
      id: text(savedInput?.meeting?.id) || null,
      title: text(savedInput?.meeting?.title) || "Untitled meeting",
      start: text(savedInput?.meeting?.start) || null,
      end: text(savedInput?.meeting?.end) || null,
    },
    failure: failedStep
      ? {
          stepName: failedStep.name,
          code: failedStep.error?.code || "meeting_closeout_failed",
          detail: friendlyFailure(failedStep.error?.code),
        }
      : null,
    result,
  };
}

function launchRun(state, payload, workItemId, options = {}, resume = false) {
  const key = activeKey(state, workItemId);
  const existing = activeRuns.get(key);
  if (existing) return existing;
  const run = Promise.resolve()
    .then(() =>
      runSavedStepJob(state, {
        ...runnerOptions(payload, workItemId, options),
        resume,
      })
    )
    .finally(() => activeRuns.delete(key));
  activeRuns.set(key, run);
  return run;
}

export async function startMeetingCloseoutJob(payload, options = {}) {
  const state = await resolveState(options);
  const workItemId = options.workItemId || meetingCloseoutJobId(payload);
  await prepareSavedStepJob(state, runnerOptions(payload, workItemId, options));
  const existing = await publicJob(state, workItemId);
  if (existing?.status !== "completed") launchRun(state, payload, workItemId, options, false);
  return {
    accepted: existing?.status !== "completed",
    job: existing,
  };
}

export async function getMeetingCloseoutJob(workItemId, options = {}) {
  const state = await resolveState(options);
  return publicJob(state, workItemId);
}

export async function stopMeetingCloseoutJob(workItemId, options = {}) {
  const state = await resolveState(options);
  const existing = await projectSavedStepJob(state, workItemId);
  if (!existing) return null;
  await requestSavedStepJobStop(state, {
    workItemId,
    reason: options.reason || "user requested stop",
  });
  return publicJob(state, workItemId);
}

export async function resumeMeetingCloseoutJob(workItemId, options = {}) {
  const state = await resolveState(options);
  if (activeRuns.has(activeKey(state, workItemId))) {
    return { accepted: false, job: await publicJob(state, workItemId) };
  }
  const item = (await projectWorkItems(state)).find((entry) => entry.id === workItemId);
  if (!leaseCanBeCleared(item)) {
    return { accepted: false, job: await publicJob(state, workItemId) };
  }
  const payload = await readSavedStepJobInput(state, workItemId);
  const existing = await publicJob(state, workItemId);
  if (existing?.status !== "completed") launchRun(state, payload, workItemId, options, true);
  return {
    accepted: existing?.status !== "completed",
    job: existing,
  };
}

export async function listMeetingCloseoutJobs(options = {}) {
  const state = await resolveState(options);
  const items = (await projectWorkItems(state)).filter(
    (item) => item.kind === MEETING_CLOSEOUT_JOB_KIND
  );
  return Promise.all(items.map((item) => publicJob(state, item.id)));
}

export async function recoverMeetingCloseoutJobs(options = {}) {
  const state = await resolveState(options);
  const recoverable = await listRecoverableSavedStepJobs(state, {
    kind: MEETING_CLOSEOUT_JOB_KIND,
  });
  const workItems = new Map((await projectWorkItems(state)).map((item) => [item.id, item]));
  const interrupted = recoverable.filter((job) => ["pending", "running"].includes(job.status));
  const safeToResume = interrupted.filter((job) =>
    leaseCanBeCleared(workItems.get(job.workItemId))
  );
  for (const job of safeToResume) {
    const payload = await readSavedStepJobInput(state, job.workItemId);
    launchRun(state, payload, job.workItemId, options, true);
  }
  return safeToResume.map((job) => job.workItemId);
}

export async function waitForMeetingCloseoutJob(workItemId, options = {}) {
  const state = await resolveState(options);
  await activeRuns.get(activeKey(state, workItemId));
  return publicJob(state, workItemId);
}
