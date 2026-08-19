import {
  AlertCircle,
  Bot,
  CheckCircle2,
  CornerDownRight,
  LoaderCircle,
  Paperclip,
  RefreshCw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { describeAction } from "../jira/AgentActivity";
import "./agent-runs.css";
import { agentRunsGateway } from "./api";
import { deliveredLabel, needsYou, runDuration, runPresentation, startedLabel } from "./format";
import { RunReviewModal } from "./RunReviewModal";
import type { AgentRunSummary } from "./types";

/**
 * Every run, newest first, live while any run is in flight.
 *
 * This is a supervision surface, not a log viewer: each row answers when it
 * started, who ran it, what it worked on, where it stands, how much it actually
 * did, and whether it delivered anything, without opening it. A run that
 * finished REVIEW or BLOCKED is waiting on a person and is tinted as such.
 */

const POLL_MS = 3000;
const SHOW_MODEL_KEY = "ipcorp-workbench.autonomy.show-model";

type RunFilter = "all" | "needs-you" | "running" | "finished";

const FILTERS: { id: RunFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs-you", label: "Needs you" },
  { id: "running", label: "Running" },
  { id: "finished", label: "Finished" },
];

function readShowModel() {
  try {
    return window.localStorage.getItem(SHOW_MODEL_KEY) === "true";
  } catch {
    return false;
  }
}

function matchesFilter(run: AgentRunSummary, filter: RunFilter) {
  if (filter === "all") return true;
  if (filter === "needs-you") return needsYou(run);
  if (filter === "running") return run.state === "running";
  return run.state === "finished" && !needsYou(run);
}

export function AgentRunsSurface({
  onCounts,
}: {
  /** Real counts for the page hero. Never estimated. */
  onCounts?: (counts: { running: number; needsYou: number }) => void;
}) {
  const [runs, setRuns] = useState<AgentRunSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RunFilter>("all");
  const [query, setQuery] = useState("");
  const [showModel, setShowModel] = useState(readShowModel);
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(SHOW_MODEL_KEY, showModel ? "true" : "false");
    } catch {
      // Storage can be unavailable; the toggle still works for the session.
    }
  }, [showModel]);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      const next = await agentRunsGateway.list();
      setRuns(next);
      setError(null);
    } catch (cause) {
      // A failed poll never clears the last known list: losing the gateway for
      // a moment must not make live runs vanish. The error rides alongside.
      setError(cause instanceof Error ? cause.message : "The run list could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const anyRunning = useMemo(() => (runs ?? []).some((run) => run.state === "running"), [runs]);

  // Poll only while something is actually running; when nothing is, the screen
  // is quiet. Coming back to the tab re-reads once so a run dispatched from the
  // Work screen in the meantime still appears without a manual refresh.
  useEffect(() => {
    if (!anyRunning) return;
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [anyRunning, load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // A local tick keeps live durations moving between polls instead of jumping.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!anyRunning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [anyRunning]);

  const counts = useMemo(
    () => ({
      running: (runs ?? []).filter((run) => run.state === "running").length,
      needsYou: (runs ?? []).filter(needsYou).length,
    }),
    [runs]
  );
  const countsRef = useRef(onCounts);
  countsRef.current = onCounts;
  useEffect(() => {
    countsRef.current?.(counts);
  }, [counts]);

  const visible = useMemo(() => {
    if (!runs) return [];
    const normalized = query.trim().toLowerCase();
    return runs.filter((run) => {
      if (!matchesFilter(run, filter)) return false;
      if (!normalized) return true;
      return [run.issueKey, run.issueSummary, run.agentLabel, run.sessionName, run.model]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [runs, filter, query]);

  const openRun = useMemo(
    () => (openRunId ? (runs ?? []).find((run) => run.runId === openRunId) : undefined),
    [openRunId, runs]
  );

  if (loading) {
    return (
      <section className="wb-runs-state" aria-live="polite">
        <LoaderCircle className="wb-spin" size={28} />
        <h2>Reading the run record…</h2>
        <p>Rows stay empty until the gateway returns real runs.</p>
      </section>
    );
  }

  if (error && !runs) {
    return (
      <section className="wb-runs-state wb-runs-state-error" role="alert">
        <AlertCircle size={30} />
        <h2>The gateway is not answering</h2>
        <p>{error}</p>
        <div className="wb-runs-state-actions">
          <button type="button" className="wb-primary-button" onClick={() => void load()}>
            <RefreshCw size={16} /> Try again
          </button>
          <span>This is a connection problem, not an empty history.</span>
        </div>
      </section>
    );
  }

  if (runs && runs.length === 0) {
    return (
      <section className="wb-runs-state">
        <Bot size={30} />
        <h2>No runs yet</h2>
        <p>
          When an issue is handed to Claude Code or Codex from the Work screen, the run appears here
          as it happens. Nothing is simulated in the meantime.
        </p>
      </section>
    );
  }

  return (
    <div className="wb-runs-surface">
      <div className="wb-runs-truthbar">
        <div>
          <CheckCircle2 size={18} />
          <div>
            <strong>Dispatch record · live and archived runs</strong>
            <span>
              {runs?.length} {runs?.length === 1 ? "run" : "runs"} known to the gateway
            </span>
          </div>
        </div>
        {error ? (
          <span className="wb-runs-refresh-error">{error} Showing the last successful read.</span>
        ) : (
          <span className="wb-runs-poll">
            {anyRunning ? (
              <>
                <span className="wb-runs-pulse" aria-hidden="true" />
                Updating every {POLL_MS / 1000}s while a run is live
              </>
            ) : (
              "Nothing is running; polling is stopped"
            )}
          </span>
        )}
      </div>

      <div className="wb-runs-toolbar">
        <fieldset className="wb-segmented">
          <legend className="wb-sr-only">Run status filter</legend>
          {FILTERS.map((entry) => (
            <button
              type="button"
              key={entry.id}
              aria-pressed={filter === entry.id}
              className={filter === entry.id ? "is-active" : ""}
              onClick={() => setFilter(entry.id)}
            >
              {entry.label}
              {entry.id === "needs-you" && counts.needsYou > 0 ? ` · ${counts.needsYou}` : ""}
            </button>
          ))}
        </fieldset>

        <label className="wb-runs-search">
          <Search size={16} aria-hidden="true" />
          <span className="wb-sr-only">Filter runs</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by ticket, agent or model"
          />
        </label>

        <label className="wb-runs-check">
          <input
            type="checkbox"
            checked={showModel}
            onChange={(event) => setShowModel(event.target.checked)}
          />
          Show model
        </label>

        <div className="wb-runs-toolbar-actions">
          <button
            type="button"
            className="wb-secondary-button"
            onClick={() => void load(true)}
            disabled={refreshing}
          >
            <RefreshCw className={refreshing ? "wb-spin" : ""} size={16} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="wb-runs-count">
        <strong>{visible.length}</strong>
        <span>
          {filter === "all"
            ? "runs"
            : `runs · ${FILTERS.find((f) => f.id === filter)?.label.toLowerCase()}`}
        </span>
      </div>

      {visible.length === 0 ? (
        <section className="wb-runs-state">
          <Search size={24} />
          <h2>No runs match this view</h2>
          <p>Clear the filter or choose another status. No placeholder rows are shown.</p>
        </section>
      ) : (
        <section className="wb-runs-list" aria-label="Agent runs, newest first">
          <div className="wb-runs-head">
            <span>Run</span>
            <span>Working on</span>
            <span>Status</span>
            <span>Activity</span>
            <span>Delivered</span>
            <span>Started</span>
          </div>
          {visible.map((run) => {
            const live = run.state === "running";
            const presentation = runPresentation(run);
            const attention = needsYou(run);
            // A live run has not delivered yet by definition; only a finished
            // run with no attachments field is an actual gap in the record.
            const delivered =
              live && run.attachments === null
                ? { text: "Not yet", failed: 0 }
                : deliveredLabel(run.attachments);
            const doing = live ? (describeAction(run.lastAction) ?? "Getting started") : null;
            return (
              <button
                type="button"
                className="wb-runs-row"
                data-needs-you={attention ? "true" : undefined}
                key={run.runId}
                onClick={() => setOpenRunId(run.runId)}
              >
                <span className="wb-runs-agent">
                  <span className="wb-runs-agent-mark" data-live={live ? "true" : undefined}>
                    {live ? (
                      <LoaderCircle className="wb-spin" size={15} aria-hidden="true" />
                    ) : (
                      <Bot size={15} aria-hidden="true" />
                    )}
                  </span>
                  <div>
                    <strong>{run.sessionName || run.agentLabel}</strong>
                    <small>
                      {run.sessionName ? `${run.agentLabel}` : "Session name not recorded"}
                      {showModel && (
                        <> · {run.model ? <code>{run.model}</code> : "model not recorded"}</>
                      )}
                    </small>
                  </div>
                </span>

                <span className="wb-runs-issue">
                  <span>
                    <span className="wb-runs-key">{run.issueKey}</span>
                    <span
                      className="wb-runs-summary"
                      data-missing={run.issueSummary ? undefined : "true"}
                    >
                      {run.issueSummary || "Issue summary not recorded"}
                    </span>
                  </span>
                  {run.followsRun && (
                    <span className="wb-runs-follows">
                      <CornerDownRight size={12} aria-hidden="true" />
                      Follow-up on an earlier run of {run.issueKey}
                    </span>
                  )}
                </span>

                <span className="wb-runs-status">
                  <span className="wb-status-chip" data-tone={presentation.tone}>
                    {presentation.label}
                  </span>
                </span>

                <span className="wb-runs-activity">
                  {live && <span className="wb-runs-doing">{doing}</span>}
                  <strong>
                    {run.steps} {run.steps === 1 ? "step" : "steps"}
                  </strong>
                </span>

                <span
                  className="wb-runs-delivered"
                  data-failed={delivered.failed > 0 ? "true" : undefined}
                  data-none={
                    run.attachments === null || run.attachments.length === 0 ? "true" : undefined
                  }
                >
                  <Paperclip size={13} aria-hidden="true" />
                  {delivered.text}
                </span>

                <span className="wb-runs-when">
                  <strong>{startedLabel(run.startedAt)}</strong>
                  <span>
                    {live ? "running " : "ran "}
                    {runDuration(run.startedAt, run.finishedAt, now)}
                  </span>
                </span>
              </button>
            );
          })}
        </section>
      )}

      {openRunId && (
        <RunReviewModal
          runId={openRunId}
          summary={openRun ?? null}
          onClose={() => setOpenRunId(null)}
          onRunsChanged={() => void load()}
        />
      )}
    </div>
  );
}
