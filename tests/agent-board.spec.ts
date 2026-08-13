import { expect, type Page, test } from "@playwright/test";

/**
 * The Agent Board is the trust surface: Steve looks at it to know whether the
 * agent is keeping up, so the two behaviors that matter are that staleness is
 * loud (red cards) and that a dead source announces itself instead of leaving
 * a lane quietly empty.
 *
 * The third is that a card goes somewhere. Every card says what it points at,
 * and the negative half of that rule matters as much: a card with nothing to
 * point at is never offered as a link.
 */

const JIRA_BASE = "https://ip-corporation.atlassian.net";

const board = {
  generatedAt: "2026-08-11T20:00:00.000Z",
  date: "2026-08-11",
  sources: [
    { id: "calendar", label: "Calendar", ok: true, detail: "" },
    { id: "packages", label: "Meeting packages", ok: true, detail: "" },
    {
      id: "activity",
      label: "Reconciliation state",
      ok: false,
      detail: "The state file is not valid JSON.",
    },
    { id: "agent-runs", label: "Ticket agents", ok: true, detail: "" },
  ],
  lanes: [
    {
      id: "watching",
      label: "Watching",
      helper: "Signals on the agent's radar",
      cards: [
        {
          id: "source-activity",
          kind: "source-error",
          title: "Reconciliation state is unreadable",
          detail: "The state file is not valid JSON.",
          why: "The source failed to read, so the board says so instead of showing an empty lane that looks healthy.",
          evidence: ["Source: Reconciliation state"],
          // Nothing outside this card to send him to.
          reference: { type: "none", id: "", label: "", href: null },
          at: "2026-08-11T20:00:00.000Z",
          age: "",
          tone: "red",
          meta: [],
        },
      ],
    },
    {
      id: "working",
      label: "Working now",
      helper: "Runs executing this minute",
      cards: [
        {
          id: "activity-run-1",
          kind: "activity-run",
          title: "Activity reconciliation",
          detail: "Reading Teams messages (step 3/10)",
          why: "The run is executing right now.",
          evidence: ["Run: activity-20260811-aa11bb22"],
          reference: {
            type: "receipt",
            id: "activity-20260811-aa11bb22",
            label: "Activity reconciliation run",
            href: null,
          },
          at: "2026-08-11T19:55:00.000Z",
          age: "5m ago",
          tone: "ok",
          meta: [],
        },
        {
          id: "agent-MT-470",
          kind: "ticket-agent",
          title: "Claude working MT-470",
          detail: "Headless run against the live issue.",
          why: "A headless run is working this issue right now.",
          evidence: ["Issue: MT-470", "Agent: Claude"],
          reference: {
            type: "jira",
            id: "MT-470",
            label: "MT-470",
            href: `${JIRA_BASE}/browse/MT-470`,
          },
          at: "2026-08-11T19:40:00.000Z",
          age: "20m ago",
          tone: "ok",
          meta: [],
        },
      ],
    },
    {
      id: "waiting",
      label: "Waiting on Steve",
      helper: "Approvals, pastes, promises",
      cards: [
        {
          id: "meeting-m1",
          kind: "meeting-capture",
          title: "Programs, Projects and Tasks",
          detail: "Ended with no capture stored. Paste the Cluely transcript to process it.",
          why: "It ended and no capture is stored, so nothing can be processed until one arrives.",
          evidence: ["Calendar id: m1", "Ends: 2026-08-11T15:30:00.000Z"],
          // A calendar event has no page of its own.
          reference: {
            type: "meeting",
            id: "m1",
            label: "Programs, Projects and Tasks",
            href: null,
          },
          at: "2026-08-11T15:30:00.000Z",
          age: "4h ago",
          tone: "red",
          meta: [],
        },
      ],
    },
    {
      id: "delivered",
      label: "Delivered today",
      helper: "Finished with evidence",
      cards: [
        {
          id: "package-1",
          kind: "meeting-package",
          title: "Patrick Stiller ad-hoc check-in on the Halftime video",
          detail: "Package stored, infographic rendered.",
          why: "The package was stored today with its files written.",
          evidence: ["Package: 2026-08-11-halftime"],
          reference: {
            type: "deliverable",
            id: "2026-08-11-halftime",
            label: "Open the meeting infographic",
            href: "/api/meetings/infographic?id=2026-08-11-halftime&file=2026-08-11-halftime.png",
          },
          at: "2026-08-11T21:01:00.000Z",
          age: "1h ago",
          tone: "ok",
          meta: ["1 commitments"],
        },
      ],
    },
  ],
};

