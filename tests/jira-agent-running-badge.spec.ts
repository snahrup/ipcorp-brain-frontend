import { expect, test } from "@playwright/test";
import { jiraIssue, jiraIssueTwo, mockJira } from "./helpers/mock-jira";

/**
 * Before this, a card looked identical whether an agent was actively working it or not
 * — the only place a running dispatch was visible at all was inside that one issue's own
 * modal. This proves the board-wide poll surfaces it on every card surface without the
 * modal ever being opened.
 */
async function mockRuns(page, runningKey: string | null) {
  await page.route("http://127.0.0.1:8817/api/agents/runs", async (route) => {
    const data = runningKey
      ? [
          {
            issueKey: runningKey,
            agent: "claude",
            agentLabel: "Claude Code",
            state: "running",
            startedAt: "2026-08-04T12:00:00.000Z",
            finishedAt: null,
            verdict: null,
            note: null,
            output: "",
            exitCode: null,
            error: null,
          },
        ]
      : [];
    await route.fulfill({
      status: 200,
      headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:5217" },
      body: JSON.stringify({ ok: true, data }),
    });
  });
}

test.describe("Agent-running card indicator", () => {
  test("no badge appears anywhere when nothing is running", async ({ page }) => {
    await mockJira(page);
    await mockRuns(page, null);
    await page.goto("/");
    await page.getByTestId("nav-work").click();

    await expect(page.getByText("Agent working")).not.toBeVisible();
    await page.getByRole("button", { name: "Board", exact: true }).click();
    await expect(page.getByText("Agent working")).not.toBeVisible();
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    await expect(page.getByText("Agent working")).not.toBeVisible();
  });

  test("the List row for the running issue shows the badge, the other issue does not", async ({
    page,
  }) => {
    await mockJira(page);
    await mockRuns(page, jiraIssue.key);
    await page.goto("/");
    await page.getByTestId("nav-work").click();

    const runningRow = page.locator(".wb-jira-list-row", { hasText: jiraIssue.key });
    const idleRow = page.locator(".wb-jira-list-row", { hasText: jiraIssueTwo.key });
    await expect(runningRow.getByText("Agent working")).toBeVisible();
    await expect(runningRow).toHaveAttribute("data-agent-running", "true");
    await expect(idleRow.getByText("Agent working")).not.toBeVisible();
    await expect(idleRow).not.toHaveAttribute("data-agent-running", "true");
  });

  test("the Board card for the running issue shows the badge", async ({ page }) => {
    await mockJira(page);
    await mockRuns(page, jiraIssue.key);
    await page.goto("/");
    await page.getByTestId("nav-work").click();
    await page.getByRole("button", { name: "Board", exact: true }).click();

    const runningCard = page.locator(".wb-jira-card", { hasText: jiraIssue.key });
    await expect(runningCard.getByText("Agent working")).toBeVisible();
  });

  test("the Activity row for the running issue shows the badge next to its key", async ({
    page,
  }) => {
    await mockJira(page);
    await mockRuns(page, jiraIssue.key);
    await page.goto("/");
    await page.getByTestId("nav-work").click();
    await page.getByRole("button", { name: "Activity", exact: true }).click();

    const row = page.locator(".wb-jira-activity-row", { hasText: jiraIssue.key });
    await expect(row.getByText("Agent working")).toBeVisible();
  });

  test("a run finishing makes the badge disappear on the next poll", async ({ page }) => {
    await mockJira(page);
    let running = true;
    await page.route("http://127.0.0.1:8817/api/agents/runs", async (route) => {
      const data = running
        ? [
            {
              issueKey: jiraIssue.key,
              agent: "claude",
              agentLabel: "Claude Code",
              state: "running",
              startedAt: "2026-08-04T12:00:00.000Z",
              finishedAt: null,
              verdict: null,
              note: null,
              output: "",
              exitCode: null,
              error: null,
            },
          ]
        : [];
      await route.fulfill({
        status: 200,
        headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:5217" },
        body: JSON.stringify({ ok: true, data }),
      });
    });
    await page.goto("/");
    await page.getByTestId("nav-work").click();

    await expect(page.getByText("Agent working")).toBeVisible();
    running = false;
    await expect(page.getByText("Agent working")).not.toBeVisible({ timeout: 5000 });
  });
});
