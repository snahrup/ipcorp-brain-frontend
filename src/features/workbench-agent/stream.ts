import type {
  AgentActivityItem,
  AgentReceipt,
  AgentReviewCard,
  ConnectorReadiness,
  WorkbenchAgentCommand,
  WorkbenchAgentConnectorId,
  WorkbenchAgentStatusSnapshot,
  WorkbenchAgentStreamEvent,
  WorkbenchAgentStreamRequest,
} from "./types";

let requestToken: string | null = null;
type ConfirmPayload = {
  ok?: boolean;
  data?: { receipt?: unknown; command?: unknown };
  error?: string;
} | null;
type NormalizedConfirmPayload = {
  ok: true;
  data: { receipt?: AgentReceipt; command?: WorkbenchAgentCommand };
};
type StatusPayload = {
  ok?: boolean;
  data?: {
    checkedAt?: unknown;
    connectors?: unknown;
  };
  error?: string;
} | null;

const CONNECTOR_LABELS: Record<WorkbenchAgentConnectorId, string> = {
  workbench: "Workbench",
  jira: "Jira",
  microsoft365: "Microsoft 365",
  "team-library": "Team Library",
  notebooklm: "NotebookLM",
  devspace: "DevSpace",
  sql: "SQL",
  powerbi: "Power BI",
  fabric: "Fabric",
};
const CONNECTOR_IDS = Object.keys(CONNECTOR_LABELS) as WorkbenchAgentConnectorId[];

type StreamHandlers = {
  onEvent: (event: WorkbenchAgentStreamEvent) => void;
  onError: (message: string) => void;
};

export async function streamWorkbenchAgent(
  request: WorkbenchAgentStreamRequest,
  signal: AbortSignal,
  handlers: StreamHandlers
) {
  const token = await ensureAgentSession();
  const response = await fetch("/api/workbench-agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-workbench-agent-request": token },
    credentials: "include",
    body: JSON.stringify({
      message: request.message,
      view: request.activeView,
      availableActions: request.actions,
      destinationSections: Object.fromEntries(
        request.destinations.map((destination) => [
          destination.view,
          destination.sections.map((section) => section.key),
        ])
      ),
      conversation: request.conversation,
    }),
    signal,
  });

  if (!response.ok) {
    handlers.onError(`Agent service returned ${response.status}.`);
    return;
  }

  if (!response.body) {
    handlers.onError("Agent service did not return a stream.");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = parseStreamLine(trimmed);
      if (event) handlers.onEvent(event);
    }
  }

  const final = buffer.trim();
  if (final) {
    const event = parseStreamLine(final);
    if (event) handlers.onEvent(event);
  }
}

export async function confirmWorkbenchAgentAction(reviewId: string) {
  const token = await ensureAgentSession();
  const response = await fetch("/api/workbench-agent/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-workbench-agent-request": token },
    credentials: "include",
    body: JSON.stringify({ reviewId }),
  });
  const payload = (await response.json().catch(() => null)) as ConfirmPayload;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? `Confirmation failed with ${response.status}.`);
  }
  return normalizeConfirmPayload(payload);
}

export function normalizeConfirmPayload(payload: ConfirmPayload): NormalizedConfirmPayload {
  return {
    ok: true,
    data: {
      receipt: isRecord(payload?.data?.receipt)
        ? normalizeReceipt(payload.data.receipt)
        : undefined,
      command:
        normalizeCommand(payload?.data?.command) ?? commandFromReceipt(payload?.data?.receipt),
    },
  };
}

export async function getWorkbenchAgentStatus(): Promise<WorkbenchAgentStatusSnapshot> {
  const token = await ensureAgentSession();
  const response = await fetch("/api/workbench-agent/status", {
    method: "GET",
    headers: { "x-workbench-agent-request": token },
    credentials: "include",
  });
  const payload = (await response.json().catch(() => null)) as StatusPayload;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? `Agent status failed with ${response.status}.`);
  }
  return normalizeStatusPayload(payload);
}

