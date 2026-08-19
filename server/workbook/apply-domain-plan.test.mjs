import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDomainPlan,
  diffPlanAgainstBoard,
  hoursToJiraEstimate,
  summaryKey,
} from "./apply-domain-plan.mjs";

const PLAN = {
  domains: [
    {
      domain: "Sales",
      waveNumber: 2,
      startDate: "2027-01-04",
      dueDate: "2027-05-05",
      effortHours: 404,
      tasks: [
        {
          summary: "Pick the widget size",
          startDate: "2027-01-04",
          dueDate: "2027-01-06",
          effortHours: 12.5,
        },
        {
          summary: "Order the widgets",
          startDate: "2027-01-07",
          dueDate: "2027-01-07",
          effortHours: 5.5,
        },
      ],
    },
  ],
};

/** A stand-in Jira that records what it was asked to do. */
function fakeJira({ failOn = () => false } = {}) {
  const calls = [];
  let counter = 0;
  const request = async (path, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ path, method: init?.method, body });
    if (init?.method === "POST") {
      if (failOn(body?.fields?.summary)) throw new Error("Jira said no");
      counter += 1;
      return { key: `MT-${900 + counter}` };
    }
    if (failOn(path)) throw new Error("field update refused");
    return {};
  };
  return { request, calls };
}

test("hoursToJiraEstimate renders whole hours, minutes, and mixtures", () => {
  assert.equal(hoursToJiraEstimate(12), "12h");
  assert.equal(hoursToJiraEstimate(0.5), "30m");
  assert.equal(hoursToJiraEstimate(12.5), "12h 30m");
  assert.equal(hoursToJiraEstimate(0), null);
  assert.equal(hoursToJiraEstimate(undefined), null);
});

test("summaries match regardless of case and spacing", () => {
  assert.equal(summaryKey("  Pick   the SIZE "), summaryKey("pick the size"));
});

test("a summary carrying its workbook code matches the same task without one", () => {
  // The board's workbook-loaded issues are titled "M1.1 Present the ..." and the planner
  // emits the bare text. Before this matched, a dry run against the real board proposed
  // 124 issues and would have duplicated the whole Customer domain.
  assert.equal(
    summaryKey("M1.1 Present the Customer recommendation to stewards for weigh-in"),
    summaryKey("Present the Customer recommendation to stewards for weigh-in")
  );
  assert.equal(
    summaryKey("P4.3 Decide access granularity"),
    summaryKey("Decide access granularity")
  );
  // A code-like word that is part of the sentence must survive.
  assert.equal(summaryKey("Fix 1.2 million rows"), "fix 1.2 million rows");
});

test("existing workbook-coded issues are recognised, not queued for creation again", () => {
  const existing = [
    { key: "MT-500", summary: "Wave 2 domain MVP for Sales: run off the Wave 1 template" },
    { key: "MT-501", summary: "W1.1 Pick the widget size", parentKey: "MT-500" },
    { key: "MT-502", summary: "W1.2 Order the widgets", parentKey: "MT-500" },
  ];
  const diff = diffPlanAgainstBoard({ plan: PLAN, existingIssues: existing, epicKey: "MT-12" });
  assert.equal(diff.toCreate, 0);
  assert.equal(diff.alreadyPresent, 3);
});

test("the dry run creates nothing", async () => {
  const jira = fakeJira();
  const result = await applyDomainPlan({
    plan: PLAN,
    existingIssues: [],
    epicKey: "MT-12",
    request: jira.request,
    taskTypeId: "1",
    subtaskTypeId: "5",
  });
  assert.equal(result.committed, false);
  assert.equal(jira.calls.length, 0, "a dry run must not touch Jira");
  assert.equal(result.toCreate, 3, "one domain ticket plus two tasks");
});

test("work already on the board is skipped, not duplicated", async () => {
  const existing = [
    { key: "MT-500", summary: "Wave 2 domain MVP for Sales: run off the Wave 1 template" },
    { key: "MT-501", summary: "pick   the WIDGET size", parentKey: "MT-500" },
  ];
  const diff = diffPlanAgainstBoard({ plan: PLAN, existingIssues: existing, epicKey: "MT-12" });
  assert.equal(diff.toCreate, 1);
  assert.equal(diff.alreadyPresent, 2);
  assert.equal(diff.domains[0].parentKey, "MT-500");
  assert.equal(diff.domains[0].tasks[0].existingKey, "MT-501");
  assert.equal(diff.domains[0].tasks[1].existingKey, null);
});

