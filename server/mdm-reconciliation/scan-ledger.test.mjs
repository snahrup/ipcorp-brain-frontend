import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyDispositions,
  classifyEvidence,
  emptyLedger,
  evidenceFingerprint,
  evidenceHash,
  loadLedger,
  recordScan,
  saveLedger,
} from "./scan-ledger.mjs";

const record = (overrides = {}) => ({
  id: "proposal-2026-05-27-audit",
  kind: "Brain action proposal",
  title: "Audit proactive coaching disable flow",
  text: "Review the disable path before rollout",
  status: "proposed",
  updatedAt: "2026-05-27T12:00:00.000Z",
  reference: "Brain action proposal proposal-2026-05-27-audit",
  ...overrides,
});

test("fingerprints ignore churn-prone ids and hold on identity", () => {
  const a = record({ id: "email-2026-08-04-3" });
  const b = record({ id: "email-2026-08-04-7" });
  assert.equal(evidenceFingerprint(a), evidenceFingerprint(b));
  const other = record({ title: "A different piece of evidence" });
  assert.notEqual(evidenceFingerprint(a), evidenceFingerprint(other));
});

test("content hash moves when the substance moves", () => {
  const base = record();
  assert.equal(evidenceHash(base), evidenceHash(record()));
  assert.notEqual(evidenceHash(base), evidenceHash(record({ status: "accepted" })));
});

test("an empty ledger classifies everything as new", () => {
  const { records, counts } = classifyEvidence([record()], emptyLedger());
  assert.equal(records.length, 1);
  assert.equal(records[0].freshness, "new");
  assert.ok(records[0].fingerprint);
  assert.deepEqual(counts, { newCount: 1, changedCount: 0, carriedCount: 0, resolvedCount: 0 });
});

test("a seen but unresolved record carries instead of shouting new", () => {
  const records = [record()];
  let ledger = emptyLedger();
  const first = classifyEvidence(records, ledger);
  ledger = recordScan(
    ledger,
    { startedAt: "2026-08-05T10:00:00.000Z", finishedAt: "2026-08-05T10:01:00.000Z" },
    first.records
  );
  const second = classifyEvidence(records, ledger);
  assert.equal(second.records[0].freshness, "carried");
  assert.equal(second.counts.newCount, 0);
  assert.equal(second.counts.carriedCount, 1);
});

test("REGRESSION: scan, dismiss all, rescan proposes nothing", () => {
  const records = [record(), record({ title: "Second evidence item", id: "x-2" })];
  let ledger = emptyLedger();
  const first = classifyEvidence(records, ledger);
  assert.equal(first.counts.newCount, 2);
  ledger = recordScan(
    ledger,
    { startedAt: "2026-08-05T10:00:00.000Z", finishedAt: "2026-08-05T10:01:00.000Z" },
    first.records
  );
  ledger = applyDispositions(
    ledger,
    first.records.map((item) => item.fingerprint),
    "dismissed",
    "2026-08-05T10:05:00.000Z"
  );
  const second = classifyEvidence(records, ledger);
  assert.equal(second.records.length, 0);
  assert.deepEqual(second.counts, {
    newCount: 0,
    changedCount: 0,
    carriedCount: 0,
    resolvedCount: 2,
  });
});

test("a dismissed record that later changes comes back as changed", () => {
  const records = [record()];
  let ledger = emptyLedger();
  const first = classifyEvidence(records, ledger);
  ledger = recordScan(
    ledger,
    { startedAt: "2026-08-05T10:00:00.000Z", finishedAt: "2026-08-05T10:01:00.000Z" },
    first.records
  );
  ledger = applyDispositions(
    ledger,
    [first.records[0].fingerprint],
    "dismissed",
    "2026-08-05T10:05:00.000Z"
  );
  const changedRecords = [record({ status: "accepted" })];
  const second = classifyEvidence(changedRecords, ledger);
  assert.equal(second.records.length, 1);
  assert.equal(second.records[0].freshness, "changed");
  assert.equal(second.counts.changedCount, 1);
});

test("an applied record with unchanged substance stays gone", () => {
  const records = [record()];
  let ledger = emptyLedger();
  const first = classifyEvidence(records, ledger);
  ledger = recordScan(
    ledger,
    { startedAt: "2026-08-05T10:00:00.000Z", finishedAt: "2026-08-05T10:01:00.000Z" },
    first.records
  );
  ledger = applyDispositions(
    ledger,
    [first.records[0].fingerprint],
    "applied",
    "2026-08-05T10:05:00.000Z"
  );
  const second = classifyEvidence(records, ledger);
  assert.equal(second.records.length, 0);
  assert.equal(second.counts.resolvedCount, 1);
});

test("recordScan logs the window, advances lastScanAt, and caps history", () => {
  let ledger = emptyLedger();
  for (let index = 0; index < 70; index += 1) {
    const finishedAt = `2026-08-05T10:${String(index).padStart(2, "0")}:00.000Z`;
    ledger = recordScan(
      ledger,
      {
        startedAt: "2026-08-05T09:00:00.000Z",
        finishedAt,
        window: { from: ledger.lastScanAt, to: finishedAt },
        counts: { newCount: 0, changedCount: 0, carriedCount: 0, resolvedCount: 0 },
        proposalCount: 0,
      },
      []
    );
  }
  assert.equal(ledger.scans.length, 60);
  // The timestamps are plain strings to the ledger; the last one written wins.
  assert.equal(ledger.lastScanAt, "2026-08-05T10:69:00.000Z");
  assert.equal(ledger.scans.at(-1).window.to, ledger.lastScanAt);
});

test("loadLedger survives a missing or corrupt file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "scan-ledger-"));
  const missing = await loadLedger(join(dir, "does-not-exist.json"));
  assert.equal(missing.lastScanAt, null);
  assert.deepEqual(missing.scans, []);
  const corruptPath = join(dir, "corrupt.json");
  writeFileSync(corruptPath, "{not json at all", "utf8");
  const corrupt = await loadLedger(corruptPath);
  assert.equal(corrupt.lastScanAt, null);
});

test("saveLedger and loadLedger round-trip through disk", async () => {
  const dir = mkdtempSync(join(tmpdir(), "scan-ledger-"));
  const path = join(dir, "ledger.json");
  let ledger = emptyLedger();
  const first = classifyEvidence([record()], ledger);
  ledger = recordScan(
    ledger,
    { startedAt: "2026-08-05T10:00:00.000Z", finishedAt: "2026-08-05T10:01:00.000Z" },
    first.records
  );
  await saveLedger(path, ledger);
  const loaded = await loadLedger(path);
  assert.deepEqual(loaded, ledger);
  assert.ok(readFileSync(path, "utf8").endsWith("\n"));
});

test("concurrent saveLedger calls to the same path never collide on the tmp file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "scan-ledger-"));
  const path = join(dir, "ledger.json");
  const ledgerA = { ...emptyLedger(), lastScanAt: "2026-08-09T10:00:00.000Z" };
  const ledgerB = { ...emptyLedger(), lastScanAt: "2026-08-09T10:00:01.000Z" };

  // Mirrors the StrictMode double-invoked mount effect: two writers race to
  // rename their own tmp file onto the same final path at nearly the same time.
  await Promise.all([saveLedger(path, ledgerA), saveLedger(path, ledgerB)]);

  const loaded = await loadLedger(path);
  assert.ok(loaded.lastScanAt === ledgerA.lastScanAt || loaded.lastScanAt === ledgerB.lastScanAt);
});
