import type { Page } from "@playwright/test";

/**
 * The one Jira issue the specs open. Shared so a second spec can reuse it without
 * duplicating the fixture and drifting from it.
 */
const statusBacklog = { id: "1", name: "Backlog", category: "new" };
const statusInProgress = { id: "2", name: "In Progress", category: "indeterminate" };
const steve = { accountId: "steve", displayName: "Steve Nahrup" };

export const jiraIssue = {
  key: "MT-42",
  summary: "Define governed customer domain",
  description:
    "Document the customer-domain scope, ownership, source precedence, and rollout decision.",
  status: statusInProgress,
  priority: { id: "2", name: "High" },
  assignee: steve,
  issueType: "Task",
  parentKey: "MT-10",
  labels: ["mdm", "customer-domain"],
  dueDate: "2026-08-07",
  startDate: "2026-07-27",
  updatedAt: "2026-07-29T12:00:00.000Z",
  createdAt: "2026-07-27T12:00:00.000Z",
  timeTracking: {
    originalEstimate: "8h",
    remainingEstimate: "3h",
    timeSpent: "5h",
  },
  subtasks: [{ key: "MT-43", summary: "Confirm source precedence", status: "In Progress" }],
  links: [
    {
      id: "link-1",
      type: "blocks",
      direction: "outward" as const,
      key: "MT-44",
      summary: "Publish customer-domain ownership",
    },
  ],
  comments: [
    {
      id: "comment-1",
      author: "Steve Nahrup",
      body: "I tightened the scope so the rollout decision is obvious to the next person.",
      createdAt: "2026-07-29T11:00:00.000Z",
      updatedAt: "2026-07-29T11:00:00.000Z",
    },
  ],
};

export const jiraInitiative = {
  projectKey: "MT" as const,
  name: "MDM Team",
  issues: [jiraIssue],
  statuses: [statusBacklog, statusInProgress],
  assignees: [steve],
  priorities: [
    { id: "2", name: "High" },
    { id: "3", name: "Medium" },
  ],
  fetchedAt: "2026-07-29T12:00:00.000Z",
};

/** Serves reads and refuses every write, so a spec can never mutate the real board. */
export async function mockJira(page: Page) {
  await page.route("http://127.0.0.1:8817/api/jira/**", async (route) => {
    const url = new URL(route.request().url());
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:5217",
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    };
    if (url.pathname.endsWith("/initiative")) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({ ok: true, data: jiraInitiative }),
      });
      return;
    }
    if (url.pathname.endsWith("/issues/MT-42") && route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          data: {
            issue: jiraIssue,
            transitions: [{ id: "31", name: "Done", to: "Done" }],
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 503,
      headers,
      body: JSON.stringify({
        ok: false,
        code: "test_guard",
        error: "This smoke test does not permit Jira mutations.",
      }),
    });
  });
}
