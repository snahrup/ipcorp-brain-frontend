import type { ViewKey } from "../../lib/search";

export type WorkbenchAgentConnectorId =
  | "workbench"
  | "jira"
  | "microsoft365"
  | "team-library"
  | "notebooklm"
  | "devspace"
  | "sql"
  | "powerbi"
  | "fabric";

export type ConnectorReadiness = {
  id: WorkbenchAgentConnectorId;
  label: string;
  status: "ready" | "limited" | "unavailable" | "checking";
  detail: string;
  checkedAt?: string;
};

export type WorkbenchAgentStatusSnapshot = {
  connectors: ConnectorReadiness[];
  checkedAt: string;
};

export type WorkbenchAgentDestination = {
  view: ViewKey;
  section?: string;
  label?: string;
};

export type DestinationSection = {
  key: string;
  label: string;
  hints: string[];
};

export type AgentReceipt = {
  id: string;
  title: string;
  detail: string;
  source?: string;
  createdAt?: string;
  data?: Record<string, unknown>;
};

export type AgentActivityItem = {
  id: string;
  source: string;
  label: string;
  status: "running" | "completed" | "failed";
  detail?: string;
  startedAt?: string;
  durationMs?: number;
};

export type WorkbenchAgentCommand = {
  name?: string;
  mode?: "ui-command" | string;
  args?: {
    actionKey?: string;
    value?: string;
  };
};

export type AgentReviewCard = {
  id: string;
  title: string;
  summary: string;
  risk: "low" | "medium" | "high";
  toolName?: string;
  target?: string | Record<string, unknown>;
  expiresAt?: string;
  preview?: string | string[];
};

export type AgentMessage = {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  createdAt: number;
  receipts?: AgentReceipt[];
  reviewCards?: AgentReviewCard[];
};

export type WorkbenchAgentStatus =
  | "idle"
  | "thinking"
  | "using-tools"
  | "writing"
  | "stopped"
  | "error";

export type SemanticActionKind =
  | "focus"
  | "scroll"
  | "disclose"
  | "navigate"
  | "fill"
  | "submit"
  | "save"
  | "delete"
  | "send"
  | "apply"
  | "external-update";

export type SemanticActionSafety = "immediate" | "notice" | "confirm";

export type SemanticActionItem = {
  key: string;
  view: ViewKey;
  role: string;
  label: string;
  kind: SemanticActionKind;
  safety: SemanticActionSafety;
  region?: string;
  disabled: boolean;
};

export type SemanticActionResult =
  | {
      ok: true;
      message: string;
      needsReview?: false;
    }
  | {
      ok: false;
      reason: "stale" | "blocked" | "missing" | "invalid";
      message: string;
      review?: AgentReviewCard;
    }
  | {
      ok: true;
      needsReview: true;
      message: string;
      review: AgentReviewCard;
    };

export type WorkbenchAgentStreamRequest = {
  message: string;
  activeView: ViewKey;
  actions: SemanticActionItem[];
  destinations: Array<{
    view: ViewKey;
    label: string;
    sections: Array<{ key: string; label: string }>;
  }>;
  conversation: Array<{ role: "user" | "agent"; content: string }>;
};

export type WorkbenchAgentStreamEvent =
  | { type: "status"; status: WorkbenchAgentStatus; detail?: string }
  | { type: "thinking"; text: string }
  | { type: "reasoning"; text?: string; delta?: string }
  | { type: "delta"; text: string }
  | { type: "text"; text?: string; delta?: string }
  | { type: "message"; text: string }
  | { type: "connector"; connector: ConnectorReadiness }
  | { type: "activity"; activity: AgentActivityItem }
  | { type: "receipt"; receipt: AgentReceipt }
  | { type: "review"; review: AgentReviewCard }
  | { type: "navigate"; destination: WorkbenchAgentDestination }
  | { type: "action"; actionKey: string; value?: string }
  | { type: "error"; message: string }
  | { type: "done" };
