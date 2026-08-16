import assert from "node:assert/strict";
import test from "node:test";
import { buildJiraAnalytics, createJiraAnalyticsReader } from "./jira-analytics.mjs";

const HOUR = 3_600;
const DAY = 24 * HOUR;

function issue({
  key,
  createdAt = "2026-01-01T00:00:00.000Z",
  status = "In progress",
  category = "indeterminate",
  parentKey = null,
  estimate = 0,
  logged = 0,
}) {
  return {
    key,
    createdAt,
    status: { id: status.toLowerCase().replaceAll(" ", "-"), name: status, category },
    parentKey,
    timeTracking: {
      originalEstimateSeconds: estimate,
      timeSpentSeconds: logged,
    },
  };
}

function change(createdAt, from, to) {
  return [{ createdAt, items: [{ field: "status", from, to }] }];
}

const statuses = [
  { id: "backlog", name: "Backlog", category: "new" },
  { id: "progress", name: "In progress", category: "indeterminate" },
  { id: "review", name: "Review", category: "indeterminate" },
  { id: "done", name: "Done", category: "done" },
];

test("calculates logged, leaf estimates, resolution, backlog, and status time", () => {
  const parent = issue({
    key: "MT-1",
    status: "Done",
    category: "done",
    estimate: 8 * HOUR,
    logged: 2 * HOUR,
  });
  const childA = issue({
    key: "MT-2",
    status: "Done",
    category: "done",
    parentKey: "MT-1",
    estimate: 4 * HOUR,
    logged: 3 * HOUR,
  });
  const childB = issue({
    key: "MT-3",
    status: "Done",
    category: "done",
    parentKey: "MT-1",
    estimate: 4 * HOUR,
    logged: 5 * HOUR,
  });
  const histories = {
    "MT-1": [
      ...change("2026-01-03T00:00:00.000Z", "Backlog", "In progress"),
      ...change("2026-01-05T00:00:00.000Z", "In progress", "Done"),
    ],
    "MT-2": [
      ...change("2026-01-03T00:00:00.000Z", "Backlog", "In progress"),
      ...change("2026-01-05T00:00:00.000Z", "In progress", "Done"),
    ],
    "MT-3": [
      ...change("2026-01-03T00:00:00.000Z", "Backlog", "In progress"),
      ...change("2026-01-05T00:00:00.000Z", "In progress", "Done"),
    ],
  };

  const result = buildJiraAnalytics({
    initiative: { issues: [parent, childA, childB], statuses, fetchedAt: "2026-01-10" },
    historyByIssue: histories,
    now: new Date("2026-01-10T00:00:00.000Z"),
  });

  assert.equal(result.totals.loggedSeconds, 10 * HOUR);
  assert.equal(result.totals.estimatedSeconds, 8 * HOUR);
  assert.equal(result.totals.loggedOnEstimatedIssuesSeconds, 8 * HOUR);
  assert.equal(result.totals.unestimatedLoggedSeconds, 2 * HOUR);
  assert.equal(result.totals.estimateUsagePercent, 100);
  assert.equal(result.coverage.estimatedIssues, 2);
  assert.equal(result.totals.averageResolutionSeconds, 4 * DAY);
  assert.equal(result.totals.averageBacklogSeconds, 2 * DAY);
  assert.equal(
    result.statusDurations.find((row) => row.label === "In progress")?.averageSeconds,
    2 * DAY
  );
  assert.equal(
    result.statusDurations.some((row) => row.label === "Done"),
    false
  );
});

test("counts repeated visits and keeps active backlog separate from completed backlog wait", () => {
  const repeated = issue({ key: "MT-4", status: "In progress" });
  const waiting = issue({ key: "MT-5", status: "Backlog", category: "new" });
  const result = buildJiraAnalytics({
    initiative: { issues: [repeated, waiting], statuses },
    historyByIssue: {
      "MT-4": [
        ...change("2026-01-02T00:00:00.000Z", "Backlog", "In progress"),
        ...change("2026-01-03T00:00:00.000Z", "In progress", "Review"),
        ...change("2026-01-04T00:00:00.000Z", "Review", "In progress"),
      ],
      "MT-5": [],
    },
    now: new Date("2026-01-06T00:00:00.000Z"),
  });

  const inProgress = result.statusDurations.find((row) => row.label === "In progress");
  assert.equal(inProgress?.visits, 2);
  assert.equal(inProgress?.closedVisits, 1);
  assert.equal(inProgress?.currentVisits, 1);
  assert.equal(inProgress?.issueCount, 1);
  assert.equal(inProgress?.averageSeconds, DAY);
  assert.equal(inProgress?.currentAverageSeconds, 2 * DAY);
  assert.equal(result.coverage.backlogSamples, 1);
  assert.equal(result.coverage.openBacklogSamples, 1);
  assert.equal(result.totals.averageBacklogSeconds, DAY);
  assert.equal(result.totals.averageOpenBacklogSeconds, 5 * DAY);
});

test("excludes missing dates and failed history from flow averages without losing totals", () => {
  const missingDate = issue({ key: "MT-6", createdAt: "", estimate: HOUR, logged: HOUR });
  const failed = issue({ key: "MT-7", estimate: 2 * HOUR, logged: HOUR });
  const result = buildJiraAnalytics({
    initiative: { issues: [missingDate, failed], statuses },
    historyByIssue: { "MT-6": [] },
    failedIssueKeys: ["MT-7"],
    now: new Date("2026-01-06T00:00:00.000Z"),
  });

  assert.equal(result.totals.loggedSeconds, 2 * HOUR);
  assert.equal(result.totals.estimatedSeconds, 3 * HOUR);
  assert.equal(result.totals.loggedOnEstimatedIssuesSeconds, 2 * HOUR);
  assert.equal(result.totals.unestimatedLoggedSeconds, 0);
  assert.equal(result.coverage.historyFailed, 1);
  assert.equal(result.coverage.usableTimelines, 0);
  assert.equal(result.totals.averageResolutionSeconds, null);
  assert.deepEqual(result.statusDurations, []);
});

test("reader limits concurrent changelog calls, keeps partial results, and caches", async () => {
  const issues = Array.from({ length: 7 }, (_, index) => issue({ key: `MT-${index + 10}` }));
  let active = 0;
  let maxActive = 0;
  let initiativeReads = 0;
  let changelogReads = 0;
  const reader = createJiraAnalyticsReader({
    concurrency: 3,
    now: () => new Date("2026-01-06T00:00:00.000Z"),
    readInitiative: async () => {
      initiativeReads += 1;
      return { issues, statuses, fetchedAt: "2026-01-06T00:00:00.000Z" };
    },
    readChangelog: async (key) => {
      changelogReads += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      if (key === "MT-12") throw new Error("unavailable");
      return [];
    },
  });

  const first = await reader();
  const second = await reader();

  assert.equal(maxActive, 3);
  assert.equal(first.coverage.historyFailed, 1);
  assert.equal(first.coverage.historyLoaded, 6);
  assert.equal(first.cache.state, "fresh");
  assert.equal(second.cache.state, "cached");
  assert.equal(initiativeReads, 1);
  assert.equal(changelogReads, 7);
});
