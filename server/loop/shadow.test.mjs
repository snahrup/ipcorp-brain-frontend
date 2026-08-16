import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openLedger } from "./ledger.mjs";
import { loadPolicy } from "./policy.mjs";
import { KIND_TO_CLASS, shadowPass } from "./shadow.mjs";

// First light: the loop senses and classifies, and does nothing. Shadow rows
// are honest (unverified, zero tokens) and idempotent per item per day.

const NOW = new Date("2026-08-12T23:00:00.000Z");

const policy = loadPolicy({
  version: 1,
  classes: {
    "jira-create": { autonomy: "show", model: "top", tools: "jira-write", promoteAt: 10 },
    "draft-deliver": { autonomy: "show", model: "none", tools: "outlook-draft", promoteAt: 10 },
    "email-send": { autonomy: "ask", model: "top", tools: "outlook-send", promoteAt: 10 },
    "meeting-invite": { autonomy: "ask", model: "top", tools: "outlook-send", promoteAt: 10 },
  },
});

const board = {
  generatedAt: NOW.toISOString(),
  lanes: [
    {
      id: "waiting",
      cards: [
        { id: "proposal-p1", kind: "recommended-change", title: "Create: digest" },
        { id: "draft-d1", kind: "email-draft", title: "Draft to Taylor" },
        { id: "meeting-m1", kind: "meeting-capture", title: "Halftime Deliverable Review" },
        { id: "commitment-c1", kind: "commitment", title: "Send Patrick the links" },
      ],
    },
    { id: "working", cards: [{ id: "run-x", kind: "activity-run", title: "reconciliation" }] },
    { id: "watching", cards: [] },
    { id: "delivered", cards: [{ id: "package-1", kind: "meeting-package", title: "done" }] },
  ],
};

async function freshLedger(t) {
  const dir = await mkdtemp(join(tmpdir(), "loop-shadow-"));
  t.after(async () => {
    assert.ok(dir.startsWith(tmpdir()));
    await rm(dir, { recursive: true, force: true });
  });
  return openLedger(join(dir, "loop-ledger.json"));
}

test("a pass classifies every open item and acts on nothing", async (t) => {
  const ledger = await freshLedger(t);
  const result = await shadowPass({ board, policy, ledger, now: NOW });

  assert.equal(result.considered, 4, "waiting lane only; working and delivered are not open work");
  assert.equal(result.recorded, 4);

  const runs = await ledger.runsWithVerification();
  assert.equal(runs.length, 4);
  for (const run of runs) {
    assert.equal(run.state, "shadow");
    assert.equal(run.verification, "unverified", "shadow rows never read as done");
  }

  const mapped = runs.find((run) => run.workItemId === "proposal-p1");
  assert.equal(mapped.classId, "jira-create", "kind maps through the explicit table");

  const unknown = runs.find((run) => run.workItemId === "commitment-c1");
  assert.equal(unknown.classId, "commitment", "unmapped kinds keep their kind as class id");
  const receipts = await ledger.receiptsForRun(unknown.id);
  assert.match(receipts[0].outcome, /ask/, "unknown work fails closed to ask in the verdict");
  assert.equal(receipts[0].tokensIn + receipts[0].tokensOut, 0, "shadow spends nothing");
});

test("a second pass the same day adds nothing; a new day shadows again", async (t) => {
  const ledger = await freshLedger(t);
  await shadowPass({ board, policy, ledger, now: NOW });
  const laterSameDay = new Date(NOW.getTime() + 5 * 60_000);
  const again = await shadowPass({ board, policy, ledger, now: laterSameDay });
  assert.equal(again.recorded, 0, "same item, same day: no duplicate shadow rows");
  assert.equal((await ledger.runsWithVerification()).length, 4);
  assert.equal(
    (await ledger.latestPass()).passAt,
    laterSameDay.toISOString(),
    "a successful no-change pass still advances the visible loop heartbeat"
  );

  const tomorrow = new Date(NOW.getTime() + 24 * 3_600_000);
  const nextDay = await shadowPass({ board, policy, ledger, now: tomorrow });
  assert.equal(nextDay.recorded, 4, "still-open work is shadowed fresh each day");
});

test("the kind map stays explicit and small", () => {
  assert.equal(KIND_TO_CLASS["recommended-change"], "jira-create");
  assert.equal(KIND_TO_CLASS["email-draft"], "draft-deliver");
  assert.equal(KIND_TO_CLASS["meeting-capture"], "transcript-paste");
});
