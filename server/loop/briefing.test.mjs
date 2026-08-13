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
//
// Steve reads this on a phone, so the primary output is a headline plus a
// few terse items he can scan, each carrying a reference the board can
// resolve. A model that hands back a paragraph and nothing else is a
// failure, and an item pointing at a card that does not exist is dropped.

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
          reference: {
            type: "jira",
            id: "MT-470",
            label: "MT-470",
            href: "https://ip-corporation.atlassian.net/browse/MT-470",
          },
        },
        {
          id: "d-1",
          kind: "email-draft",
          title: "Draft to Taylor Perez",
          tone: "red",
          age: "2d ago",
          reference: { type: "receipt", id: "draft-1", label: "Draft draft-1", href: null },
        },
      ],
    },
    {
      id: "delivered",
      label: "Delivered today",
      cards: [
        {
          id: "pkg-1",
          kind: "meeting-package",
          title: "Halftime Deliverable Review",
          tone: "ok",
          reference: {
            type: "deliverable",
            id: "2026-08-13-halftime-deliverable-review",
            label: "Meeting summary",
            href: "/api/team-library/file?path=summary.md",
          },
        },
      ],
    },
  ],
};

function modelOutput({ headline, items, body }) {
  return [
    "HEADLINE:",
    headline,
    "END HEADLINE",
    "ITEMS:",
    JSON.stringify(items, null, 2),
    "END ITEMS",
    "BRIEFING:",
    body,
    "END BRIEFING",
  ].join("\n");
}

const GOOD_ITEMS = [
  {
    group: "act",
    text: "Recommended Jira change, red 2 days",
    count: 1,
    verification: "verified",
    ref: "p-1",
  },
  {
    group: "act",
    text: "Draft to Taylor Perez stalled",
    count: 1,
    verification: "verified",
    ref: "d-1",
  },
  {
    group: "happened",
    text: "Halftime review package stored",
    count: 1,
    verification: "verified",
    ref: "pkg-1",
  },
  {
    group: "happened",
    text: "Loop shadowed, executed nothing",
    count: 1,
    verification: "unverified",
    ref: null,
  },
];

const GOOD_BODY =
  "Two items wait on you. The Halftime Deliverable Review package is stored with all four sources readable.";

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
    return modelOutput({
      headline: "Two items waiting, both red two days",
      items: GOOD_ITEMS,
      body: GOOD_BODY,
    });
  };

  const briefing = await assembleStandup({ ledger, board, now: NOW, runModel });
  assert.equal(briefing.kind, "standup");
  assert.equal(briefing.forDate, "2026-08-13");
  assert.match(briefing.body, /Taylor Perez|Halftime/);
  assert.ok(briefing.receiptIds.length >= 1, "citations recorded");

  const stored = await ledger.latestBriefing("standup");
  assert.equal(stored.body, briefing.body);
});

