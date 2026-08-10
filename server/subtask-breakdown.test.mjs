import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractSubtasksBlock,
  generateBreakdown,
  minutesToJiraEstimate,
  parseSubtasks,
  reconcileEstimates,
} from "./subtask-breakdown.mjs";

const sum = (values) => values.reduce((total, value) => total + value, 0);

test("reconcileEstimates: exact sum on a clean split", () => {
  const minutes = reconcileEstimates([120, 120, 240], 480);
  assert.equal(sum(minutes), 480);
  assert.deepEqual(minutes, [120, 120, 240]);
});

test("reconcileEstimates: rescales when the model over-proposes", () => {
  const minutes = reconcileEstimates([240, 240, 240], 480);
  assert.equal(sum(minutes), 480);
  for (const value of minutes) assert.ok(value >= 15);
});

test("reconcileEstimates: absorbs rounding drift to land exactly", () => {
  // 7 equal weights into 480m cannot divide evenly on a 15m grain.
  const minutes = reconcileEstimates([1, 1, 1, 1, 1, 1, 1], 480);
  assert.equal(sum(minutes), 480);
});

test("reconcileEstimates: odd parent totals use a finer grain and still land", () => {
  const minutes = reconcileEstimates([50, 50, 50], 190);
  assert.equal(sum(minutes), 190);
});

test("reconcileEstimates: garbage weights still produce a valid split", () => {
  const minutes = reconcileEstimates([Number.NaN, -20, 0], 240);
  assert.equal(sum(minutes), 240);
  for (const value of minutes) assert.ok(value >= 15);
});

test("parse: reads the marker block and salvages trailing prose", () => {
  const output = [
    "Some preamble the model printed.",
    "SUBTASKS:",
    '[{"summary":"Map the sources","description":"d","estimateMinutes":60},',
    ' {"summary":"Build the loader","description":"d","estimateMinutes":120}]',
    "END SUBTASKS",
  ].join("\n");
  const parsed = parseSubtasks(extractSubtasksBlock(output));
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].summary, "Map the sources");
});

test("minutesToJiraEstimate formats h and m", () => {
  assert.equal(minutesToJiraEstimate(480), "8h");
  assert.equal(minutesToJiraEstimate(90), "1h 30m");
  assert.equal(minutesToJiraEstimate(45), "45m");
});

test("generateBreakdown: refuses a parent with no original estimate", async () => {
  await assert.rejects(
    generateBreakdown({
      key: "MT-1",
      summary: "x",
      description: "",
      labels: [],
      subtasks: [],
      timeTracking: { originalEstimateSeconds: null },
    }),
    /no original estimate/
  );
});

test("generateBreakdown: end to end with a stubbed model run", async () => {
  const fakeRun = async () =>
    [
      "SUBTASKS:",
      JSON.stringify([
        { summary: "Inventory the current model", description: "Read it.", estimateMinutes: 100 },
        { summary: "Draft the target structure", description: "Write it.", estimateMinutes: 200 },
        {
          summary: "Review with Patrick Stiller",
          description: "Walk it through.",
          estimateMinutes: 100,
        },
      ]),
      "END SUBTASKS",
    ].join("\n");

  const proposal = await generateBreakdown(
    {
      key: "MT-2",
      summary: "Restructure the domain model",
      description: "Bigger piece of work.",
      labels: ["mdm"],
      subtasks: [],
      timeTracking: { originalEstimate: "8h", originalEstimateSeconds: 8 * 3600 },
    },
    fakeRun
  );

  assert.equal(proposal.parentMinutes, 480);
  assert.equal(proposal.totalMinutes, 480);
  assert.equal(proposal.subtasks.length, 3);
  assert.equal(sum(proposal.subtasks.map((subtask) => subtask.estimateMinutes)), 480);
  for (const subtask of proposal.subtasks) {
    assert.ok(subtask.estimate);
    assert.ok(subtask.summary.length > 0);
  }
});
