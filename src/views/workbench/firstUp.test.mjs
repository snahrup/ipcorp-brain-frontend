// First up is the thing to actually start on this morning.
import assert from "node:assert/strict";
import { test } from "node:test";
import { eligibleForFirstUp, isRotting, pickFirstUp } from "./firstUp.ts";

const TODAY = Date.UTC(2026, 7, 18);
const issue = (key, over = {}) => ({
  key,
  summary: key,
  status: { name: "In Progress", category: "indeterminate" },
  priority: { name: "Priority 2" },
  dueDate: "2026-08-19",
  updatedAt: "2026-08-18T09:00:00Z",
  lastActivityAt: "2026-08-18T09:00:00Z",
  ...over,
});

test("MT-392, the actual ticket that led for eleven mornings, never leads again", () => {
  // In Review, three hours logged, overdue since the 7th: a reviewer holds it.
  const mt392 = issue("MT-392", {
    status: { name: "In Review", category: "indeterminate" },
    dueDate: "2026-08-07",
    lastActivityAt: "2026-08-14T21:11:26Z",
  });
  const real = issue("MT-600", { dueDate: "2026-08-20" });
  assert.equal(eligibleForFirstUp(mt392, TODAY), false);
  assert.equal(pickFirstUp([mt392, real], TODAY).key, "MT-600");
});

test("backlog work never leads, however overdue it looks", () => {
  const backlog = issue("MT-470", {
    status: { name: "Backlog", category: "new" },
    dueDate: "2026-08-01",
  });
  const real = issue("MT-601", { dueDate: "2026-08-25" });
  assert.equal(pickFirstUp([backlog, real], TODAY).key, "MT-601");
});

test("a blocked ticket never leads", () => {
  const blocked = issue("MT-466", {
    status: { name: "Blocked", category: "indeterminate" },
    dueDate: "2026-08-01",
  });
  assert.equal(pickFirstUp([blocked, issue("MT-602")], TODAY).key, "MT-602");
});

test("long overdue and long untouched is a decision, not today's work", () => {
  const rotting = issue("MT-900", {
    dueDate: "2026-08-01",
    lastActivityAt: "2026-08-01T10:00:00Z",
  });
  assert.equal(isRotting(rotting, TODAY), true);
  assert.equal(eligibleForFirstUp(rotting, TODAY), false);
});

test("recently worked and overdue still leads: that is exactly what to pick up", () => {
  const live = issue("MT-254", {
    dueDate: "2026-08-15",
    lastActivityAt: "2026-08-17T10:00:00Z",
  });
  assert.equal(eligibleForFirstUp(live, TODAY), true);
  assert.equal(
    pickFirstUp([live, issue("MT-700", { dueDate: "2026-08-30" })], TODAY).key,
    "MT-254"
  );
});

test("nothing eligible is honestly nothing, never a fallback to junk", () => {
  const backlog = issue("MT-1", { status: { name: "Backlog", category: "new" } });
  const blocked = issue("MT-2", { status: { name: "Blocked", category: "indeterminate" } });
  assert.equal(pickFirstUp([backlog, blocked], TODAY), null);
});
