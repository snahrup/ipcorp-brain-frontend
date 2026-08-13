import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assembleStandup } from "./briefing.mjs";
import { openLedger } from "./ledger.mjs";

// The foreman's first artifact. Assembled only from receipts and board
// state, cites what it was built from, refuses banned words, and fails
// closed when the model fails: no briefing beats an invented one.

const NOW = new Date("2026-08-13T12:00:00.000Z");

const board = {
  generatedAt: NOW.toISOString(),
  sources: [
    { id: "calendar", label: "Calendar", ok: true, detail: "" },
    { id: "packages", label: "Meeting packages", ok: true, detail: "" },
    { id: "activity", label: "Reconciliation state", ok: true, detail: "" },
    { id: "agent-runs", label: "Ticket agents", ok: true, detail: "" },
  ],
  lanes: [
    { id: "watching", label: "Watching", cards: [] },
    { id: "working", label: "Working now", cards: [] },
    {
      id: "waiting",
      label: "Waiting on Steve",
      cards: [
        {
          id: "p-1",
          kind: "recommended-change",
          title: "Create: digest",
          tone: "red",
          age: "2d ago",
        },
        {
          id: "d-1",
          kind: "email-draft",
          title: "Draft to Taylor Perez",
          tone: "red",
          age: "2d ago",
        },
      ],
    },
    {
      id: "delivered",
      label: "Delivered today",
      cards: [
        { id: "pkg-1", kind: "meeting-package", title: "Halftime Deliverable Review", tone: "ok" },
      ],
    },
  ],
};

async function seededLedger(t) {
  const dir = await mkdtemp(join(tmpdir(), "loop-briefing-"));
  t.after(async () => {
    assert.ok(dir.startsWith(tmpdir()));
    await rm(dir, { recursive: true, force: true });
  });
  const ledger = await openLedger(join(dir, "ledger.json"));
  await ledger.recordRun({
    id: "shadow-1",
    workItemId: "p-1",
    classId: "jira-create",
    state: "shadow",
    startedAt: "2026-08-13T05:46:00.000Z",
    finishedAt: "2026-08-13T05:46:00.000Z",
  });
  await ledger.appendReceipt({
    runId: "shadow-1",
    outcome: "WOULD handle as jira-create: show tier.",
    tokensIn: 0,
    tokensOut: 0,
    changedRefs: [],
    at: "2026-08-13T05:46:00.000Z",
  });
  return ledger;
}

test("the standup is stored with its receipt citations and survives the voice scan", async (t) => {
  const ledger = await seededLedger(t);
  const runModel = async (prompt) => {
    assert.match(prompt, /Waiting on Steve/, "the prompt carries real board state");
    assert.match(prompt, /jira-create/, "the prompt carries real shadow verdicts");
    return [
      "BRIEFING:",
      "Overnight the loop shadowed the board and touched nothing. Two items",
      "sit waiting on you: one recommended Jira change and one stalled draft",
      "to Taylor Perez, both red for two days. The Halftime Deliverable",
      "Review processed end to end with its package stored. All four sources",
      "are readable.",
      "END BRIEFING",
    ].join("\n");
  };

  const briefing = await assembleStandup({ ledger, board, now: NOW, runModel });
  assert.equal(briefing.kind, "standup");
  assert.equal(briefing.forDate, "2026-08-13");
  assert.match(briefing.body, /Taylor Perez/);
  assert.ok(briefing.receiptIds.length >= 1, "citations recorded");

  const stored = await ledger.latestBriefing("standup");
  assert.equal(stored.body, briefing.body);
});

test("a briefing that trips the voice rules is refused, not delivered", async (t) => {
  const ledger = await seededLedger(t);
  const runModel = async () =>
    "BRIEFING:\nWe will leverage the robust pipeline going forward.\nEND BRIEFING";
  await assert.rejects(assembleStandup({ ledger, board, now: NOW, runModel }), /voice/i);
  assert.equal(await ledger.latestBriefing("standup"), null, "nothing stored");
});

test("a failed model means no briefing, never a template", async (t) => {
  const ledger = await seededLedger(t);
  const runModel = async () => {
    throw new Error("model unreachable");
  };
  await assert.rejects(assembleStandup({ ledger, board, now: NOW, runModel }));
  assert.equal(await ledger.latestBriefing("standup"), null);
});

test("one standup per day: a second assembly the same day returns the stored one", async (t) => {
  const ledger = await seededLedger(t);
  let calls = 0;
  const runModel = async () => {
    calls += 1;
    return "BRIEFING:\nQuiet night. Nothing waits on you this morning.\nEND BRIEFING";
  };
  const first = await assembleStandup({ ledger, board, now: NOW, runModel });
  const second = await assembleStandup({ ledger, board, now: NOW, runModel });
  assert.equal(calls, 1);
  assert.equal(second.id, first.id);
});
