import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openLedger } from "./ledger.mjs";

// The record the whole loop trusts. Append-only is structural here: the API
// has no way to change a receipt, a run without verification can never read
// as done, and tokens per class is a query, not an estimate.

const NOW = new Date("2026-08-12T22:30:00.000Z");

async function freshLedger(t) {
  const dir = await mkdtemp(join(tmpdir(), "loop-ledger-"));
  t.after(async () => {
    assert.ok(dir.startsWith(tmpdir()));
    await rm(dir, { recursive: true, force: true });
  });
  return openLedger(join(dir, "loop-ledger.json"));
}

test("a run without a verification row reads unverified, never done", async (t) => {
  const ledger = await freshLedger(t);
  await ledger.recordRun({
    id: "run-1",
    workItemId: "item-1",
    classId: "jira-comment",
    agentRole: "writer",
    modelUsed: "top",
    state: "complete",
    startedAt: NOW.toISOString(),
    finishedAt: NOW.toISOString(),
  });

  const rows = await ledger.runsWithVerification();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].verification, "unverified");

  await ledger.recordVerification({
    runId: "run-1",
    ladder: "mechanical",
    result: "verified",
    evidenceRef: "readback:MT-474",
  });
  const after = await ledger.runsWithVerification();
  assert.equal(after[0].verification, "verified");
});

test("receipts append only: no update or delete exists, corrections supersede", async (t) => {
  const ledger = await freshLedger(t);
  await ledger.recordRun({
    id: "run-1",
    workItemId: "item-1",
    classId: "log-digest",
    state: "complete",
    startedAt: NOW.toISOString(),
    finishedAt: NOW.toISOString(),
  });
  const first = await ledger.appendReceipt({
    runId: "run-1",
    outcome: "Digest written.",
    tokensIn: 900,
    tokensOut: 150,
    changedRefs: [],
    at: NOW.toISOString(),
  });

  assert.equal(typeof ledger.updateReceipt, "undefined");
  assert.equal(typeof ledger.deleteReceipt, "undefined");

  const correction = await ledger.appendReceipt({
    runId: "run-1",
    outcome: "Digest written; earlier count was wrong.",
    tokensIn: 900,
    tokensOut: 150,
    changedRefs: [],
    supersedes: first.id,
    at: NOW.toISOString(),
  });
  const receipts = await ledger.receiptsForRun("run-1");
  assert.equal(receipts.length, 2, "corrections are new rows");
  assert.equal(receipts[1].supersedes, first.id);
  assert.notEqual(correction.id, first.id);
});

test("tokens per class per week is a real query", async (t) => {
  const ledger = await freshLedger(t);
  const day = (offset) => new Date(NOW.getTime() - offset * 24 * 3_600_000).toISOString();

  const seed = async (id, classId, at, tokensOut) => {
    await ledger.recordRun({
      id,
      workItemId: `item-${id}`,
      classId,
      state: "complete",
      startedAt: at,
      finishedAt: at,
    });
    await ledger.appendReceipt({
      runId: id,
      outcome: "x",
      tokensIn: 100,
      tokensOut,
      changedRefs: [],
      at,
    });
  };

  await seed("run-1", "jira-comment", day(1), 500);
  await seed("run-2", "jira-comment", day(2), 700);
  await seed("run-3", "log-digest", day(3), 50);
  await seed("run-4", "jira-comment", day(20), 9_000); // outside the week

  const week = await ledger.tokensByClass({ since: day(7) });
  assert.equal(week["jira-comment"].tokensOut, 1200);
  assert.equal(week["jira-comment"].runs, 2);
  assert.equal(week["log-digest"].tokensOut, 50);
  assert.equal(week["jira-comment"].tokensIn, 200);
  assert.equal(week["run-4"], undefined);
});

test("class state persists across reopen and survives the earned-autonomy round trip", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "loop-ledger-state-"));
  t.after(async () => {
    assert.ok(dir.startsWith(tmpdir()));
    await rm(dir, { recursive: true, force: true });
  });
  const path = join(dir, "loop-ledger.json");

  const ledger = await openLedger(path);
  await ledger.saveClassState("ticket-code", {
    tier: "show",
    streak: 4,
    tierSince: "2026-08-01T00:00:00.000Z",
    promoteAt: 10,
  });

  const reopened = await openLedger(path);
  const state = await reopened.classState("ticket-code");
  assert.equal(state.streak, 4);
  assert.equal(state.tier, "show");

  const raw = JSON.parse(await readFile(path, "utf8"));
  assert.ok(Array.isArray(raw.receipts), "the file is the documented shape");
});

test("briefings store append-only with a latest read", async (t) => {
  const ledger = await freshLedger(t);
  assert.equal(await ledger.latestBriefing("standup"), null);
  await ledger.appendBriefing({
    kind: "standup",
    forDate: "2026-08-13",
    body: "Overnight the loop shadowed 28 items.",
    receiptIds: ["receipt-1"],
    at: NOW.toISOString(),
  });
  const latest = await ledger.latestBriefing("standup");
  assert.equal(latest.forDate, "2026-08-13");
  assert.match(latest.body, /shadowed 28/);
  assert.equal(typeof ledger.updateBriefing, "undefined");
});
