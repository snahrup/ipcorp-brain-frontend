import assert from "node:assert/strict";
import test from "node:test";
import { summaryKey } from "./apply-domain-plan.mjs";
import { applyCorrections, collectSamples, learnFromActuals } from "./calibration.mjs";

const TEMPLATE = [
  { group: "Source data", hours: 3, task: "Identify source systems feeding the domain" },
  { group: "Source data", hours: 6, task: "Document source tables in scope" },
  { group: "Build", hours: 12, task: "Stand up bronze and silver" },
  { group: "Training", hours: 2, task: "Establish what training is needed" },
  { group: "Cadence", hours: 1, task: "Set the recurring meeting cadence" },
];

function issue({ key, task, estimate, spent, done = true, prefix = "M1.1 " }) {
  return {
    key,
    summary: `${prefix}${task}`,
    status: { category: done ? "done" : "indeterminate" },
    timeTracking: {
      originalEstimateSeconds: estimate === null ? null : estimate * 3600,
      timeSpentSeconds: spent === null ? null : spent * 3600,
    },
  };
}

/** Finished work whose logged time genuinely varies against its estimate. */
function measuredIssues() {
  return [
    issue({ key: "MT-1", task: TEMPLATE[0].task, estimate: 10, spent: 15 }),
    issue({ key: "MT-2", task: TEMPLATE[1].task, estimate: 20, spent: 24 }),
    issue({ key: "MT-3", task: TEMPLATE[2].task, estimate: 40, spent: 70 }),
    issue({ key: "MT-4", task: TEMPLATE[3].task, estimate: 8, spent: 6 }),
    issue({ key: "MT-5", task: TEMPLATE[4].task, estimate: 4, spent: 7 }),
  ];
}

const learn = (issues) =>
  learnFromActuals({ templateTasks: TEMPLATE, issues, matchSummary: summaryKey });

test("matches an issue back to its template step through the workbook code", () => {
  const { samples } = collectSamples({
    templateTasks: TEMPLATE,
    issues: [issue({ key: "MT-1", task: TEMPLATE[0].task, estimate: 10, spent: 15 })],
    matchSummary: summaryKey,
  });
  assert.equal(samples.length, 1);
  assert.equal(samples[0].task, TEMPLATE[0].task);
  assert.equal(samples[0].ratio, 1.5);
});

test("unfinished work and work with no logged time are left out, with a reason", () => {
  const { samples, rejected } = collectSamples({
    templateTasks: TEMPLATE,
    issues: [
      issue({ key: "MT-1", task: TEMPLATE[0].task, estimate: 10, spent: 15, done: false }),
      issue({ key: "MT-2", task: TEMPLATE[1].task, estimate: 20, spent: null }),
      issue({ key: "MT-3", task: TEMPLATE[2].task, estimate: null, spent: 8 }),
    ],
    matchSummary: summaryKey,
  });
  assert.equal(samples.length, 0);
  assert.equal(rejected.length, 3);
  assert.equal(rejected[0].reason, "not finished");
  assert.ok(rejected[1].reason.includes("no estimate or no logged time"));
});

test("refuses to learn from worklogs written to match their estimates", () => {
  // This is the real board's signature: median ratio exactly 1.00. Learning from it
  // would echo the original guess back with rising confidence.
  const circular = TEMPLATE.map((template, index) =>
    issue({ key: `MT-${index}`, task: template.task, estimate: 10, spent: 10 })
  );
  const result = learn(circular);
  assert.equal(result.applied, false);
  assert.equal(result.signal.trustworthy, false);
  assert.ok(result.signal.reason.includes("within 2% of their estimate"));
  assert.deepEqual(result.corrections, {});
});

test("refuses to learn from too few samples rather than inventing a factor", () => {
  const result = learn([issue({ key: "MT-1", task: TEMPLATE[0].task, estimate: 10, spent: 15 })]);
  assert.equal(result.applied, false);
  assert.ok(result.signal.reason.includes("At least 4"));
  assert.equal(result.overallRatio, null);
});

