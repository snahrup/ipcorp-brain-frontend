/**
 * One place that decides what colour a Jira status is, so the list, board, timeline,
 * Gantt and dependency views cannot drift from each other.
 *
 * Tones map to the semantic colours in the design system: blue for active, green for
 * finished, amber for waiting on someone, red for blocked, grey for not started.
 */
export type StatusTone = "todo" | "active" | "review" | "waiting" | "blocked" | "done" | "dropped";

const BY_NAME: Array<[RegExp, StatusTone]> = [
  [/^backlog$|^to ?do$|^new$|^open$/i, "todo"],
  [/research|discovery|planning/i, "todo"],
  [/in progress|in-progress|doing|active/i, "active"],
  [/review|qa|verify/i, "review"],
  [/waiting|on hold|pending|paused/i, "waiting"],
  [/blocked|impediment/i, "blocked"],
  [/done|complete|closed|resolved|shipped/i, "done"],
  [/cancel|reject|abandon|wont ?do|superseded/i, "dropped"],
];

export function statusTone(name: string, category?: string): StatusTone {
  for (const [pattern, tone] of BY_NAME) {
    if (pattern.test(name)) return tone;
  }
  // Fall back to Jira's own category when the name is not one we recognise.
  if (category === "done") return "done";
  if (category === "indeterminate") return "active";
  return "todo";
}

export const TONE_LABEL: Record<StatusTone, string> = {
  todo: "Not started",
  active: "In progress",
  review: "In review",
  waiting: "Waiting",
  blocked: "Blocked",
  done: "Done",
  dropped: "Dropped",
};

/** Solid colour used for timeline and Gantt bars and dependency nodes. */
export const TONE_COLOR: Record<StatusTone, string> = {
  todo: "#8A9099",
  active: "#1B5E9E",
  review: "#446084",
  waiting: "#B0761A",
  blocked: "#C8102E",
  done: "#1E7B4D",
  dropped: "#B9BEC4",
};

export function priorityRank(name?: string) {
  const match = /(\d+)/.exec(name ?? "");
  return match ? Number(match[1]) : 9;
}
