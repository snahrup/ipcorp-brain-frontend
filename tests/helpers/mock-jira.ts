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
    // The real gateway always populates these from Jira's own seconds fields; this
    // fixture predates that being asserted on anywhere, so it was silently incomplete.
    originalEstimateSeconds: 28_800,
    remainingEstimateSeconds: 10_800,
    timeSpentSeconds: 18_000,
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
  worklogs: [
    {
      id: "worklog-1",
      author: "Steve Nahrup",
      comment: "Wrote the domain scope section.",
      timeSpent: "2h",
      timeSpentSeconds: 7200,
      createdAt: "2026-07-29T11:30:00.000Z",
    },
  ],
  lastActivityAt: "2026-07-29T11:30:00.000Z",
  lastActivitySummary: 'Steve Nahrup — logged 2h: "Wrote the domain scope section."',
};

/** A second issue under a different parent, for swimlane grouping and activity sort. */
export const jiraIssueTwo = {
  ...jiraIssue,
  key: "MT-50",
  summary: "Publish the vendor domain glossary",
  status: statusBacklog,
  parentKey: "MT-20",
  worklogs: [],
  comments: [],
  // Deliberately older than jiraIssue, so a correct Activity view sorts MT-42 first.
  lastActivityAt: "2026-07-20T09:00:00.000Z",
  lastActivitySummary: "Updated — no comment or worklog logged",
};

export const jiraInitiative = {
  projectKey: "MT" as const,
  name: "MDM Team",
  issues: [jiraIssue, jiraIssueTwo],
  statuses: [statusBacklog, statusInProgress],
  assignees: [steve],
  priorities: [
    { id: "2", name: "High" },
    { id: "3", name: "Medium" },
  ],
  fetchedAt: "2026-07-29T12:00:00.000Z",
};

export const jiraAnalytics = {
  generatedAt: "2026-08-15T16:00:00.000Z",
  jiraFetchedAt: "2026-08-15T15:59:00.000Z",
  cache: { state: "fresh" as const, savedAt: "2026-08-15T16:00:00.000Z" },
  coverage: {
    totalIssues: 42,
    sourceTruncated: false,
    historyLoaded: 42,
    historyFailed: 0,
    usableTimelines: 39,
    resolutionSamples: 18,
    backlogSamples: 31,
    openBacklogSamples: 7,
    estimatedIssues: 36,
    loggedIssues: 34,
  },
  totals: {
    openIssues: 24,
    doneIssues: 18,
    loggedSeconds: 1_249_200,
    estimatedSeconds: 1_425_600,
    loggedOnEstimatedIssuesSeconds: 1_206_000,
    unestimatedLoggedSeconds: 43_200,
    estimateUsagePercent: 84.6,
    averageResolutionSeconds: 777_600,
    medianResolutionSeconds: 691_200,
    averageBacklogSeconds: 216_000,
    medianBacklogSeconds: 172_800,
    averageOpenBacklogSeconds: 518_400,
  },
  stageDurations: [
    {
      label: "Backlog",
      category: "new",
      averageSeconds: 216_000,
      medianSeconds: 172_800,
      currentAverageSeconds: 518_400,
      totalSeconds: 6_696_000,
      visits: 38,
      closedVisits: 31,
      currentVisits: 7,
      issueCount: 38,
    },
    {
      label: "In progress",
      category: "indeterminate",
      averageSeconds: 302_400,
      medianSeconds: 259_200,
      currentAverageSeconds: 345_600,
      totalSeconds: 7_862_400,
      visits: 30,
      closedVisits: 26,
      currentVisits: 4,
      issueCount: 27,
    },
  ],
  statusDurations: [
    {
      label: "Research / Discovery",
      category: "indeterminate",
      averageSeconds: 259_200,
      medianSeconds: 216_000,
      currentAverageSeconds: 345_600,
      totalSeconds: 3_369_600,
      visits: 15,
      closedVisits: 13,
      currentVisits: 2,
      issueCount: 14,
    },
    {
      label: "In Progress",
      category: "indeterminate",
      averageSeconds: 345_600,
      medianSeconds: 302_400,
      currentAverageSeconds: 259_200,
      totalSeconds: 4_492_800,
      visits: 15,
      closedVisits: 13,
      currentVisits: 2,
      issueCount: 13,
    },
  ],
  currentStatuses: [
    {
      label: "Backlog",
      category: "new",
      count: 7,
      estimatedSeconds: 259_200,
      loggedSeconds: 43_200,
    },
    {
      label: "In Progress",
      category: "indeterminate",
      count: 4,
      estimatedSeconds: 172_800,
      loggedSeconds: 129_600,
    },
    {
      label: "Done",
      category: "done",
      count: 18,
      estimatedSeconds: 777_600,
      loggedSeconds: 820_800,
    },
  ],
  weeklyCompletions: [
    { weekOf: "2026-06-22", completed: 1 },
    { weekOf: "2026-06-29", completed: 3 },
    { weekOf: "2026-07-06", completed: 2 },
    { weekOf: "2026-07-13", completed: 4 },
    { weekOf: "2026-07-20", completed: 3 },
    { weekOf: "2026-07-27", completed: 5 },
    { weekOf: "2026-08-03", completed: 4 },
    { weekOf: "2026-08-10", completed: 6 },
  ],
  notes: [
    "Logged time sums Jira's current issue time-spent values.",
    "Parent estimates are excluded when an estimated child exists, preventing duplicate planned time.",
    "Status averages use completed visits. Active visit age is shown separately.",
  ],
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
    if (url.pathname.endsWith("/analytics")) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({ ok: true, data: jiraAnalytics }),
      });
      return;
    }
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
