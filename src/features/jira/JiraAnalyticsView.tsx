import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Gauge,
  LoaderCircle,
  RefreshCw,
  TimerReset,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { jiraGateway } from "./api";
import "./jira-analytics.css";
import type { JiraAnalyticsDuration, JiraAnalyticsSnapshot } from "./types";

const HOUR_SECONDS = 3_600;
const DAY_SECONDS = 86_400;

function duration(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Not available";
  if (value < DAY_SECONDS * 2)
    return `${(value / HOUR_SECONDS).toFixed(value < HOUR_SECONDS * 10 ? 1 : 0)}h`;
  return `${(value / DAY_SECONDS).toFixed(1)}d`;
}

function hours(value: number) {
  const total = value / HOUR_SECONDS;
  return `${total.toLocaleString(undefined, {
    maximumFractionDigits: total < 100 ? 1 : 0,
  })}h`;
}

function percent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Not available";
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}%`;
}

function timestamp(value: string | null) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Unknown";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function weekLabel(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function MetricCard({
  icon,
  label,
  value,
  note,
  tone = "blue",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  tone?: "blue" | "navy" | "green" | "amber";
}) {
  return (
    <article className="jira-analytics-metric" data-tone={tone}>
      <span className="jira-analytics-metric-label">
        {icon}
        {label}
      </span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function DurationRows({ rows, label }: { rows: JiraAnalyticsDuration[]; label: string }) {
  const maximum = Math.max(
    1,
    ...rows.map((row) => Math.max(row.averageSeconds || 0, row.currentAverageSeconds || 0))
  );

  if (!rows.length) {
    return <p className="jira-analytics-empty">No usable status history was returned.</p>;
  }

  return (
    <ol className="jira-analytics-duration-list" aria-label={label}>
      {rows.map((row) => {
        const barValue = row.averageSeconds ?? row.currentAverageSeconds ?? 0;
        const closedCopy = row.closedVisits
          ? `${row.closedVisits} completed ${row.closedVisits === 1 ? "visit" : "visits"}`
          : "No completed visits";
        const activeCopy = row.currentVisits
          ? `${row.currentVisits} active · ${duration(row.currentAverageSeconds)} average age`
          : "No active visits";
        return (
          <li className="jira-analytics-duration-row" data-category={row.category} key={row.label}>
            <div>
              <strong>{row.label}</strong>
              <small>
                {closedCopy} · {activeCopy}
              </small>
            </div>
            <div
              className="jira-analytics-bar-track"
              role="img"
              aria-label={`${row.label}: ${duration(row.averageSeconds)} average across ${closedCopy.toLowerCase()}`}
            >
              <span style={{ width: `${Math.max(2, (barValue / maximum) * 100)}%` }} />
            </div>
            <div className="jira-analytics-duration-value">
              <strong>{duration(row.averageSeconds)}</strong>
              <small>completed average</small>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function AnalyticsContent({
  data,
  onRefresh,
  refreshing,
}: {
  data: JiraAnalyticsSnapshot;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const maxCompletions = Math.max(1, ...data.weeklyCompletions.map((week) => week.completed));
  const statusTotal = data.currentStatuses.reduce((sum, status) => sum + status.count, 0);
  const partial = data.coverage.historyFailed > 0 || data.coverage.sourceTruncated;

  return (
    <div className="jira-analytics" data-testid="jira-analytics-view">
      <header className="jira-analytics-hero">
        <div>
          <span className="jira-analytics-eyebrow">
            <BarChart3 size={15} aria-hidden="true" /> Jira analytics
          </span>
          <h2>How work is moving.</h2>
          <p>
            Real MT estimates, logged time, completion pace, and status history. Every average
            carries its own sample size.
          </p>
          <span className="jira-analytics-read-time">
            {data.cache.state === "cached" ? "Cached read" : "Fresh read"} · updated{" "}
            {timestamp(data.generatedAt)}
          </span>
        </div>
        <button
          type="button"
          className="jira-analytics-refresh"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={refreshing ? "wb-spin" : ""} size={17} aria-hidden="true" />
          {refreshing ? "Refreshing" : "Refresh analytics"}
        </button>
      </header>

      {partial ? (
        <aside className="jira-analytics-notice" role="status">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>Some Jira history is unavailable</strong>
            <span>
              {data.coverage.historyLoaded} of {data.coverage.totalIssues} issue histories loaded.
              {data.coverage.sourceTruncated
                ? " The Jira issue read reached its configured limit."
                : ""}
              Totals and current status counts still use the issue data Jira returned.
            </span>
          </div>
        </aside>
      ) : (
        <aside className="jira-analytics-coverage" role="status">
          <CheckCircle2 size={17} aria-hidden="true" />
          Status history loaded for all {data.coverage.totalIssues} MT issues.
        </aside>
      )}

      <section className="jira-analytics-metrics" aria-label="Jira time and flow measures">
        <MetricCard
          icon={<Clock3 size={17} aria-hidden="true" />}
          label="Time logged"
          value={hours(data.totals.loggedSeconds)}
          note={`${data.coverage.loggedIssues} issues carry logged time`}
          tone="navy"
        />
        <MetricCard
          icon={<TimerReset size={17} aria-hidden="true" />}
          label="Time estimated"
          value={hours(data.totals.estimatedSeconds)}
          note={`${data.coverage.estimatedIssues} leaf work items carry estimates`}
        />
        <MetricCard
          icon={<Gauge size={17} aria-hidden="true" />}
          label="Estimate used"
          value={percent(data.totals.estimateUsagePercent)}
          note={
            data.totals.unestimatedLoggedSeconds > 0
              ? `${hours(data.totals.unestimatedLoggedSeconds)} logged without an estimate`
              : "Logged time on estimated work"
          }
          tone={
            data.totals.estimateUsagePercent !== null && data.totals.estimateUsagePercent > 100
              ? "amber"
              : "blue"
          }
        />
        <MetricCard
          icon={<TrendingUp size={17} aria-hidden="true" />}
          label="Average resolution"
          value={duration(data.totals.averageResolutionSeconds)}
          note={`${data.coverage.resolutionSamples} completed work items`}
          tone="green"
        />
        <MetricCard
          icon={<Clock3 size={17} aria-hidden="true" />}
          label="Average backlog wait"
          value={duration(data.totals.averageBacklogSeconds)}
          note={`${data.coverage.backlogSamples} issues that left backlog`}
        />
        <MetricCard
          icon={<TimerReset size={17} aria-hidden="true" />}
          label="Open backlog age"
          value={duration(data.totals.averageOpenBacklogSeconds)}
          note={`${data.coverage.openBacklogSamples} issues still in backlog`}
        />
      </section>

      <section className="jira-analytics-section jira-analytics-stage-section">
        <header>
          <div>
            <span className="jira-analytics-section-kicker">Flow by stage</span>
            <h3>Where elapsed time collects</h3>
          </div>
          <small>Completed visits set the average. Active visit age stays separate.</small>
        </header>
        <DurationRows rows={data.stageDurations} label="Average time by Jira stage" />
      </section>

      <div className="jira-analytics-main-grid">
        <section className="jira-analytics-section">
          <header>
            <div>
              <span className="jira-analytics-section-kicker">Flow by status</span>
              <h3>Average time in each Jira status</h3>
            </div>
            <small>{data.coverage.usableTimelines} usable issue timelines</small>
          </header>
          <DurationRows rows={data.statusDurations} label="Average time by named Jira status" />
        </section>

        <section className="jira-analytics-section">
          <header>
            <div>
              <span className="jira-analytics-section-kicker">Work now</span>
              <h3>Current issue load</h3>
            </div>
            <small>
              {statusTotal} issues across {data.currentStatuses.length} statuses
            </small>
          </header>
          <div className="jira-analytics-status-list">
            {data.currentStatuses.map((status) => (
              <article data-category={status.category} key={status.label}>
                <span className="jira-analytics-status-dot" aria-hidden="true" />
                <div>
                  <strong>{status.label}</strong>
                  <small>
                    {hours(status.loggedSeconds)} logged · {hours(status.estimatedSeconds)}{" "}
                    estimated
                  </small>
                </div>
                <span className="jira-analytics-status-count">{status.count}</span>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="jira-analytics-section jira-analytics-weekly">
        <header>
          <div>
            <span className="jira-analytics-section-kicker">Completion pace</span>
            <h3>Issues completed by week</h3>
          </div>
          <small>
            {data.totals.doneIssues} completed · {data.totals.openIssues} open now
          </small>
        </header>
        <ol className="jira-analytics-week-bars" aria-label="Completed issues by week">
          {data.weeklyCompletions.map((week) => (
            <li key={week.weekOf}>
              <strong>{week.completed}</strong>
              <span className="jira-analytics-week-track" aria-hidden="true">
                <i style={{ height: `${Math.max(4, (week.completed / maxCompletions) * 100)}%` }} />
              </span>
              <small>{weekLabel(week.weekOf)}</small>
            </li>
          ))}
        </ol>
      </section>

      <details className="jira-analytics-method">
        <summary>How these numbers are calculated</summary>
        <ul>
          {data.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
          <li>
            Jira issue data was read {timestamp(data.jiraFetchedAt)}. No issue, comment, worklog, or
            status was changed.
          </li>
        </ul>
      </details>
    </div>
  );
}

export function JiraAnalyticsView() {
  const [data, setData] = useState<JiraAnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setData(await jiraGateway.analytics(refresh));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Jira analytics could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const state = useMemo(() => {
    if (loading && !data) return "loading";
    if (error && !data) return "error";
    if (data?.coverage.totalIssues === 0) return "empty";
    return "ready";
  }, [data, error, loading]);

  if (state === "loading") {
    return (
      <section
        className="jira-analytics-state"
        aria-live="polite"
        data-testid="jira-analytics-loading"
      >
        <LoaderCircle className="wb-spin" size={28} aria-hidden="true" />
        <h2>Reading Jira history</h2>
        <p>Status history loads only for this analytics view. The first read can take a moment.</p>
      </section>
    );
  }

  if (state === "error") {
    return (
      <section className="jira-analytics-state is-error" role="alert">
        <AlertCircle size={28} aria-hidden="true" />
        <h2>Analytics is unavailable</h2>
        <p>{error}</p>
        <button type="button" onClick={() => void load()}>
          <RefreshCw size={17} aria-hidden="true" /> Try again
        </button>
      </section>
    );
  }

  if (state === "empty") {
    return (
      <section className="jira-analytics-state">
        <BarChart3 size={28} aria-hidden="true" />
        <h2>No MT issues to analyze</h2>
        <p>Jira returned no issues, so no measures are shown.</p>
      </section>
    );
  }

  if (!data) return null;
  return (
    <>
      {error ? (
        <p className="jira-analytics-refresh-error">{error} Showing the last successful read.</p>
      ) : null}
      <AnalyticsContent data={data} refreshing={refreshing} onRefresh={() => void load(true)} />
    </>
  );
}