test("the standup hands back a headline and scannable items, not only a paragraph", async (t) => {
  const ledger = await seededLedger(t);
  const runModel = async (prompt) => {
    assert.match(prompt, /ref: p-1/, "the prompt hands the model the real card references");
    return modelOutput({
      headline: "Two items waiting, both red two days",
      items: [
        ...GOOD_ITEMS,
        {
          group: "act",
          text: "Points at nothing real",
          count: null,
          verification: "verified",
          ref: "no-such-card",
        },
      ],
      body: GOOD_BODY,
    });
  };

  const briefing = await assembleStandup({ ledger, board, now: NOW, runModel });

  assert.equal(briefing.headline, "Two items waiting, both red two days");
  assert.ok(Array.isArray(briefing.items), "the standup carries structured items");
  assert.equal(briefing.items.length, 4, "the item pointing at no real card is dropped");
  assert.equal(briefing.itemsDropped, 1, "the drop is recorded, not hidden");

  const act = briefing.items.filter((item) => item.group === "act");
  const happened = briefing.items.filter((item) => item.group === "happened");
  assert.equal(act.length, 2, "what Steve must do is separated from what merely happened");
  assert.equal(happened.length, 2);

  // Every item is terse enough to scan, and its reference resolves to a real
  // board card so the screen can link it.
  for (const item of briefing.items) {
    assert.ok(item.text.length <= 60, `too long to scan: ${item.text}`);
    if (item.ref) {
      const known = board.lanes.some((lane) => lane.cards.some((c) => c.id === item.ref.cardId));
      assert.ok(known, `reference resolves: ${item.ref.cardId}`);
    }
  }
  // The reference is the board card's own, copied off real state, never
  // whatever the model felt like calling it.
  assert.deepEqual(act[0].ref, {
    cardId: "p-1",
    type: "jira",
    id: "MT-470",
    label: "MT-470",
    href: "https://ip-corporation.atlassian.net/browse/MT-470",
  });
  assert.equal(act[0].count, 1, "counts survive, they scan fast");
  assert.equal(
    briefing.items.filter((item) => item.verification === "unverified").length,
    1,
    "unverified still reads as unverified"
  );

  const stored = await ledger.latestBriefing("standup");
  assert.deepEqual(stored.items, briefing.items, "the items are what got stored");
  assert.equal(stored.headline, briefing.headline);
});

test("a model that returns no items is refused, never padded into a list", async (t) => {
  const ledger = await seededLedger(t);
  const runModel = async () =>
    [
      "HEADLINE:",
      "Two items waiting, both red two days",
      "END HEADLINE",
      "BRIEFING:",
      GOOD_BODY,
      "END BRIEFING",
    ].join("\n");
  await assert.rejects(assembleStandup({ ledger, board, now: NOW, runModel }), /item/i);
  assert.equal(await ledger.latestBriefing("standup"), null, "nothing stored");
});

test("an empty list is a real answer and is stored as empty", async (t) => {
  const ledger = await seededLedger(t);
  const runModel = async () =>
    modelOutput({
      headline: "Quiet night, nothing waiting",
      items: [],
      body: "Quiet night. Nothing waits on you this morning.",
    });
  const briefing = await assembleStandup({ ledger, board, now: NOW, runModel });
  assert.deepEqual(briefing.items, []);
  assert.equal(briefing.headline, "Quiet night, nothing waiting");
});

test("a briefing that trips the voice rules is refused, not delivered", async (t) => {
  const ledger = await seededLedger(t);
  const runModel = async () =>
    modelOutput({
      headline: "Two items waiting, both red two days",
      items: GOOD_ITEMS,
      body: "We will leverage the robust pipeline going forward.",
    });
  await assert.rejects(assembleStandup({ ledger, board, now: NOW, runModel }), /voice/i);
  assert.equal(await ledger.latestBriefing("standup"), null, "nothing stored");
});

test("the voice scan reaches inside the items, not just the paragraph", async (t) => {
  const ledger = await seededLedger(t);
  const runModel = async () =>
    modelOutput({
      headline: "Two items waiting, both red two days",
      items: [
        {
          group: "act",
          text: "Jira proposal waiting on you",
          count: 1,
          verification: "verified",
          ref: "p-1",
        },
      ],
      body: GOOD_BODY,
    });
  await assert.rejects(assembleStandup({ ledger, board, now: NOW, runModel }), /voice/i);
  assert.equal(await ledger.latestBriefing("standup"), null, "nothing stored");
});

test("a headline that trips the voice rules is refused too", async (t) => {
  const ledger = await seededLedger(t);
  const runModel = async () =>
    modelOutput({
      headline: "A robust morning across the board",
      items: GOOD_ITEMS,
      body: GOOD_BODY,
    });
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
    return modelOutput({
      headline: "Quiet night, nothing waiting",
      items: [],
      body: "Quiet night. Nothing waits on you this morning.",
    });
  };
  const first = await assembleStandup({ ledger, board, now: NOW, runModel });
  const second = await assembleStandup({ ledger, board, now: NOW, runModel });
  assert.equal(calls, 1);
  assert.equal(second.id, first.id);
});
