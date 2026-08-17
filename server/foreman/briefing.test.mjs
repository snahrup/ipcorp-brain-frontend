import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { answerItem, buildBriefing, candidatesFromSnapshot } from "./briefing.mjs";
import { loadRun, saveRun } from "./ledger.mjs";

const TODAY = "2026-08-18";

function fixtureSnapshot() {
  return {
    capturedAt: "2026-08-18T12:00:00Z",
    sources: {
      jira: { status: "ok", observedAt: "2026-08-18T12:00:00Z" },
      agentBoard: { status: "ok", observedAt: "2026-08-18T12:00:00Z" },
      reconciliation: {
        status: "partial",
        observedAt: "2026-08-15T09:00:00Z",
        detail: "Last good run is 3 days old",
      },
      loop: { status: "ok", observedAt: "2026-08-18T12:00:00Z" },
    },
    jira: {
      fetchedAt: "2026-08-18T12:00:00Z",
      issues: [
        {
          key: "MT-1",
          summary: "Overdue architecture recommendation",
          dueDate: "2026-08-17",
          status: { name: "In Progress", category: "indeterminate" },
          priority: { name: "Priority 2" },
          originalEstimateSeconds: 3600,
          updated: "2026-08-18T09:00:00Z",
        },
        {
          key: "MT-2",
          summary: "Ownership list with no estimate yet",
          dueDate: "2026-08-19",
          status: { name: "To Do", category: "new" },
          priority: { name: "Priority 3" },
          originalEstimateSeconds: null,
          updated: "2026-08-16T09:00:00Z",
        },
        {
          key: "MT-3",
          summary: "Finished thing",
          dueDate: null,
          status: { name: "Done", category: "done" },
          priority: { name: "Priority 3" },
          originalEstimateSeconds: 3600,
          updated: "2026-08-18T08:00:00Z",
        },
        {
          key: "MT-4",
          summary: "Held by someone else",
          dueDate: "2026-08-18",
          status: { name: "Blocked", category: "indeterminate" },
          priority: { name: "Priority 2" },
          originalEstimateSeconds: 3600,
          updated: "2026-08-17T09:00:00Z",
        },
      ],
    },
    agentBoard: { lanes: [{ id: "waiting", cards: [{}, {}] }] },
  };
}

function withTempStateDir(run) {
  const dir = mkdtempSync(join(tmpdir(), "foreman-briefing-"));
  const previous = process.env.FOREMAN_STATE_DIR;
  process.env.FOREMAN_STATE_DIR = dir;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.FOREMAN_STATE_DIR;
    else process.env.FOREMAN_STATE_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

test("candidates derive mechanically: finished issues drop, held issues fail next-actor, missing estimates become estimate items", () => {
  const candidates = candidatesFromSnapshot(fixtureSnapshot(), { today: TODAY });
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  assert.deepEqual(
    [...byId.keys()].sort(),
    ["MT-1", "MT-2", "MT-4"],
    "done issues are not candidates; everything else is"
  );
  assert.equal(byId.get("MT-1").kind, "start-work");
  assert.equal(byId.get("MT-1").nextActor, "steve");
  assert.equal(byId.get("MT-2").kind, "estimate", "a missing estimate asks for a ballpark");
  assert.equal(byId.get("MT-4").nextActor, "held", "blocked work is held by someone else");
});

test("candidate hashes are stable for unchanged content and move when the content moves", () => {
  const first = candidatesFromSnapshot(fixtureSnapshot(), { today: TODAY });
  const second = candidatesFromSnapshot(fixtureSnapshot(), { today: TODAY });
  assert.equal(first[0].hash, second[0].hash);
  const changed = fixtureSnapshot();
  changed.jira.issues[0].summary = "Renamed";
  const third = candidatesFromSnapshot(changed, { today: TODAY });
  assert.notEqual(first[0].hash, third[0].hash);
});

test("buildBriefing ranks, persists, and reports counts, changes, and exclusions", () =>
  withTempStateDir(() => {
    const run = buildBriefing({ snapshot: fixtureSnapshot(), today: TODAY });
    assert.deepEqual(
      run.items.map((item) => item.id),
      ["MT-1", "MT-2"],
      "overdue outranks the later due date"
    );
    assert.deepEqual(
      run.exclusions.map((entry) => [entry.id, entry.reason]),
      [["MT-4", "next-actor-not-steve"]]
    );
    assert.equal(run.counts.upFirst, 2);
    assert.equal(run.counts.waiting, 2);
    assert.equal(run.counts.open, 3);
    assert.deepEqual(
      run.changes.map((change) => change.key),
      ["MT-1"],
      "changes are the issues that changed today, finished ones included never"
    );
    assert.ok(loadRun(TODAY), "the run is persisted for the day");
  }));

test("buildBriefing is idempotent for the day and preserves answers", () =>
  withTempStateDir(() => {
    const first = buildBriefing({ snapshot: fixtureSnapshot(), today: TODAY });
    answerItem({ today: TODAY, itemId: "MT-2", verb: "ballpark", ballpark: "half-day" });
    const second = buildBriefing({ snapshot: fixtureSnapshot(), today: TODAY });
    assert.equal(second.runId, first.runId);
    const answered = second.items.find((item) => item.id === "MT-2");
    assert.equal(answered.answer.verb, "ballpark");
    assert.equal(answered.answer.ballpark, "half-day");
  }));

test("yesterday's answered-unchanged items stay out and the close-out summarizes them", () =>
  withTempStateDir(() => {
    const candidates = candidatesFromSnapshot(fixtureSnapshot(), { today: TODAY });
    const mt2 = candidates.find((candidate) => candidate.id === "MT-2");
    saveRun({
      runId: "2026-08-17",
      date: "2026-08-17",
      items: [
        { id: "MT-2", hash: mt2.hash, answer: { verb: "approve", at: "2026-08-17T13:00:00Z" } },
      ],
    });
    const run = buildBriefing({ snapshot: fixtureSnapshot(), today: TODAY });
    assert.deepEqual(
      run.items.map((item) => item.id),
      ["MT-1"],
      "the unchanged answered item does not come back"
    );
    assert.deepEqual(
      run.suppressed.map((entry) => [entry.id, entry.reason]),
      [["MT-2", "answered-unchanged"]]
    );
    assert.equal(run.closeOut.answered, 1);
  }));

test("answers use the closed verb set, snooze demands a return date, and every answer writes a receipt", () =>
  withTempStateDir(() => {
    buildBriefing({ snapshot: fixtureSnapshot(), today: TODAY });
    const run = answerItem({ today: TODAY, itemId: "MT-1", verb: "done" });
    const item = run.items.find((entry) => entry.id === "MT-1");
    assert.equal(item.answer.verb, "done");
    assert.equal(run.receipts.length, 1);
    assert.equal(run.receipts[0].itemId, "MT-1");
    assert.equal(run.receipts[0].routedTo, "local-run");
    assert.throws(() => answerItem({ today: TODAY, itemId: "MT-1", verb: "obliterate" }), /verb/);
    assert.throws(() => answerItem({ today: TODAY, itemId: "missing", verb: "done" }), /item/);
    assert.throws(
      () => answerItem({ today: TODAY, itemId: "MT-2", verb: "snooze" }),
      /returnAt/,
      "a snooze without a return date is refused"
    );
  }));