const loopStatus = {
  mode: "shadow",
  policyVersion: 1,
  tokensByClass: {},
  shadowRuns: 3,
  lastPass: "2026-08-11T19:59:00.000Z",
  todayVerdicts: [
    {
      workItemId: "proposal-p1",
      title: "Create: digest",
      classId: "jira-create",
      autonomyTier: "show",
      modelTier: "top",
    },
  ],
  latestStandup: {
    forDate: "2026-08-11",
    body: "Overnight the loop shadowed the board and touched nothing.",
    at: "2026-08-11T12:00:00.000Z",
  },
};

// Steve reads the standup on a phone and will not read a paragraph, so the
// foreman returns a headline plus terse items grouped by whether he has to act.
// An item that names one source carries that board card's own reference, so a
// tap does what tapping the card does.
const scannableStatus = {
  ...loopStatus,
  latestStandup: {
    forDate: "2026-08-11",
    at: "2026-08-11T12:00:00.000Z",
    headline: "One capture missing, everything else quiet",
    items: [
      {
        group: "act",
        text: "Programs meeting ended with no capture",
        count: 1,
        verification: "verified",
        // The board card's own reference, carried through unchanged.
        ref: {
          cardId: "meeting-m1",
          type: "meeting",
          id: "m1",
          label: "Programs, Projects and Tasks",
          href: null,
        },
      },
      {
        group: "happened",
        text: "Loop shadowed, executed nothing",
        count: 3,
        verification: "unverified",
        ref: null,
      },
    ],
    body: "Overnight the loop shadowed the board and touched nothing.",
  },
};

// An item whose card has nothing to open still takes Steve to the card.
const inertStatus = {
  ...loopStatus,
  latestStandup: {
    forDate: "2026-08-11",
    at: "2026-08-11T12:00:00.000Z",
    headline: "Reconciliation state unreadable since 8:00",
    items: [
      {
        group: "act",
        text: "Reconciliation state unreadable",
        count: 1,
        verification: "verified",
        ref: { cardId: "source-activity", type: "none", id: "", label: "", href: null },
      },
    ],
    body: "The reconciliation state could not be read.",
  },
};

const JIRA_HREF = `${JIRA_BASE}/browse/MT-470`;

// The same standup against a board whose card really does name a Jira issue.
const jiraBoard = {
  ...board,
  lanes: board.lanes.map((lane) =>
    lane.id === "waiting"
      ? {
          ...lane,
          cards: lane.cards.map((card) => ({
            ...card,
            reference: { type: "jira", id: "MT-470", label: "MT-470", href: JIRA_HREF },
          })),
        }
      : lane
  ),
};

const jiraStatus = {
  ...scannableStatus,
  latestStandup: {
    ...scannableStatus.latestStandup,
    items: scannableStatus.latestStandup.items.map((item) =>
      item.ref
        ? {
            ...item,
            ref: {
              cardId: "meeting-m1",
              type: "jira",
              id: "MT-470",
              label: "MT-470",
              href: JIRA_HREF,
            },
          }
        : item
    ),
  },
};

async function openBoard(page: Page, loop: unknown = loopStatus, lanes: unknown = board) {
  await page.route("http://127.0.0.1:8817/api/agent-board", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: lanes }),
    });
  });
  await page.route("http://127.0.0.1:8817/api/loop/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: loop }),
    });
  });
  await page.goto("/");
  await page.getByTestId("nav-agent-board").click();
  await expect(page.getByTestId("agent-board-view")).toBeVisible();
}

test("the board renders all four lanes from the agent's own state", async ({ page }) => {
  await openBoard(page);
  for (const label of ["Watching", "Working now", "Waiting on Steve", "Delivered today"]) {
    await expect(page.getByRole("heading", { name: label })).toBeVisible();
  }
  await expect(page.getByText("Reading Teams messages (step 3/10)")).toBeVisible();
  await expect(page.getByText("Package stored, infographic rendered.")).toBeVisible();
});

test("stale work is loud and a dead source is declared, not hidden", async ({ page }) => {
  await openBoard(page);
  const staleCard = page.locator('.wb-board-card[data-tone="red"][data-kind="meeting-capture"]');
  await expect(staleCard).toBeVisible();
  await expect(staleCard).toContainText("Paste the Cluely transcript");
  await expect(page.getByRole("alert")).toContainText("The state file is not valid JSON.");
  await expect(page.locator('.wb-board-card[data-kind="source-error"]')).toContainText(
    "Reconciliation state is unreadable"
  );
});

test("the standup and shadow strip render from the loop status", async ({ page }) => {
  await openBoard(page);
  await expect(page.getByTestId("board-standup")).toContainText("touched nothing");
  const strip = page.getByTestId("board-shadow-strip");
  await expect(strip).toContainText("1 verdict today");
  await expect(strip).toContainText("jira-create");
});