export function normalizeStatusPayload(payload: StatusPayload): WorkbenchAgentStatusSnapshot {
  const checkedAt =
    typeof payload?.data?.checkedAt === "string"
      ? payload.data.checkedAt
      : new Date().toISOString();
  const rawConnectors = payload?.data?.connectors;
  const connectorsById = new Map<WorkbenchAgentConnectorId, ConnectorReadiness>();

  if (Array.isArray(rawConnectors)) {
    for (const rawConnector of rawConnectors) {
      const connector = normalizeConnector(rawConnector, checkedAt);
      if (connector) connectorsById.set(connector.id, connector);
    }
  } else if (isRecord(rawConnectors)) {
    for (const [id, rawConnector] of Object.entries(rawConnectors)) {
      const connector = normalizeConnector({ id, value: rawConnector }, checkedAt);
      if (connector) connectorsById.set(connector.id, connector);
    }
  }

  return {
    checkedAt,
    connectors: (Object.keys(CONNECTOR_LABELS) as WorkbenchAgentConnectorId[]).map(
      (id) =>
        connectorsById.get(id) ?? {
          id,
          label: CONNECTOR_LABELS[id],
          status: "unavailable",
          detail: "Status was not reported by the service.",
          checkedAt,
        }
    ),
  };
}

async function ensureAgentSession() {
  if (requestToken) return requestToken;
  const response = await fetch("/api/workbench-agent/session", {
    method: "POST",
    credentials: "include",
  });
  const payload = (await response.json()) as {
    ok?: boolean;
    data?: { requestToken?: string };
  } | null;
  const token = payload?.data?.requestToken;
  if (!response.ok || !payload?.ok || !token) {
    throw new Error(`Agent session failed with ${response.status}.`);
  }
  requestToken = token;
  return token;
}

function parseStreamLine(line: string): WorkbenchAgentStreamEvent | null {
  try {
    return normalizeStreamEvent(JSON.parse(line) as Record<string, unknown>);
  } catch {
    return { type: "error", message: "Agent service sent an unreadable stream event." };
  }
}

function normalizeStreamEvent(raw: Record<string, unknown>): WorkbenchAgentStreamEvent | null {
  const type = typeof raw.type === "string" ? raw.type : "";
  if (type === "reasoning") return { type: "thinking", text: eventText(raw) };
  if (type === "text") return { type: "delta", text: eventText(raw) };
  if (type === "thinking") return { type: "thinking", text: eventText(raw) };
  if (type === "delta") return { type: "delta", text: eventText(raw) };
  if (type === "review" && isRecord(raw.review)) {
    return { type: "review", review: normalizeReview(raw.review) };
  }
  if (type === "activity" && isRecord(raw.activity)) {
    return { type: "activity", activity: normalizeActivity(raw.activity) };
  }
  if (type === "receipt" && isRecord(raw.receipt)) {
    return { type: "receipt", receipt: normalizeReceipt(raw.receipt) };
  }
  return raw as WorkbenchAgentStreamEvent;
}

function normalizeActivity(raw: Record<string, unknown>): AgentActivityItem {
  const status: AgentActivityItem["status"] =
    raw.status === "running" || raw.status === "failed" ? raw.status : "completed";
  return {
    id: String(raw.id ?? crypto.randomUUID()),
    source: String(raw.source ?? "Workbench"),
    label: String(raw.label ?? "Source read"),
    status,
    detail: typeof raw.detail === "string" ? raw.detail : undefined,
    startedAt: typeof raw.startedAt === "string" ? raw.startedAt : undefined,
    durationMs: typeof raw.durationMs === "number" ? raw.durationMs : undefined,
  };
}

function normalizeReceipt(raw: Record<string, unknown>): AgentReceipt {
  return {
    id: String(raw.id ?? crypto.randomUUID()),
    title: String(raw.title ?? "Recorded"),
    detail: String(raw.detail ?? raw.summary ?? ""),
    source: typeof raw.source === "string" ? raw.source : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : undefined,
    data: isRecord(raw.data) ? raw.data : undefined,
  };
}

