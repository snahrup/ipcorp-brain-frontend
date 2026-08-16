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
  brainCompletions: { ok: true, items: [] },
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
      infographic: {
        saved: { file: "preview.png" },
        verified: {
          id: "2026-08-11-programs-projects-and-tasks",
          file: "Programs, Projects and Tasks [2026-08-11].png",
          path: "natively/meeting-infographics/2026-08-11-programs-projects-and-tasks/Programs, Projects and Tasks [2026-08-11].png",
          artifactId: "artifact-programs",
          sourceIds: ["transcript", "summary"],
          warningCount: 0,
        },
      },
    },
  ];
  const board = buildAgentBoard(inputs);
  assert.equal(lane(board, "waiting").cards.filter((c) => c.title.includes("Programs")).length, 0);
  const delivered = lane(board, "delivered").cards.find((c) => c.title.includes("Programs"));
  assert.ok(delivered, "stored package shows as delivered today");
  assert.match(delivered.detail, /infographic/i);
});

test("an older same-title package does not hide today's recurring meeting", () => {
  const inputs = baseInputs();
  inputs.calendar.meetings = [
    {
      id: "recurring-meeting-today",
      title: "Weekly Dev/Data Stand-up",
      start: "2026-08-11T15:00:00.000Z",
      end: "2026-08-11T15:30:00.000Z",
    },
  ];
  inputs.packages.items = [
    {
      id: "2026-08-04-weekly-dev-data-stand-up",
      meeting: {
        id: "recurring-meeting-last-week",
        title: "Weekly Dev/Data Stand-up",
        start: "2026-08-04T15:00:00.000Z",
      },
      createdAt: "2026-08-04T18:00:00.000Z",
      commitments: [],
    },
  ];

  const waiting = lane(buildAgentBoard(inputs), "waiting").cards.find(
    (entry) => entry.kind === "meeting-capture"
  );
  assert.ok(waiting);
  assert.equal(waiting.title, "Weekly Dev/Data Stand-up");
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

test("a partial reconciliation lists package outcomes and stays amber", () => {
  const inputs = baseInputs();
  inputs.activityState.state.runs = [
    {
      id: "run-meetings",
      status: "partial_success",
      startedAt: "2026-08-11T18:00:00.000Z",
      finishedAt: "2026-08-11T19:00:00.000Z",
      counts: {
        new: 8,
        changed: 2,
        meetingsProcessed: 2,
        jiraProposals: 0,
        emailDrafts: 0,
        failures: 2,
      },
      meetings: [
        { id: "mdm", title: "MDM Projects", status: "repaired" },
        { id: "etl", title: "ETL UPDATE", status: "partial" },
      ],
      jiraProposals: [],
      emailDrafts: [],
    },
  ];
  const delivered = lane(buildAgentBoard(inputs), "delivered").cards.find(
    (entry) => entry.kind === "activity-run"
  );
  assert.ok(delivered);
  assert.equal(delivered.tone, "amber");
  assert.match(delivered.detail, /10 new or changed items/);
  assert.match(delivered.detail, /2 meeting packages processed/);
  assert.ok(delivered.evidence.some((line) => line === "MDM Projects: repaired"));
  assert.ok(delivered.evidence.some((line) => line === "ETL UPDATE: partial"));
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

// Every card says what it points at, so a tap lands on the real thing instead
// of sending Steve hunting through the Jira board for the issue a line names.
// The rule that matters most is the negative one: a card with nothing to point
// at carries no reference, so the screen can never render it as a dead link.

const JIRA_BASE = "https://ip-corporation.atlassian.net";

test("a ticket agent card points at its issue with a real browse link", () => {
  const inputs = baseInputs();
  inputs.jiraBaseUrl = JIRA_BASE;
  inputs.agentRuns.items = [
    {
      issueKey: "MT-470",
      agent: "claude",
      agentLabel: "Claude",
      state: "running",
      startedAt: "2026-08-11T19:50:00.000Z",
    },
  ];
  const card = lane(buildAgentBoard(inputs), "working").cards.find(
    (c) => c.kind === "ticket-agent"
  );
  assert.ok(card, "the running agent is on the board");
  assert.equal(card.reference.type, "jira");
  assert.equal(card.reference.id, "MT-470");
  assert.equal(card.reference.href, `${JIRA_BASE}/browse/MT-470`);
});

test("a recommended change against an existing issue opens that issue", () => {
  const inputs = baseInputs();
  inputs.jiraBaseUrl = `${JIRA_BASE}/`;
  inputs.activityState.state.runs = [
    {
      id: "run-1",
      status: "partial_success",
      startedAt: "2026-08-11T13:00:00.000Z",
      finishedAt: "2026-08-11T13:30:00.000Z",
      jiraProposals: [
        { id: "p-1", issueKey: "MT-512", title: "Update: MT-512", actionLabel: "comment" },
        { id: "p-2", title: "Create: due-work digest", actionLabel: "create work item" },
      ],
      emailDrafts: [],
      counts: {},
    },
  ];
  const waiting = lane(buildAgentBoard(inputs), "waiting").cards;
  const linked = waiting.find((c) => c.reference.id === "MT-512");
  assert.ok(linked, "the change against MT-512 carries the issue key");
  assert.equal(linked.reference.href, `${JIRA_BASE}/browse/MT-512`, "one slash, not two");

  // A brand new issue has no key yet. It still has identity, so it opens its
  // own detail rather than a link that would go nowhere.
  const created = waiting.find((c) => c.title.includes("due-work digest"));
  assert.equal(created.reference.type, "receipt");
  assert.equal(created.reference.id, "p-2");
  assert.equal(created.reference.href, null);
});

test("no readable Jira host means no link, never a guessed one", () => {
  const inputs = baseInputs();
  inputs.jiraBaseUrl = "";
  inputs.agentRuns.items = [
    { issueKey: "MT-470", agentLabel: "Claude", state: "running", startedAt: NOW.toISOString() },
  ];
  const card = lane(buildAgentBoard(inputs), "working").cards.find(
    (c) => c.kind === "ticket-agent"
  );
  assert.equal(card.reference.type, "jira", "the key is still true");
  assert.equal(card.reference.id, "MT-470");
  assert.equal(card.reference.href, null, "nothing is invented when the host is unknown");
});

test("an unreadable source has nothing to point at, so it carries no reference", () => {
  const inputs = baseInputs();
  inputs.activityState = { ok: false, error: "The state file is not valid JSON." };
  const card = lane(buildAgentBoard(inputs), "watching").cards.find(
    (c) => c.kind === "source-error"
  );
  assert.ok(card, "the failure is still a visible card");
  assert.equal(card.reference.type, "none");
  assert.equal(card.reference.href, null);
  assert.match(card.why, /empty lane/i, "the card says why it is here");
});

test("a stored package points at the verified infographic, never an unverified file", () => {
  const inputs = baseInputs();
  inputs.packages.items = [
    {
      id: "2026-08-11-halftime-video",
      meeting: { title: "Halftime video working session" },
      createdAt: "2026-08-11T18:00:00.000Z",
      commitments: [{ text: "Send Patrick the cut list.", due: "Tomorrow" }],
      infographic: {
        saved: { id: "2026-08-11-halftime-video", file: "2026-08-11-preview.png" },
        verified: {
          id: "2026-08-11-halftime-video",
          file: "Halftime video working session [2026-08-11].png",
          path: "natively/meeting-infographics/2026-08-11-halftime-video/Halftime video working session [2026-08-11].png",
          artifactId: "artifact-halftime",
          sourceIds: ["transcript", "summary"],
          warningCount: 0,
        },
      },
      files: { summary: "core/meetings/summaries/2026-08-11-halftime-video.md" },
    },
  ];
  const board = buildAgentBoard(inputs);
  const stored = lane(board, "delivered").cards.find((c) => c.kind === "meeting-package");
  assert.equal(stored.reference.type, "deliverable");
  assert.equal(
    stored.reference.href,
    "/api/meetings/infographic?id=2026-08-11-halftime-video&file=Halftime%20video%20working%20session%20%5B2026-08-11%5D.png"
  );
  assert.ok(
    stored.evidence.some((line) => line.includes("2026-08-11-halftime-video.md")),
    "the stored files are the evidence"
  );

  // A promise has no page anywhere, so it points back at its meeting and the
  // screen opens the detail instead of a link.
  const promise = lane(board, "waiting").cards.find((c) => c.kind === "commitment");
  assert.equal(promise.reference.type, "meeting");
  assert.equal(promise.reference.id, "2026-08-11-halftime-video");
  assert.equal(promise.reference.href, null);
});

test("a package without a generated image says the final infographic is still pending", () => {
  const inputs = baseInputs();
  inputs.packages.items = [
    {
      id: "2026-08-11-preview-only",
      meeting: { title: "Preview only" },
      createdAt: "2026-08-11T18:00:00.000Z",
      commitments: [],
      infographic: {
        saved: { id: "2026-08-11-preview-only", file: "2026-08-11-preview-only.png" },
        verified: null,
      },
    },
  ];
  const stored = lane(buildAgentBoard(inputs), "delivered").cards.find(
    (entry) => entry.kind === "meeting-package"
  );
  assert.ok(stored);
  assert.match(stored.detail, /still pending/i);
  assert.equal(stored.tone, "amber");
  assert.equal(stored.reference.href, null);
});

test("a verified scheduled infographic appears as delivered with recorded review notes", () => {
  const inputs = baseInputs();
  inputs.packages.items = [
    {
      id: "2026-05-19-plant-tour",
      meeting: { title: "Plant Tour" },
      createdAt: "2026-08-10T18:00:00.000Z",
      commitments: [],
    },
  ];
  inputs.brainCompletions.items = [
    {
      id: "2026-05-19-plant-tour",
      title: "Plant Tour",
      generatedAt: "2026-08-11T19:50:00.000Z",
      artifactId: "artifact-plant-tour",
      sourceIds: ["transcript", "summary"],
      file: "Plant Tour [2026-05-19].png",
      path: "natively/meeting-infographics/2026-05-19-plant-tour/Plant Tour [2026-05-19].png",
      sha256: "abc123",
      warningCount: 3,
    },
  ];
  const delivered = lane(buildAgentBoard(inputs), "delivered").cards.find(
    (entry) => entry.kind === "meeting-infographic"
  );
  assert.ok(delivered);
  assert.equal(delivered.title, "Plant Tour");
  assert.equal(delivered.tone, "amber");
  assert.match(delivered.detail, /3 recorded review notes/i);
  assert.match(delivered.reference.href, /Plant%20Tour%20%5B2026-05-19%5D.png/);
});

test("a same-day package and its verified infographic appear only once", () => {
  const inputs = baseInputs();
  inputs.packages.items = [
    {
      id: "2026-08-11-current-meeting",
      meeting: { title: "Current meeting" },
      createdAt: "2026-08-11T18:00:00.000Z",
      commitments: [],
      infographic: {
        verified: {
          id: "2026-08-11-current-meeting",
          file: "Current meeting [2026-08-11].png",
          path: "natively/meeting-infographics/2026-08-11-current-meeting/Current meeting [2026-08-11].png",
          artifactId: "artifact-current",
          sourceIds: ["transcript", "summary"],
          warningCount: 0,
        },
      },
    },
  ];
  inputs.brainCompletions.items = [
    {
      ...inputs.packages.items[0].infographic.verified,
      title: "Current meeting",
      generatedAt: "2026-08-11T18:05:00.000Z",
      sha256: "abc123",
    },
  ];
  const delivered = lane(buildAgentBoard(inputs), "delivered").cards.filter(
    (entry) => entry.title === "Current meeting"
  );
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].kind, "meeting-package");
});

test("an applied receipt lands on the board and points at the issue it changed", () => {
  const inputs = baseInputs();
  inputs.jiraBaseUrl = JIRA_BASE;
  inputs.activityState.state.applyReceipts = {
    "r-1": {
      id: "r-1",
      runId: "run-1",
      status: "complete",
      proposalIds: ["p-2"],
      // The store writes completedAt. Reading finishedAt kept this card off
      // the board entirely.
      completedAt: "2026-08-11T15:00:00.000Z",
      results: [{ proposalId: "p-2", receipt: { issueKey: "MT-470" } }],
    },
  };
  const card = lane(buildAgentBoard(inputs), "delivered").cards.find(
    (c) => c.kind === "jira-apply"
  );
  assert.ok(card, "a completed apply is delivered work");
  assert.equal(card.reference.type, "jira");
  assert.equal(card.reference.href, `${JIRA_BASE}/browse/MT-470`);
});

test("every card on the board carries a reference, even when it is none", () => {
  const inputs = baseInputs();
  inputs.jiraBaseUrl = JIRA_BASE;
  inputs.calendar.availability = "loading";
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
      id: "2026-08-10-nahrup-1-on-1",
      meeting: { title: "Nahrup - 1-on-1" },
      createdAt: "2026-08-10T15:00:00.000Z",
      commitments: [{ text: "Send the packet paths.", due: "Tomorrow" }],
    },
  ];
  inputs.activityState.state.runs = [
    {
      id: "run-1",
      status: "partial_success",
      startedAt: "2026-08-11T13:00:00.000Z",
      finishedAt: "2026-08-11T13:30:00.000Z",
      jiraProposals: [{ id: "p-1", title: "Create: digest", actionLabel: "create work item" }],
      emailDrafts: [{ id: "d-1", to: "taylor@example.com", subject: "RE: Budget", outlook: {} }],
      counts: {},
    },
  ];
  const board = buildAgentBoard(inputs);
  const cards = board.lanes.flatMap((entry) => entry.cards);
  assert.ok(cards.length >= 5, "the board has cards to check");
  const allowed = new Set(["jira", "meeting", "deliverable", "receipt", "none"]);
  for (const entry of cards) {
    assert.ok(entry.reference, `${entry.id} carries a reference`);
    assert.ok(allowed.has(entry.reference.type), `${entry.id} has a known reference type`);
    assert.ok(Array.isArray(entry.evidence), `${entry.id} carries evidence`);
    if (entry.reference.type === "none") {
      assert.equal(entry.reference.href, null, `${entry.id} must not look clickable`);
    } else {
      assert.ok(entry.reference.id, `${entry.id} names what it points at`);
    }
  }
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
