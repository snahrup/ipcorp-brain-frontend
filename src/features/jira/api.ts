import { GATEWAY } from "../../lib/gateway";
import type { AgentRun } from "./AgentDispatchButton";
import type {
  JiraAnalyticsSnapshot,
  JiraAttachment,
  JiraConnection,
  JiraInitiative,
  JiraIssueDetail,
  ReconciliationPreview,
  SubtaskApplyResult,
  SubtaskBreakdown,
} from "./types";

const JIRA_API = `${GATEWAY}/jira`;
// Dispatch runs live under /agents, a sibling of /jira, not underneath it.
const AGENTS_API = `${GATEWAY}/agents`;

export class JiraGatewayError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;

  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "JiraGatewayError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function requestFrom<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new JiraGatewayError(
      "The local Jira gateway is not running. Start the Workbench Jira connection and try again.",
      503,
      "gateway_offline"
    );
  }

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: T;
    error?: string;
    code?: string;
    details?: Record<string, unknown>;
  };
  if (!response.ok || payload.ok === false || payload.data === undefined) {
    throw new JiraGatewayError(
      payload.error || `Jira request failed with HTTP ${response.status}.`,
      response.status,
      payload.code,
      payload.details
    );
  }
  return payload.data;
}

const request = <T>(path: string, init?: RequestInit) => requestFrom<T>(JIRA_API, path, init);
const requestAgentRuns = () => requestFrom<AgentRun[]>(AGENTS_API, "/runs");

export const jiraGateway = {
  connection: () => request<JiraConnection>("/status"),
  initiative: () => request<JiraInitiative>("/initiative"),
  analytics: (refresh = false) =>
    request<JiraAnalyticsSnapshot>(`/analytics${refresh ? "?refresh=1" : ""}`),
  issue: (key: string) => request<JiraIssueDetail>(`/issues/${encodeURIComponent(key)}`),
  updateIssue: (
    key: string,
    input: {
      expectedUpdated: string;
      fields: Record<string, unknown>;
      transitionTo?: string;
      comment?: string;
      worklog?: { timeSpent: string; comment: string };
    }
  ) =>
    request<{
      issue: JiraIssueDetail["issue"];
      effects: string[];
      errors: string[];
      partial: boolean;
    }>(`/issues/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  /** Where an attachment's bytes are served from (inline unless download). */
  attachmentUrl: (id: string, download = false) =>
    `${JIRA_API}/attachments/${encodeURIComponent(id)}/content${download ? "?download=true" : ""}`,
  deleteAttachment: (id: string) =>
    request<{ deleted: string }>(`/attachments/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  /**
   * Upload one file to an issue. XMLHttpRequest rather than fetch because the
   * staging tiles show real transfer progress, and fetch has no upload
   * progress events. Resolves with the attachment Jira created.
   */
  uploadAttachment: (
    key: string,
    file: File,
    ctx: { onProgress: (percent: number) => void; signal: AbortSignal }
  ) =>
    new Promise<JiraAttachment>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${JIRA_API}/issues/${encodeURIComponent(key)}/attachments`);
      // URI-encoded so non-ASCII filenames survive the header.
      xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) ctx.onProgress((event.loaded / event.total) * 100);
      };
      xhr.onload = () => {
        try {
          const payload = JSON.parse(xhr.responseText || "{}");
          if (xhr.status >= 200 && xhr.status < 300 && payload.ok !== false && payload.data) {
            resolve(payload.data as JiraAttachment);
            return;
          }
          reject(
            new JiraGatewayError(
              payload.error || `The upload failed with HTTP ${xhr.status}.`,
              xhr.status,
              payload.code
            )
          );
        } catch {
          reject(new JiraGatewayError(`The upload failed with HTTP ${xhr.status}.`, xhr.status));
        }
      };
      xhr.onerror = () =>
        reject(new JiraGatewayError("The upload could not reach the local gateway.", 503));
      xhr.onabort = () => reject(new DOMException("The upload was cancelled.", "AbortError"));
      ctx.signal.addEventListener("abort", () => xhr.abort(), { once: true });
      xhr.send(file);
    }),
  generateSubtasks: (key: string) =>
    request<SubtaskBreakdown>(`/issues/${encodeURIComponent(key)}/subtasks/generate`, {
      method: "POST",
      body: "{}",
    }),
  applySubtasks: (
    key: string,
    input: {
      expectedUpdated: string;
      subtasks: Array<{ summary: string; description: string; estimateMinutes: number }>;
    }
  ) =>
    request<SubtaskApplyResult>(`/issues/${encodeURIComponent(key)}/subtasks/apply`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** Every dispatch run the gateway knows about, running or finished. */
  agentRuns: () => requestAgentRuns(),
  /** `windowDays` bounds how far back evidence may be to become a candidate:
   * null is the current week, a number is a rolling day count, "all" removes the
   * window. Older records are still counted and disclosed, never proposed. */
  previewReconciliation: (forceMicrosoft365 = false, windowDays: number | "all" | null = null) =>
    request<ReconciliationPreview>("/reconcile/preview", {
      method: "POST",
      body: JSON.stringify({ scope: "MT", forceMicrosoft365, windowDays }),
    }),
  applyReconciliation: (proposals: ReconciliationPreview["proposals"], confirmation: string) =>
    request<{ scope: "MT"; results: Array<Record<string, unknown>> }>("/reconcile/apply", {
      method: "POST",
      body: JSON.stringify({ proposals, confirmation }),
    }),
  /** Mark evidence as reviewed with no Jira change; the scan ledger keeps it out of
   * future scans unless the underlying source changes. Writes nothing to Jira. */
  dismissReconciliation: (fingerprints: string[], note?: string) =>
    request<{ dismissed: number; requested: number }>("/reconcile/dismiss", {
      method: "POST",
      body: JSON.stringify({ fingerprints, note }),
    }),
};
