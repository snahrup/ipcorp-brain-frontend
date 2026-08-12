import { expect, type Page, test } from "@playwright/test";

/**
 * The Agent Board is the trust surface: Steve looks at it to know whether the
 * agent is keeping up, so the two behaviors that matter are that staleness is
 * loud (red cards) and that a dead source announces itself instead of leaving
 * a lane quietly empty.
 */

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
          at: "2026-08-11T19:55:00.000Z",
          age: "5m ago",
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
          at: "2026-08-11T21:01:00.000Z",
          age: "1h ago",
          tone: "ok",
          meta: ["1 commitments"],
        },
      ],
    },
  ],
};

async function openBoard(page: Page) {
  await page.route("http://127.0.0.1:8817/api/agent-board", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: board }),
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

test("a failed board read shows the failure and never a stale-looking board", async ({ page }) => {
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
