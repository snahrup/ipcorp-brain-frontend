/**
 * Measure how long other people actually take.
 *
 * This exists because of one number. A sensitivity sweep over the domain plan showed
 * that doubling every effort figure moves the finish 12%, doubling every agent duration
 * moves it 0%, and doubling the latency figures moves it 77%. The schedule is a claim
 * about human response time wearing a costume made of effort estimates, and every one
 * of those response times was invented.
 *
 * The good news is that latency is the one quantity here that cannot be gamed at
 * closeout. Effort gets written down at the end to match whatever was estimated, which
 * is exactly what the board's worklogs did. But "this was asked on the 3rd and answered
 * on the 11th" is two timestamps that either exist or do not.
 *
 * The vocabulary follows waitdeadai/minmaxing, which names the right distinctions even
 * though it ships no schema to copy. Only the concepts were taken.
 *
 * Storage lives outside the repository on purpose. Tailwind's source scan watches every
 * non-ignored file, so writing observations into the working tree would full-reload
 * every open Workbench tab whenever a wait was recorded.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Reuses the same root the agent runs and launcher logs already write under. */
function localAppDataRoot() {
  return process.env.LOCALAPPDATA || join(process.env.USERPROFILE || homedir(), "AppData", "Local");
}

export function latencyLogPath() {
  return (
    process.env.IPCORP_LATENCY_LOG_PATH ||
    join(localAppDataRoot(), "IPCorpBrain", "latency-observations.json")
  );
}

/**
 * The moments worth stamping on a piece of work.
 *
 * `askedAt` and `answeredAt` are the pair that matter and the only two that are
 * mandatory. The rest narrow down WHERE the time went, which is the difference between
 * "this took nine days" and "this took nine days, seven of them waiting for a steward
 * who had not been asked yet".
 */
export const MOMENTS = [
  "startedAt",
  "planFrozenAt",
  "implementationStartedAt",
  "verificationCompletedAt",
  "closedAt",
];

export class LatencyLogError extends Error {
  constructor(message) {
    super(message);
    this.name = "LatencyLogError";
  }
}

function toDay(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Whole working days between two instants, weekends excluded.
 *
 * Waiting is counted in working days because that is how the plan schedules. A request
 * sent on Friday and answered on Monday waited one working day, not three, and calling
 * it three would inflate every weekend into a delay somebody has to explain.
 */
export function workingDaysBetween(from, to, isWorkday) {
  const start = toDay(from);
  const end = toDay(to);
  if (start === null || end === null) return null;
  if (end < start) return null;

  let days = 0;
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setUTCHours(0, 0, 0, 0);
  while (cursor < last) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isWorkday(cursor.toISOString().slice(0, 10))) days += 1;
  }
  return days;
}

/**
 * Turn one recorded wait into an observation, or say why it cannot be used.
 *
 * A record missing either end of the pair is rejected rather than half-counted. Half a
 * measurement is not a small measurement, it is a guess with a timestamp attached.
 */
export function toObservation(record, isWorkday) {
  const task = String(record?.task ?? "").trim();
  if (!task) return { ok: false, reason: "no task text, so it cannot be matched to a step" };
  if (!record.askedAt) return { ok: false, reason: "no askedAt, so the wait has no start" };
  if (!record.answeredAt) {
    return { ok: false, reason: "still open, so the wait has not finished yet" };
  }

  const waitingDays = workingDaysBetween(record.askedAt, record.answeredAt, isWorkday);
  if (waitingDays === null) {
    return { ok: false, reason: "the timestamps are unreadable or run backwards" };
  }

  return {
    ok: true,
    observation: {
      task,
      domain: record.domain ?? null,
      who: record.who ?? null,
      askedAt: record.askedAt,
      answeredAt: record.answeredAt,
      waitingDays,
      humanBlockerMinutes: Number(record.humanBlockerMinutes) || 0,
      moments: Object.fromEntries(
        MOMENTS.filter((moment) => record[moment]).map((moment) => [moment, record[moment]])
      ),
    },
  };
}

/** Below this, one slow reply becomes the whole template's truth. */
const MINIMUM_SAMPLES = 3;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Measured waiting per template step, with the same refusal discipline the effort
 * calibration uses.
 *
 * A step with too few observations keeps its planned figure and is reported as
 * unmeasured. Nothing is blended, averaged toward the guess, or quietly filled in: a
 * reader has to be able to point at any latency figure on the plan and be told either
 * "measured, from four observations" or "still a guess".
 */
export function measureLatency({ records, isWorkday, minimumSamples = MINIMUM_SAMPLES }) {
  const observations = [];
  const rejected = [];
  for (const record of records ?? []) {
    const result = toObservation(record, isWorkday);
    if (result.ok) observations.push(result.observation);
    else rejected.push({ task: record?.task ?? "(unnamed)", reason: result.reason });
  }

  const byTask = new Map();
  for (const observation of observations) {
    if (!byTask.has(observation.task)) byTask.set(observation.task, []);
    byTask.get(observation.task).push(observation.waitingDays);
  }

  const measured = {};
  const tooFew = [];
  for (const [task, waits] of byTask) {
    if (waits.length < minimumSamples) {
      tooFew.push({ task, samples: waits.length });
      continue;
    }
    measured[task] = {
      latencyDays: Math.round(median(waits)),
      samples: waits.length,
      spreadDays: [Math.min(...waits), Math.max(...waits)],
    };
  }

  return { observations, rejected, measured, tooFew };
}

/**
 * Replace planned latency with measured latency where it exists.
 *
 * Every returned step says which it is. A plan that cannot tell you which of its dates
 * rest on evidence is the thing this whole exercise was trying to stop producing.
 */
export function applyMeasuredLatency({ templateTasks, measurement }) {
  return templateTasks.map((template) => {
    const found = measurement.measured[template.task];
    if (!found) {
      return { ...template, latencyBasis: "estimated", latencySamples: 0 };
    }
    return {
      ...template,
      latencyDays: found.latencyDays,
      plannedLatencyDays: template.latencyDays,
      latencyBasis: "measured",
      latencySamples: found.samples,
      latencySpreadDays: found.spreadDays,
    };
  });
}

/** How much of the schedule now rests on evidence rather than judgment. */
export function coverage(applied) {
  const withWait = applied.filter((task) => task.latencyDays > 0 || task.plannedLatencyDays > 0);
  const measured = withWait.filter((task) => task.latencyBasis === "measured");
  return {
    stepsThatWait: withWait.length,
    measured: measured.length,
    share: withWait.length ? Math.round((measured.length / withWait.length) * 100) / 100 : 0,
  };
}

export async function readRecords(path = latencyLogPath()) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (reason) {
    if (reason?.code === "ENOENT") return [];
    throw new LatencyLogError(`The latency log at ${path} could not be read: ${reason.message}`);
  }
}

/**
 * Append one wait. Read-modify-write, because the log is small and a person recording a
 * steward's reply is not a concurrent workload.
 */
export async function recordWait(record, path = latencyLogPath()) {
  const existing = await readRecords(path);
  existing.push(record);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(existing, null, 2), "utf8");
  return existing.length;
}
