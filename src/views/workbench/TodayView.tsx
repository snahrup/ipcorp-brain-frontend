import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  Inbox,
  LoaderCircle,
  PauseCircle,
  RefreshCw,
  SquareKanban,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WorkspaceHero } from "../../components/workbench/WorkspaceHero";
import type { ActivityRun } from "../../features/activity-reconciliation/types";
import { IssueTimeMetrics } from "../../features/jira/IssueTimeMetrics";
import { JiraIssueModal } from "../../features/jira/JiraIssueModal";
import { priorityRank, statusTone, TONE_LABEL } from "../../features/jira/jiraStatus";
import type { JiraInitiative, JiraIssue } from "../../features/jira/types";
import { GATEWAY } from "../../lib/gateway";
import {
  type Board,
  type BoardCard,
  type BoardLane,
  referenceOf,
  resolveHref,
} from "./agent-board-model";

const DAY_MS = 86_400_000;
const CACHE_REFRESH_MS = 60_000;
const CLOCK_REFRESH_MS = 30_000;

type LoopStatus = {
  mode: string;
  shadowRuns: number;
  lastPass?: string | null;
  todayVerdicts?: Array<{
    workItemId: string;
    title: string;
    classId: string;
    autonomyTier: string;
    modelTier: string;
  }>;
};

type TodaySourceStatus = "ok" | "partial" | "unavailable" | "error" | "missing";

type TodaySourceObservation = {
  id: string;
  label: string;
  status: TodaySourceStatus;
  observedAt: string | null;
  error: string | null;
  detail: string;
};

type TodaySnapshot = {
  version: 1;
  snapshotId: string;
  capturedAt: string;
  partial: boolean;
  notes: Array<{ source: string; status: TodaySourceStatus; message: string }>;
  sources: Record<"jira" | "agentBoard" | "reconciliation" | "loop", TodaySourceObservation>;
  jira: JiraInitiative | null;
  agentBoard: Board | null;
  reconciliation: ActivityRun | null;
  loop: LoopStatus | null;
};