test("running twice creates nothing the second time", async () => {
  const first = fakeJira();
  const run = await applyDomainPlan({
    plan: PLAN,
    existingIssues: [],
    epicKey: "MT-12",
    request: first.request,
    taskTypeId: "1",
    subtaskTypeId: "5",
    commit: true,
  });
  assert.equal(run.created.length, 3);
  assert.equal(run.errors.length, 0);

  // Feed what the first run made back in as the board's current state, carrying the
  // parent links a real re-read of Jira would return.
  const board = run.created.map((item) => ({
    key: item.key,
    summary: item.summary,
    parentKey: item.parent ?? "MT-12",
  }));
  const second = fakeJira();
  const repeat = await applyDomainPlan({
    plan: PLAN,
    existingIssues: board,
    epicKey: "MT-12",
    request: second.request,
    taskTypeId: "1",
    subtaskTypeId: "5",
    commit: true,
  });
  assert.equal(repeat.created.length, 0, "a second run must create nothing");
  assert.equal(repeat.skipped.length, 3);
  assert.equal(second.calls.length, 0);
});

test("dates and the estimate go on in a second call, not the create", async () => {
  const jira = fakeJira();
  await applyDomainPlan({
    plan: PLAN,
    existingIssues: [],
    epicKey: "MT-12",
    request: jira.request,
    taskTypeId: "1",
    subtaskTypeId: "5",
    commit: true,
  });
  const creates = jira.calls.filter((call) => call.method === "POST");
  for (const call of creates) {
    assert.equal(call.body.fields.duedate, undefined, "create must not carry a due date");
    assert.equal(call.body.fields.timetracking, undefined, "create must not carry an estimate");
  }
  const updates = jira.calls.filter((call) => call.method === "PUT");
  assert.equal(updates.length, creates.length);
  const taskUpdate = updates.at(-1).body.fields;
  assert.equal(taskUpdate.customfield_11915, "2027-01-07");
  assert.equal(taskUpdate.duedate, "2027-01-07");
  assert.equal(taskUpdate.timetracking.originalEstimate, "5h 30m");
});

test("subtasks hang off the domain ticket the run just created", async () => {
  const jira = fakeJira();
  const result = await applyDomainPlan({
    plan: PLAN,
    existingIssues: [],
    epicKey: "MT-12",
    request: jira.request,
    taskTypeId: "1",
    subtaskTypeId: "5",
    commit: true,
  });
  const domainKey = result.created[0].key;
  const taskCreates = jira.calls.filter(
    (call) => call.method === "POST" && call.body.fields.issuetype.id === "5"
  );
  assert.equal(taskCreates.length, 2);
  for (const call of taskCreates) assert.equal(call.body.fields.parent.key, domainKey);
  // The domain ticket itself hangs off the epic.
  const domainCreate = jira.calls.find(
    (call) => call.method === "POST" && call.body.fields.issuetype.id === "1"
  );
  assert.equal(domainCreate.body.fields.parent.key, "MT-12");
});

test("an issue that is created but cannot take its dates is reported, not lost", async () => {
  const jira = fakeJira({ failOn: (value) => String(value).startsWith("/rest/api/3/issue/MT-") });
  const result = await applyDomainPlan({
    plan: PLAN,
    existingIssues: [],
    epicKey: "MT-12",
    request: jira.request,
    taskTypeId: "1",
    subtaskTypeId: "5",
    commit: true,
  });
  assert.equal(result.created.length, 3, "the issues still exist");
  assert.equal(result.warnings.length, 3);
  assert.ok(result.warnings[0].includes("dates and estimate did not apply"));
});

test("a run stops after three straight failures instead of grinding through the list", async () => {
  const many = {
    domains: [
      {
        domain: "Sales",
        waveNumber: 2,
        startDate: "2027-01-04",
        dueDate: "2027-05-05",
        tasks: Array.from({ length: 30 }, (_, index) => ({
          summary: `Task number ${index}`,
          startDate: "2027-01-04",
          dueDate: "2027-01-05",
          effortHours: 4,
        })),
      },
    ],
  };
  const jira = fakeJira({ failOn: (summary) => String(summary).startsWith("Task number") });
  const result = await applyDomainPlan({
    plan: many,
    existingIssues: [],
    epicKey: "MT-12",
    request: jira.request,
    taskTypeId: "1",
    subtaskTypeId: "5",
    commit: true,
  });
  assert.equal(result.stoppedEarly, true);
  assert.equal(result.errors.length, 3, "stops at three, does not attempt all thirty");
});

test("an identical task under a DIFFERENT domain does not count as present", () => {
  // 27 of the 30 template tasks read identically across domains, so a board-wide match
  // makes every later domain look nearly done. The real dry run reported Sales as
  // needing 4 tasks instead of 30 because of exactly this.
  const otherDomain = [
    { key: "MT-420", summary: "Wave 1 domain MVP for Customer: run off the Wave 1 template" },
    { key: "MT-427", summary: "M3.1 Pick the widget size", parentKey: "MT-420" },
    { key: "MT-428", summary: "M3.2 Order the widgets", parentKey: "MT-420" },
  ];
  const diff = diffPlanAgainstBoard({ plan: PLAN, existingIssues: otherDomain, epicKey: "MT-12" });
  assert.equal(diff.toCreate, 3, "Sales needs its own copy of both tasks plus its domain ticket");
  assert.equal(diff.alreadyPresent, 0);
});