test("a standup with items reads as a scannable list, never a paragraph", async ({ page }) => {
  await openBoard(page, scannableStatus);
  const standup = page.getByTestId("board-standup");
  await expect(standup.locator(".wb-standup-headline")).toHaveText(
    "One capture missing, everything else quiet"
  );
  await expect(standup.locator(".wb-standup-item")).toHaveCount(2);
  await expect(standup.locator('.wb-standup-group[data-group="act"]')).toContainText(
    "Waiting on you"
  );
  // The number and the unverified marker both survive to the screen.
  await expect(standup.locator(".wb-standup-count").first()).toHaveText("1");
  await expect(standup.locator(".wb-standup-unverified")).toHaveText("unverified");
  // The paragraph is not what he reads any more.
  await expect(standup).not.toContainText("Overnight the loop shadowed the board");
});

test("a standup item opens the detail of the card it names", async ({ page }) => {
  await openBoard(page, scannableStatus);
  const standup = page.getByTestId("board-standup");
  await standup.getByRole("button", { name: "Programs meeting ended with no capture" }).click();
  await expect(page.getByTestId("board-card-modal")).toContainText("Programs, Projects and Tasks");
  // An item about no single source stays plain text rather than pretending.
  await expect(
    standup.getByRole("button", { name: "Loop shadowed, executed nothing" })
  ).toHaveCount(0);
});

test("an item whose card opens nothing still takes Steve to that card", async ({ page }) => {
  await openBoard(page, inertStatus);
  await page
    .getByTestId("board-standup")
    .getByRole("button", { name: "Reconciliation state unreadable" })
    .click();
  await expect(page.locator("#board-card-source-activity")).toHaveAttribute("data-flash", "true");
});

test("a standup item naming a Jira issue opens that issue", async ({ page }) => {
  await openBoard(page, jiraStatus, jiraBoard);
  const link = page
    .getByTestId("board-standup")
    .getByRole("link", { name: "Programs meeting ended with no capture" });
  await expect(link).toHaveAttribute("href", JIRA_HREF);
  await expect(link).toHaveAttribute("target", "_blank");
});

test("a card that names a Jira issue opens that issue in Jira", async ({ page }) => {
  await openBoard(page);
  const card = page.locator('.wb-board-card[data-kind="ticket-agent"]');
  await expect(card).toHaveAttribute("href", `${JIRA_BASE}/browse/MT-470`);
  await expect(card).toHaveAttribute("target", "_blank");
  await expect(card).toHaveAttribute("data-reference", "jira");
  // The card says where the tap goes before he takes it.
  await expect(card.locator(".wb-board-go")).toContainText("MT-470");
});

test("a card that names a stored file opens it through the gateway", async ({ page }) => {
  await openBoard(page);
  const card = page.locator('.wb-board-card[data-kind="meeting-package"]');
  await expect(card).toHaveAttribute(
    "href",
    "http://127.0.0.1:8817/api/meetings/infographic?id=2026-08-11-halftime&file=2026-08-11-halftime.png"
  );
});

test("a card with nothing to point at is never offered as a link", async ({ page }) => {
  await openBoard(page);
  const card = page.locator('.wb-board-card[data-kind="source-error"]');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-reference", "none");
  // Not a link, not a button, and no affordance suggesting a tap does anything.
  await expect(page.locator('a.wb-board-card[data-kind="source-error"]')).toHaveCount(0);
  await expect(page.locator('button.wb-board-card[data-kind="source-error"]')).toHaveCount(0);
  await expect(card.locator(".wb-board-go")).toHaveCount(0);
});

test("a card with no page of its own opens a read-only detail", async ({ page }) => {
  await openBoard(page);
  await page.locator('.wb-board-card[data-kind="meeting-capture"]').click();
  const modal = page.getByTestId("board-card-modal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("Programs, Projects and Tasks");
  // Why it is sitting in this lane, and the evidence behind it.
  await expect(modal).toContainText("Why it is in Waiting on Steve");
  await expect(modal).toContainText("no capture is stored");
  await expect(page.getByTestId("board-card-evidence")).toContainText("Calendar id: m1");
  // Read only: the agent owns this board, so there is nothing here to edit.
  await expect(modal.locator("input, textarea, select")).toHaveCount(0);
  await expect(modal.getByTestId("board-card-modal-link")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
});

test("a failed board read shows the failure and never a stale-looking board", async ({ page }) => {
  await page.route("http://127.0.0.1:8817/api/loop/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: loopStatus }),
    });
  });
  await page.route("http://127.0.0.1:8817/api/agent-board", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "The gateway is not reachable." }),
    });
  });
  await page.goto("/");
  await page.getByTestId("nav-agent-board").click();
  await expect(page.getByTestId("agent-board-view")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("The gateway is not reachable.");
  await expect(page.getByText("Nothing cached is shown in its place.")).toBeVisible();
});
