import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { auditWeeklyEffort } from "./policy.mjs";

const FRONTEND_ROOT = resolve(
  new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
);
const RUN_ROOT = join(FRONTEND_ROOT, "workflow-runs", "mdm-jira-rebuild");

function normalizedSummary(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(?:fabric|mdm|ip corp|task|work)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function metadataGaps(issue) {
  const gaps = [];
  if (!issue.assignee?.accountId) gaps.push("assignee");
  if (!Array.isArray(issue.labels) || issue.labels.length < 2) gaps.push("labels");
  if (!issue.startDate) gaps.push("startDate");
  if (!issue.dueDate) gaps.push("dueDate");
  if (!issue.timeTracking?.originalEstimate) gaps.push("originalEstimate");
  if (!issue.description?.trim()) gaps.push("description");
  if (
    issue.status?.name === "Done" &&
    !["0h", "0m"].includes(issue.timeTracking?.remainingEstimate)
  ) {
    gaps.push("zeroRemainingEstimate");
  }
  return gaps;
}

async function main() {
  const latest = JSON.parse(await readFile(join(RUN_ROOT, "latest.json"), "utf8"));
  const payload = JSON.parse(
    await readFile(join(latest.runDirectory, "jira-export-response.json"), "utf8")
  );
  const issues = payload.data?.issues || [];

  const worklogs = issues.flatMap((issue) =>
    (issue.worklogs || []).map((worklog) => ({
      issueKey: issue.key,
      issueSummary: issue.summary,
      worklogId: worklog.id,
      started: worklog.startedAt,
      hours: Number(worklog.timeSpentSeconds || 0) / 3600,
      author: worklog.author,
      authorAccountId: worklog.authorAccountId,
      comment: worklog.comment,
    }))
  );
  const duplicateGroups = Array.from(
    issues.reduce((groups, issue) => {
      const normalized = normalizedSummary(issue.summary);
      const current = groups.get(normalized) || [];
      current.push(issue.key);
      groups.set(normalized, current);
      return groups;
    }, new Map())
  )
    .filter(([normalized, keys]) => normalized && keys.length > 1)
    .map(([normalized, keys]) => ({ normalized, keys }));

  const now = Date.now();
  const activeIssues = issues.filter((issue) => issue.status?.name === "In Progress");
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    fetchedAt: payload.data?.fetchedAt || null,
    projectKey: payload.data?.projectKey || "MT",
    counts: {
      issues: issues.length,
      comments: issues.reduce((sum, issue) => sum + (issue.comments?.length || 0), 0),
      worklogs: worklogs.length,
      links: issues.reduce((sum, issue) => sum + (issue.links?.length || 0), 0),
      subtasks: issues.filter((issue) => issue.issueType === "Subtask" || issue.parentKey).length,
      issuesWithSubtasks: issues.filter((issue) => issue.subtasks?.length).length,
      changelogEntries: issues.reduce((sum, issue) => sum + (issue.changelog?.length || 0), 0),
    },
    byStatus: issues.reduce((resultByStatus, issue) => {
      const status = issue.status?.name || "Unknown";
      resultByStatus[status] = (resultByStatus[status] || 0) + 1;
      return resultByStatus;
    }, {}),
    byType: issues.reduce((resultByType, issue) => {
      const type = issue.issueType || "Unknown";
      resultByType[type] = (resultByType[type] || 0) + 1;
      return resultByType;
    }, {}),
    metadataGaps: issues
      .map((issue) => ({ key: issue.key, gaps: metadataGaps(issue) }))
      .filter((item) => item.gaps.length),
    activeIssues: activeIssues.map((issue) => ({
      key: issue.key,
      summary: issue.summary,
      dueDate: issue.dueDate,
      updatedAt: issue.updatedAt,
      overdue:
        Boolean(issue.dueDate) && new Date(`${issue.dueDate}T23:59:59-04:00`).getTime() < now,
      staleDays: Math.floor((now - new Date(issue.updatedAt).getTime()) / 86_400_000),
    })),
    duplicateGroups,
    worklogs,
    weeklyAudit: auditWeeklyEffort(worklogs),
  };

  const output = join(latest.runDirectory, "jira-baseline.json");
  await writeFile(output, JSON.stringify(result, null, 2), "utf8");
  console.log(
    JSON.stringify({
      ok: true,
      output,
      counts: result.counts,
      statuses: result.byStatus,
      types: result.byType,
      metadataGapIssues: result.metadataGaps.length,
      duplicateGroups: result.duplicateGroups.length,
      activeIssues: result.activeIssues,
      weeklyAudit: result.weeklyAudit,
    })
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })
  );
  process.exitCode = 1;
});
