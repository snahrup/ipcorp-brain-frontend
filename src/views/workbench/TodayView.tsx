import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Inbox,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WorkspaceHero } from "../../components/workbench/WorkspaceHero";
import { jiraGateway } from "../../features/jira/api";
import { IssueTimeMetrics } from "../../features/jira/IssueTimeMetrics";
import { JiraIssueModal } from "../../features/jira/JiraIssueModal";
import { priorityRank, statusTone, TONE_LABEL } from "../../features/jira/jiraStatus";
import type { JiraInitiative, JiraIssue } from "../../features/jira/types";

const DAY_MS = 86_400_000;

function day(value?: string | null) {
  if (!value) return null;
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function dueLabel(due: number | null, todayUtc: number) {
  if (due === null) return null;
  const diff = Math.round((due - todayUtc) / DAY_MS);
  if (diff < -1) return `${Math.abs(diff)} days overdue`;
  if (diff === -1) return "1 day overdue";
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff <= 7) return `Due in ${diff} days`;
  return new Date(due).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function StatusChip({ issue }: { issue: JiraIssue }) {
  const tone = statusTone(issue.status.name, issue.status.category);
  return (
    <span className="wb-status-chip" data-tone={tone}>
      {issue.status.name || TONE_LABEL[tone]}
    </span>
  );
}

function IssueTile({
  issue,
  todayUtc,
  onOpen,
}: {
  issue: JiraIssue;
  todayUtc: number;
  onOpen: (key: string) => void;
}) {
  const due = day(issue.dueDate);
  const overdue = due !== null && due < todayUtc;
  const label = dueLabel(due, todayUtc);
  return (
    <button type="button" className="wb-tile" onClick={() => onOpen(issue.key)}>
      <span className="wb-tile-top">
        <span className="wb-issue-key">{issue.key}</span>
        <StatusChip issue={issue} />
      </span>
      <strong className="wb-tile-title">{issue.summary}</strong>
      <span className="wb-tile-meta">
        {label && (
          <span className="wb-pill" data-tone={overdue ? "blocked" : undefined}>
            <CalendarClock size={12} aria-hidden="true" />
            {label}
          </span>
        )}
        {issue.priority?.name && <span className="wb-pill">{issue.priority.name}</span>}
        {issue.subtasks.length > 0 && (
          <span className="wb-pill">{issue.subtasks.length} subtasks</span>
        )}
      </span>
      <IssueTimeMetrics tracking={issue.timeTracking} />
    </button>
  );
}

export function TodayView({ onOpenWork }: { onOpenWork: () => void }) {
  const [initiative, setInitiative] = useState<JiraInitiative | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIssueKey, setSelectedIssueKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInitiative(await jiraGateway.initiative());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Jira could not be reached from this machine right now."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const todayUtc = useMemo(() => {
    const now = new Date();
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const groups = useMemo(() => {
    const open = (initiative?.issues ?? []).filter((issue) => {
      const tone = statusTone(issue.status.name, issue.status.category);
      return tone !== "done" && tone !== "dropped";
    });

    const sort = (a: JiraIssue, b: JiraIssue) => {
      const da = day(a.dueDate) ?? Number.POSITIVE_INFINITY;
      const db = day(b.dueDate) ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return priorityRank(a.priority?.name) - priorityRank(b.priority?.name);
    };

    const overdue: JiraIssue[] = [];
    const soon: JiraIssue[] = [];
    const active: JiraIssue[] = [];
    const later: JiraIssue[] = [];

    for (const issue of open) {
      const due = day(issue.dueDate);
      const tone = statusTone(issue.status.name, issue.status.category);
      if (due !== null && due < todayUtc) overdue.push(issue);
      else if (due !== null && due <= todayUtc + 7 * DAY_MS) soon.push(issue);
      else if (tone === "active" || tone === "review") active.push(issue);
      else later.push(issue);
    }

    return {
      open,
      overdue: overdue.sort(sort),
      soon: soon.sort(sort),
      active: active.sort(sort),
      later: later.sort(sort),
    };
  }, [initiative, todayUtc]);

  const firstUp = groups.overdue[0] ?? groups.soon[0] ?? groups.active[0] ?? groups.later[0];

  const sections: Array<{
    key: string;
    label: string;
    helper: string;
    icon: typeof Inbox;
    items: JiraIssue[];
  }> = [
    {
      key: "overdue",
      label: "Past due",
      helper: "Due date has passed.",
      icon: TriangleAlert,
      items: groups.overdue,
    },
    {
      key: "soon",
      label: "Due this week",
      helper: "Lands in the next seven days.",
      icon: CalendarClock,
      items: groups.soon,
    },
    {
      key: "active",
      label: "In progress",
      helper: "Started, no near due date.",
      icon: CircleDot,
      items: groups.active,
    },
    {
      key: "later",
      label: "Queued",
      helper: "Not started and not due yet.",
      icon: Inbox,
      items: groups.later,
    },
  ];

  return (
    <div className="wb-page" data-testid="today-view">
      <WorkspaceHero
        kicker="Today"
        title="Start with what needs attention."
        stats={[
          { label: "Past due", value: groups.overdue.length, tone: "attention" },
          { label: "Due this week", value: groups.soon.length },
          { label: "In progress", value: groups.active.length },
          { label: "Open issues", value: groups.open.length },
        ]}
        action={
          <button className="wb-hero-button" type="button" onClick={onOpenWork}>
            Open all work
            <ArrowRight size={16} />
          </button>
        }
      />

      {loading && !initiative ? (
        <section className="wb-jira-state" aria-live="polite">
          <LoaderCircle className="wb-spin" size={26} aria-hidden="true" />
          <p>Reading your Jira work.</p>
        </section>
      ) : error ? (
        <section className="wb-jira-state wb-jira-state-error" role="alert">
          <AlertCircle size={28} aria-hidden="true" />
          <h2>Jira could not be reached</h2>
          <p>{error}</p>
          <div className="wb-jira-state-actions">
            <button className="wb-button-primary" type="button" onClick={() => void load()}>
              <RefreshCw size={16} />
              Try again
            </button>
            <span>Nothing is shown from another source in its place.</span>
          </div>
        </section>
      ) : groups.open.length === 0 ? (
        <section className="wb-safe-empty">
          <CheckCircle2 size={24} aria-hidden="true" />
          <div>
            <strong>No open Jira issues</strong>
            <p>Everything in MT is Done or Cancelled.</p>
          </div>
        </section>
      ) : (
        <>
          {firstUp && (
            <section className="wb-firstup-card">
              <div className="wb-firstup-badge">
                <CircleDot size={15} aria-hidden="true" />
                First up
              </div>
              <h2>
                <span className="wb-issue-key">{firstUp.key}</span> {firstUp.summary}
              </h2>
              <div className="wb-firstup-meta">
                <StatusChip issue={firstUp} />
                {dueLabel(day(firstUp.dueDate), todayUtc) && (
                  <span
                    className="wb-pill"
                    data-tone={
                      (day(firstUp.dueDate) ?? Number.POSITIVE_INFINITY) < todayUtc
                        ? "blocked"
                        : undefined
                    }
                  >
                    {dueLabel(day(firstUp.dueDate), todayUtc)}
                  </span>
                )}
                {firstUp.priority?.name && <span className="wb-pill">{firstUp.priority.name}</span>}
                {firstUp.assignee && (
                  <span className="wb-pill">{firstUp.assignee.displayName}</span>
                )}
              </div>
              <button
                className="wb-button-primary"
                type="button"
                onClick={() => setSelectedIssueKey(firstUp.key)}
              >
                Open the issue
                <ArrowRight size={17} />
              </button>
            </section>
          )}

          {sections.map((section) => {
            const items = section.items.filter((issue) => issue.key !== firstUp?.key);
            if (items.length === 0) return null;
            const Icon = section.icon;
            return (
              <section key={section.key}>
                <div className="wb-band">
                  <span className="wb-tile-icon">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <h2>{section.label}</h2>
                  <span className="wb-band-count">{items.length}</span>
                  <span className="wb-band-helper">{section.helper}</span>
                </div>
                <div className="wb-card-grid">
                  {items.slice(0, 9).map((issue) => (
                    <IssueTile
                      key={issue.key}
                      issue={issue}
                      todayUtc={todayUtc}
                      onOpen={setSelectedIssueKey}
                    />
                  ))}
                </div>
                {items.length > 9 && (
                  <button type="button" className="wb-link-button" onClick={onOpenWork}>
                    See all {items.length} in Work
                  </button>
                )}
              </section>
            );
          })}
        </>
      )}

      {selectedIssueKey && initiative && (
        <JiraIssueModal
          issueKey={selectedIssueKey}
          initiative={initiative}
          onClose={() => setSelectedIssueKey(null)}
          onIssueUpdated={() => void load()}
        />
      )}
    </div>
  );
}
