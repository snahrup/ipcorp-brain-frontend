import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { closeOutYesterday, loadRun, reconcileAgainstLedger, saveRun } from "./ledger.mjs";

const TODAY = "2026-08-18";

function prevRunWith(items) {
  return { runId: "2026-08-17-am", date: "2026-08-17", items };
}

test("an item answered yesterday with an unchanged hash does not reappear", () => {
  const prev = prevRunWith([
    { id: "a", hash: "h1", answer: { verb: "approve", at: "2026-08-17T13:00:00Z" } },
  ]);
  const result = reconcileAgainstLedger(
    prev,
    [
      { id: "a", hash: "h1" },
      { id: "b", hash: "hb" },
    ],
    { today: TODAY }
  );
  assert.deepEqual(
    result.eligible.map((item) => item.id),
    ["b"]
  );
  assert.deepEqual(
    result.suppressed.map((entry) => [entry.id, entry.reason]),
    [["a", "answered-unchanged"]]
  );
});

test("the same item with a changed hash returns as a new revision", () => {
  const prev = prevRunWith([
    { id: "a", hash: "h1", answer: { verb: "approve", at: "2026-08-17T13:00:00Z" } },
  ]);
  const result = reconcileAgainstLedger(prev, [{ id: "a", hash: "h2" }], { today: TODAY });
  assert.deepEqual(
    result.eligible.map((item) => item.id),
    ["a"]
  );
  assert.equal(result.suppressed.length, 0);
});

test("a snoozed item stays quiet before its date and without activity", () => {
  const prev = prevRunWith([
    {
      id: "s",
      hash: "h1",
      answer: {
        verb: "snooze",
        at: "2026-08-17T13:00:00Z",
        snooze: { returnAt: "2026-08-20", wakeOnActivity: true },
      },
    },
  ]);
  const result = reconcileAgainstLedger(prev, [{ id: "s", hash: "h1", hasNewActivity: false }], {
    today: TODAY,
  });
  assert.equal(result.eligible.length, 0);
  assert.deepEqual(
    result.suppressed.map((entry) => [entry.id, entry.reason]),
    [["s", "snoozed"]]
  );
});

test("a snoozed item returns on its date OR on new activity, whichever comes first", () => {
  const prevItems = [
    {
      id: "s",
      hash: "h1",
      answer: {
        verb: "snooze",
        at: "2026-08-17T13:00:00Z",
        snooze: { returnAt: "2026-08-20", wakeOnActivity: true },
      },
    },
  ];
  const onDate = reconcileAgainstLedger(
    prevRunWith(prevItems),
    [{ id: "s", hash: "h1", hasNewActivity: false }],
    {
      today: "2026-08-20",
    }
  );
  assert.deepEqual(
    onDate.eligible.map((item) => item.id),
    ["s"],
    "the return date wakes the item"
  );
  const onActivity = reconcileAgainstLedger(
    prevRunWith(prevItems),
    [{ id: "s", hash: "h1", hasNewActivity: true }],
    {
      today: TODAY,
    }
  );
  assert.deepEqual(
    onActivity.eligible.map((item) => item.id),
    ["s"],
    "new activity wakes the item before its date"
  );
});

test("close-out summarizes yesterday before today is written", () => {
  const prev = prevRunWith([
    { id: "a", hash: "h1", answer: { verb: "approve", at: "2026-08-17T13:00:00Z" } },
    {
      id: "b",
      hash: "h2",
      answer: { verb: "snooze", at: "2026-08-17T13:02:00Z", snooze: { returnAt: "2026-08-20" } },
    },
    { id: "c", hash: "h3" },
  ]);
  const summary = closeOutYesterday(prev);
  assert.equal(summary.answered, 2);
  assert.equal(summary.unanswered, 1);
  assert.deepEqual(summary.verbs, { approve: 1, snooze: 1 });
});

test("runs round-trip through the state dir override and never touch the real ledger", () => {
  const dir = mkdtempSync(join(tmpdir(), "foreman-ledger-"));
  const previous = process.env.FOREMAN_STATE_DIR;
  process.env.FOREMAN_STATE_DIR = dir;
  try {
    const run = {
      runId: "2026-08-18-am",
      date: TODAY,
      items: [{ id: "a", hash: "h1" }],
      parked: [],
    };
    saveRun(run);
    assert.deepEqual(loadRun(TODAY), run);
    assert.equal(loadRun("2026-08-19"), null, "a missing run reads as null, never invented");
  } finally {
    if (previous === undefined) delete process.env.FOREMAN_STATE_DIR;
    else process.env.FOREMAN_STATE_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});