test("discards a ratio that is not believable instead of letting it skew the template", () => {
  const { samples, rejected } = collectSamples({
    templateTasks: TEMPLATE,
    issues: [issue({ key: "MT-9", task: TEMPLATE[0].task, estimate: 0.25, spent: 40 })],
    matchSummary: summaryKey,
  });
  assert.equal(samples.length, 0);
  assert.ok(rejected[0].reason.includes("not believable"));
});

test("learns a per-task factor from work that was genuinely measured", () => {
  const result = learn(measuredIssues());
  assert.equal(result.applied, true);
  assert.equal(result.signal.trustworthy, true);
  assert.equal(result.corrections[TEMPLATE[0].task].ratio, 1.5);
  assert.equal(result.corrections[TEMPLATE[2].task].ratio, 1.75);
  assert.equal(result.corrections[TEMPLATE[3].task].ratio, 0.75);
});

test("uses the median so one runaway task does not drag the whole template", () => {
  const withOutlier = [
    ...measuredIssues(),
    issue({ key: "MT-6", task: TEMPLATE[0].task, estimate: 10, spent: 60, prefix: "M2.1 " }),
  ];
  const result = learn(withOutlier);
  // Two samples for that task: 1.5x and 6x. The median of the pair is 3.75, but the
  // overall template ratio must not be dominated by it.
  assert.ok(result.overallRatio < 2, `overall ratio was ${result.overallRatio}`);
});

test("raises the base hours of a task that consistently overran", () => {
  const adjusted = applyCorrections({ templateTasks: TEMPLATE, learning: learn(measuredIssues()) });
  const build = adjusted.find((task) => task.task === TEMPLATE[2].task);
  assert.equal(build.originalHours, 12);
  assert.equal(build.hours, 21); // 12 x 1.75
  assert.equal(build.basis, "measured");
  assert.equal(build.samples, 1);
});

test("lowers the base hours of a task that came in under", () => {
  const adjusted = applyCorrections({ templateTasks: TEMPLATE, learning: learn(measuredIssues()) });
  const training = adjusted.find((task) => task.task === TEMPLATE[3].task);
  assert.equal(training.originalHours, 2);
  assert.equal(training.hours, 1.5); // 2 x 0.75
});

test("a step nobody has run yet is marked as such, not passed off as measured", () => {
  const partial = measuredIssues().slice(0, 4);
  const adjusted = applyCorrections({ templateTasks: TEMPLATE, learning: learn(partial) });
  const untouched = adjusted.find((task) => task.task === TEMPLATE[4].task);
  assert.equal(untouched.samples, 0);
  assert.equal(untouched.basis, "measured across the template");
  const measured = adjusted.find((task) => task.task === TEMPLATE[0].task);
  assert.equal(measured.basis, "measured");
});

test("when the evidence is refused, every figure stays exactly as it was", () => {
  const circular = TEMPLATE.map((template, index) =>
    issue({ key: `MT-${index}`, task: template.task, estimate: 10, spent: 10 })
  );
  const adjusted = applyCorrections({ templateTasks: TEMPLATE, learning: learn(circular) });
  for (const [index, task] of adjusted.entries()) {
    assert.equal(task.hours, TEMPLATE[index].hours);
    assert.equal(task.basis, "estimated");
    assert.equal(task.ratio, 1);
  }
});

test("a set that is half exact matches is still refused, since half is noise", () => {
  const half = [
    issue({ key: "MT-1", task: TEMPLATE[0].task, estimate: 10, spent: 10 }),
    issue({ key: "MT-2", task: TEMPLATE[1].task, estimate: 20, spent: 20 }),
    issue({ key: "MT-3", task: TEMPLATE[2].task, estimate: 40, spent: 40 }),
    issue({ key: "MT-4", task: TEMPLATE[3].task, estimate: 8, spent: 12 }),
    issue({ key: "MT-5", task: TEMPLATE[4].task, estimate: 4, spent: 7 }),
  ];
  const result = learn(half);
  assert.equal(result.applied, false);
  assert.equal(result.signal.exactMatchShare, 0.6);
});

test("the verdict survives JSON, since it is shown in the browser", () => {
  const revived = JSON.parse(JSON.stringify(learn(measuredIssues())));
  assert.equal(revived.signal.trustworthy, true);
  assert.ok(revived.overallRatio > 0);
});
