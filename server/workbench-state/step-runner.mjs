import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  appendEvent,
  createWorkItem,
  listEvents,
  projectWorkItems,
  WORKBENCH_STATE_SCHEMA_VERSION,
} from "./index.mjs";

export const SAVED_STEP_EVENT_TYPES = Object.freeze({
  INPUT_RECORDED: "saved_step_job.input_recorded",
  STEP_STARTED: "saved_step_job.step_started",
  STEP_SUCCEEDED: "saved_step_job.step_succeeded",
  STEP_FAILED: "saved_step_job.step_failed",
  STEP_SKIPPED: "saved_step_job.step_skipped",
  STOP_REQUESTED: "saved_step_job.stop_requested",
  TURN_RECEIPT_RECORDED: "saved_step_job.turn_receipt_recorded",
});

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

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

function hashValue(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function hashText(value) {
  return createHash("sha256")
    .update(String(value || ""))
    .digest("hex");
}

function requiredString(value, label) {
  if (!value || typeof value !== "string") throw new Error(`Saved step job ${label} is required.`);
  return value;
}

function nowIso(value) {
  if (!value) return new Date().toISOString();
  if (Number.isNaN(Date.parse(value))) throw new Error("Saved step job now must be an ISO time.");
  return value;
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

function safeFilePart(value) {
  return requiredString(value, "id").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function assertOpenedState(state) {
  if (!state?.paths?.snapshots || !state?.paths?.events) {
    throw new Error("Saved step jobs need an opened Workbench state.");
  }
}

function snapshotPath(state, ...parts) {
  assertOpenedState(state);
  const target = join(state.paths.snapshots, ...parts);
  if (!isSameOrWithin(state.paths.snapshots, target)) {
    throw new Error("Saved step job refused to write outside the snapshot root.");
  }
  return target;
}

function snapshotRef(state, path, extra = {}) {
  if (!isSameOrWithin(state.paths.snapshots, path)) {
    throw new Error("Saved step job refused an artifact outside the snapshot root.");
  }
  return {
    kind: "workbench-state-json",
    path: relative(state.paths.snapshots, path).replaceAll("\\", "/"),
    ...extra,
  };
}

function pathFromRef(state, ref) {
  const target = snapshotPath(state, ...(ref?.path || "").split(/[\\/]/).filter(Boolean));
  if (!isSameOrWithin(state.paths.snapshots, target)) {
    throw new Error("Saved step job refused an artifact ref outside the snapshot root.");
  }
  return target;
}

async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.${safeFilePart(`${process.pid}-${randomUUID()}`)}.tmp`);
  const handle = await open(temp, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temp, path);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function validateSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error("Saved step job needs at least one caller-supplied step.");
  }
  const names = steps.map((step) => requiredString(step?.name, "step name"));
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicate) throw new Error(`Saved step job has a duplicate step: ${duplicate}.`);
  for (const step of steps) {
    if (typeof step.run !== "function") {
      throw new Error(`Saved step job step ${step.name} needs a run function.`);
    }
  }
  return names;
}

function stepDirPath(state, workItemId) {
  return snapshotPath(state, "saved-step-jobs", safeFilePart(workItemId), "steps");
}

function inputPath(state, workItemId) {
  return snapshotPath(state, "saved-step-jobs", safeFilePart(workItemId), "input.json");
}

function receiptPath(state, workItemId) {
  return snapshotPath(state, "saved-step-jobs", safeFilePart(workItemId), "turn-receipt.json");
}

function artifactPath(state, workItemId, stepIndex, stepName) {
  return join(
    stepDirPath(state, workItemId),
    `${String(stepIndex + 1).padStart(2, "0")}-${safeFilePart(stepName)}.json`
  );
}

function stepEvents(events, workItemId, stepName) {
  return events.filter(
    (event) => event.workItemId === workItemId && event.payload?.stepName === stepName
  );
}

function stepAttempt(events, workItemId, stepName) {
  return stepEvents(events, workItemId, stepName).reduce(
    (max, event) => Math.max(max, Number(event.payload?.attempt || 0)),
    0
  );
}

function latestStepSuccess(events, workItemId, stepName) {
  return stepEvents(events, workItemId, stepName)
    .filter((event) =>
      [SAVED_STEP_EVENT_TYPES.STEP_SUCCEEDED, SAVED_STEP_EVENT_TYPES.STEP_SKIPPED].includes(
        event.type
      )
    )
    .at(-1);
}

function latestSequence(events, type, workItemId) {
  return events
    .filter((event) => event.type === type && event.workItemId === workItemId)
    .reduce((max, event) => Math.max(max, Number(event.sequence || 0)), 0);
}

function hasActiveStopRequest(events, workItemId) {
  const stop = latestSequence(events, SAVED_STEP_EVENT_TYPES.STOP_REQUESTED, workItemId);
  if (!stop) return false;
  const resumed = latestSequence(events, "work_item.resumed", workItemId);
  const completed = latestSequence(events, "work_item.completed", workItemId);
  return stop > resumed && stop > completed;
}

function normalizeError(error) {
  return {
    name: error?.name || "Error",
    code: error?.code || null,
    messageHash: hashText(error?.message || error?.name || "error"),
  };
}

async function ensureWorkItem(state, options, inputHash, stepNames, at) {
  const existing = (await projectWorkItems(state)).find((item) => item.id === options.workItemId);
  if (existing) return existing;
  await createWorkItem(state, {
    id: options.workItemId,
    title: options.title || options.workItemId,
    kind: options.kind || "saved-step-job",
    priority: options.priority || "normal",
    createdAt: at,
    eventId: options.createEventId,
    evidence: [
      {
        kind: "saved-step-input",
        inputHash,
        stepNames,
      },
    ],
  });
  return (await projectWorkItems(state)).find((item) => item.id === options.workItemId);
}

async function recordInput(state, options, inputHash, at) {
  const path = inputPath(state, options.workItemId);
  const inputRef = snapshotRef(state, path, { hash: inputHash });
  let existingHash = null;
  try {
    existingHash = (await readJson(path)).inputHash || null;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  if (existingHash !== inputHash) {
    await atomicWriteJson(path, {
      schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
      workItemId: options.workItemId,
      writtenAt: at,
      inputHash,
      input: options.input,
    });
    await appendEvent(state, {
      id: options.inputEventId || `evt-${randomUUID()}`,
      type: SAVED_STEP_EVENT_TYPES.INPUT_RECORDED,
      at,
      workItemId: options.workItemId,
      payload: {
        inputHash,
        inputRef,
      },
    });
  }
  return inputRef;
}

async function readArtifact(state, ref) {
  return readJson(pathFromRef(state, ref));
}

async function validateSavedOutput(state, step, successEvent) {
  const ref = successEvent?.payload?.outputRefs?.[0];
  if (!ref) return { ok: false, output: null };
  let artifact;
  try {
    artifact = await readArtifact(state, ref);
  } catch (error) {
    if (error?.code === "ENOENT") return { ok: false, output: null };
    throw error;
  }
  if (artifact.inputHash !== successEvent.payload.inputHash) return { ok: false, output: null };
  if (artifact.outputHash !== successEvent.payload.outputHash) return { ok: false, output: null };
  if (hashValue(artifact.output) !== successEvent.payload.outputHash) {
    return { ok: false, output: null };
  }
  if (typeof step.validate === "function") {
    const callerOk = await step.validate({
      output: artifact.output,
      artifact,
      outputRefs: successEvent.payload.outputRefs,
      inputHash: successEvent.payload.inputHash,
      outputHash: successEvent.payload.outputHash,
      state,
    });
    if (callerOk !== true) return { ok: false, output: null };
  }
  return { ok: true, output: artifact.output, artifact };
}

async function writeStepArtifact(state, workItemId, stepIndex, stepName, value) {
  const path = artifactPath(state, workItemId, stepIndex, stepName);
  await atomicWriteJson(path, value);
  const artifactHash = hashText(JSON.stringify(value));
  return snapshotRef(state, path, { hash: artifactHash });
}

function buildStepInput(step, context) {
  if (typeof step.getInput === "function") return step.getInput(context);
  return {
    input: context.input,
    outputs: context.outputs,
  };
}

async function claimLease(state, options, at) {
  return state.claimWorkItem(options.workItemId, {
    owner: requiredString(options.owner, "owner"),
    leaseMs: options.leaseMs || DEFAULT_LEASE_MS,
    now: at,
    eventId: options.claimEventId,
  });
}

async function releaseLease(state, options, lease, at) {
  if (!lease?.leaseId) return;
  await state.releaseWorkItem(options.workItemId, {
    owner: options.owner,
    leaseId: lease.leaseId,
    now: at,
  });
}

export async function requestSavedStepJobStop(state, input) {
  assertOpenedState(state);
  const at = nowIso(input?.now);
  return appendEvent(state, {
    id: input?.eventId || `evt-${randomUUID()}`,
    type: SAVED_STEP_EVENT_TYPES.STOP_REQUESTED,
    at,
    workItemId: requiredString(input?.workItemId, "work item id"),
    payload: {
      reasonHash: hashText(input?.reason || "stop requested"),
      requestedAt: at,
    },
  });
}

export async function prepareSavedStepJob(state, options) {
  assertOpenedState(state);
  const workItemId = requiredString(options?.workItemId, "work item id");
  const stepNames = validateSteps(options?.steps);
  const at = nowIso(options?.now);
  const inputHash = hashValue(options.input || {});
  await ensureWorkItem(state, { ...options, workItemId }, inputHash, stepNames, at);
  const inputRef = await recordInput(state, { ...options, workItemId }, inputHash, at);
  return {
    workItemId,
    stepNames,
    at,
    inputHash,
    inputRef,
    job: await projectSavedStepJob(state, workItemId),
  };
}

export async function readSavedStepJobInput(state, workItemId) {
  assertOpenedState(state);
  const saved = await readJson(inputPath(state, requiredString(workItemId, "work item id")));
  return saved.input || {};
}

export async function readSavedStepJobOutput(state, workItemId, stepName) {
  assertOpenedState(state);
  const projection = await projectSavedStepJob(state, requiredString(workItemId, "work item id"));
  const step = projection?.steps?.find(
    (entry) => entry.name === requiredString(stepName, "step name")
  );
  const ref = step?.outputRefs?.[0];
  if (!ref) return null;
  return (await readArtifact(state, ref)).output || null;
}

export async function runSavedStepJob(state, options) {
  const prepared = await prepareSavedStepJob(state, options);
  const { workItemId, at, inputRef } = prepared;

  if (options?.resume) {
    await state.resumeWorkItem(workItemId, {
      reason: "saved step job resumed",
      now: at,
      eventId: options.resumeEventId,
    });
  }

  const claim = await claimLease(state, { ...options, workItemId }, at);
  if (claim.status === "busy") {
    return {
      status: "busy",
      workItemId,
      lease: claim.lease,
      job: await projectSavedStepJob(state, workItemId),
    };
  }
  if (!["claimed", "duplicate"].includes(claim.status)) {
    return {
      status: claim.status,
      workItemId,
      lease: claim.lease,
      job: await projectSavedStepJob(state, workItemId),
    };
  }

  let completed = false;
  try {
    const outputs = {};
    for (let stepIndex = 0; stepIndex < options.steps.length; stepIndex += 1) {
      let events = await listEvents(state);
      if (hasActiveStopRequest(events, workItemId)) {
        return { status: "stopped", workItemId, job: await projectSavedStepJob(state, workItemId) };
      }

      const step = options.steps[stepIndex];
      const stepInput = await buildStepInput(step, {
        input: options.input || {},
        outputs,
        state,
        workItemId,
      });
      const stepInputHash = hashValue(stepInput || {});
      const priorSuccess = latestStepSuccess(events, workItemId, step.name);
      if (priorSuccess?.payload?.inputHash === stepInputHash) {
        const validation = await validateSavedOutput(state, step, priorSuccess);
        if (validation.ok) {
          outputs[step.name] = validation.output;
          const skipAttempt = stepAttempt(events, workItemId, step.name) || 1;
          await appendEvent(state, {
            id: `evt-${randomUUID()}`,
            type: SAVED_STEP_EVENT_TYPES.STEP_SKIPPED,
            at: nowIso(),
            workItemId,
            payload: {
              stepName: step.name,
              stepIndex,
              attempt: skipAttempt,
              inputHash: stepInputHash,
              outputHash: priorSuccess.payload.outputHash,
              outputRefs: priorSuccess.payload.outputRefs,
              reason: "validated_saved_output",
            },
          });
          continue;
        }
      }

      events = await listEvents(state);
      const attempt = stepAttempt(events, workItemId, step.name) + 1;
      await appendEvent(state, {
        id: `evt-${randomUUID()}`,
        type: SAVED_STEP_EVENT_TYPES.STEP_STARTED,
        at: nowIso(),
        workItemId,
        payload: {
          stepName: step.name,
          stepIndex,
          attempt,
          inputHash: stepInputHash,
          inputRef,
        },
      });

      try {
        const output = await step.run({
          stepInput,
          input: options.input || {},
          outputs,
          state,
          workItemId,
          attempt,
        });
        const outputHash = hashValue(output || {});
        const outputRef = await writeStepArtifact(state, workItemId, stepIndex, step.name, {
          schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
          workItemId,
          stepName: step.name,
          stepIndex,
          attempt,
          writtenAt: nowIso(),
          inputHash: stepInputHash,
          outputHash,
          output: output || {},
        });
        const artifactValidation = await validateSavedOutput(
          state,
          step,
          {
            payload: {
              inputHash: stepInputHash,
              outputHash,
              outputRefs: [outputRef],
            },
          },
          output
        );
        if (!artifactValidation.ok) {
          throw new Error("Saved step output did not pass validation.");
        }
        await appendEvent(state, {
          id: `evt-${randomUUID()}`,
          type: SAVED_STEP_EVENT_TYPES.STEP_SUCCEEDED,
          at: nowIso(),
          workItemId,
          payload: {
            stepName: step.name,
            stepIndex,
            attempt,
            inputHash: stepInputHash,
            outputHash,
            outputRefs: [outputRef],
          },
        });
        outputs[step.name] = output || {};
      } catch (error) {
        await appendEvent(state, {
          id: `evt-${randomUUID()}`,
          type: SAVED_STEP_EVENT_TYPES.STEP_FAILED,
          at: nowIso(),
          workItemId,
          payload: {
            stepName: step.name,
            stepIndex,
            attempt,
            inputHash: stepInputHash,
            error: normalizeError(error),
          },
        });
        return { status: "failed", workItemId, job: await projectSavedStepJob(state, workItemId) };
      }
    }

    const receipt = await writeTurnReceipt(state, workItemId, options.steps);
    await appendEvent(state, {
      id: `evt-${randomUUID()}`,
      type: "work_item.completed",
      at: nowIso(),
      workItemId,
      payload: {
        receiptHash: receipt.receiptHash,
        receiptRef: receipt.receiptRef,
      },
    });
    completed = true;
    return { status: "completed", workItemId, job: await projectSavedStepJob(state, workItemId) };
  } finally {
    if (!completed) await releaseLease(state, { ...options, workItemId }, claim.lease, nowIso());
  }
}

async function writeTurnReceipt(state, workItemId, steps) {
  const projection = await projectSavedStepJob(state, workItemId);
  const receipt = {
    schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
    workItemId,
    status: "complete",
    recordedAt: nowIso(),
    steps: steps.map((step, index) => {
      const projected = projection.steps.find((entry) => entry.name === step.name);
      return {
        name: step.name,
        index,
        status: projected?.status === "failed" ? "failed" : "success",
        inputHash: projected?.inputHash || null,
        outputHash: projected?.outputHash || null,
        outputRefs: projected?.outputRefs || [],
        attempts: projected?.attempts || 0,
      };
    }),
  };
  const receiptHash = hashValue(receipt);
  const path = receiptPath(state, workItemId);
  await atomicWriteJson(path, { ...receipt, receiptHash });
  const receiptRef = snapshotRef(state, path, { hash: receiptHash });
  await appendEvent(state, {
    id: `evt-${randomUUID()}`,
    type: SAVED_STEP_EVENT_TYPES.TURN_RECEIPT_RECORDED,
    at: nowIso(),
    workItemId,
    payload: {
      receiptHash,
      receiptRef,
      stepNames: receipt.steps.map((step) => step.name),
    },
  });
  return { receipt, receiptHash, receiptRef };
}

export async function projectSavedStepJob(state, workItemId) {
  assertOpenedState(state);
  requiredString(workItemId, "work item id");
  const events = (await listEvents(state)).filter((event) => event.workItemId === workItemId);
  if (!events.length) return null;

  const inputEvent = events
    .filter((event) => event.type === SAVED_STEP_EVENT_TYPES.INPUT_RECORDED)
    .at(-1);
  const completedEvent = events.filter((event) => event.type === "work_item.completed").at(-1);
  const receiptEvent = events
    .filter((event) => event.type === SAVED_STEP_EVENT_TYPES.TURN_RECEIPT_RECORDED)
    .at(-1);
  const stepMap = new Map();

  for (const event of events) {
    const stepName = event.payload?.stepName;
    if (!stepName) continue;
    const existing = stepMap.get(stepName) || {
      name: stepName,
      index: event.payload.stepIndex,
      status: "pending",
      attempts: 0,
      inputHash: null,
      outputHash: null,
      outputRefs: [],
      lastEventAt: null,
    };
    existing.index = Number(event.payload.stepIndex ?? existing.index);
    existing.attempts = Math.max(existing.attempts, Number(event.payload.attempt || 0));
    existing.inputHash = event.payload.inputHash || existing.inputHash;
    existing.lastEventAt = event.at;
    if (event.type === SAVED_STEP_EVENT_TYPES.STEP_STARTED) existing.status = "running";
    if (event.type === SAVED_STEP_EVENT_TYPES.STEP_FAILED) {
      existing.status = "failed";
      existing.error = event.payload.error || null;
    }
    if (event.type === SAVED_STEP_EVENT_TYPES.STEP_SUCCEEDED) {
      existing.status = "succeeded";
      existing.outputHash = event.payload.outputHash;
      existing.outputRefs = event.payload.outputRefs || [];
      delete existing.error;
    }
    if (event.type === SAVED_STEP_EVENT_TYPES.STEP_SKIPPED) {
      existing.status = "skipped";
      existing.outputHash = event.payload.outputHash;
      existing.outputRefs = event.payload.outputRefs || [];
      existing.skipReason = event.payload.reason || null;
      delete existing.error;
    }
    stepMap.set(stepName, existing);
  }

  let turnReceipt = null;
  if (receiptEvent?.payload?.receiptRef) {
    try {
      const receipt = await readArtifact(state, receiptEvent.payload.receiptRef);
      turnReceipt = {
        status: receipt.status,
        receiptHash: receipt.receiptHash || receiptEvent.payload.receiptHash,
        receiptRef: receiptEvent.payload.receiptRef,
        steps: Array.isArray(receipt.steps) ? receipt.steps : [],
      };
    } catch {
      turnReceipt = {
        status: "missing",
        receiptHash: receiptEvent.payload.receiptHash || null,
        receiptRef: receiptEvent.payload.receiptRef,
        steps: [],
      };
    }
  }

  const stopped = hasActiveStopRequest(events, workItemId);
  const failed = [...stepMap.values()].some((step) => step.status === "failed");
  const running = [...stepMap.values()].some((step) => step.status === "running");
  const status = completedEvent
    ? "completed"
    : stopped
      ? "stop_requested"
      : failed
        ? "failed"
        : running
          ? "running"
          : "pending";

  return {
    schemaVersion: WORKBENCH_STATE_SCHEMA_VERSION,
    workItemId,
    status,
    inputHash: inputEvent?.payload?.inputHash || null,
    inputRef: inputEvent?.payload?.inputRef || null,
    stopRequested: stopped,
    steps: [...stepMap.values()].sort((a, b) => a.index - b.index),
    turnReceipt,
  };
}

export async function listRecoverableSavedStepJobs(state, options = {}) {
  const items = await projectWorkItems(state);
  const projected = await Promise.all(
    items
      .filter((item) => !options.kind || item.kind === options.kind)
      .map((item) => projectSavedStepJob(state, item.id))
  );
  return projected.filter((job) => job && job.status !== "completed");
}
