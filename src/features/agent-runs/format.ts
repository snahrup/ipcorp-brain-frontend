import type { AgentRunSummary, RunVerdict } from "./types";

/** Chip tones already defined by .wb-status-chip in jira-views.css. */
export type ChipTone = "todo" | "active" | "review" | "waiting" | "blocked" | "done" | "dropped";

/**
 * One place decides what a run's state is called and how it is colored, so a
 * REVIEW or BLOCKED finish is never visually interchangeable with a clean one.
 */
export function runPresentation(run: {
  state: AgentRunSummary["state"];
  verdict: RunVerdict | null;
}): { label: string; tone: ChipTone } {
  if (run.state === "running") return { label: "Running", tone: "active" };
  if (run.verdict === "DONE") return { label: "Finished", tone: "done" };
  if (run.verdict === "REVIEW") return { label: "Needs review", tone: "review" };
  if (run.verdict === "BLOCKED") return { label: "Blocked", tone: "blocked" };
  return { label: "Finished, unclassified", tone: "waiting" };
}

/** A finished run waiting on a person. Running runs are watched, not waited on. */
export function needsYou(run: { state: string; verdict: RunVerdict | null }): boolean {
  return run.state === "finished" && (run.verdict === "REVIEW" || run.verdict === "BLOCKED");
}

const TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** "Today 2:41 PM", "Yesterday 9:05 AM", "Aug 12 4:18 PM". */
export function startedLabel(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Unknown start";
  const now = new Date();
  const dayMs = 86_400_000;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = date.getTime();
  const day =
    t >= startOfToday ? "Today" : t >= startOfToday - dayMs ? "Yesterday" : DAY.format(date);
  return `${day} ${TIME.format(date)}`;
}

/** "38s", "4m 12s", "1h 06m". Live runs pass `now` so the clock keeps moving. */
export function runDuration(startedAt: string, finishedAt: string | null, now: number): string {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return "unknown";
  const end = finishedAt ? new Date(finishedAt).getTime() : now;
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** What the Delivered cell says. Null attachments means the run never recorded any. */
export function deliveredLabel(attachments: AgentRunSummary["attachments"]): {
  text: string;
  failed: number;
} {
  if (attachments === null) return { text: "Not recorded", failed: 0 };
  if (attachments.length === 0) return { text: "None", failed: 0 };
  const failed = attachments.filter((a) => !a.ok).length;
  const files = `${attachments.length} ${attachments.length === 1 ? "file" : "files"}`;
  return { text: failed ? `${files}, ${failed} failed` : files, failed };
}
