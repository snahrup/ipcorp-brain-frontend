import type { JiraIssue } from "./types";

/**
 * The card-level truth about effort: has work actually been logged, how much,
 * and what is left of the original estimate.
 *
 * "Started" here means a worklog exists — not that someone dragged the card to
 * In Progress. The two disagree often enough that showing status alone hides
 * exactly the tickets Steve is asking about.
 *
 * "Left" is computed as original estimate minus logged time rather than read
 * from Jira's remaining-estimate field: worklogs posted with adjustEstimate=
 * leave make Jira's own field drift (MT-260 sat 8 minutes off the day this was
 * built), and the point of the metric is that the arithmetic always reconciles
 * with the two numbers shown beside it.
 */

export function formatSeconds(seconds: number): string {
  const total = Math.round(Math.abs(seconds) / 60);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

export function IssueTimeMetrics({ tracking }: { tracking: JiraIssue["timeTracking"] }) {
  const spent = tracking.timeSpentSeconds ?? 0;
  const original = tracking.originalEstimateSeconds ?? 0;
  const started = spent > 0;
  const remaining = original > 0 ? original - spent : null;
  const over = remaining !== null && remaining < 0;
  const progress = original > 0 ? Math.min(100, (spent / original) * 100) : 0;

  // Nothing measured and nothing planned: one quiet line instead of a fake bar.
  if (!started && !original) {
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ipc-muted">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full border border-ipc-line-strong"
          aria-hidden="true"
        />
        Not started · no estimate
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] tabular-nums">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            started ? "bg-ipc-green" : "border border-ipc-line-strong"
          }`}
          aria-hidden="true"
        />
        <span className={started ? "font-medium text-ipc-green" : "text-ipc-muted"}>
          {started ? `Started · ${formatSeconds(spent)} logged` : "Not started"}
        </span>
        {remaining !== null && (
          <span className={over ? "font-medium text-ipc-red" : "text-ipc-muted"}>
            {" · "}
            {over
              ? `${formatSeconds(remaining)} over`
              : `${formatSeconds(remaining)} left of ${formatSeconds(original)}`}
          </span>
        )}
        {remaining === null && started && <span className="text-ipc-muted"> · no estimate</span>}
      </div>
      {original > 0 && (
        <div
          className="h-[3px] w-full overflow-hidden rounded-full bg-ipc-bg-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-label={`${formatSeconds(spent)} logged of ${formatSeconds(original)} estimated`}
        >
          <div
            className={`h-full rounded-full ${over ? "bg-ipc-red" : "bg-ipc-action"}`}
            style={{ width: `${Math.max(progress, started ? 4 : 0)}%` }}
          />
        </div>
      )}
    </div>
  );
}