function day(value?: string | null) {
  if (!value) return null;
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function todayStartUtc(now: Date) {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

function localDateKey(value: Date) {
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const date = `${value.getDate()}`.padStart(2, "0");
  return `${value.getFullYear()}-${month}-${date}`;
}

function sameLocalDate(value: string | null | undefined, dateKey: string) {
  if (!value) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && localDateKey(parsed) === dateKey;
}

function formatWhen(value: string | null | undefined) {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Not available";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function formatStatus(value: string | null | undefined) {
  if (!value) return "unknown";
  return value.replace(/[-_]/g, " ");
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

async function readTodaySnapshot(): Promise<TodaySnapshot> {
  const response = await fetch(`${GATEWAY}/today/snapshot`);
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    data?: TodaySnapshot;
    error?: string;
  } | null;
  if (!response.ok || !payload?.ok || !payload.data) {
    throw new Error(payload?.error || `The Today read returned HTTP ${response.status}.`);
  }
  return payload.data;
}

function findLane(board: Board | null, id: string): BoardLane | null {
  return board?.lanes.find((lane) => lane.id === id) ?? null;
}

function StatusChip({ issue }: { issue: JiraIssue }) {
  const tone = statusTone(issue.status.name, issue.status.category);
  return (
    <span className="wb-status-chip" data-tone={tone}>
      {issue.status.name || TONE_LABEL[tone]}
    </span>
  );
}

function BoardCardLine({ card }: { card: BoardCard }) {
  const reference = referenceOf(card);
  const href = resolveHref(reference.href);
  const body = (
    <>
      <strong>{card.title}</strong>
      {card.detail && <span>{card.detail}</span>}
    </>
  );

  if (href) {
    return (
      <a className="wb-today-cardline" href={href} rel="noreferrer" target="_blank">
        {body}
        <ArrowUpRight size={13} aria-hidden="true" />
      </a>
    );
  }

  return <div className="wb-today-cardline">{body}</div>;
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

export function TodayView({
  onOpenWork,
  onOpenAgentBoard,
}: {
  onOpenWork: () => void;
  onOpenAgentBoard: () => void;
}) {
  const [snapshot, setSnapshot] = useState<TodaySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [selectedIssueKey, setSelectedIssueKey] = useState<string | null>(null);
  const initialLoadStarted = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await readTodaySnapshot());
    } catch (cause) {
      setSnapshot(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "The current Workbench snapshot could not be read from this machine."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
      void load();
    }, CACHE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), CLOCK_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const todayUtc = useMemo(() => todayStartUtc(now), [now]);
  const todayKey = useMemo(() => localDateKey(now), [now]);
  const initiative = snapshot?.jira ?? null;
  const board = snapshot?.agentBoard ?? null;
  const loop = snapshot?.loop ?? null;
  const activityRun = snapshot?.reconciliation ?? null;

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
    // Blocked and waiting work is held by someone else. It stays visible in its
    // own section, but it never competes for "past due" or for First up.
    const held: JiraIssue[] = [];

    for (const issue of open) {
      const due = day(issue.dueDate);
      const tone = statusTone(issue.status.name, issue.status.category);
      if (tone === "blocked" || tone === "waiting") held.push(issue);
      else if (due !== null && due < todayUtc) overdue.push(issue);
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
      held: held.sort(sort),
    };
  }, [initiative, todayUtc]);

  const firstUp = groups.overdue[0] ?? groups.soon[0] ?? groups.active[0] ?? groups.later[0];
  const delivered = findLane(board, "delivered");
  const working = findLane(board, "working");
  const waiting = findLane(board, "waiting");
  const sourceProblems = [
    ...(snapshot?.notes.map((note) => {
      const source = snapshot.sources[note.source as keyof TodaySnapshot["sources"]];
      return `${source?.label || note.source}: ${note.message}`;
    }) ?? []),
    error ? `Today snapshot: ${error}` : null,
  ].filter((item): item is string => Boolean(item));
  const jiraProblem = snapshot?.sources.jira.status !== "ok";

  const updatedToday = (initiative?.issues ?? []).filter((issue) =>
    sameLocalDate(issue.updatedAt, todayKey)
  );
  const activityAt = activityRun?.finishedAt || activityRun?.lastActivityAt || null;
  const activityIsOld = Boolean(activityAt && !sameLocalDate(activityAt, todayKey));
  const activityLabel = activityRun
    ? `${formatStatus(activityRun.status)} at ${formatWhen(activityAt)}`
    : "No saved activity run found.";
  const activityCounts = activityRun
    ? `${activityRun.counts.observed.toLocaleString()} checked. ${(
        activityRun.counts.new + activityRun.counts.changed
      ).toLocaleString()} new or changed. ${activityRun.counts.meetingsProcessed.toLocaleString()} meeting package${
        activityRun.counts.meetingsProcessed === 1 ? "" : "s"
      } processed. ${activityRun.counts.failures.toLocaleString()} failure${
        activityRun.counts.failures === 1 ? "" : "s"
      }.`
    : null;
  const loopSummary = loop
    ? loop.mode === "shadow"
      ? `Shadow mode: observed ${loop.todayVerdicts?.length ?? 0} item${
          (loop.todayVerdicts?.length ?? 0) === 1 ? "" : "s"
        } today and executed nothing. Last pass ${formatWhen(loop.lastPass)}.`
      : loop.mode === "off"
        ? "Loop is off."
        : `${formatStatus(loop.mode)} mode.`
    : "Loop status unavailable.";

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
      key: "held",
      label: "Waiting on someone else",
      helper: "Blocked or on hold. Not yours to move until they answer.",
      icon: PauseCircle,
      items: groups.held,
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
        title="Start with what is current."
        stats={[
          { label: "Delivered today", value: delivered?.cards.length ?? 0 },
          { label: "Working now", value: working?.cards.length ?? 0 },
          { label: "Waiting on Steve", value: waiting?.cards.length ?? 0, tone: "attention" },
          { label: "Open issues", value: groups.open.length },
        ]}
        action={
          <button
            className="wb-hero-button"
            type="button"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "wb-spin" : undefined} />
            Refresh Today
          </button>
        }
      />

      <section className="wb-today-current" data-testid="today-current-work">
        <header className="wb-today-current-head">
          <div>
            <span className="eyebrow">Current work</span>
            <h2>What changed, what needs you, and what the loop only observed.</h2>
          </div>
          <span className="wb-today-readtime">
            <Clock3 size={14} aria-hidden="true" />
            Snapshot {formatWhen(snapshot?.capturedAt)}
          </span>
        </header>

        {sourceProblems.length > 0 && (
          <div className="wb-today-source-problems" role="alert">
            <AlertCircle size={15} aria-hidden="true" />
            <div>
              <strong>Some sources need attention</strong>
              {sourceProblems.map((problem) => (
                <span key={problem}>{problem}</span>
              ))}
            </div>
          </div>
        )}

        <div className="wb-today-status-grid">
          <article className="wb-today-status-card">
            <span>
              <SquareKanban size={15} aria-hidden="true" />
              Jira
            </span>
            <strong>{formatWhen(initiative?.fetchedAt)}</strong>
            <p>
              {updatedToday.length === 0
                ? "No MT issue activity found for today."
                : `${updatedToday.length} MT issue${
                    updatedToday.length === 1 ? "" : "s"
                  } changed today.`}
            </p>
          </article>

          <article className="wb-today-status-card">
            <span>
              <CheckCircle2 size={15} aria-hidden="true" />
              Delivered today
            </span>
            <strong>{delivered?.cards.length ?? 0}</strong>
            <p>Finished items with saved evidence.</p>
            {delivered?.cards.slice(0, 2).map((card) => (
              <BoardCardLine card={card} key={card.id} />
            ))}
            {(delivered?.cards.length ?? 0) > 2 && (
              <button className="wb-today-see-all" type="button" onClick={onOpenAgentBoard}>
                See all {delivered?.cards.length} in Agent Board
                <ArrowRight size={13} aria-hidden="true" />
              </button>
            )}
          </article>

          <article className="wb-today-status-card">
            <span>
              <CircleDot size={15} aria-hidden="true" />
              Working now
            </span>
            <strong>{working?.cards.length ?? 0}</strong>
            <p>Runs or reads active right now.</p>
            {working?.cards.slice(0, 2).map((card) => (
              <BoardCardLine card={card} key={card.id} />
            ))}
          </article>

          <article className="wb-today-status-card">
            <span>
              <PauseCircle size={15} aria-hidden="true" />
              Waiting on Steve
            </span>
            <strong>{waiting?.cards.length ?? 0}</strong>
            <p>Items that need a paste, review, or approval.</p>
            {waiting?.cards.slice(0, 2).map((card) => (
              <BoardCardLine card={card} key={card.id} />
            ))}
            {(waiting?.cards.length ?? 0) > 2 && (
              <button className="wb-today-see-all" type="button" onClick={onOpenAgentBoard}>
                See all {waiting?.cards.length} in Agent Board
                <ArrowRight size={13} aria-hidden="true" />
              </button>
            )}
          </article>

          <article
            className="wb-today-status-card"
            data-tone={activityIsOld ? "attention" : undefined}
          >
            <span>
              <RefreshCw size={15} aria-hidden="true" />
              Activity reconciliation
            </span>
            <strong>{activityRun ? formatStatus(activityRun.status) : "Not found"}</strong>
            <p>{activityIsOld ? `Old run: ${activityLabel}.` : activityLabel}</p>
            {activityCounts && <p>{activityCounts}</p>}
          </article>

          <article className="wb-today-status-card">
            <span>
              <Clock3 size={15} aria-hidden="true" />
              Loop
            </span>
            <strong>{loop ? formatStatus(loop.mode) : "Unavailable"}</strong>
            <p>{loopSummary}</p>
          </article>
        </div>
      </section>

      {loading && !snapshot ? (
        <section className="wb-jira-state" aria-live="polite">
          <LoaderCircle className="wb-spin" size={26} aria-hidden="true" />
          <p>Reading the current Workbench snapshot.</p>
        </section>
      ) : error ? (
        <section className="wb-jira-state wb-jira-state-error" role="alert">
          <AlertCircle size={28} aria-hidden="true" />
          <h2>Today could not be read</h2>
          <p>{error}</p>
          <div className="wb-jira-state-actions">
            <button className="wb-button-primary" type="button" onClick={() => void load()}>
              <RefreshCw size={16} />
              Try again
            </button>
            <span>Old results are not shown in its place.</span>
          </div>
        </section>
      ) : jiraProblem ? (
        <section className="wb-jira-state wb-jira-state-error" role="alert">
          <AlertCircle size={28} aria-hidden="true" />
          <h2>Current Jira work is unavailable</h2>
          <p>
            {snapshot?.sources.jira.error ||
              snapshot?.sources.jira.detail ||
              "Jira did not return a current result."}
          </p>
          <div className="wb-jira-state-actions">
            <button className="wb-button-primary" type="button" onClick={() => void load()}>
              <RefreshCw size={16} />
              Try again
            </button>
            <span>The other snapshot sources remain visible above.</span>
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
