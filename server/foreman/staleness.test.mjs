// The rule Steve stated on 2026-08-18, after MT-392 held first place for
// eleven days running: if a ticket sits in the top spot for more than two
// working days, it is not a priority. It is finished, or it belongs in the
// backlog, or it needs a real date. Presenting it as "start here" a third
// morning is how the whole surface loses its credibility.
//
// So an item that has been shown twice with no answer stops being work and
// becomes a decision, and a decision never occupies the first slot: the top
// of the list must always be something a person would actually do today.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildBriefing } from "./briefing.mjs";
import { saveRun } from "./ledger.mjs";

async function withTempStateDir(run) {
  const dir = mkdtempSync(join(tmpdir(), "foreman-stale-"));
  const previous = process.env.FOREMAN_STATE_DIR;
  process.env.FOREMAN_STATE_DIR = dir;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.FOREMAN_STATE_DIR;
    else process.env.FOREMAN_STATE_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

const issue = (key, over = {}) => ({
  key,
  summary: `${key} summary`,
  status: { name: "In Progress", category: "indeterminate" },
  priority: { name: "Priority 2" },
  dueDate: "2026-08-07",
  updatedAt: "2026-08-14T10:00:00-0500",
  lastActivityAt: "2026-08-14T10:00:00-0500",
  timeTracking: { originalEstimateSeconds: 3600, timeSpentSeconds: null },
  ...over,
});

const snapshotOf = (issues) => ({
  capturedAt: "2026-08-18T12:00:00Z",
  sources: { jira: { status: "ok", observedAt: "2026-08-18T12:00:00Z" } },
  jira: { issues },
  agentBoard: { lanes: [] },
});

// A prior run in which the item was shown and never answered.
const priorRun = (date, ids) => ({
  runId: date,
  date,
  items: ids.map((id) => ({ id, hash: `h-${id}`, kind: "start-work", summary: `${id} summary` })),
  receipts: [],
});

test("shown twice with no answer, it becomes a decision instead of work", () =>
  withTempStateDir(() => {
    saveRun(priorRun("2026-08-16", ["MT-392", "MT-500"]));
    saveRun(priorRun("2026-08-17", ["MT-392", "MT-500"]));
    const run = buildBriefing({
      snapshot: snapshotOf([issue("MT-392"), issue("MT-500", { dueDate: "2026-08-20" })]),
      today: "2026-08-18",
    });
    const stale = run.items.find((item) => item.id === "MT-392");
    assert.ok(stale, "it is still surfaced, just differently");
    assert.equal(stale.kind, "disposition", "it stops asking to be worked on");
    assert.equal(stale.shownCount, 2, "the count of mornings it has been asked");
  }));

test("a decision never takes the first slot", () =>
  withTempStateDir(() => {
    saveRun(priorRun("2026-08-16", ["MT-392"]));
    saveRun(priorRun("2026-08-17", ["MT-392"]));
    const run = buildBriefing({
      snapshot: snapshotOf([
        // The stalest item, which pure deadline ranking would put first forever.
        issue("MT-392", { dueDate: "2026-08-01" }),
        issue("MT-600", { dueDate: "2026-08-19" }),
      ]),
      today: "2026-08-18",
    });
    assert.notEqual(run.items[0].kind, "disposition", "first place is real work");
    assert.equal(run.items[0].id, "MT-600");
  }));

// No prior runs here on purpose: this is about ORDER alone. Stack showings on
// top and the review item correctly becomes a decision instead, which is a
// different rule and has its own test.
test("the top of the list is always something to DO: work, then chases, then decisions", () =>
  withTempStateDir(() => {
    const run = buildBriefing({
      snapshot: snapshotOf([
        // Most overdue, and a reviewer holds it: real, but not "start here".
        issue("MT-392", {
          dueDate: "2026-08-01",
          status: { name: "In Review", category: "indeterminate" },
          timeTracking: { originalEstimateSeconds: null, timeSpentSeconds: 10800 },
        }),
        // Least overdue, but it is actual work sitting on Steve.
        issue("MT-600", { dueDate: "2026-08-19" }),
      ]),
      today: "2026-08-18",
    });
    assert.equal(run.items[0].id, "MT-600", "work leads, however old the other one is");
    assert.equal(run.items[1].kind, "chase-review");
  }));

test("an old ticket nobody has touched becomes a decision even with no run history", () =>
  withTempStateDir(() => {
    // The ledger only remembers as far back as it has run. A ticket that went
    // overdue two weeks ago and has had nothing logged against it since is
    // stale on its own evidence, and waiting days to say so repeats the exact
    // failure this rule exists to end.
    const run = buildBriefing({
      snapshot: snapshotOf([
        issue("MT-900", {
          dueDate: "2026-08-04",
          updatedAt: "2026-08-04T10:00:00-0500",
          lastActivityAt: "2026-08-04T10:00:00-0500",
        }),
        issue("MT-901", { dueDate: "2026-08-19", updatedAt: "2026-08-18T09:00:00-0500" }),
      ]),
      today: "2026-08-18",
    });
    const stale = run.items.find((item) => item.id === "MT-900");
    assert.equal(stale.kind, "disposition", "14 days overdue and untouched is not a plan");
    assert.notEqual(run.items[0].id, "MT-900", "and it does not lead the list");
  }));

test("a fresh item is untouched by any of this", () =>
  withTempStateDir(() => {
    const run = buildBriefing({
      snapshot: snapshotOf([issue("MT-700")]),
      today: "2026-08-18",
    });
    assert.equal(run.items[0].kind, "start-work");
    assert.equal(run.items[0].shownCount, 0);
  }));

test("answering it resets the clock: it is not nagged about again", () =>
  withTempStateDir(() => {
    const answered = priorRun("2026-08-17", ["MT-392"]);
    answered.items[0].answer = { verb: "approve", at: "2026-08-17T13:00:00Z" };
    saveRun(priorRun("2026-08-16", ["MT-392"]));
    saveRun(answered);
    const run = buildBriefing({
      snapshot: snapshotOf([issue("MT-392", { summary: "MT-392 summary changed" })]),
      today: "2026-08-18",
    });
    const item = run.items.find((entry) => entry.id === "MT-392");
    assert.notEqual(item?.kind, "disposition", "an answered item starts over");
  }));
