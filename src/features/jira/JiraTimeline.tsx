import { useMemo } from "react";
import { statusTone, TONE_COLOR, TONE_LABEL } from "./jiraStatus";
import type { JiraIssue } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

function parseDay(value?: string | null) {
  if (!value) return null;
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Issues need at least one date to appear on a time axis. */
export function datedIssues(issues: JiraIssue[]) {
  return issues
    .map((issue) => {
      const start = parseDay(issue.startDate);
      const due = parseDay(issue.dueDate);
      if (start === null && due === null) return null;
      // A single-dated issue is drawn as a short marker rather than dropped.
      const from = start ?? (due as number);
      const to = due ?? (start as number);
      return { issue, from: Math.min(from, to), to: Math.max(from, to) };
    })
    .filter((row): row is { issue: JiraIssue; from: number; to: number } => row !== null)
    .sort((a, b) => a.from - b.from || a.to - b.to);
}

function monthTicks(min: number, max: number) {
  const ticks: Array<{ at: number; label: string }> = [];
  const cursor = new Date(min);
  cursor.setUTCDate(1);
  cursor.setUTCHours(0, 0, 0, 0);
  while (cursor.getTime() <= max) {
    ticks.push({
      at: cursor.getTime(),
      label: `${MONTHS[cursor.getUTCMonth()]} ${String(cursor.getUTCFullYear()).slice(2)}`,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return ticks;
}

/**
 * Timeline and Gantt share one time axis and one row layout. Gantt additionally draws
 * the "blocks" relationships between bars, which is the only real difference between
 * the two in practice.
 */
export function JiraTimeline({
  issues,
  mode,
  onOpenIssue,
}: {
  issues: JiraIssue[];
  mode: "timeline" | "gantt";
  onOpenIssue: (key: string) => void;
}) {
  const rows = useMemo(() => datedIssues(issues), [issues]);

  const bounds = useMemo(() => {
    if (rows.length === 0) return null;
    const min = Math.min(...rows.map((r) => r.from));
    const max = Math.max(...rows.map((r) => r.to));
    // Always show at least a month so a single short task is not a full-width bar.
    const pad = Math.max(3 * DAY_MS, (max - min) * 0.03);
    return { min: min - pad, max: Math.max(max + pad, min + 30 * DAY_MS) };
  }, [rows]);

  const rowIndex = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, index) => {
      map.set(row.issue.key, index);
    });
    return map;
  }, [rows]);

  const dependencies = useMemo(() => {
    if (mode !== "gantt") return [];
    const out: Array<{ from: string; to: string }> = [];
    for (const { issue } of rows) {
      for (const link of issue.links) {
        // Only draw a dependency once, from the blocker to the thing it blocks.
        if (!/blocks/i.test(link.type)) continue;
        if (link.direction !== "outward") continue;
        if (!rowIndex.has(link.key)) continue;
        out.push({ from: issue.key, to: link.key });
      }
    }
    return out;
  }, [mode, rows, rowIndex]);

  if (!bounds || rows.length === 0) {
    return (
      <section className="wb-safe-empty">
        <div>
          <strong>No dated work to place on a timeline</strong>
          <p>Issues appear here once they carry a start date or a due date.</p>
        </div>
      </section>
    );
  }

  const span = bounds.max - bounds.min;
  const pct = (value: number) => ((value - bounds.min) / span) * 100;
  const ticks = monthTicks(bounds.min, bounds.max);
  const today = Date.now();
  const ROW_H = 30;

  return (
    <section
      className="wb-gantt"
      aria-label={mode === "gantt" ? "Jira Gantt chart" : "Jira timeline"}
    >
      <div className="wb-gantt-head">
        <span className="wb-gantt-head-label">{rows.length} dated issues</span>
        <div className="wb-gantt-axis">
          {ticks.map((tick) => (
            <span className="wb-gantt-tick" key={tick.at} style={{ left: `${pct(tick.at)}%` }}>
              {tick.label}
            </span>
          ))}
        </div>
      </div>

      <div className="wb-gantt-body">
        <div className="wb-gantt-labels">
          {rows.map(({ issue }) => (
            <button
              type="button"
              className="wb-gantt-label"
              key={issue.key}
              style={{ height: ROW_H }}
              onClick={() => onOpenIssue(issue.key)}
              title={issue.summary}
            >
              <span className="wb-gantt-key">{issue.key}</span>
              <span className="wb-gantt-name">{issue.summary}</span>
            </button>
          ))}
        </div>

        <div className="wb-gantt-plot" style={{ height: rows.length * ROW_H }}>
          {ticks.map((tick) => (
            <span
              className="wb-gantt-gridline"
              key={tick.at}
              style={{ left: `${pct(tick.at)}%` }}
            />
          ))}

          {today >= bounds.min && today <= bounds.max && (
            <span
              className="wb-gantt-today"
              style={{ left: `${pct(today)}%` }}
              role="img"
              aria-label="Today"
            />
          )}

          {mode === "gantt" && dependencies.length > 0 && (
            <svg
              className="wb-gantt-links"
              width="100%"
              height={rows.length * ROW_H}
              aria-hidden="true"
            >
              <title>Dependencies</title>
              <defs>
                <marker
                  id="wb-gantt-arrow"
                  markerWidth="7"
                  markerHeight="7"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L0,6 L6,3 z" fill="#8A9099" />
                </marker>
              </defs>
              {dependencies.map((dep) => {
                const a = rows[rowIndex.get(dep.from) as number];
                const b = rows[rowIndex.get(dep.to) as number];
                if (!a || !b) return null;
                const y1 = (rowIndex.get(dep.from) as number) * ROW_H + ROW_H / 2;
                const y2 = (rowIndex.get(dep.to) as number) * ROW_H + ROW_H / 2;
                return (
                  <line
                    key={`${dep.from}-${dep.to}`}
                    x1={`${pct(a.to)}%`}
                    y1={y1}
                    x2={`${pct(b.from)}%`}
                    y2={y2}
                    stroke="#8A9099"
                    strokeWidth="1.2"
                    strokeDasharray="3 3"
                    markerEnd="url(#wb-gantt-arrow)"
                  />
                );
              })}
            </svg>
          )}

          {rows.map(({ issue, from, to }, index) => {
            const tone = statusTone(issue.status.name, issue.status.category);
            const left = pct(from);
            const width = Math.max(1.2, pct(to) - left);
            const overdue =
              tone !== "done" && tone !== "dropped" && to < today ? " is-overdue" : "";
            return (
              <button
                type="button"
                key={issue.key}
                className={`wb-gantt-bar${overdue}`}
                style={{
                  top: index * ROW_H + 5,
                  left: `${left}%`,
                  width: `${width}%`,
                  background: TONE_COLOR[tone],
                }}
                onClick={() => onOpenIssue(issue.key)}
                title={`${issue.key} · ${issue.summary} · ${TONE_LABEL[tone]}${
                  overdue ? " · past its due date" : ""
                }`}
              >
                <span>{issue.key}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