function normalizeConnector(raw: unknown, fallbackCheckedAt: string): ConnectorReadiness | null {
  const record = isRecord(raw) ? raw : null;
  if (!record) return null;
  const rawId = typeof record.id === "string" ? record.id : undefined;
  const id = normalizeConnectorId(rawId);
  if (!id) return null;
  const nested = isRecord(record.value) ? record.value : record;
  return {
    id,
    label: CONNECTOR_LABELS[id],
    status: normalizeConnectorState(nested.state ?? nested.status),
    detail: normalizeConnectorDetail(nested),
    checkedAt: typeof nested.checkedAt === "string" ? nested.checkedAt : fallbackCheckedAt,
  };
}

function normalizeConnectorId(id?: string): WorkbenchAgentConnectorId | null {
  if (!id) return null;
  const normalized = id.trim().toLowerCase().replace(/_/g, "-");
  if (normalized === "m365" || normalized === "microsoft-365") return "microsoft365";
  if (normalized === "teamlibrary" || normalized === "team-library") return "team-library";
  if (CONNECTOR_IDS.includes(normalized as WorkbenchAgentConnectorId)) {
    return normalized as WorkbenchAgentConnectorId;
  }
  return null;
}

function normalizeConnectorState(value: unknown): ConnectorReadiness["status"] {
  const state = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (["ready", "ok", "connected", "available", "online"].includes(state)) return "ready";
  if (["limited", "partial", "degraded", "warning", "needs-confirmation"].includes(state)) {
    return "limited";
  }
  if (["checking", "pending", "loading"].includes(state)) return "checking";
  return "unavailable";
}

function normalizeConnectorDetail(record: Record<string, unknown>) {
  const detail = record.detail ?? record.message ?? record.reason ?? record.summary;
  if (typeof detail === "string" && detail.trim()) return detail.trim().slice(0, 160);
  return "No detail was provided by the service.";
}

function normalizeReview(raw: Record<string, unknown>): AgentReviewCard {
  const risk: AgentReviewCard["risk"] =
    raw.risk === "high" || raw.risk === "medium" || raw.risk === "low" ? raw.risk : "medium";
  return {
    id: String(raw.id ?? ""),
    title: String(raw.title ?? "Review action"),
    summary: String(raw.summary ?? ""),
    risk,
    toolName: typeof raw.toolName === "string" ? raw.toolName : undefined,
    target:
      typeof raw.target === "string" || isRecord(raw.target)
        ? (raw.target as string | Record<string, unknown>)
        : undefined,
    expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : undefined,
    preview:
      typeof raw.preview === "string"
        ? raw.preview
        : Array.isArray(raw.preview)
          ? raw.preview.map((item) => String(item))
          : undefined,
  };
}

function eventText(raw: Record<string, unknown>) {
  const value = raw.text ?? raw.delta ?? raw.content ?? "";
  return typeof value === "string" ? value : String(value);
}

function commandFromReceipt(receipt: unknown): WorkbenchAgentCommand | undefined {
  if (!isRecord(receipt) || !isRecord(receipt.data)) return undefined;
  if (receipt.data.mode !== "ui-command") return undefined;
  return normalizeCommand(receipt.data.command);
}

function normalizeCommand(raw: unknown): WorkbenchAgentCommand | undefined {
  if (!isRecord(raw)) return undefined;
  const args = isRecord(raw.args) ? raw.args : undefined;
  return {
    name: typeof raw.name === "string" ? raw.name : undefined,
    mode: typeof raw.mode === "string" ? raw.mode : undefined,
    args: args
      ? {
          actionKey: typeof args.actionKey === "string" ? args.actionKey : undefined,
          value: typeof args.value === "string" ? args.value : undefined,
        }
      : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
