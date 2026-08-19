import assert from "node:assert/strict";
import test from "node:test";
import { crosswalkBreakdown, parseBreakdown, wordDifference } from "./breakdown.mjs";

/** A workbook in the shape readWorkbook returns, without touching a file. */
function workbookOf(sheets) {
  return {
    sheetNames: Object.keys(sheets),
    sheets: new Map(Object.entries(sheets)),
  };
}

const TASK_SHEET = [
  [],
  ["Program: Widget Foundations"],
  ["The platform basics needed for every widget."],
  [],
  ["Project", "#", "Task", "Owner (draft)", "Notes"],
  ["W1. FIRST GROUP", "1", "Pick the widget size", "Ada", "First one."],
  ["", "2", "Order the widgets", "Ada", ""],
  ["W2. SECOND GROUP", "1", "Write the widget guide", "Grace", ""],
];

/** Wave-1-style tab: same layout with an extra Done column wedged in the middle. */
const SHEET_WITH_DONE = [
  [],
  ["Program: Widget Rollout"],
  ["The first rollout."],
  [],
  ["Project", "#", "Task", "Done", "Owner (draft)", "Notes"],
  ["R1. ROLLOUT", "1", "Ship the widgets", "", "Ada", "Ship it."],
];

const POSITION_SHEET = [
  [],
  ["Program(s): Later Waves"],
  ["Each later wave repeats the first."],
  [],
  ["Field", "Current position", "Notes"],
  ["Next domain", "Sales next", "Confirmed."],
  ["Timeboxing", "None yet", ""],
];

function issueOf(overrides) {
  return {
    key: "MT-1",
    summary: "W1.1 Pick the widget size",
    status: { name: "Backlog", category: "new" },
    startDate: null,
    dueDate: null,
    timeTracking: { originalEstimateSeconds: null, timeSpentSeconds: null },
    ...overrides,
  };
}

test("finds a program from its banner and keeps the description beneath it", () => {
  const { programs } = parseBreakdown(workbookOf({ Widgets: TASK_SHEET }));
  assert.equal(programs.length, 1);
  assert.equal(programs[0].name, "Widget Foundations");
  assert.equal(programs[0].description, "The platform basics needed for every widget.");
  assert.equal(programs[0].kind, "tasks");
});

test("reads a Program(s): banner as a program too", () => {
  const { programs } = parseBreakdown(workbookOf({ Later: POSITION_SHEET }));
  assert.equal(programs[0].name, "Later Waves");
});

test("skips tabs that are not programs", () => {
  const { programs } = parseBreakdown(
    workbookOf({ Glossary: [[], ["Role Definitions"], [], ["Role", "Definition"]] })
  );
  assert.deepEqual(programs, []);
});

test("carries a project group down the rows that leave its cell blank", () => {
  const { programs } = parseBreakdown(workbookOf({ Widgets: TASK_SHEET }));
  const [first, second] = programs[0].projects;
  assert.equal(first.code, "W1");
  assert.deepEqual(
    first.tasks.map((task) => task.code),
    ["W1.1", "W1.2"]
  );
  assert.equal(second.code, "W2");
  assert.deepEqual(
    second.tasks.map((task) => task.code),
    ["W2.1"]
  );
});

test("locates columns by their header, not a fixed position", () => {
  const { programs } = parseBreakdown(workbookOf({ Rollout: SHEET_WITH_DONE }));
  const task = programs[0].projects[0].tasks[0];
  // Owner sits in column 5 here and column 4 on the tab without a Done column. A fixed
  // index reads the Done column as the owner on one of the two.
  assert.equal(task.owner, "Ada");
  assert.equal(task.notes, "Ship it.");
  assert.equal(task.doneMark, "");
});

test("records a positions tab as positions rather than inventing tasks", () => {
  const { programs } = parseBreakdown(workbookOf({ Later: POSITION_SHEET }));
  assert.equal(programs[0].kind, "positions");
  assert.deepEqual(programs[0].projects, []);
  assert.deepEqual(programs[0].positions, [
    { field: "Next domain", value: "Sales next", notes: "Confirmed." },
    { field: "Timeboxing", value: "None yet", notes: "" },
  ]);
});

