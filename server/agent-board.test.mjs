import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentBoard } from "./agent-board.mjs";

// The board exists so Steve can look at one screen and know whether the agent
// is keeping up. Every rule here is a trust rule: work the agent should have
// done and has not goes amber then red on its own, and an unreadable source is
// declared instead of rendering an empty lane that looks healthy.

const NOW = new Date("2026-08-11T20:00:00.000Z");

function lane(board, id) {
  const found = board.lanes.find((entry) => entry.id === id);
  assert.ok(found, `lane ${id} exists`);
  return found;
}

const baseInputs = () => ({
  now: NOW,
  calendar: {
    ok: true,
    date: "2026-08-11",
    availability: "current",
    meetings: [],
  },
  packages: { ok: true, items: [] },
  activityState: { ok: true, state: { runs: [], applyReceipts: {} } },
  agentRuns: { ok: true, items: [] },
});

test("an ended meeting with no package waits on Steve and goes red as it ages", () => {
  const inputs = baseInputs();
  inputs.calendar.meetings = [
    {
      id: "m-1",
      title: "Programs, Projects and Tasks",
      start: "2026-08-11T15:00:00.000Z",
      end: "2026-08-11T15:30:00.000Z",
    },
  ];
  const board = buildAgentBoard(inputs);
  const waiting = lane(board, "waiting");
  const card = waiting.cards.find((c) => c.title.includes("Programs, Projects and Tasks"));
  assert.ok(card, "ended, uncaptured meeting is waiting on Steve");
  assert.equal(card.tone, "red", "4.5 hours after end is red");
  assert.match(card.detail, /transcript/i);
});

test("a meeting whose package is stored lands in delivered, not waiting", () => {
  const inputs = baseInputs();
  inputs.calendar.meetings = [
    {
      id: "m-1",
      title: "Programs, Projects and Tasks",
      start: "2026-08-11T15:00:00.000Z",
      end: "2026-08-11T15:30:00.000Z",
    },
  ];
  inputs.packages.items = [
    {
      id: "2026-08-11-programs-projects-and-tasks",
      meeting: { title: "Programs, Projects and Tasks", start: "2026-08-11T11:00:00-04:00" },
      createdAt: "2026-08-11T18:01:39.782Z",
      commitments: [],
      infographic: { saved: { file: "x.png" } },
    },
  ];
  const board = buildAgentBoard(inputs);
  assert.equal(lane(board, "waiting").cards.filter((c) => c.title.includes("Programs")).length, 0);
  const delivered = lane(board, "delivered").cards.find((c) => c.title.includes("Programs"));
  assert.ok(delivered, "stored package shows as delivered today");
  assert.match(delivered.detail, /infographic/i);
});

test("a running reconciliation shows as working and goes red when it sits silent", () => {
  const inputs = baseInputs();
  inputs.activityState.state.runs = [
    {
      id: "run-1",
      status: "running",
      startedAt: "2026-08-11T19:00:00.000Z",
      finishedAt: null,
      lastActivityAt: "2026-08-11T19:15:00.000Z",
      phase: { label: "Reading Teams messages", index: 3, total: 10 },
      jiraProposals: [],
      emailDrafts: [],
      counts: {},
    },
  ];
  const board = buildAgentBoard(inputs);
  const card = lane(board, "working").cards.find((c) => c.kind === "activity-run");
  assert.ok(card, "running run is visible");
  assert.equal(card.tone, "red", "45 minutes without progress is red");
  assert.match(card.detail, /Reading Teams messages/);
});

test("pending proposals wait on Steve; receipt-completed ones do not", () => {
  const inputs = baseInputs();
  inputs.activityState.state.runs = [
    {
      id: "run-1",
      status: "partial_success",
      startedAt: "2026-08-10T13:51:00.000Z",
      finishedAt: "2026-08-10T13:59:00.000Z",
      jiraProposals: [
        { id: "p-1", title: "Create: due-work digest", actionLabel: "create work item" },
        { id: "p-2", title: "Update: MT-470 with the reply", actionLabel: "comment" },
      ],
      emailDrafts: [],
      counts: {},
    },
  ];
  inputs.activityState.state.applyReceipts = {
    "r-1": { status: "complete", proposalIds: ["p-2"], finishedAt: "2026-08-10T15:00:00.000Z" },
  };
  const board = buildAgentBoard(inputs);
  const waiting = lane(board, "waiting");
  assert.ok(waiting.cards.some((c) => c.title.includes("due-work digest")));
  assert.equal(waiting.cards.filter((c) => c.title.includes("MT-470")).length, 0);
  const pending = waiting.cards.find((c) => c.title.includes("due-work digest"));
  assert.equal(pending.tone, "red", "a proposal pending for 30 hours is red");
});

test("a failed draft delivery surfaces its failure instead of hiding it", () => {
  const inputs = baseInputs();
  inputs.activityState.state.runs = [
    {
      id: "run-1",
      status: "partial_success",
      startedAt: "2026-08-11T13:00:00.000Z",
      finishedAt: "2026-08-11T13:30:00.000Z",
      jiraProposals: [],
      emailDrafts: [
        {
          id: "d-1",
          to: "Taylor Perez",
          subject: "RE: Budget report",
          status: "draft_only",
          outlook: { status: "failed", detail: "A draft needs at least one email address." },
        },
      ],
      counts: {},
    },
  ];
  const board = buildAgentBoard(inputs);
  const card = lane(board, "waiting").cards.find((c) => c.kind === "email-draft");
  assert.ok(card);
  assert.match(card.detail, /at least one email address/);
  assert.notEqual(card.tone, "ok");
});

test("an unreadable source is declared and the rest of the board still builds", () => {
  const inputs = baseInputs();
  inputs.calendar = { ok: false, error: "The Outlook calendar read failed." };
  inputs.packages.items = [
    {
      id: "2026-08-11-x",
      meeting: { title: "X", start: "2026-08-11T11:00:00-04:00" },
      createdAt: "2026-08-11T18:00:00.000Z",
      commitments: [],
    },
  ];
  const board = buildAgentBoard(inputs);
  const calendarSource = board.sources.find((s) => s.id === "calendar");
  assert.equal(calendarSource.ok, false);
  assert.match(calendarSource.detail, /calendar read failed/i);
  assert.ok(lane(board, "delivered").cards.length > 0, "readable sources still render");
  const alert = lane(board, "watching").cards.find((c) => c.kind === "source-error");
  assert.ok(alert, "the failure is a visible card, not an empty lane");
  assert.equal(alert.tone, "red");
});

test("a promised commitment from an older package ages amber then red", () => {
  const inputs = baseInputs();
  inputs.packages.items = [
    {
      id: "2026-08-10-nahrup-1-on-1",
      meeting: { title: "Nahrup - 1-on-1", start: "2026-08-10T10:00:00-04:00" },
      createdAt: "2026-08-10T15:00:00.000Z",
      commitments: [
        {
          text: "Send Patrick the SharePoint paths for the packets.",
          due: "Tomorrow",
          status: "Review",
        },
      ],
    },
  ];
  const board = buildAgentBoard(inputs);
  const card = lane(board, "waiting").cards.find((c) => c.kind === "commitment");
  assert.ok(card, "promised follow-up stays visible until delivered");
  assert.equal(card.tone, "amber", "a commitment from yesterday is amber");
  assert.match(card.meta.join(" "), /Nahrup - 1-on-1/);
});
