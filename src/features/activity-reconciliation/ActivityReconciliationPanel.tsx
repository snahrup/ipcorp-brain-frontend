import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Mail,
  PauseCircle,
  Play,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GATEWAY } from "../../lib/gateway";
import { ActivityReconciliationError, activityReconciliationApi } from "./api";
import type {
  ActivityApplyReceipt,
  ActivityJiraProposal,
  ActivityRun,
  ActivitySourceProgress,
} from "./types";
import "./activity-reconciliation.css";

/* Labels are a frozen acceptance-tested contract (tests/activity-reconciliation.spec.ts,
   docs/specs/workbench-activity-reconciliation.md). The explainer is presentation-only:
   it teaches what each step does and why it is safe while the user waits. */
const PHASES = [
  [
    "preparing",
    "Prepare",
    "Locking the scan window and loading each source's last confirmed position.",
  ],
  [
    "reading_sources",
    "Read sources",
    "Reading Outlook and Teams since each source's saved position, with a 15-minute overlap so nothing is missed.",
  ],
  [
    "classifying_evidence",
    "Classify",
    "Sorting new items into meetings, decisions, and work signals — provenance stays attached to every item.",
  ],
  [
    "processing_meetings",
    "Check meetings",
    "Checking ready transcripts and completing meeting packets.",
  ],
  [
    "generating_visuals",
    "Save visuals",
    "Saving updated meeting visuals and summaries to the Brain.",
  ],
  [
    "matching_jira",
    "Match Jira",
    "Matching captured evidence against MT issues to find the work it belongs to.",
  ],
  [
    "preparing_proposals",
    "Prepare review",
    "Drafting Jira updates for your review. Nothing is applied without your approval.",
  ],
  [
    "delivering_drafts",
    "Outlook drafts",
    "Placing prepared follow-up emails into your Outlook Drafts folder. Nothing is sent.",
  ],
  ["mdm_check", "MDM check", "Running the chained Jira-vs-Brain consistency check."],
  [
    "finalizing",
    "Save recap",
    "Writing the run recap and saving each source's position for the next run.",
  ],
] as const;

const ACTIVE = new Set(["running", "stopping"]);
const COMPLETE = new Set(["completed", "partial_success"]);
const FAILURE_STATES = new Set([
  "partial",
  "unavailable",
  "not_authorized",
  "timed_out",
  "malformed",
  "failed",
]);

const FEED_LIMIT = 40;