test("wordDifference reports the words that actually changed", () => {
  assert.deepEqual(wordDifference("install the metrics app", "install the metrics app"), {
    removed: [],
    added: [],
    identical: true,
  });
  const swapped = wordDifference("install the Chargeback app", "install the cost-tracking app");
  assert.deepEqual(swapped.removed, ["Chargeback"]);
  assert.deepEqual(swapped.added, ["cost-tracking"]);
  assert.equal(swapped.identical, false);

  const trimmed = wordDifference("hold the initial meeting today", "hold the initial meeting");
  assert.deepEqual(trimmed.removed, ["today"]);
  assert.deepEqual(trimmed.added, []);
});

test("matches on the code and separates identical text from reworded text", () => {
  const breakdown = parseBreakdown(workbookOf({ Widgets: TASK_SHEET }));
  const result = crosswalkBreakdown(breakdown, [
    issueOf({ key: "MT-1", summary: "W1.1 Pick the widget size" }),
    issueOf({ key: "MT-2", summary: "W1.2 Order the gadgets" }),
    issueOf({ key: "MT-3", summary: "W2.1 Write the widget guide" }),
  ]);
  const tasks = result.programs[0].projects.flatMap((project) => project.tasks);
  assert.equal(tasks[0].state, "identical");
  assert.equal(tasks[0].issue.key, "MT-1");
  assert.equal(tasks[1].state, "reworded");
  assert.deepEqual(tasks[1].difference.removed, ["widgets"]);
  assert.deepEqual(tasks[1].difference.added, ["gadgets"]);
  assert.equal(result.coverage.identical, 2);
  assert.equal(result.coverage.reworded, 1);
});

test("reports a workbook task with no issue rather than quietly dropping it", () => {
  const breakdown = parseBreakdown(workbookOf({ Widgets: TASK_SHEET }));
  const result = crosswalkBreakdown(breakdown, [
    issueOf({ key: "MT-1", summary: "W1.1 Pick the widget size" }),
  ]);
  const tasks = result.programs[0].projects.flatMap((project) => project.tasks);
  assert.deepEqual(
    tasks.map((task) => task.state),
    ["identical", "missing-from-jira", "missing-from-jira"]
  );
  assert.equal(result.coverage.missingFromJira, 2);
  assert.equal(result.coverage.matched, 1);
});

test("reports issues the workbook does not account for", () => {
  const breakdown = parseBreakdown(workbookOf({ Widgets: TASK_SHEET }));
  const result = crosswalkBreakdown(breakdown, [
    issueOf({ key: "MT-1", summary: "W1.1 Pick the widget size" }),
    issueOf({ key: "MT-2", summary: "W1.2 Order the widgets" }),
    issueOf({ key: "MT-3", summary: "W2.1 Write the widget guide" }),
    issueOf({ key: "MT-9", summary: "W9.9 Something nobody wrote down" }),
  ]);
  assert.equal(result.coverage.unaccountedInJira, 1);
  assert.equal(result.unaccounted[0].issue.key, "MT-9");
});

test("rescues a row whose group label was lost, instead of reporting two gaps", () => {
  // The second row's project cell is blank AND its number is missing, which is what a
  // broken group label looks like in the real workbook.
  const broken = [
    [],
    ["Program: Widget Foundations"],
    ["Basics."],
    [],
    ["Project", "#", "Task", "Owner (draft)", "Notes"],
    ["W1. FIRST GROUP", "1", "Pick the widget size", "Ada", ""],
    ["stray label", "", "Order the widgets", "Ada", ""],
  ];
  const breakdown = parseBreakdown(workbookOf({ Widgets: broken }));
  const result = crosswalkBreakdown(breakdown, [
    issueOf({ key: "MT-1", summary: "W1.1 Pick the widget size" }),
    issueOf({ key: "MT-2", summary: "W1.2 Order the widgets" }),
  ]);
  const tasks = result.programs[0].projects.flatMap((project) => project.tasks);
  const rescued = tasks.find((task) => task.task === "Order the widgets");
  assert.equal(rescued.state, "identical");
  assert.equal(rescued.matchedBy, "text");
  assert.equal(rescued.code, "W1.2");
  assert.equal(result.coverage.unaccountedInJira, 0);
  assert.equal(result.coverage.matchedByText, 1);
  assert.deepEqual(result.coverage.groupingRepairs[0].key, "MT-2");
});

