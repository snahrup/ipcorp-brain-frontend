import type { TeamWorkItem, WorkState } from "../../types/workbench";

const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type SnapshotFreshness =
  | { state: "current"; asOf: string; ageDays: number }
  | { state: "stale"; asOf: string; ageDays: number }
  | { state: "unavailable"; asOf: string | null; ageDays: null };

export type Microsoft365CoverageLike = {
  available: boolean;
  code?: string | null;
  retryable?: boolean;
  authRequired?: boolean;
  items?: unknown[];
  limitations?: string[];
};

export type Microsoft365CoverageState =
  | "available-partial"
  | "empty"
  | "authentication-required"
  | "timeout"
  | "unavailable";

export function getSnapshotFreshness(
  asOf: string | null | undefined,
  now = Date.now()
): SnapshotFreshness {
  if (!asOf) return { state: "unavailable", asOf: null, ageDays: null };

  const timestamp = Date.parse(asOf);
  if (!Number.isFinite(timestamp)) {
    return { state: "unavailable", asOf, ageDays: null };
  }

  const ageMs = Math.max(0, now - timestamp);
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  return {
    state: ageMs > STALE_AFTER_MS ? "stale" : "current",
    asOf,
    ageDays,
  };
}

export function getPreparedDisplayState(item: TeamWorkItem): WorkState {
  if (item.detail?.kind !== "proposal") return item.state;

  const status = item.detail.value.status.trim().toLowerCase().replace(/-/g, "_");
  if (["executed", "completed", "done", "rejected"].includes(status)) return "done";
  if (["snoozed", "failed", "blocked", "waiting"].includes(status)) return "waiting";
  if (["approved", "in_progress"].includes(status)) return "in-progress";
  if (status === "proposed") return "needs-you";
  return item.state;
}

export function preparedStateLabel(state: WorkState, isHistorical: boolean) {
  const currentLabel: Record<WorkState, string> = {
    "needs-you": "Needs you",
    "in-progress": "In progress",
    waiting: "Waiting",
    done: "Done",
  };
  if (!isHistorical) return currentLabel[state];
  return `Was marked ${currentLabel[state].toLowerCase()}`;
}

export function getMicrosoft365CoverageState(
  coverage: Microsoft365CoverageLike
): Microsoft365CoverageState {
  if (coverage.available) {
    return (coverage.items?.length ?? 0) === 0 ? "empty" : "available-partial";
  }
  if (coverage.authRequired) return "authentication-required";
  if (coverage.code === "m365_timeout") return "timeout";
  return "unavailable";
}
