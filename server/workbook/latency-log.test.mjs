import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { HOLIDAYS } from "./domain-plan.mjs";
import {
  applyMeasuredLatency,
  coverage,
  measureLatency,
  readRecords,
  recordWait,
  toObservation,
  workingDaysBetween,
} from "./latency-log.mjs";

/** Weekends and the same company holidays the planner honours. */
const isWorkday = (day) => {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !HOLIDAYS.has(day);
};

const STEWARD = "Get steward/owner acceptance (light-touch ask)";
const KICKOFF = "Hold the initial meeting with the named stewards";

const TEMPLATE = [
  { task: STEWARD, latencyDays: 7 },
  { task: KICKOFF, latencyDays: 10 },
  { task: "Implement ETL", latencyDays: 0 },
];

function wait({ task = STEWARD, askedAt, answeredAt, ...rest }) {
  return { task, askedAt, answeredAt, ...rest };
}

test("counts working days and skips the weekend between them", () => {
  // Friday to Monday is one working day of waiting, not three.
  assert.equal(workingDaysBetween("2026-08-14", "2026-08-17", isWorkday), 1);
  assert.equal(workingDaysBetween("2026-08-17", "2026-08-21", isWorkday), 4);
  assert.equal(workingDaysBetween("2026-08-17", "2026-08-17", isWorkday), 0);
});

test("skips company holidays as well as weekends", () => {
  // 2026-11-26 and 27 are Thanksgiving and the day after, then a weekend.
  assert.equal(workingDaysBetween("2026-11-25", "2026-11-30", isWorkday), 1);
});

test("a wait that is still open is rejected rather than counted as short", () => {
  const result = toObservation(wait({ askedAt: "2026-08-17", answeredAt: null }), isWorkday);
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("still open"));
});

test("timestamps that run backwards are rejected, not made positive", () => {
  const result = toObservation(
    wait({ askedAt: "2026-08-21", answeredAt: "2026-08-17" }),
    isWorkday
  );
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("backwards"));
});

test("a record with no task text cannot be matched and is rejected", () => {
  const result = toObservation({ askedAt: "2026-08-17", answeredAt: "2026-08-21" }, isWorkday);
  assert.equal(result.ok, false);
});

test("keeps the extra moments when they are supplied", () => {
  const result = toObservation(
    wait({
      askedAt: "2026-08-17",
      answeredAt: "2026-08-21",
      who: "steward",
      planFrozenAt: "2026-08-18",
      closedAt: "2026-08-21",
      humanBlockerMinutes: 45,
    }),
    isWorkday
  );
  assert.equal(result.ok, true);
  assert.equal(result.observation.waitingDays, 4);
  assert.equal(result.observation.humanBlockerMinutes, 45);
  assert.deepEqual(result.observation.moments, {
    planFrozenAt: "2026-08-18",
    closedAt: "2026-08-21",
  });
});

test("a step with too few observations keeps its planned figure", () => {
  const measurement = measureLatency({
    records: [
      wait({ askedAt: "2026-08-17", answeredAt: "2026-08-21" }),
      wait({ askedAt: "2026-09-07", answeredAt: "2026-09-10" }),
    ],
    isWorkday,
  });
  assert.deepEqual(measurement.measured, {});
  assert.equal(measurement.tooFew[0].samples, 2);

  const applied = applyMeasuredLatency({ templateTasks: TEMPLATE, measurement });
  const steward = applied.find((task) => task.task === STEWARD);
  assert.equal(steward.latencyDays, 7, "the planned figure must survive untouched");
  assert.equal(steward.latencyBasis, "estimated");
});

test("three or more observations replace the guess with the measured median", () => {
  const measurement = measureLatency({
    records: [
      wait({ askedAt: "2026-08-17", answeredAt: "2026-08-19" }), // 2 days
      wait({ askedAt: "2026-09-07", answeredAt: "2026-09-10" }), // 3 days
      wait({ askedAt: "2026-10-05", answeredAt: "2026-10-08" }), // 3 days
    ],
    isWorkday,
  });
  assert.equal(measurement.measured[STEWARD].latencyDays, 3);
  assert.equal(measurement.measured[STEWARD].samples, 3);
  assert.deepEqual(measurement.measured[STEWARD].spreadDays, [2, 3]);

  const applied = applyMeasuredLatency({ templateTasks: TEMPLATE, measurement });
  const steward = applied.find((task) => task.task === STEWARD);
  assert.equal(steward.latencyDays, 3, "measured beats the guess");
  assert.equal(steward.plannedLatencyDays, 7);
  assert.equal(steward.latencyBasis, "measured");
});

test("measuring one step never disturbs another", () => {
  const measurement = measureLatency({
    records: [
      wait({ askedAt: "2026-08-17", answeredAt: "2026-08-19" }),
      wait({ askedAt: "2026-09-07", answeredAt: "2026-09-10" }),
      wait({ askedAt: "2026-10-05", answeredAt: "2026-10-08" }),
    ],
    isWorkday,
  });
  const applied = applyMeasuredLatency({ templateTasks: TEMPLATE, measurement });
  assert.equal(applied.find((task) => task.task === KICKOFF).latencyDays, 10);
  assert.equal(applied.find((task) => task.task === KICKOFF).latencyBasis, "estimated");
});

test("coverage says how much of the waiting now rests on evidence", () => {
  const measurement = measureLatency({
    records: [
      wait({ askedAt: "2026-08-17", answeredAt: "2026-08-19" }),
      wait({ askedAt: "2026-09-07", answeredAt: "2026-09-10" }),
      wait({ askedAt: "2026-10-05", answeredAt: "2026-10-08" }),
    ],
    isWorkday,
  });
  const applied = applyMeasuredLatency({ templateTasks: TEMPLATE, measurement });
  const result = coverage(applied);
  // Two of the three steps involve waiting; one of those is now measured.
  assert.equal(result.stepsThatWait, 2);
  assert.equal(result.measured, 1);
  assert.equal(result.share, 0.5);
});

test("with nothing recorded, every figure stays a guess and coverage is zero", () => {
  const measurement = measureLatency({ records: [], isWorkday });
  const applied = applyMeasuredLatency({ templateTasks: TEMPLATE, measurement });
  assert.equal(coverage(applied).share, 0);
  for (const task of applied) assert.equal(task.latencyBasis, "estimated");
});

test("the log round-trips through disk without touching the repository", async () => {
  const dir = await mkdtemp(join(tmpdir(), "latency-"));
  const path = join(dir, "nested", "observations.json");
  try {
    assert.deepEqual(await readRecords(path), [], "a missing log reads as empty, not an error");
    await recordWait(wait({ askedAt: "2026-08-17", answeredAt: "2026-08-21" }), path);
    const count = await recordWait(
      wait({ task: KICKOFF, askedAt: "2026-08-17", answeredAt: "2026-08-31" }),
      path
    );
    assert.equal(count, 2);
    const records = await readRecords(path);
    assert.equal(records.length, 2);
    assert.equal(records[1].task, KICKOFF);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
