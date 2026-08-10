import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const ACTIVITY_STATE_VERSION = 1;

export function emptyActivityState() {
  return {
    version: ACTIVITY_STATE_VERSION,
    activeRunId: null,
    sourcePositions: {},
    evidence: {},
    meetingStates: {},
    runs: [],
    applyReceipts: {},
  };
}

function normalizeState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyActivityState();
  return {
    ...emptyActivityState(),
    ...value,
    version: ACTIVITY_STATE_VERSION,
    sourcePositions:
      value.sourcePositions && typeof value.sourcePositions === "object"
        ? value.sourcePositions
        : {},
    evidence: value.evidence && typeof value.evidence === "object" ? value.evidence : {},
    meetingStates:
      value.meetingStates && typeof value.meetingStates === "object" ? value.meetingStates : {},
    runs: Array.isArray(value.runs) ? value.runs : [],
    applyReceipts:
      value.applyReceipts && typeof value.applyReceipts === "object" ? value.applyReceipts : {},
  };
}

async function loadFile(path) {
  try {
    return normalizeState(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return emptyActivityState();
    if (error instanceof SyntaxError) {
      const wrapped = new Error("The saved activity run state is not valid JSON.");
      wrapped.code = "activity_state_malformed";
      throw wrapped;
    }
    throw error;
  }
}

async function saveFile(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporaryPath, path);
}

export function createActivityStore(path) {
  let queue = Promise.resolve();

  function serialized(work) {
    const next = queue.then(work, work);
    queue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  return {
    path,
    read() {
      return serialized(() => loadFile(path));
    },
    update(mutator) {
      return serialized(async () => {
        const state = await loadFile(path);
        const result = await mutator(state);
        const nextState = normalizeState(result?.state ?? state);
        await saveFile(path, nextState);
        return result && Object.hasOwn(result, "value") ? result.value : nextState;
      });
    },
    replace(nextState) {
      return serialized(async () => {
        const normalized = normalizeState(nextState);
        await saveFile(path, normalized);
        return normalized;
      });
    },
  };
}
