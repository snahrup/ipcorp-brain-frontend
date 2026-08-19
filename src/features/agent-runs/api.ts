import { GATEWAY } from "../../lib/gateway";
import type { AgentRunSummary, RunDetail, RunQuestion } from "./types";

/**
 * The Autonomy screen's read layer over the dispatch gateway. Same envelope and
 * error behavior as features/jira/api.ts: {ok, data, error, code}, and a fetch
 * that cannot reach the gateway is reported as the gateway being down, which is
 * a different situation from "no runs yet" and must never look the same.
 */

const AGENTS_API = `${GATEWAY}/agents`;

export class AgentRunsGatewayError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AgentRunsGatewayError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${AGENTS_API}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new AgentRunsGatewayError(
      "The local gateway is not answering. Start the Workbench gateway and try again.",
      503,
      "gateway_offline"
    );
  }
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: T;
    error?: string;
    code?: string;
  };
  if (!response.ok || payload.ok === false || payload.data === undefined) {
    throw new AgentRunsGatewayError(
      payload.error || `The request failed with HTTP ${response.status}.`,
      response.status,
      payload.code
    );
  }
  return payload.data;
}

export const agentRunsGateway = {
  /** Every dispatch run the gateway knows about, running or finished, newest first. */
  list: () => request<AgentRunSummary[]>("/runs"),

  /** One run with its full review record (request, approach, plan, messages, delivery). */
  detail: (runId: string) => request<RunDetail>(`/runs/detail?id=${encodeURIComponent(runId)}`),

  /** The question thread kept with a run. */
  questions: (runId: string) =>
    request<RunQuestion[]>(`/runs/questions?id=${encodeURIComponent(runId)}`),

  /**
   * Ask about the work. Never interrupts a running agent: the gateway starts a
   * separate companion session that has the run's record and answers on its
   * behalf. Resolves with the thread including the new, still-answering entry.
   */
  ask: (runId: string, question: string) =>
    request<RunQuestion[]>("/runs/questions", {
      method: "POST",
      body: JSON.stringify({ id: runId, question }),
    }),

  /**
   * Request changes to the work. Starts a NEW run on the same ticket carrying
   * the request and the previous run's record as its instruction. This and
   * `ask` are the only two actions this surface may take.
   */
  requestChanges: (runId: string, instruction: string) =>
    request<AgentRunSummary>("/runs/changes", {
      method: "POST",
      body: JSON.stringify({ id: runId, instruction }),
    }),
};
