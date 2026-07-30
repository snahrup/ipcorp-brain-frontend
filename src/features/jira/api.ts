import { GATEWAY } from "../../lib/gateway";
import type {
  JiraConnection,
  JiraInitiative,
  JiraIssueDetail,
  ReconciliationPreview,
} from "./types";

const JIRA_API = `${GATEWAY}/jira`;

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${JIRA_API}${path}`, {
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

export const jiraGateway = {
  connection: () => request<JiraConnection>("/status"),
  initiative: () => request<JiraInitiative>("/initiative"),
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
  previewReconciliation: (forceMicrosoft365 = false) =>
    request<ReconciliationPreview>("/reconcile/preview", {
      method: "POST",
      body: JSON.stringify({ scope: "MT", forceMicrosoft365 }),
    }),
  applyReconciliation: (proposals: ReconciliationPreview["proposals"], confirmation: string) =>
    request<{ scope: "MT"; results: Array<Record<string, unknown>> }>("/reconcile/apply", {
      method: "POST",
      body: JSON.stringify({ proposals, confirmation }),
    }),
};
