import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_PATH = fileURLToPath(import.meta.url);
const FRONTEND_ROOT = resolve(dirname(MODULE_PATH), "../..");
const DEFAULT_RUN_ROOT = join(FRONTEND_ROOT, "workflow-runs", "mdm-jira-rebuild");
const DEFAULT_SYNTHESIS_SCRIPT = join(
  FRONTEND_ROOT,
  "server",
  "mdm-reconciliation",
  "synthesize-weekly-activities.mjs"
);
const STATUS_FILE_NAME = "weekly-synthesis-queue-status.json";
const STATUS_SCHEMA_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS_PER_RUN = 2;
const MAX_ATTEMPTS_PER_RUN = 5;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 60_000;
const MAX_CHILD_LOG_CHARACTERS = 20_000;

export const FULL_SETTLEMENT_WEEKS = Object.freeze([
  "2026-05-04",
  "2026-05-11",
  "2026-05-18",
  "2026-05-25",
  "2026-06-01",
  "2026-06-08",
  "2026-06-15",
  "2026-06-22",
  "2026-06-29",
  "2026-07-06",
  "2026-07-13",
  "2026-07-20",
]);

export const QUEUE_POLICY = Object.freeze({
  retroactiveWindowStart: "2026-05-01",
  retroactiveWindowEnd: "2026-07-28",
  firstSettlementWeek: FULL_SETTLEMENT_WEEKS[0],
  lastSettlementWeek: FULL_SETTLEMENT_WEEKS.at(-1),
  partialPeriodsExcluded: Object.freeze([
    Object.freeze({ start: "2026-05-01", end: "2026-05-03" }),
    Object.freeze({ start: "2026-07-27", end: "2026-07-28" }),
  ]),
  jiraWritesAllowed: false,
});

const ALLOWED_DISPOSITIONS = new Set([
  "completed",
  "active-now",
  "planned",
  "research",
  "blocked",
  "obsolete",
  "unknown",
]);

export class SynthesisTimeoutError extends Error {
  constructor(weekOf, timeoutMs) {
    super(`Weekly synthesis for ${weekOf} exceeded ${timeoutMs} ms.`);
    this.name = "SynthesisTimeoutError";
    this.code = "SYNTHESIS_TIMEOUT";
    this.weekOf = weekOf;
    this.timeoutMs = timeoutMs;
  }
}

function timestamp(now) {
  const value = now();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function appendBounded(current, chunk, limit = MAX_CHILD_LOG_CHARACTERS) {
  const combined = `${current}${String(chunk)}`;
  return combined.length <= limit ? combined : combined.slice(-limit);
}

function sanitizeDiagnostic(value) {
  return String(value || "")
    .replace(
      /\b(authorization|password|secret|token|api[_-]?key)\b\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]"
    )
    .slice(-4_000);
}

function summarizeError(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    code: error && typeof error === "object" && "code" in error ? String(error.code) : null,
    message: sanitizeDiagnostic(error instanceof Error ? error.message : String(error)),
    exitCode: error && typeof error === "object" && "exitCode" in error ? error.exitCode : null,
    signal: error && typeof error === "object" && "signal" in error ? error.signal : null,
    stderrTail:
      error && typeof error === "object" && "stderr" in error
        ? sanitizeDiagnostic(error.stderr)
        : "",
  };
}

