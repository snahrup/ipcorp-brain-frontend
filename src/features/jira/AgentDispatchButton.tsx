import { AlertCircle, Bot, CheckCircle2, LoaderCircle, Play, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import "./agent-dispatch.css";
import { GATEWAY } from "../../lib/gateway";
import { AgentActivity } from "./AgentActivity";
import { AgentTranscript } from "./AgentTranscript";

const BASE = `${GATEWAY}/agents`;
// Fast enough that the conversation reads as it happens. The payload is a small JSON
// document from a process on this machine, so the cost of asking often is negligible.
const POLL_MS = 1500;

/** One turn of the run's conversation. Tool calls never become messages. */
export type AgentMessage = {
  /** Append-only position in the run, so a message has a stable identity to key on. */
  seq: number;
  role: "sent" | "agent";
  text: string;
  at: string;
};

export type AgentRun = {
  issueKey: string;
  agent: "claude" | "codex";
  agentLabel: string;
  state: "running" | "finished";
  startedAt: string;
  finishedAt: string | null;
  verdict: "DONE" | "REVIEW" | "BLOCKED" | null;
  note: string | null;
  output: string;
  messages?: AgentMessage[];
  /** Tool calls so far, and the most recent one, so a silent run still shows movement. */
  steps?: number;
  lastAction?: string | null;
  lastEventAt?: string | null;
  exitCode: number | null;
  error: string | null;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: T;
    error?: string;
  };
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed with HTTP ${response.status}.`);
  }
  return payload.data as T;
}

/**
 * Hands the issue to Claude Code or Codex and shows what came back.
 *
 * The board moves before the agent starts, so an issue is never quietly worked on while
 * still showing as not started. On finish the run posts its own comment, logs its time
 * and moves the issue to Done, In Review or Blocked based on what it actually reported.
 */
export function AgentDispatchButton({
  issueKey,
  onChanged,
}: {
  issueKey: string;
  onChanged?: () => void;
}) {
  const [run, setRun] = useState<AgentRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState("");
  const [showContext, setShowContext] = useState(false);
  const timer = useRef<number | null>(null);
  const wasRunning = useRef(false);

  const poll = useCallback(async () => {
    try {
      const next = await call<AgentRun | null>(`/run?issueKey=${encodeURIComponent(issueKey)}`);
      setRun(next);
      if (wasRunning.current && next && next.state === "finished") {
        wasRunning.current = false;
        onChanged?.();
      }
      if (next?.state === "running") wasRunning.current = true;
    } catch {
      // A failed poll is not a failed run. Keep the last known state.
    }
  }, [issueKey, onChanged]);

  useEffect(() => {
    void poll();
  }, [poll]);

  useEffect(() => {
    if (run?.state !== "running") {
      if (timer.current) window.clearInterval(timer.current);
      return;
    }
    timer.current = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [run?.state, poll]);

  const start = async (agent: "claude" | "codex") => {
    setBusy(true);
    setError(null);
    try {
      const started = await call<AgentRun>("/dispatch", {
        method: "POST",
        body: JSON.stringify({ issueKey, agent, context: context.trim() }),
      });
      setRun(started);
      wasRunning.current = true;
      setShowContext(false);
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The run could not be started.");
    } finally {
      setBusy(false);
    }
  };

  const running = run?.state === "running";

  return (
    <div className="wb-agent">
      <div className="wb-agent-head">
        <Bot size={16} aria-hidden="true" />
        <strong>Hand this to an agent</strong>
        {run && !running && run.verdict && (
          <span className="wb-agent-verdict" data-verdict={run.verdict}>
            {run.verdict === "DONE" ? (
              <CheckCircle2 size={13} aria-hidden="true" />
            ) : run.verdict === "REVIEW" ? (
              <AlertCircle size={13} aria-hidden="true" />
            ) : (
              <TriangleAlert size={13} aria-hidden="true" />
            )}
            {run.verdict === "DONE"
              ? "Finished"
              : run.verdict === "REVIEW"
                ? "Needs your review"
                : "Blocked"}
          </span>
        )}
      </div>

      {running ? (
        <div className="wb-agent-running" role="status">
          <LoaderCircle className="wb-spin" size={16} aria-hidden="true" />
          <span>
            {run?.agentLabel} is working on {issueKey}. The issue is In Progress and will update
            itself when the run ends.
          </span>
          <AgentActivity run={run} />
        </div>
      ) : (
        <>
          <p className="wb-agent-copy">
            The issue moves to In Progress immediately, then to Done, In Review or Blocked based on
            what the run reports. It writes its own comment and logs its time.
          </p>

          {showContext && (
            <textarea
              className="wb-agent-context"
              value={context}
              onChange={(event) => setContext(event.target.value)}
              placeholder="Anything the issue does not say that the agent should know"
              rows={3}
            />
          )}

          <div className="wb-agent-actions">
            <button
              type="button"
              className="wb-button-primary"
              disabled={busy}
              onClick={() => void start("claude")}
            >
              <Play size={15} aria-hidden="true" />
              Claude Code
            </button>
            <button
              type="button"
              className="wb-button-secondary"
              disabled={busy}
              onClick={() => void start("codex")}
            >
              <Play size={15} aria-hidden="true" />
              Codex
            </button>
            <button
              type="button"
              className="wb-link-button"
              onClick={() => setShowContext((v) => !v)}
            >
              {showContext ? "Hide context" : "Add context"}
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="wb-agent-error" role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          {error}
        </div>
      )}

      {run?.messages?.length ? (
        <AgentTranscript
          messages={run.messages}
          agentLabel={run.agentLabel}
          running={running}
          steps={run.steps}
          lastAction={run.lastAction}
        />
      ) : null}

      {run && !running && run.note && (
        <details className="wb-agent-result">
          <summary>What the run reported</summary>
          <p>{run.note}</p>
          {run.output && <pre>{run.output.trim().split("\n").slice(-25).join("\n")}</pre>}
        </details>
      )}
    </div>
  );
}
