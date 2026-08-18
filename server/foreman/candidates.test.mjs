// Candidate classification, written against the REAL snapshot shape.
//
// Every field name below was read off a live /api/today/snapshot response on
// 2026-08-18, after the first version of this feature shipped five items that
// were all wrong: two Backlog tickets presented as today's work, one In Review
// ticket with 3h already logged asked for an estimate, and the estimate itself
// read from a top-level field that does not exist. The old fixtures matched my
// assumptions, so every test passed while the product was nonsense. Fixtures
// in this file must be copied from real payloads, never invented.

import assert from "node:assert/strict";
import { test } from "node:test";
import { candidatesFromSnapshot } from "./briefing.mjs";

const TODAY = "2026-08-18";

// Shapes taken verbatim from the live snapshot.
const issue = (over = {}) => ({
  key: "MT-1",
  summary: "A thing",
  status: { id: "1", name: "In Progress", category: "indeterminate" },
  priority: { name: "Priority 2" },
  dueDate: "2026-08-11",
  updatedAt: "2026-08-14T21:11:26.619-0500",
  lastActivityAt: "2026-08-14T21:11:26.619-0500",
  timeTracking: {
    originalEstimate: null,
    remainingEstimate: null,
    timeSpent: null,
    originalEstimateSeconds: null,
    remainingEstimateSeconds: null,
    timeSpentSeconds: null,
  },
  worklogs: [],
  comments: [],
  ...over,
});

const snapshotOf = (issues) => ({
  capturedAt: "2026-08-18T12:00:00Z",
  sources: { jira: { status: "ok", observedAt: "2026-08-18T12:00:00Z" } },
  jira: { issues },
  agentBoard: { lanes: [] },
});

const byId = (list) => new Map(list.map((c) => [c.id, c]));

test("Backlog work is never today's work", () => {
  const list = candidatesFromSnapshot(
    snapshotOf([
      issue({ key: "MT-470", status: { name: "Backlog", category: "new" } }),
      issue({ key: "MT-1", status: { name: "In Progress", category: "indeterminate" } }),
    ]),
    { today: TODAY }
  );
  const found = byId(list);
  assert.equal(
    found.get("MT-470").nextActor,
    "backlog",
    "a Backlog ticket is not waiting on Steve"
  );
  assert.equal(found.get("MT-1").nextActor, "steve");
});

test("an estimate is read from timeTracking, so estimated work is never asked for a ballpark", () => {
  const list = candidatesFromSnapshot(
    snapshotOf([
      issue({
        key: "MT-470",
        status: { name: "In Progress", category: "indeterminate" },
        timeTracking: { originalEstimateSeconds: 25200, timeSpentSeconds: null },
      }),
      issue({ key: "MT-2", status: { name: "In Progress", category: "indeterminate" } }),
    ]),
    { today: TODAY }
  );
  const found = byId(list);
  assert.notEqual(found.get("MT-470").kind, "estimate", "7h is already estimated");
  assert.equal(found.get("MT-2").kind, "estimate", "nothing estimated, so ask for a ballpark");
});

test("work in review is a chase, not a ballpark: the reviewer holds it, not Steve", () => {
  const list = candidatesFromSnapshot(
    snapshotOf([
      issue({
        key: "MT-392",
        status: { name: "In Review", category: "indeterminate" },
        timeTracking: { originalEstimateSeconds: null, timeSpentSeconds: 10800 },
      }),
    ]),
    { today: TODAY }
  );
  const found = byId(list).get("MT-392");
  assert.equal(found.kind, "chase-review");
  assert.notEqual(found.kind, "estimate", "3h is logged; asking for an estimate is nonsense");
});

test("work already underway asks to continue, not to estimate", () => {
  const list = candidatesFromSnapshot(
    snapshotOf([
      issue({
        key: "MT-9",
        status: { name: "In Progress", category: "indeterminate" },
        timeTracking: { originalEstimateSeconds: 3600, timeSpentSeconds: 1800 },
      }),
    ]),
    { today: TODAY }
  );
  assert.equal(byId(list).get("MT-9").kind, "continue");
});

test("staleness comes from real activity, read from updatedAt", () => {
  const list = candidatesFromSnapshot(
    snapshotOf([
      issue({ key: "MT-5", updatedAt: "2026-08-11T10:00:00-0500", lastActivityAt: null }),
    ]),
    { today: TODAY }
  );
  const found = byId(list).get("MT-5");
  assert.equal(typeof found.daysSinceActivity, "number");
  assert.equal(found.daysSinceActivity, 7, "Aug 11 to Aug 18 is seven days untouched");
});