function assertIntegerInRange(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`);
  }
}

function assertQueueWeeks(weeks) {
  if (!Array.isArray(weeks) || weeks.length === 0) {
    throw new Error("The synthesis queue requires at least one full settlement week.");
  }

  const allowed = new Set(FULL_SETTLEMENT_WEEKS);
  const unique = new Set();
  for (const week of weeks) {
    if (!allowed.has(week)) {
      throw new Error(
        `${week} is outside the approved full-week settlement queue. ` +
          "May 1-3 and July 27-28 are intentionally excluded."
      );
    }
    if (unique.has(week)) {
      throw new Error(`Duplicate settlement week ${week}.`);
    }
    unique.add(week);
  }
}

function assertRunDirectory(runRoot, runDirectory) {
  const normalizedRoot = resolve(runRoot);
  const normalizedRunDirectory = resolve(runDirectory);
  const relation = relative(normalizedRoot, normalizedRunDirectory);
  if (relation === "" || relation.startsWith("..") || isAbsolute(relation)) {
    throw new Error(`The current run directory must be a direct child of ${normalizedRoot}.`);
  }
  if (relation.includes("/") || relation.includes("\\")) {
    throw new Error(`The current run directory must be a direct child of ${normalizedRoot}.`);
  }
  return normalizedRunDirectory;
}

async function resolveCurrentRunDirectory(runRoot) {
  const latestPath = join(runRoot, "latest.json");
  const latest = JSON.parse(await readFile(latestPath, "utf8"));
  if (!latest || typeof latest.runDirectory !== "string") {
    throw new Error(`${latestPath} does not declare a runDirectory.`);
  }
  const runDirectory = assertRunDirectory(runRoot, latest.runDirectory);
  const details = await stat(runDirectory);
  if (!details.isDirectory()) {
    throw new Error(`${runDirectory} is not a directory.`);
  }
  return runDirectory;
}

async function writeFileDurably(path, content) {
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function writeJsonCheckpoint(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const backupPath = `${path}.bak`;
  const content = `${JSON.stringify(value, null, 2)}\n`;

  await writeFileDurably(temporaryPath, content);
  try {
    try {
      await copyFile(path, backupPath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    try {
      await rename(temporaryPath, path);
    } catch (error) {
      if (!["EEXIST", "EPERM"].includes(error?.code)) throw error;
      await rm(path, { force: true });
      await rename(temporaryPath, path);
    }
  } catch (error) {
    try {
      await copyFile(backupPath, path);
    } catch {
      // The backup is best-effort; preserve the original write error.
    }
    throw error;
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function readJsonCheckpoint(path) {
  const candidates = [path, `${path}.bak`];
  let lastError = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(await readFile(candidate, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") lastError = error;
    }
  }
  if (lastError) {
    throw new Error(
      `Neither ${path} nor its backup contains a valid queue checkpoint: ${lastError.message}`
    );
  }
  return null;
}

export function validateWeeklyOutput(value, weekOf) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: ["Output must be a JSON object."] };
  }
  if (value.weekOf !== weekOf) {
    errors.push(`weekOf must equal ${weekOf}.`);
  }
  if (!Array.isArray(value.activities)) {
    errors.push("activities must be an array.");
  }
  if (!Array.isArray(value.unresolved)) {
    errors.push("unresolved must be an array.");
  }
  if (!Array.isArray(value.excluded)) {
    errors.push("excluded must be an array.");
  }
  if (!value.coverage || typeof value.coverage !== "object") {
    errors.push("coverage is required.");
  } else {
    for (const field of [
      "sourceRecords",
      "condensedGroups",
      "ineligibleGroupsWithheld",
      "includedGroups",
      "omittedGroups",
    ]) {
      if (!Number.isFinite(value.coverage[field]) || value.coverage[field] < 0) {
        errors.push(`coverage.${field} must be a non-negative number.`);
      }
    }
    if (typeof value.coverage.bounded !== "boolean") {
      errors.push("coverage.bounded must be a boolean.");
    }
  }
  for (const flag of [
    "personalWorkExcluded",
    "soloByDefault",
    "activeNowRequiresCurrentEvidence",
    "hiddenReasoningExcluded",
  ]) {
    if (value.policy?.[flag] !== true) {
      errors.push(`policy.${flag} must be true.`);
    }
  }

  const activityIds = new Set();
  for (const activity of value.activities || []) {
    if (!activity || typeof activity !== "object") {
      errors.push("Every activity must be an object.");
      continue;
    }
    if (typeof activity.stableId !== "string" || !activity.stableId.trim()) {
      errors.push("Every activity requires a stableId.");
    } else if (activityIds.has(activity.stableId)) {
      errors.push(`Duplicate activity stableId ${activity.stableId}.`);
    } else {
      activityIds.add(activity.stableId);
    }
    if (typeof activity.title !== "string" || !activity.title.trim()) {
      errors.push(`${activity.stableId || "activity"} requires a title.`);
    }
    if (!ALLOWED_DISPOSITIONS.has(activity.disposition)) {
      errors.push(`${activity.stableId || "activity"} has an invalid disposition.`);
    }
    if (
      !Array.isArray(activity.evidenceRefs) ||
      activity.evidenceRefs.length === 0 ||
      activity.evidenceRefs.some((reference) => typeof reference !== "string" || !reference.trim())
    ) {
      errors.push(`${activity.stableId || "activity"} requires non-empty evidenceRefs.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

async function readAndValidateWeeklyOutput(path, weekOf) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return { value, ...validateWeeklyOutput(value, weekOf) };
  } catch (error) {
    return {
      value: null,
      valid: false,
      errors: [
        error?.code === "ENOENT"
          ? "Output file does not exist."
          : `Output file is not valid JSON: ${error.message}`,
      ],
    };
  }
}

