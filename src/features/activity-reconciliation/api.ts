import { GATEWAY } from "../../lib/gateway";
import type {
  ActivityApplyReceipt,
  ActivityRun,
  ActivityRunSteps,
  ActivityStartResult,
} from "./types";

const API = `${GATEWAY}/work/activity-reconciliation`;

export class ActivityReconciliationError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = "ActivityReconciliationError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path = "", init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = (await response.json().catch(() => null)) as {
    ok: boolean;
    data?: T;
    error?: string;
    code?: string;
    details?: unknown;
  } | null;
  if (!response.ok || !payload?.ok) {
    throw new ActivityReconciliationError(
      payload?.error || `Activity reconciliation returned HTTP ${response.status}.`,
      payload?.code || "activity_request_failed",
      response.status,
      payload?.details
    );
  }
  return payload.data as T;
}

export const activityReconciliationApi = {
  status: (runId?: string, signal?: AbortSignal) =>
    request<ActivityRun | null>(`/status${runId ? `?runId=${encodeURIComponent(runId)}` : ""}`, {
      signal,
    }),
  start: (fresh = false, steps?: ActivityRunSteps) =>
    request<ActivityStartResult>("/start", {
      method: "POST",
      body: JSON.stringify({ fresh, steps }),
    }),
  stop: (runId: string) =>
    request<ActivityRun>("/stop", {
      method: "POST",
      body: JSON.stringify({ runId }),
    }),
  resume: (runId: string) =>
    request<ActivityRun>("/resume", {
      method: "POST",
      body: JSON.stringify({ runId }),
    }),
  applyJira: (runId: string, proposalIds: string[], confirmation: string) =>
    request<ActivityApplyReceipt>("/jira/apply", {
      method: "POST",
      body: JSON.stringify({ runId, proposalIds, confirmation }),
    }),
};
