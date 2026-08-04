import { ArrowUpRight } from "lucide-react";
import { useMemo } from "react";
import { formatDate } from "../../lib/utils";
import { formatSeconds } from "./IssueTimeMetrics";
import type { JiraIssue } from "./types";

const ACTIVITY_TIME = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function relativeActivity(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Unknown";
  const minutes = Math.floor((Date.now() - time) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return ACTIVITY_TIME.format(time);
}

function timeCell(issue: JiraIssue) {
  const spent = issue.timeTracking.timeSpentSeconds ?? 0;
  const original = issue.timeTracking.originalEstimateSeconds ?? 0;
  if (!spent && !original) return "—";
  const remaining = original > spent ? original - spent : 0;
  if (!spent) return `${formatSeconds(original)} estimated`;
  if (!original) return `${formatSeconds(spent)} logged`;
  return `${formatSeconds(spent)} logged · ${formatSeconds(remaining)} left`;
}

/**
 * Every issue, one row each, sorted by what actually happened most recently rather than
 * by rank or status. The question this answers is "what did I touch last and why",
 * which the Board and List views were never built to show at a glance.
 *
 * The summary column is not a live model call per row. Composing it deterministically
 * from the real author, the real timestamp and the real worklog or comment text is fast
 * across the whole board, costs nothing, and cannot say something that did not happen —
 * a real risk demonstrated twice tonight in a different part of this app. The Jira
 * gateway computes the underlying timestamp as the true max across updated, every
 * comment and every worklog, not just Jira's own `updated` field.
 */
export function JiraActivityView({
  issues,
  onOpenIssue,
}: {
  issues: JiraIssue[];
  onOpenIssue: (key: string) => void;
}) {
  const sorted = useMemo(
    () => [...issues].sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1)),
    [issues]
  );

  return (
    <section className="wb-jira-activity" aria-label="Jira issues by most recent activity">
      <div className="wb-jira-activity-head">
        <span>Issue</span>
        <span>Due</span>
        <span>Time</span>
        <span>Most recent activity</span>
      </div>
      {sorted.map((issue) => (
        <div className="wb-jira-activity-row" key={issue.key}>
          <div className="wb-jira-activity-key">
            <button type="button" onClick={() => onOpenIssue(issue.key)}>
              <strong>{issue.key}</strong>
              <span>{issue.summary}</span>
            </button>
            <a
              href={`https://ip-corporation.atlassian.net/browse/${issue.key}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${issue.key} in Jira`}
              title="Open in Jira"
            >
              <ArrowUpRight size={13} />
            </a>
          </div>
          <span className="wb-jira-activity-due">
            {issue.dueDate ? formatDate(issue.dueDate) : "—"}
          </span>
          <span className="wb-jira-activity-time">{timeCell(issue)}</span>
          <button
            type="button"
            className="wb-jira-activity-summary"
            onClick={() => onOpenIssue(issue.key)}
          >
            <span>{issue.lastActivitySummary}</span>
            <time dateTime={issue.lastActivityAt}>{relativeActivity(issue.lastActivityAt)}</time>
          </button>
        </div>
      ))}
    </section>
  );
}
