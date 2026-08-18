/**
 * What Today puts in "First up".
 *
 * Extracted from the view so it can be tested, because it kept getting this
 * wrong in a way nobody could see until Steve had looked at the same ticket
 * eleven mornings running.
 *
 * The rule that matters: First up is the one thing to sit down and DO. Work
 * held by a reviewer is not that. Work in the backlog is definitely not that.
 * And an item that has been past due for a week with nothing logged against it
 * is not a plan, it is a decision waiting to be made, so it does not lead
 * either.
 */
import type { JiraIssue } from "../../features/jira/types";

// Status is matched by name here rather than through statusTone. That helper
// answers "what colour is this", which is a display question; this file answers
// "who is holding this work", which is a different one, and keeping it free of
// imports is what lets these rules be tested on their own. The regexes are
// pinned by tests, including one named for the ticket that led eleven mornings.
const BACKLOG = /backlog/i;
const HELD = /block|impediment|waiting|on hold|pending|paused|review|qa|verify/i;
const FINISHED = /^done$|complete|closed|resolved|shipped|cancel|reject|abandon|superseded/i;

const DAY_MS = 86_400_000;

export function isBacklog(issue: Pick<JiraIssue, "status">): boolean {
  return BACKLOG.test(issue.status?.name ?? "");
}

/** Someone other than Steve has this: a reviewer, a blocker, a queue. */
export function heldByOthers(issue: Pick<JiraIssue, "status">): boolean {
  return HELD.test(issue.status?.name ?? "");
}

function daysBetween(fromIso: string | null | undefined, toUtc: number): number | null {
  if (!fromIso) return null;
  const then = Date.parse(`${String(fromIso).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(then)) return null;
  return Math.round((toUtc - then) / DAY_MS);
}

/**
 * Past due long enough, and untouched long enough, that presenting it as
 * today's work is not honest. It still belongs on the page; it just stops
 * leading.
 */
export function isRotting(
  issue: Pick<JiraIssue, "dueDate" | "updatedAt" | "lastActivityAt">,
  todayUtc: number,
  { overdueDays = 5, idleDays = 5 } = {}
): boolean {
  const overdue = daysBetween(issue.dueDate, todayUtc);
  const idle = daysBetween(issue.lastActivityAt ?? issue.updatedAt, todayUtc);
  return overdue !== null && overdue >= overdueDays && idle !== null && idle >= idleDays;
}

export function eligibleForFirstUp(issue: JiraIssue, todayUtc: number): boolean {
  const name = issue.status?.name ?? "";
  if (FINISHED.test(name) || issue.status?.category === "done") return false;
  if (isBacklog(issue)) return false;
  if (heldByOthers(issue)) return false;
  return !isRotting(issue, todayUtc);
}

/** The single item to start on, or null when there honestly is not one. */
export function pickFirstUp(issues: JiraIssue[], todayUtc: number): JiraIssue | null {
  const candidates = issues.filter((issue) => eligibleForFirstUp(issue, todayUtc));
  if (candidates.length === 0) return null;
  const score = (issue: JiraIssue) => {
    const due = issue.dueDate
      ? Date.parse(`${issue.dueDate.slice(0, 10)}T00:00:00Z`)
      : Number.POSITIVE_INFINITY;
    return due;
  };
  return [...candidates].sort((a, b) => {
    const byDue = score(a) - score(b);
    if (byDue !== 0) return byDue;
    return String(a.key).localeCompare(String(b.key));
  })[0];
}