function terminateProcessTree(child) {
  if (!child.pid) return Promise.resolve();
  if (process.platform !== "win32") {
    child.kill("SIGKILL");
    return Promise.resolve();
  }

  return new Promise((resolveTermination) => {
    execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, () =>
      resolveTermination()
    );
  });
}

export function runSynthesisChild({
  weekOf,
  timeoutMs,
  cwd = FRONTEND_ROOT,
  scriptPath = DEFAULT_SYNTHESIS_SCRIPT,
}) {
  return new Promise((resolveChild, rejectChild) => {
    const child = spawn(process.execPath, [scriptPath, "--week", weekOf], {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };

    child.stdout.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.on("error", (error) => settle(rejectChild, error));
    child.on("close", (exitCode, signal) => {
      if (timedOut) return;
      if (exitCode === 0) {
        settle(resolveChild, { exitCode, signal, stdout, stderr });
        return;
      }
      const error = new Error(
        `Weekly synthesis for ${weekOf} exited with code ${exitCode ?? "unknown"}.`
      );
      error.code = "SYNTHESIS_CHILD_FAILED";
      error.exitCode = exitCode;
      error.signal = signal;
      error.stdout = stdout;
      error.stderr = stderr;
      settle(rejectChild, error);
    });

    const timeout = setTimeout(async () => {
      if (settled) return;
      timedOut = true;
      await terminateProcessTree(child);
      settle(rejectChild, new SynthesisTimeoutError(weekOf, timeoutMs));
    }, timeoutMs);
  });
}

function initialWeekState(weekOf, outputPath, previous) {
  return {
    weekOf,
    outputPath,
    state: previous?.state || "pending",
    attemptsTotal: Number(previous?.attemptsTotal || 0),
    lastAttemptStartedAt: previous?.lastAttemptStartedAt || null,
    lastAttemptFinishedAt: previous?.lastAttemptFinishedAt || null,
    completedAt: previous?.completedAt || null,
    lastAction: previous?.lastAction || null,
    validationErrors: Array.isArray(previous?.validationErrors) ? previous.validationErrors : [],
    lastError: previous?.lastError || null,
  };
}

function queueSummary(weeks) {
  const summary = {
    total: weeks.length,
    succeeded: 0,
    failed: 0,
    pending: 0,
    running: 0,
  };
  for (const week of weeks) {
    if (week.state === "succeeded") summary.succeeded += 1;
    else if (week.state === "failed") summary.failed += 1;
    else if (week.state === "running") summary.running += 1;
    else summary.pending += 1;
  }
  return summary;
}

function buildQueueState({
  existing,
  runDirectory,
  weeks,
  outputRoot,
  now,
  invocationId,
  timeoutMs,
  maxAttemptsPerRun,
}) {
  const previousWeeks = new Map((existing?.weeks || []).map((week) => [week.weekOf, week]));
  const weekStates = weeks.map((weekOf) =>
    initialWeekState(weekOf, join(outputRoot, `${weekOf}.json`), previousWeeks.get(weekOf))
  );
  return {
    schemaVersion: STATUS_SCHEMA_VERSION,
    queueId: "mdm-full-week-synthesis-2026-05-04-through-2026-07-20",
    runDirectory,
    policy: {
      ...QUEUE_POLICY,
      settlementWeeks: [...FULL_SETTLEMENT_WEEKS],
    },
    state: "running",
    createdAt: existing?.createdAt || timestamp(now),
    updatedAt: timestamp(now),
    completedAt: null,
    invocation: {
      id: invocationId,
      startedAt: timestamp(now),
      completedAt: null,
      timeoutMs,
      maxAttemptsPerRun,
    },
    weeks: weekStates,
    summary: queueSummary(weekStates),
  };
}

async function delay(milliseconds) {
  if (milliseconds <= 0) return;
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

export async function runWeeklySynthesisQueue({
  runRoot = DEFAULT_RUN_ROOT,
  runDirectory: suppliedRunDirectory = null,
  weeks = FULL_SETTLEMENT_WEEKS,
  childRunner = runSynthesisChild,
  synthesisScriptPath = DEFAULT_SYNTHESIS_SCRIPT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxAttemptsPerRun = DEFAULT_MAX_ATTEMPTS_PER_RUN,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  now = () => new Date(),
  logger = console,
  wait = delay,
} = {}) {
  assertQueueWeeks(weeks);
  assertIntegerInRange(timeoutMs, "timeoutMs", 1, MAX_TIMEOUT_MS);
  assertIntegerInRange(maxAttemptsPerRun, "maxAttemptsPerRun", 1, MAX_ATTEMPTS_PER_RUN);
  assertIntegerInRange(retryDelayMs, "retryDelayMs", 0, MAX_RETRY_DELAY_MS);

  const normalizedRunRoot = resolve(runRoot);
  const runDirectory = suppliedRunDirectory
    ? assertRunDirectory(normalizedRunRoot, suppliedRunDirectory)
    : await resolveCurrentRunDirectory(normalizedRunRoot);
  const outputRoot = join(runDirectory, "weekly-activities");
  const statusPath = join(runDirectory, STATUS_FILE_NAME);
  const existing = await readJsonCheckpoint(statusPath);
  const invocationId = randomUUID();
  const state = buildQueueState({
    existing,
    runDirectory,
    weeks,
    outputRoot,
    now,
    invocationId,
    timeoutMs,
    maxAttemptsPerRun,
  });

  await mkdir(outputRoot, { recursive: true });
  await writeJsonCheckpoint(statusPath, state);

  for (const week of state.weeks) {
    const existingOutput = await readAndValidateWeeklyOutput(week.outputPath, week.weekOf);
    if (existingOutput.valid) {
      week.state = "succeeded";
      week.completedAt ||= timestamp(now);
      week.lastAction = "skipped-valid-output";
      week.validationErrors = [];
      week.lastError = null;
      state.updatedAt = timestamp(now);
      state.summary = queueSummary(state.weeks);
      await writeJsonCheckpoint(statusPath, state);
      logger.info?.(
        JSON.stringify({
          weekOf: week.weekOf,
          state: week.state,
          action: week.lastAction,
        })
      );
      continue;
    }

    week.validationErrors = existingOutput.errors;
    let succeeded = false;
    for (let attemptInRun = 1; attemptInRun <= maxAttemptsPerRun; attemptInRun += 1) {
      week.state = "running";
      week.attemptsTotal += 1;
      week.lastAttemptStartedAt = timestamp(now);
      week.lastAttemptFinishedAt = null;
      week.lastAction = "synthesis-started";
      week.lastError = null;
      state.updatedAt = timestamp(now);
      state.summary = queueSummary(state.weeks);
      await writeJsonCheckpoint(statusPath, state);

      try {
        const runnerResult = await childRunner({
          weekOf: week.weekOf,
          timeoutMs,
          cwd: FRONTEND_ROOT,
          scriptPath: synthesisScriptPath,
          outputPath: week.outputPath,
          runDirectory,
          attemptInRun,
        });
        const generatedOutput = await readAndValidateWeeklyOutput(week.outputPath, week.weekOf);
        if (!generatedOutput.valid) {
          const validationError = new Error(
            `Synthesis completed without a valid ${week.weekOf} output: ` +
              generatedOutput.errors.join(" ")
          );
          validationError.code = "INVALID_SYNTHESIS_OUTPUT";
          throw validationError;
        }

        week.state = "succeeded";
        week.completedAt = timestamp(now);
        week.lastAttemptFinishedAt = timestamp(now);
        week.lastAction = "generated-and-validated";
        week.validationErrors = [];
        week.lastError = null;
        week.lastRunner = runnerResult
          ? {
              exitCode: runnerResult.exitCode ?? null,
              signal: runnerResult.signal ?? null,
              stdoutTail: sanitizeDiagnostic(runnerResult.stdout),
              stderrTail: sanitizeDiagnostic(runnerResult.stderr),
            }
          : null;
        succeeded = true;
        logger.info?.(
          JSON.stringify({
            weekOf: week.weekOf,
            state: week.state,
            attemptsTotal: week.attemptsTotal,
          })
        );
        break;
      } catch (error) {
        week.state = "failed";
        week.completedAt = null;
        week.lastAttemptFinishedAt = timestamp(now);
        week.lastAction = "attempt-failed";
        week.lastError = summarizeError(error);
        const currentOutput = await readAndValidateWeeklyOutput(week.outputPath, week.weekOf);
        week.validationErrors = currentOutput.errors;
        logger.error?.(
          JSON.stringify({
            weekOf: week.weekOf,
            state: week.state,
            attemptInRun,
            attemptsTotal: week.attemptsTotal,
            error: week.lastError,
          })
        );
      } finally {
        state.updatedAt = timestamp(now);
        state.summary = queueSummary(state.weeks);
        await writeJsonCheckpoint(statusPath, state);
      }

      if (attemptInRun < maxAttemptsPerRun) {
        await wait(Math.min(retryDelayMs * attemptInRun, MAX_RETRY_DELAY_MS));
      }
    }

    if (!succeeded) {
      week.state = "failed";
      week.lastAction = "retry-budget-exhausted";
      state.updatedAt = timestamp(now);
      state.summary = queueSummary(state.weeks);
      await writeJsonCheckpoint(statusPath, state);
    }
  }

  state.summary = queueSummary(state.weeks);
  state.state = state.summary.failed === 0 ? "completed" : "completed-with-failures";
  state.updatedAt = timestamp(now);
  state.completedAt = timestamp(now);
  state.invocation.completedAt = timestamp(now);
  await writeJsonCheckpoint(statusPath, state);
  return { state, statusPath };
}

function parseBoundedInteger(value, label, minimum, maximum) {
  const parsed = Number(value);
  assertIntegerInRange(parsed, label, minimum, maximum);
  return parsed;
}

function parseArguments(argumentsList) {
  const options = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--max-attempts") {
      options.maxAttemptsPerRun = parseBoundedInteger(
        argumentsList[++index],
        "--max-attempts",
        1,
        MAX_ATTEMPTS_PER_RUN
      );
    } else if (argument === "--timeout-ms") {
      options.timeoutMs = parseBoundedInteger(
        argumentsList[++index],
        "--timeout-ms",
        1,
        MAX_TIMEOUT_MS
      );
    } else if (argument === "--retry-delay-ms") {
      options.retryDelayMs = parseBoundedInteger(
        argumentsList[++index],
        "--retry-delay-ms",
        0,
        MAX_RETRY_DELAY_MS
      );
    } else if (argument === "--help") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument ${argument}.`);
    }
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        "Usage: node run-weekly-synthesis-queue.mjs [options]",
        "",
        "Options:",
        `  --max-attempts N     Attempts per failed week in this run (1-${MAX_ATTEMPTS_PER_RUN})`,
        `  --timeout-ms N       Overall timeout per week (1-${MAX_TIMEOUT_MS})`,
        `  --retry-delay-ms N   Delay between retries (0-${MAX_RETRY_DELAY_MS})`,
        "  --help               Show this help",
        "",
        "The queue is fixed to the 12 full settlement weeks from May 4 through July 20, 2026.",
        "It never calls Jira. May 1-3 and July 27-28 are intentionally excluded.",
      ].join("\n")
    );
    return;
  }

  const result = await runWeeklySynthesisQueue(options);
  console.log(
    JSON.stringify({
      ok: result.state.summary.failed === 0,
      state: result.state.state,
      summary: result.state.summary,
      statusPath: result.statusPath,
    })
  );
  if (result.state.summary.failed > 0) process.exitCode = 1;
}

const isMain =
  process.argv[1] && resolve(process.argv[1]).toLowerCase() === resolve(MODULE_PATH).toLowerCase();
if (isMain) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        error: summarizeError(error),
      })
    );
    process.exitCode = 1;
  });
}
