/**
 * The run record as the gateway serves it. Everything here is read straight off
 * a real dispatch: nothing on the Autonomy screen may invent a value, so every
 * field an older run never recorded is null, and the interface says "not
 * recorded" rather than filling the hole.
 */

export type RunVerdict = "DONE" | "REVIEW" | "BLOCKED";

export type RunAttachment = {
  path: string;
  ok: boolean;
  /** Why the upload failed, when it did. */
  error: string | null;
};

export type AgentRunSummary = {
  /** `${issueKey}@${startedAt}`, minted by the gateway. Stable across polls. */
  runId: string;
  issueKey: string;
  /** The issue summary at dispatch time. Null on runs that predate recording it. */
  issueSummary: string | null;
  agent: "claude" | "codex";
  agentLabel: string;
  /** The agent's assigned session name. Null when the dispatcher had none. */
  sessionName: string | null;
  /** The model pinned for the run. Null on runs that predate recording it. */
  model: string | null;
  state: "running" | "finished";
  startedAt: string;
  finishedAt: string | null;
  verdict: RunVerdict | null;
  note: string | null;
  /** Tool calls so far, and the most recent one, so a silent run still shows movement. */
  steps: number;
  lastAction: string | null;
  lastEventAt: string | null;
  exitCode: number | null;
  error: string | null;
  /** Files the run delivered to the ticket. Null means not recorded, [] means none. */
  attachments: RunAttachment[] | null;
  /** The run this one was started to revise, when it is a change-request follow-up. */
  followsRun: string | null;
};

/**
 * Plan reporting contract. The dispatch prompt asks the agent to print, before
 * its first tool call:
 *
 *   APPROACH:
 *   <one short paragraph>
 *   END APPROACH
 *   PLAN:
 *   1. <first phase>
 *   2. <next phase>
 *   END PLAN
 *
 * and then one line per transition while working:
 *
 *   STEP 2 START
 *   STEP 2 DONE
 *   STEP 2 SKIP <why it is no longer needed>
 *   STEP 2 FAIL <what stopped it>
 *
 * The gateway derives the plan from the run's own messages (server/agent-runs.mjs,
 * deriveReview), so it works identically for live and archived runs. A run that
 * predates the contract has plan: null, and the modal says so plainly.
 */
export type PlanStepStatus = "pending" | "active" | "done" | "skipped" | "failed";

export type PlanStep = {
  n: number;
  title: string;
  status: PlanStepStatus;
  /** The agent's stated reason, for skipped and failed steps. */
  reason: string | null;
};

export type RunMessage = {
  seq: number;
  role: "sent" | "agent";
  text: string;
  at: string;
};

export type RunReview = {
  /** The exact instruction sent to the agent. Null only on summary-level records. */
  request: string | null;
  /** The agent's own statement of how it intended to tackle the work. */
  approach: string | null;
  /** The ordered plan with per-step status, or null when the run never reported one. */
  plan: PlanStep[] | null;
  /** What the agent said while working, in order, with plan markers stripped. */
  messages: RunMessage[];
  /** The comment the run posted to the ticket, when the record carries it. */
  postedComment: string | null;
  /**
   * "full" when the archived conversation exists; "summary" when only the
   * outcome summary was kept, in which case request/approach/plan/messages
   * cannot be shown and the modal states that instead.
   */
  recordLevel: "full" | "summary";
};

export type RunDetail = AgentRunSummary & { review: RunReview };

export type RunQuestion = {
  id: string;
  question: string;
  askedAt: string;
  state: "answering" | "answered" | "failed";
  answer: string | null;
  answeredAt: string | null;
  error: string | null;
};
