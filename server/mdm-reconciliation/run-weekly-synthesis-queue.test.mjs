import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FULL_SETTLEMENT_WEEKS,
  QUEUE_POLICY,
  runSynthesisChild,
  runWeeklySynthesisQueue,
  SynthesisTimeoutError,
  validateWeeklyOutput,
  writeJsonCheckpoint,
} from "./run-weekly-synthesis-queue.mjs";

const silentLogger = {
  info() {},
  error() {},
};

function validWeeklyOutput(weekOf, stableId = `${weekOf}-activity`) {
  return {
    weekOf,
    activities: [
      {
        stableId,
        title: "Evidence-backed activity",
        disposition: "completed",
        evidenceRefs: [`evidence:${stableId}`],
      },
    ],
    unresolved: [],
    excluded: [],
    coverage: {
      sourceRecords: 4,
      condensedGroups: 3,
      ineligibleGroupsWithheld: 1,
      includedGroups: 2,
      omittedGroups: 0,
      bounded: false,
    },
    policy: {
      personalWorkExcluded: true,
      soloByDefault: true,
      activeNowRequiresCurrentEvidence: true,
      hiddenReasoningExcluded: true,
    },
  };
}

async function createRunFixture() {
  const runRoot = await mkdtemp(join(tmpdir(), "mdm-weekly-queue-"));
  const runDirectory = join(runRoot, "2026-07-28T16-34-18-398Z");
  await mkdir(join(runDirectory, "weekly-activities"), { recursive: true });
  await writeFile(join(runRoot, "latest.json"), JSON.stringify({ runDirectory }), "utf8");
  return { runRoot, runDirectory };
}

async function writeValidOutput(runDirectory, weekOf) {
  const outputPath = join(runDirectory, "weekly-activities", `${weekOf}.json`);
  await writeFile(outputPath, JSON.stringify(validWeeklyOutput(weekOf)), "utf8");
  return outputPath;
}

