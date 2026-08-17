import assert from "node:assert/strict";
import { test } from "node:test";
import { rankItems } from "./rank.mjs";

const TODAY = "2026-08-18";

function candidate(id, overrides = {}) {
  return {
    id,
    kind: "decide",
    nextActor: "steve",
    deadline: null,
    meetingProximityMinutes: null,
    directRequest: false,
    sourceCount: 1,
    priorityMatch: false,
    owedReplyAgeDays: null,
    hash: `h-${id}`,
    ...overrides,
  };
}

test("eleven candidates in, five out, ordered by the declared signals, violations excluded with reasons", () => {
  const candidates = [
    candidate("stale-reply-7", { owedReplyAgeDays: 7 }),
    candidate("direct", { directRequest: true }),
    candidate("deadline-3d", { deadline: "2026-08-21" }),
    candidate("agent-item", { nextActor: "workbench-agent" }),
    candidate("meeting-120", { meetingProximityMinutes: 120 }),
    candidate("due-today", { deadline: "2026-08-18" }),
    candidate("priority-only", { priorityMatch: true }),
    candidate("patrick-item", { nextActor: "patrick" }),
    candidate("overdue", { deadline: "2026-08-17" }),
    candidate("multi-3", { sourceCount: 3 }),
    candidate("meeting-30", { meetingProximityMinutes: 30 }),
  ];

  const result = rankItems(candidates, { today: TODAY });

  assert.deepEqual(
    result.selected.map((item) => item.id),
    ["overdue", "due-today", "deadline-3d", "meeting-30", "meeting-120"],
    "selection order must follow deadline distance, then meeting proximity"
  );
  assert.deepEqual(
    result.parked.map((entry) => entry.id),
    ["direct", "multi-3", "priority-only", "stale-reply-7"],
    "parked keeps rank order below the cap"
  );
  for (const entry of result.parked) {
    assert.equal(entry.wakeOnActivity, true, "parked entries wake on new activity");
    assert.ok(entry.returnAt, "parked entries carry a return date");
  }
  assert.deepEqual(
    result.exclusions.map((entry) => [entry.id, entry.reason]).sort(),
    [
      ["agent-item", "next-actor-not-steve"],
      ["patrick-item", "next-actor-not-steve"],
    ],
    "next-actor violations are excluded with a recorded reason"
  );
});

test("the cap is respected when configured", () => {
  const candidates = [
    candidate("overdue", { deadline: "2026-08-17" }),
    candidate("due-today", { deadline: "2026-08-18" }),
    candidate("later", { deadline: "2026-08-25" }),
  ];
  const result = rankItems(candidates, { today: TODAY, cap: 2 });
  assert.deepEqual(
    result.selected.map((item) => item.id),
    ["overdue", "due-today"]
  );
  assert.equal(result.parked.length, 1);
});

test("ranking is deterministic across input order", () => {
  const forward = [candidate("z1"), candidate("z2"), candidate("due", { deadline: TODAY })];
  const reversed = [...forward].reverse();
  const a = rankItems(forward, { today: TODAY });
  const b = rankItems(reversed, { today: TODAY });
  assert.deepEqual(
    a.selected.map((item) => item.id),
    b.selected.map((item) => item.id),
    "identical inputs in any order produce the identical ranking"
  );
});

test("a missing today option fails closed instead of guessing the date", () => {
  assert.throws(() => rankItems([candidate("x")], {}), /today/);
});