function formatTime(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

function formatClock(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(date);
}

function duration(startedAt: string, endedAt: string | number) {
  const end = typeof endedAt === "number" ? endedAt : new Date(endedAt).getTime();
  const seconds = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function label(value: string) {
  return value.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function openHref(value: string) {
  return value.startsWith("/api/") ? `${GATEWAY}${value.slice(4)}` : value;
}

function receiptLabel(receipt: unknown) {
  if (typeof receipt === "string") return receipt.slice(0, 80);
  if (!receipt || typeof receipt !== "object") return null;
  const value = receipt as Record<string, unknown>;
  const identity = value.issueKey || value.packageId || value.id || value.sha256;
  return typeof identity === "string" && identity ? identity.slice(0, 80) : "Saved receipt";
}

function SourceCard({ source }: { source: ActivitySourceProgress }) {
  const failed = FAILURE_STATES.has(source.state);
  return (
    <article
      className="ar-source"
      data-state={source.state}
      data-testid={`activity-source-${source.id}`}
    >
      <div className="ar-source-heading">
        {/* Keyed on state so the icon swap replays its pop-in when a read finishes. */}
        <span aria-hidden="true" key={source.state} className="ar-source-state-icon">
          {source.state === "loading" ? (
            <LoaderCircle className="ar-spin" size={15} />
          ) : failed ? (
            <AlertCircle size={15} />
          ) : (
            <Check size={15} />
          )}
        </span>
        <strong>{source.label}</strong>
        <small>{label(source.state)}</small>
      </div>
      <p>
        {source.detail ||
          (source.state === "loading" ? "Waiting to read this source." : "Read finished.")}
      </p>
      <div className="ar-source-counts">
        <span>
          <strong key={source.itemCount} className="ar-count-tick">
            {source.itemCount}
          </strong>{" "}
          observed
        </span>
        <span>
          <strong key={source.changedCount} className="ar-count-tick">
            {source.changedCount}
          </strong>{" "}
          new or changed
        </span>
      </div>
    </article>
  );
}

function ProposalChange({ proposal }: { proposal: ActivityJiraProposal }) {
  return (
    <div className="ar-proposal-detail">
      <p>{proposal.reason}</p>
      {proposal.evidenceIds?.length > 0 && (
        <p className="ar-evidence-receipt">
          Evidence receipt: <code>{proposal.evidenceIds.join(", ")}</code>
        </p>
      )}
      {proposal.before && (
        <dl>
          <div>
            <dt>Current status</dt>
            <dd>{proposal.before.status}</dd>
          </div>
          <div>
            <dt>Last changed</dt>
            <dd>{formatTime(proposal.before.updatedAt)}</dd>
          </div>
        </dl>
      )}
      <ul>
        {proposal.changes.map((change) => (
          <li key={`${proposal.id}-${JSON.stringify(change)}`}>
            <strong>{label(change.kind)}</strong>
            {change.kind === "comment" && <span>{change.body}</span>}
            {change.kind === "worklog" && <span>{change.minutes} minutes with a review note</span>}
            {change.kind === "transition" && <span>Move to {change.toStatus}</span>}
            {change.kind === "create_issue" && (
              <span>
                {change.projectKey} {change.issueType}: {change.summary}
                <br />
                Priority {change.fields?.priority?.name || "not set"} · Start{" "}
                {change.fields?.customfield_11915 || "not set"} · Due{" "}
                {change.fields?.duedate || "not set"} · Estimate{" "}
                {change.fields?.timetracking?.originalEstimate || "not set"}
                {change.fields?.labels?.length
                  ? ` · Labels ${change.fields.labels.join(", ")}`
                  : ""}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Props {
  onClose: () => void;
  startOnOpen?: boolean;
  onOpenMdmReview?: () => void;
}

export function ActivityReconciliationPanel({
  onClose,
  startOnOpen = false,
  onOpenMdmReview,
}: Props) {
  const [run, setRun] = useState<ActivityRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmation, setConfirmation] = useState("");
  const [receipt, setReceipt] = useState<ActivityApplyReceipt | null>(null);
  const [now, setNow] = useState(Date.now());
  const panelRef = useRef<HTMLElement>(null);
  const recapRef = useRef<HTMLHeadingElement>(null);
  const priorStatus = useRef<string | null>(null);
  const autoStartAttempted = useRef(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      let starting = false;
      try {
        const next = await activityReconciliationApi.status(undefined, signal);
        if (startOnOpen && (!next || !ACTIVE.has(next.status)) && !autoStartAttempted.current) {
          autoStartAttempted.current = true;
          starting = true;
          setWorking(true);
          const result = await activityReconciliationApi.start();
          if (!signal?.aborted) {
            setRun(result.run);
            window.setTimeout(() => panelRef.current?.focus(), 0);
          }
        } else {
          setRun(next);
        }
        setError(null);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(
          reason instanceof Error
            ? reason.message
            : starting
              ? "The activity run could not start."
              : "Activity status is unavailable."
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setWorking(false);
        }
      }
    },
    [startOnOpen]
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!run || !ACTIVE.has(run.status)) return;
    const poll = window.setInterval(() => void load(), 1_500);
    return () => window.clearInterval(poll);
  }, [load, run]);

  useEffect(() => {
    if (!run || !ACTIVE.has(run.status)) return;
    const ticker = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(ticker);
  }, [run]);

  useEffect(() => {
    const previous = priorStatus.current;
    priorStatus.current = run?.status || null;
    if (!run) return;
    if (!previous && ACTIVE.has(run.status)) panelRef.current?.focus();
    if (previous && ACTIVE.has(previous) && COMPLETE.has(run.status)) recapRef.current?.focus();
  }, [run]);

  const start = async () => {
    setWorking(true);
    setError(null);
    setReceipt(null);
    setSelected(new Set());
    setConfirmation("");
    try {
      const result = await activityReconciliationApi.start();
      setRun(result.run);
      window.setTimeout(() => panelRef.current?.focus(), 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The activity run could not start.");
    } finally {
      setWorking(false);
    }
  };

  const stop = async () => {
    if (!run) return;
    setWorking(true);
    setError(null);
    try {
      setRun(await activityReconciliationApi.stop(run.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The stop request failed.");
    } finally {
      setWorking(false);
    }
  };

  const resume = async () => {
    if (!run) return;
    setWorking(true);
    setError(null);
    try {
      setRun(await activityReconciliationApi.resume(run.id));
      window.setTimeout(() => panelRef.current?.focus(), 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The activity run could not resume.");
    } finally {
      setWorking(false);
    }
  };

  const toggleProposal = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmation("");
  };

  const allSelected =
    (run?.jiraProposals.length || 0) > 0 && selected.size === run?.jiraProposals.length;
  const toggleAll = () => {
    setSelected(
      allSelected ? new Set() : new Set((run?.jiraProposals || []).map((proposal) => proposal.id))
    );
    setConfirmation("");
  };

  const selectedProposals = useMemo(
    () => (run?.jiraProposals || []).filter((proposal) => selected.has(proposal.id)),
    [run, selected]
  );
  const expectedConfirmation = `APPLY ${selectedProposals.length} JIRA ${selectedProposals.length === 1 ? "CHANGE" : "CHANGES"}`;

  const apply = async () => {
    if (!run || !selectedProposals.length) return;
    setWorking(true);
    setError(null);
    try {
      const applied = await activityReconciliationApi.applyJira(
        run.id,
        selectedProposals.map((proposal) => proposal.id),
        confirmation
      );
      setReceipt(applied);
      setSelected(new Set());
      setConfirmation("");
      await load();
    } catch (reason) {
      if (reason instanceof ActivityReconciliationError) setError(reason.message);
      else setError(reason instanceof Error ? reason.message : "Jira apply failed.");
    } finally {
      setWorking(false);
    }
  };

  const windowRange = run ? Object.values(run.windows)[0] : null;
  const sources = run ? Object.values(run.sources) : [];
  const phaseIndex = PHASES.findIndex(([id]) => id === run?.phase.id);
  const elapsed = run ? duration(run.startedAt, run.finishedAt || now) : null;
  const running = run ? ACTIVE.has(run.status) : false;
  const complete = run ? COMPLETE.has(run.status) : false;
  const paused = run ? run.status === "canceled" || run.status === "interrupted" : false;

  /* Seconds since the run last reported anything — the heartbeat. Receipts in the live
     log prove work is real; the heartbeat proves the connection to it is alive. */
  const signalSeconds =
    run && running && run.lastActivityAt
      ? Math.max(0, Math.floor((now - new Date(run.lastActivityAt).getTime()) / 1_000))
      : null;
  const signalStale = signalSeconds !== null && signalSeconds > 20;

  const feed = useMemo(() => (run?.events || []).slice(-FEED_LIMIT).reverse(), [run]);

  const sourcesDone = sources.filter((source) => source.state !== "loading").length;
  const explainer =
    phaseIndex >= 0 ? PHASES[phaseIndex][2] : "Waiting for the run to report its first step.";

  return (
    <section
      className="ar-panel"
      aria-labelledby="activity-reconciliation-title"
      data-status={run?.status || "idle"}
      data-testid="activity-reconciliation-panel"
      ref={panelRef}
      tabIndex={-1}
    >
      <header className="ar-header">
        <div>
          <span className="ar-kicker">Work activity</span>
          <h2 id="activity-reconciliation-title">Activity reconciliation</h2>
          <p>Review Outlook, Teams, ready meetings, Brain updates, and related Jira work.</p>
        </div>
        <button
          type="button"
          className="ar-icon-button"
          onClick={onClose}
          aria-label="Close activity reconciliation"
        >
          <X size={18} />
        </button>
      </header>

      {error && (
        <div className="ar-alert" role="alert">
          <AlertCircle size={18} />
          <div>
            <strong>Activity reconciliation needs attention</strong>
            <span>{error}</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="ar-loading" role="status">
          <LoaderCircle className="ar-spin" size={20} /> Loading saved run history
        </div>
      ) : !run ? (
        <div className="ar-idle" data-testid="activity-reconciliation-idle">
          <div className="ar-idle-icon" aria-hidden="true">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h3>Ready for the first baseline</h3>
            <p>
              The first run reads from January 1, 2026 through its fixed start time. Later runs use
              each source's last successful position with a 15-minute overlap.
            </p>
          </div>
          <button
            type="button"
            className="ar-primary"
            onClick={() => void start()}
            disabled={working}
          >
            {working ? <LoaderCircle className="ar-spin" size={16} /> : <Play size={16} />}
            Start reconciliation
          </button>
        </div>
      ) : (
        <>
          {/* ── Run theater: one place that always answers "what is it doing, how far
                 along is it, and is it still alive" ─────────────────────────────── */}
          <div className="ar-theater" data-status={run.status}>
            <div className="ar-theater-top">
              <div className="ar-theater-identity">
                <span className="ar-status" data-status={run.status}>
                  {running && <LoaderCircle className="ar-spin" size={14} />}
                  {run.status === "canceled" && <PauseCircle size={14} />}
                  {COMPLETE.has(run.status) && <CheckCircle2 size={14} />}
                  {label(run.status)}
                </span>
                <strong>{run.baseline ? "Baseline" : "Incremental"}</strong>
                <code>{run.id}</code>
              </div>
              <div className="ar-theater-clock">
                {running && signalSeconds !== null && (
                  <span className="ar-heartbeat" data-stale={signalStale || undefined}>
                    <i aria-hidden="true" />
                    {signalStale
                      ? `Still working · last signal ${signalSeconds}s ago`
                      : `Live · signal ${signalSeconds}s ago`}
                  </span>
                )}
                <span className="ar-elapsed">
                  <Clock3 size={14} /> {elapsed}
                </span>
              </div>
            </div>

            <div className="ar-theater-hero" aria-live="polite" aria-atomic="true">
              <div className="ar-theater-phase">
                <span className="ar-phase-kicker">
                  {complete
                    ? `All ${PHASES.length} steps finished`
                    : paused
                      ? `Paused at step ${Math.max(1, phaseIndex + 1)} of ${PHASES.length}`
                      : `Step ${Math.max(1, phaseIndex + 1)} of ${PHASES.length}`}
                </span>
                <strong className="ar-phase-title">
                  {complete
                    ? run.status === "completed"
                      ? "Run complete"
                      : "Run finished — some reads need attention"
                    : run.phase.label}
                </strong>
                <p className="ar-phase-explainer">
                  {complete
                    ? "Everything below is saved with receipts. Review the recommended Jira changes and the recap — nothing was changed without them."
                    : paused
                      ? "The run stopped safely. Every source keeps its last confirmed position, so resuming loses nothing."
                      : explainer}
                </p>
                {running && <p className="ar-phase-activity">{run.activity}</p>}
              </div>
              {running && (
                <button
                  type="button"
                  className="ar-stop"
                  onClick={() => void stop()}
                  disabled={working || run.status === "stopping"}
                >
                  <Square size={14} /> {run.status === "stopping" ? "Stopping" : "Stop"}
                </button>
              )}
            </div>

            <div
              className="ar-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={PHASES.length}
              aria-valuenow={complete ? PHASES.length : Math.max(0, phaseIndex)}
              aria-label="Run progress"
            >
              {PHASES.map(([id], index) => {
                const state = complete
                  ? "complete"
                  : index < phaseIndex
                    ? "complete"
                    : index === phaseIndex
                      ? paused
                        ? "paused"
                        : "active"
                      : "waiting";
                return <span key={id} data-state={state} />;
              })}
            </div>

            <ol className="ar-phases" aria-label="Run phases">
              {PHASES.map(([id, phaseLabel], index) => {
                const state = complete
                  ? "complete"
                  : index < phaseIndex
                    ? "complete"
                    : index === phaseIndex
                      ? "active"
                      : "waiting";
                return (
                  <li key={id} data-state={state}>
                    {state === "complete" ? <Check size={13} /> : <Circle size={10} />}
                    <span>{phaseLabel}</span>
                  </li>
                );
              })}
            </ol>

            <div className="ar-theater-foot">
              <span>
                Scanning {formatTime(windowRange?.from)} to {formatTime(windowRange?.to)}
                {windowRange?.overlapMinutes ? ` · ${windowRange.overlapMinutes}-min overlap` : ""}
              </span>
              <span className="ar-safety">
                <ShieldCheck size={13} /> Read-only until you approve changes
              </span>
            </div>
          </div>

          {(running || feed.length > 0) && (
            <section className="ar-section ar-feed-section" aria-labelledby="activity-feed-title">
              <div className="ar-section-heading">
                <div>
                  <span>Receipts</span>
                  <h3 id="activity-feed-title">Live activity log</h3>
                </div>
                <small>
                  <ScrollText size={13} /> Every line is a saved event on this run
                </small>
              </div>
              <ol className="ar-feed" data-live={running || undefined}>
                {running && (
                  <li className="ar-feed-now" aria-hidden="true">
                    <time>{formatClock(new Date(now).toISOString())}</time>
                    <span>
                      {run.activity}
                      <i className="ar-caret" />
                    </span>
                  </li>
                )}
                {feed.length === 0 && !running && (
                  <li>
                    <time>--:--:--</time>
                    <span>No events were recorded on this run.</span>
                  </li>
                )}
                {feed.map((event) => (
                  <li key={event.id} data-type={event.type}>
                    <time>{formatClock(event.at)}</time>
                    <span>{event.detail}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <fieldset className="ar-counts">
            <legend className="wb-sr-only">Run counts</legend>
            <div>
              <strong key={run.counts.observed} className="ar-count-value">
                {run.counts.observed}
              </strong>
              <span>Observed</span>
            </div>
            <div>
              <strong key={run.counts.new + run.counts.changed} className="ar-count-value">
                {run.counts.new + run.counts.changed}
              </strong>
              <span>New or changed</span>
            </div>
            <div>
              <strong key={run.counts.meetingsProcessed} className="ar-count-value">
                {run.counts.meetingsProcessed}
              </strong>
              <span>Meetings complete</span>
            </div>
            <div>
              <strong key={run.counts.meetingsPending} className="ar-count-value">
                {run.counts.meetingsPending}
              </strong>
              <span>Meetings pending</span>
            </div>
            <div>
              <strong key={run.counts.jiraProposals} className="ar-count-value">
                {run.counts.jiraProposals}
              </strong>
              <span>Recommended Jira changes</span>
            </div>
            <div data-alert={run.counts.failures > 0 || undefined}>
              <strong key={run.counts.failures} className="ar-count-value">
                {run.counts.failures}
              </strong>
              <span>Source or meeting failures</span>
            </div>
          </fieldset>

          <section className="ar-section" aria-labelledby="activity-sources-title">
            <div className="ar-section-heading">
              <div>
                <span>Coverage</span>
                <h3 id="activity-sources-title">Source reads</h3>
              </div>
              <small>
                {sourcesDone} of {sources.length} sources read · each advances only after its own
                successful read
              </small>
            </div>
            <div className="ar-source-grid">
              {sources.map((source) => (
                <SourceCard key={source.id} source={source} />
              ))}
            </div>
          </section>

          {run.meetings.length > 0 && (
            <section className="ar-section" aria-labelledby="activity-meetings-title">
              <div className="ar-section-heading">
                <div>
                  <span>Meeting recovery</span>
                  <h3 id="activity-meetings-title">Completed meetings</h3>
                </div>
              </div>
              <div className="ar-meeting-list">
                {run.meetings.map((meeting) => (
                  <article key={meeting.evidenceId} data-status={meeting.status}>
                    <div>
                      <strong>{meeting.title}</strong>
                      <span>{label(meeting.status)}</span>
                    </div>
                    <p>{meeting.detail}</p>
                    {(meeting.links || []).map((link) => (
                      <a
                        key={link.href}
                        href={openHref(link.href)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {link.label} <ExternalLink size={13} />
                      </a>
                    ))}
                  </article>
                ))}
              </div>
            </section>
          )}

          {COMPLETE.has(run.status) && (
            <section className="ar-section ar-review" aria-labelledby="activity-jira-review-title">
              <div className="ar-section-heading">
                <div>
                  <span>Approval required</span>
                  <h3 id="activity-jira-review-title">Review recommended Jira changes</h3>
                </div>
                <small>
                  {run.jiraProposals.length} recommended change
                  {run.jiraProposals.length === 1 ? "" : "s"}
                </small>
              </div>
              <div className="ar-review-notice">
                <ShieldCheck size={17} />
                <p>
                  No Jira change happens until you select proposals and enter the confirmation text.
                  Email items remain drafts here.
                </p>
              </div>
              {run.jiraProposals.length === 0 ? (
                <p className="ar-empty-copy">No Jira change is proposed for this run.</p>
              ) : (
                <>
                  <label className="ar-select-all" data-testid="activity-select-all">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                    <span>
                      {allSelected
                        ? "Clear the whole selection"
                        : `Select all ${run.jiraProposals.length} proposals`}
                    </span>
                  </label>
                  <div className="ar-proposal-list">
                    {run.jiraProposals.map((proposal) => (
                      <article
                        key={proposal.id}
                        className="ar-proposal"
                        data-selected={selected.has(proposal.id)}
                      >
                        <label>
                          <input
                            type="checkbox"
                            checked={selected.has(proposal.id)}
                            onChange={() => toggleProposal(proposal.id)}
                          />
                          <span>
                            <strong>{proposal.title}</strong>
                            <small>
                              {proposal.actionLabel} · {label(proposal.confidence)} match
                              {proposal.requiresTargetReview ? " · Confirm suggested target" : ""}
                            </small>
                          </span>
                        </label>
                        <details>
                          <summary>
                            Review exact effects <ChevronDown size={14} />
                          </summary>
                          <ProposalChange proposal={proposal} />
                        </details>
                      </article>
                    ))}
                  </div>
                </>
              )}

              {selectedProposals.length > 0 && (
                <div className="ar-approval" data-testid="activity-jira-approval">
                  <label htmlFor="activity-confirmation">
                    Type <code>{expectedConfirmation}</code>
                  </label>
                  <input
                    id="activity-confirmation"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="ar-danger"
                    disabled={working || confirmation !== expectedConfirmation}
                    onClick={() => void apply()}
                  >
                    {working ? (
                      <LoaderCircle className="ar-spin" size={16} />
                    ) : (
                      <ShieldCheck size={16} />
                    )}
                    Apply selected Jira changes
                  </button>
                </div>
              )}
              {receipt?.status === "complete" && (
                <div className="ar-receipt" role="status">
                  <CheckCircle2 size={17} />
                  <span>
                    {receipt.results.length} approved Jira proposal
                    {receipt.results.length === 1 ? "" : "s"} applied with saved readback receipts.
                  </span>
                  <code>{receipt.id.slice(0, 12)}</code>
                </div>
              )}
            </section>
          )}

          {COMPLETE.has(run.status) && run.mdmCheck && (
            <section
              className="ar-section ar-mdm-check"
              aria-labelledby="activity-mdm-check-title"
              data-testid="activity-mdm-check"
              data-status={run.mdmCheck.status}
            >
              <div className="ar-section-heading">
                <div>
                  <span>Chained check</span>
                  <h3 id="activity-mdm-check-title">MDM check (Jira vs. Brain)</h3>
                </div>
                {run.mdmCheck.status === "completed" ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <AlertCircle size={18} />
                )}
              </div>
              {run.mdmCheck.status === "completed" ? (
                <div className="ar-mdm-check-body">
                  <p>
                    The Jira-vs-Brain check ran automatically after this scan and proposed{" "}
                    <strong>
                      {run.mdmCheck.proposalCount ?? 0} correction
                      {run.mdmCheck.proposalCount === 1 ? "" : "s"}
                    </strong>
                    . Corrections are applied from the Reconcile MDM review, with the same selection
                    and confirmation flow as this one.
                  </p>
                  {onOpenMdmReview && (run.mdmCheck.proposalCount ?? 0) > 0 && (
                    <button
                      type="button"
                      className="ar-primary"
                      onClick={onOpenMdmReview}
                      data-testid="activity-open-mdm-review"
                    >
                      <ShieldCheck size={16} /> Open the MDM review
                    </button>
                  )}
                </div>
              ) : (
                <p className="ar-mdm-check-body">
                  The chained MDM check did not complete:{" "}
                  {run.mdmCheck.detail || "no detail was returned"}. The activity results above are
                  unaffected; run Reconcile MDM separately when Jira is reachable.
                </p>
              )}
            </section>
          )}

          {run.emailDrafts.length > 0 && (
            <section className="ar-section" aria-labelledby="activity-email-title">
              <div className="ar-section-heading">
                <div>
                  <span>Draft only</span>
                  <h3 id="activity-email-title">Email follow-ups</h3>
                </div>
                <Mail size={18} />
              </div>
              <div className="ar-draft-list">
                {run.emailDrafts.map((draft) => (
                  <details key={draft.id}>
                    <summary>
                      <strong>{draft.subject}</strong>
                      <span>{draft.to || "Recipient needs review"}</span>
                      {draft.outlook?.status === "created" && (
                        <em className="ar-outlook-chip" data-state="created">
                          In your Outlook Drafts
                        </em>
                      )}
                      {draft.outlook?.status === "failed" && (
                        <em className="ar-outlook-chip" data-state="failed">
                          Outlook draft failed
                        </em>
                      )}
                      {draft.outlook?.status === "recipient_review" && (
                        <em className="ar-outlook-chip" data-state="recipient_review">
                          Needs a recipient first
                        </em>
                      )}
                    </summary>
                    {draft.outlook?.status === "failed" && draft.outlook.detail && (
                      <p className="ar-outlook-failure">{draft.outlook.detail}</p>
                    )}
                    <pre>{draft.body}</pre>
                  </details>
                ))}
              </div>
            </section>
          )}

          {COMPLETE.has(run.status) && (
            <section className="ar-section ar-recap" aria-labelledby="activity-recap-title">
              <div className="ar-section-heading">
                <div>
                  <span>Changes only</span>
                  <h3 id="activity-recap-title" ref={recapRef} tabIndex={-1}>
                    Run recap
                  </h3>
                </div>
                <small>
                  {run.recap?.changedItemCount || 0} changes · {run.recap?.proposalCount || 0}{" "}
                  proposals
                </small>
              </div>
              {!run.recap?.groups.length ? (
                <div className="ar-empty-result">
                  <CheckCircle2 size={20} />
                  <div>
                    <strong>No new activity required changes</strong>
                    <span>Source coverage and the scan period remain saved above.</span>
                  </div>
                </div>
              ) : (
                <div className="ar-recap-groups">
                  {run.recap.groups.map((group) => (
                    <article key={group.sourceId}>
                      <h4>{group.sourceLabel}</h4>
                      {group.destinations.map((destination) => (
                        <div key={destination.id}>
                          <strong>{destination.label}</strong>
                          <ul>
                            {destination.items.map((item) => (
                              <li key={item.id}>
                                <div>
                                  <span>{item.title}</span>
                                  <small>{item.detail}</small>
                                  {receiptLabel(item.receipt) && (
                                    <code className="ar-recap-receipt">
                                      Receipt: {receiptLabel(item.receipt)}
                                    </code>
                                  )}
                                </div>
                                {item.links
                                  .filter((link) => link.href)
                                  .map((link) => (
                                    <a
                                      key={link.label}
                                      href={link.href ? openHref(link.href) : undefined}
                                      target="_blank"
                                      rel="noreferrer"
                                      aria-label={`Open ${link.label}`}
                                    >
                                      <ExternalLink size={13} />
                                    </a>
                                  ))}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          <footer className="ar-footer">
            {(run.status === "canceled" || run.status === "interrupted") && (
              <button
                type="button"
                className="ar-primary"
                onClick={() => void resume()}
                disabled={working}
              >
                {working ? <LoaderCircle className="ar-spin" size={16} /> : <Play size={16} />}{" "}
                Resume saved run
              </button>
            )}
            {COMPLETE.has(run.status) && (
              <button
                type="button"
                className="ar-primary"
                onClick={() => void start()}
                disabled={working}
              >
                {working ? <LoaderCircle className="ar-spin" size={16} /> : <RefreshCw size={16} />}{" "}
                Reconcile new activity
              </button>
            )}
            <button type="button" className="ar-secondary" onClick={onClose}>
              Close
            </button>
          </footer>
        </>
      )}
    </section>
  );
}