test("the production queue contains exactly the 12 approved full weeks", () => {
  assert.deepEqual(FULL_SETTLEMENT_WEEKS, [
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
  assert.equal(QUEUE_POLICY.jiraWritesAllowed, false);
  assert.deepEqual(QUEUE_POLICY.partialPeriodsExcluded, [
    { start: "2026-05-01", end: "2026-05-03" },
    { start: "2026-07-27", end: "2026-07-28" },
  ]);
});

test("weekly output validation rejects incomplete checkpoints", () => {
  const weekOf = FULL_SETTLEMENT_WEEKS[0];
  assert.equal(validateWeeklyOutput(validWeeklyOutput(weekOf), weekOf).valid, true);

  const invalid = validWeeklyOutput(weekOf);
  invalid.activities[0].evidenceRefs = [];
  invalid.policy.personalWorkExcluded = false;
  const result = validateWeeklyOutput(invalid, weekOf);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /evidenceRefs/);
  assert.match(result.errors.join(" "), /personalWorkExcluded/);
});

test("the queue runs one week at a time and checkpoints successful progress", async () => {
  const fixture = await createRunFixture();
  const weeks = FULL_SETTLEMENT_WEEKS.slice(0, 3);
  let active = 0;
  let maximumActive = 0;
  const calls = [];
  try {
    const result = await runWeeklySynthesisQueue({
      ...fixture,
      weeks,
      timeoutMs: 5_000,
      retryDelayMs: 0,
      logger: silentLogger,
      childRunner: async ({ weekOf, outputPath }) => {
        calls.push(weekOf);
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
        await writeFile(outputPath, JSON.stringify(validWeeklyOutput(weekOf)), "utf8");
        active -= 1;
        return { exitCode: 0, stdout: `finished ${weekOf}`, stderr: "" };
      },
    });

    assert.deepEqual(calls, weeks);
    assert.equal(maximumActive, 1);
    assert.equal(result.state.state, "completed");
    assert.deepEqual(result.state.summary, {
      total: 3,
      succeeded: 3,
      failed: 0,
      pending: 0,
      running: 0,
    });
    const checkpoint = JSON.parse(await readFile(result.statusPath, "utf8"));
    assert.equal(checkpoint.state, "completed");
    assert.ok(checkpoint.weeks.every((week) => week.state === "succeeded"));
  } finally {
    await rm(fixture.runRoot, { recursive: true, force: true });
  }
});

test("resume skips valid outputs and only invokes the missing week", async () => {
  const fixture = await createRunFixture();
  const weeks = FULL_SETTLEMENT_WEEKS.slice(0, 2);
  const calls = [];
  try {
    await writeValidOutput(fixture.runDirectory, weeks[0]);
    const result = await runWeeklySynthesisQueue({
      ...fixture,
      weeks,
      timeoutMs: 5_000,
      retryDelayMs: 0,
      logger: silentLogger,
      childRunner: async ({ weekOf, outputPath }) => {
        calls.push(weekOf);
        await writeFile(outputPath, JSON.stringify(validWeeklyOutput(weekOf)), "utf8");
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    assert.deepEqual(calls, [weeks[1]]);
    assert.equal(result.state.weeks[0].lastAction, "skipped-valid-output");
    assert.equal(result.state.summary.succeeded, 2);
  } finally {
    await rm(fixture.runRoot, { recursive: true, force: true });
  }
});

test("a failed week exhausts its bounded retries without blocking later weeks", async () => {
  const fixture = await createRunFixture();
  const weeks = FULL_SETTLEMENT_WEEKS.slice(0, 2);
  const calls = [];
  try {
    const result = await runWeeklySynthesisQueue({
      ...fixture,
      weeks,
      maxAttemptsPerRun: 2,
      timeoutMs: 5_000,
      retryDelayMs: 0,
      logger: silentLogger,
      childRunner: async ({ weekOf, outputPath }) => {
        calls.push(weekOf);
        if (weekOf === weeks[0]) {
          const error = new Error("synthetic failure");
          error.code = "SYNTHETIC_FAILURE";
          throw error;
        }
        await writeFile(outputPath, JSON.stringify(validWeeklyOutput(weekOf)), "utf8");
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });

    assert.deepEqual(calls, [weeks[0], weeks[0], weeks[1]]);
    assert.equal(result.state.state, "completed-with-failures");
    assert.equal(result.state.weeks[0].state, "failed");
    assert.equal(result.state.weeks[0].attemptsTotal, 2);
    assert.equal(result.state.weeks[0].lastAction, "retry-budget-exhausted");
    assert.equal(result.state.weeks[1].state, "succeeded");
    assert.equal(result.state.summary.failed, 1);
    assert.equal(result.state.summary.succeeded, 1);
  } finally {
    await rm(fixture.runRoot, { recursive: true, force: true });
  }
});

test("the child runner enforces an overall timeout", async () => {
  const fixture = await createRunFixture();
  const scriptPath = join(fixture.runDirectory, "wait-forever.mjs");
  try {
    await writeFile(scriptPath, "setInterval(() => {}, 1000);\n", "utf8");
    await assert.rejects(
      runSynthesisChild({
        weekOf: FULL_SETTLEMENT_WEEKS[0],
        timeoutMs: 100,
        cwd: fixture.runDirectory,
        scriptPath,
      }),
      (error) => error instanceof SynthesisTimeoutError && error.code === "SYNTHESIS_TIMEOUT"
    );
  } finally {
    await rm(fixture.runRoot, { recursive: true, force: true });
  }
});

test("checkpoint writes keep a parseable backup for recovery", async () => {
  const fixture = await createRunFixture();
  const checkpointPath = join(fixture.runDirectory, "checkpoint.json");
  try {
    await writeJsonCheckpoint(checkpointPath, { revision: 1 });
    await writeJsonCheckpoint(checkpointPath, { revision: 2 });
    assert.deepEqual(JSON.parse(await readFile(checkpointPath, "utf8")), { revision: 2 });
    assert.deepEqual(JSON.parse(await readFile(`${checkpointPath}.bak`, "utf8")), { revision: 1 });
  } finally {
    await rm(fixture.runRoot, { recursive: true, force: true });
  }
});