test("totals effort and status across a project and up to its program", () => {
  const breakdown = parseBreakdown(workbookOf({ Widgets: TASK_SHEET }));
  const result = crosswalkBreakdown(breakdown, [
    issueOf({
      key: "MT-1",
      summary: "W1.1 Pick the widget size",
      status: { name: "Done", category: "done" },
      timeTracking: { originalEstimateSeconds: 3600, timeSpentSeconds: 7200 },
    }),
    issueOf({
      key: "MT-2",
      summary: "W1.2 Order the widgets",
      status: { name: "In Progress", category: "indeterminate" },
      timeTracking: { originalEstimateSeconds: 1800, timeSpentSeconds: null },
    }),
    issueOf({ key: "MT-3", summary: "W2.1 Write the widget guide" }),
  ]);

  const [first, second] = result.programs[0].projects;
  assert.equal(first.rollup.total, 2);
  assert.equal(first.rollup.done, 1);
  assert.equal(first.rollup.inProgress, 1);
  assert.equal(first.rollup.estimateSeconds, 5400);
  assert.equal(first.rollup.spentSeconds, 7200);
  assert.equal(first.rollup.estimatedCount, 2);
  assert.equal(second.rollup.total, 1);
  assert.equal(second.rollup.notStarted, 1);

  const program = result.programs[0].rollup;
  assert.equal(program.total, 3);
  assert.equal(program.done, 1);
  assert.equal(program.estimateSeconds, 5400);
});

test("a group whose tasks share one due date is not treated as sequenced", () => {
  const breakdown = parseBreakdown(workbookOf({ Widgets: TASK_SHEET }));
  const stamped = crosswalkBreakdown(breakdown, [
    issueOf({ key: "MT-1", summary: "W1.1 Pick the widget size", dueDate: "2026-12-19" }),
    issueOf({ key: "MT-2", summary: "W1.2 Order the widgets", dueDate: "2026-12-19" }),
  ]);
  const stampedRollup = stamped.programs[0].projects[0].rollup;
  assert.equal(stampedRollup.distinctDueDates, 1);
  assert.equal(stampedRollup.sequenced, false);
  assert.equal(stampedRollup.dueOnly, 2);
  assert.equal(stampedRollup.datesRecorded, 0);

  const planned = crosswalkBreakdown(breakdown, [
    issueOf({
      key: "MT-1",
      summary: "W1.1 Pick the widget size",
      startDate: "2026-11-01",
      dueDate: "2026-11-30",
    }),
    issueOf({
      key: "MT-2",
      summary: "W1.2 Order the widgets",
      startDate: "2026-12-01",
      dueDate: "2026-12-19",
    }),
  ]);
  const plannedRollup = planned.programs[0].projects[0].rollup;
  assert.equal(plannedRollup.sequenced, true);
  assert.equal(plannedRollup.datesRecorded, 2);
  assert.equal(plannedRollup.earliestStart, "2026-11-01");
  assert.equal(plannedRollup.latestDue, "2026-12-19");
});

test("a single issue is never called sequenced on its own", () => {
  const breakdown = parseBreakdown(workbookOf({ Rollout: SHEET_WITH_DONE }));
  const result = crosswalkBreakdown(breakdown, [
    issueOf({ key: "MT-1", summary: "R1.1 Ship the widgets", dueDate: "2026-12-19" }),
  ]);
  assert.equal(result.programs[0].rollup.sequenced, false);
});

test("reports two issues claiming the same code instead of silently keeping one", () => {
  const breakdown = parseBreakdown(workbookOf({ Widgets: TASK_SHEET }));
  const result = crosswalkBreakdown(breakdown, [
    issueOf({ key: "MT-1", summary: "W1.1 Pick the widget size" }),
    issueOf({ key: "MT-8", summary: "W1.1 Pick the widget size again" }),
  ]);
  assert.equal(result.coverage.duplicateCodes.length, 1);
  assert.deepEqual(result.coverage.duplicateCodes[0].keys, ["MT-1", "MT-8"]);
});

test("the rollup carries no Set through, so the result survives JSON", () => {
  const breakdown = parseBreakdown(workbookOf({ Widgets: TASK_SHEET }));
  const result = crosswalkBreakdown(breakdown, [
    issueOf({ key: "MT-1", summary: "W1.1 Pick the widget size", dueDate: "2026-12-19" }),
  ]);
  const revived = JSON.parse(JSON.stringify(result));
  assert.equal(revived.programs[0].projects[0].rollup.distinctDueDates, 1);
  assert.equal(revived.programs[0].projects[0].rollup.dueDates, undefined);
});
