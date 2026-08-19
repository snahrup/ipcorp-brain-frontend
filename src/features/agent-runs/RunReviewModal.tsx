import {
  AlertCircle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Circle,
  CircleAlert,
  CornerDownRight,
  ListChecks,
  LoaderCircle,
  MessageSquareText,
  MessagesSquare,
  Paperclip,
  Send,
  SkipForward,
  User,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "../../lib/useBodyScrollLock";
import { describeAction } from "../jira/AgentActivity";
import { agentRunsGateway } from "./api";
import { runDuration, runPresentation, startedLabel } from "./format";
import type { AgentRunSummary, PlanStep, RunDetail, RunQuestion } from "./types";

/**
 * The review modal: what the run was asked, how it decided to approach it, the
 * plan it worked against, what it said while working, and what it delivered,
 * in that order. Live runs keep updating in place; finished runs read the same
 * way days later.
 *
 * Two actions exist here and nowhere else on the screen: asking a question
 * (answered by a companion session with this run's record, never by
 * interrupting the worker) and requesting changes (which starts a new,
 * linked run on the same ticket). Nothing else starts, stops or alters a run.
 */

const LIVE_POLL_MS = 1500;
const QUESTION_POLL_MS = 2500;
const CLIP_AT = 900;

const TIME = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

function at(iso: string) {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? TIME.format(date) : "";
}

function StepIcon({ step, live }: { step: PlanStep; live: boolean }) {
  if (step.status === "done") return <CheckCircle2 size={15} aria-hidden="true" />;
  if (step.status === "skipped") return <SkipForward size={15} aria-hidden="true" />;
  if (step.status === "failed") return <XCircle size={15} aria-hidden="true" />;
  if (step.status === "active" && live)
    return <LoaderCircle className="wb-spin" size={15} aria-hidden="true" />;
  if (step.status === "active") return <CircleAlert size={15} aria-hidden="true" />;
  return <Circle size={15} aria-hidden="true" />;
}

function stepStateLabel(step: PlanStep, live: boolean): string | null {
  if (step.status === "active") return live ? "In progress" : "Started, never reported done";
  if (step.status === "skipped") return "Skipped";
  if (step.status === "failed") return "Failed";
  return null;
}

export function RunReviewModal({
  runId,
  summary,
  onClose,
  onRunsChanged,
}: {
  runId: string;
  /** The list row, so the header can render while the record loads. */
  summary: AgentRunSummary | null;
  onClose: () => void;
  /** Called after a change request starts a new run, so the list re-reads. */
  onRunsChanged: () => void;
}) {
  useBodyScrollLock();

  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);

  const [questions, setQuestions] = useState<RunQuestion[] | null>(null);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [questionDraft, setQuestionDraft] = useState("");
  const [asking, setAsking] = useState(false);

  const [changeDraft, setChangeDraft] = useState("");
  const [changeBusy, setChangeBusy] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeStarted, setChangeStarted] = useState<AgentRunSummary | null>(null);

  const backdropPressRef = useRef(false);
  const notesRef = useRef<HTMLDivElement | null>(null);

  const loadDetail = useCallback(async () => {
    try {
      setDetail(await agentRunsGateway.detail(runId));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The run record could not be read.");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  const loadQuestions = useCallback(async () => {
    try {
      setQuestions(await agentRunsGateway.questions(runId));
      setQuestionsError(null);
    } catch (cause) {
      setQuestionsError(
        cause instanceof Error ? cause.message : "The question thread could not be read."
      );
    }
  }, [runId]);

  useEffect(() => {
    void loadDetail();
    void loadQuestions();
  }, [loadDetail, loadQuestions]);

  const live = detail?.state === "running";

  // A live run keeps the record moving; a finished one is read from disk once
  // and never changes, so there is nothing to poll.
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => void loadDetail(), LIVE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [live, loadDetail]);

  const answering = useMemo(
    () => (questions ?? []).some((entry) => entry.state === "answering"),
    [questions]
  );
  useEffect(() => {
    if (!answering) return;
    const timer = window.setInterval(() => void loadQuestions(), QUESTION_POLL_MS);
    return () => window.clearInterval(timer);
  }, [answering, loadQuestions]);

  // Live clock for the header duration.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Follow the tail of the working notes while live, but only when already at
  // the bottom, so reading an earlier note is never yanked away.
  const noteCount = detail?.review.messages.length ?? 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: live is read in the guard and must re-run the follow when a run starts streaming
  useEffect(() => {
    const node = notesRef.current;
    if (!node || !live) return;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
    if (nearBottom) node.scrollTop = node.scrollHeight;
  }, [noteCount, live]);

  const ask = async () => {
    const question = questionDraft.trim();
    if (!question || asking) return;
    setAsking(true);
    setQuestionsError(null);
    try {
      setQuestions(await agentRunsGateway.ask(runId, question));
      setQuestionDraft("");
    } catch (cause) {
      setQuestionsError(cause instanceof Error ? cause.message : "The question was not sent.");
    } finally {
      setAsking(false);
    }
  };

  const requestChanges = async () => {
    const instruction = changeDraft.trim();
    if (!instruction || changeBusy) return;
    setChangeBusy(true);
    setChangeError(null);
    try {
      const started = await agentRunsGateway.requestChanges(runId, instruction);
      setChangeStarted(started);
      setChangeDraft("");
      onRunsChanged();
    } catch (cause) {
      setChangeError(
        cause instanceof Error ? cause.message : "The follow-up run could not be started."
      );
    } finally {
      setChangeBusy(false);
    }
  };

  const header = detail ?? summary;
  const presentation = header ? runPresentation(header) : null;
  const agentSpoke = detail?.review.messages.filter((m) => m.role === "agent") ?? [];
  const doing = live ? (describeAction(detail?.lastAction ?? null) ?? "Getting started") : null;

  return createPortal(
    // Same light-dismiss scrim as the Jira issue modal: Escape and the labelled
    // X are the accessible paths; the press must start on the backdrop itself.
    // biome-ignore lint/a11y/noStaticElementInteractions: light-dismiss scrim; Escape and the Close button are the accessible paths
    <div
      className="wb-modal-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        backdropPressRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        const startedHere = backdropPressRef.current;
        backdropPressRef.current = false;
        if (startedHere && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="wb-runs-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-review-title"
      >
        <header className="wb-runs-modal-header">
          <div>
            <div className="wb-runs-modal-meta">
              <span className="wb-runs-key">{header?.issueKey ?? "Run"}</span>
              {presentation && (
                <span className="wb-status-chip" data-tone={presentation.tone}>
                  {presentation.label}
                </span>
              )}
              {header?.followsRun && (
                <span className="wb-runs-follows">
                  <CornerDownRight size={12} aria-hidden="true" />
                  Follow-up run
                </span>
              )}
            </div>
            <h2 id="run-review-title">{header?.issueSummary || header?.issueKey || "Agent run"}</h2>
            {header && (
              <div className="wb-runs-modal-meta">
                <span>{header.sessionName || header.agentLabel}</span>
                {header.sessionName && (
                  <>
                    <span className="wb-runs-meta-sep">·</span>
                    <span>{header.agentLabel}</span>
                  </>
                )}
                <span className="wb-runs-meta-sep">·</span>
                {header.model ? <code>{header.model}</code> : <span>model not recorded</span>}
                <span className="wb-runs-meta-sep">·</span>
                <span>
                  {startedLabel(header.startedAt)}, {live ? "running" : "ran"}{" "}
                  {runDuration(header.startedAt, header.finishedAt, now)}
                </span>
              </div>
            )}
          </div>
          <div className="wb-modal-header-actions">
            <a
              href={`https://ip-corporation.atlassian.net/browse/${header?.issueKey ?? ""}`}
              target="_blank"
              rel="noreferrer"
              className="wb-secondary-button"
            >
              Open in Jira <ArrowUpRight size={15} />
            </a>
            <button
              type="button"
              className="wb-icon-button"
              onClick={onClose}
              aria-label="Close run review"
            >
              <X size={19} />
            </button>
          </div>
        </header>

        {loading ? (
          <div className="wb-modal-state">
            <LoaderCircle className="wb-spin" size={26} />
            <strong>Reading the run record…</strong>
            <span>Nothing is substituted while the record loads.</span>
          </div>
        ) : error && !detail ? (
          <div className="wb-modal-state wb-modal-state-error">
            <AlertCircle size={27} />
            <strong>Run record unavailable</strong>
            <span>{error}</span>
            <button type="button" className="wb-primary-button" onClick={() => void loadDetail()}>
              Try again
            </button>
          </div>
        ) : detail ? (
          <div className="wb-runs-modal-body">
            {detail.error && (
              <div className="wb-runs-error" role="alert">
                <AlertCircle size={15} aria-hidden="true" />
                {detail.error}
              </div>
            )}

            {detail.review.recordLevel === "summary" && (
              <div className="wb-runs-honesty" role="status">
                <CircleAlert size={15} aria-hidden="true" />
                <span>
                  Only the outcome summary of this run was kept. The instruction, plan and
                  conversation were not archived, so they cannot be shown.
                </span>
              </div>
            )}

            {detail.review.recordLevel === "full" && (
              <>
                <section className="wb-runs-section" aria-label="The request">
                  <header>
                    <MessageSquareText size={15} aria-hidden="true" />
                    <h3>What Steve asked it to do</h3>
                    <small>the exact instruction the run received</small>
                  </header>
                  {detail.review.request ? (
                    <>
                      <pre
                        className="wb-runs-request"
                        data-clipped={
                          detail.review.request.length > CLIP_AT && !requestOpen
                            ? "true"
                            : undefined
                        }
                      >
                        {detail.review.request}
                      </pre>
                      {detail.review.request.length > CLIP_AT && (
                        <button
                          type="button"
                          className="wb-runs-more"
                          onClick={() => setRequestOpen((open) => !open)}
                        >
                          {requestOpen ? "Show less" : "Show the full instruction"}
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="wb-runs-missing">
                      The instruction was not recorded for this run.
                    </p>
                  )}
                </section>

                <section className="wb-runs-section" aria-label="The approach">
                  <header>
                    <Bot size={15} aria-hidden="true" />
                    <h3>How it decided to approach it</h3>
                    <small>stated before the work began</small>
                  </header>
                  {detail.review.approach ? (
                    <p className="wb-runs-approach">{detail.review.approach}</p>
                  ) : (
                    <p className="wb-runs-missing">
                      This run did not state an approach. Runs before the plan-reporting change do
                      not carry one.
                    </p>
                  )}
                </section>

                <section className="wb-runs-section" aria-label="The plan">
                  <header>
                    <ListChecks size={15} aria-hidden="true" />
                    <h3>The plan</h3>
                    {detail.review.plan && (
                      <small>
                        {detail.review.plan.filter((s) => s.status === "done").length} of{" "}
                        {detail.review.plan.length} steps complete
                      </small>
                    )}
                  </header>
                  {detail.review.plan ? (
                    <ol className="wb-runs-plan">
                      {detail.review.plan.map((step) => {
                        const state = stepStateLabel(step, live);
                        return (
                          <li className="wb-runs-step" data-status={step.status} key={step.n}>
                            <span className="wb-runs-step-icon">
                              <StepIcon step={step} live={live} />
                            </span>
                            <div>
                              <span className="wb-runs-step-title">
                                {step.n}. {step.title}
                              </span>
                              {state && <span className="wb-runs-step-state">{state}</span>}
                              {step.reason && (
                                <span className="wb-runs-step-note">{step.reason}</span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="wb-runs-missing">
                      This run predates plan reporting and recorded no plan. Nothing is
                      reconstructed after the fact.
                    </p>
                  )}
                </section>

                <section className="wb-runs-section" aria-label="Working notes">
                  <header>
                    <MessagesSquare size={15} aria-hidden="true" />
                    <h3>What it said while working</h3>
                    <small>
                      {agentSpoke.length === 0
                        ? live
                          ? "waiting for the first note"
                          : "no notes recorded"
                        : `${agentSpoke.length} ${agentSpoke.length === 1 ? "note" : "notes"}, in order`}
                    </small>
                  </header>
                  {agentSpoke.length > 0 && (
                    <div className="wb-runs-notes" ref={notesRef}>
                      {agentSpoke.map((message) => (
                        <article
                          className="wb-runs-note"
                          data-role={message.role}
                          key={message.seq}
                        >
                          <header>
                            <MessagesSquare size={12} aria-hidden="true" />
                            <strong>{detail.agentLabel}</strong>
                            <time dateTime={message.at}>{at(message.at)}</time>
                          </header>
                          <p>{message.text}</p>
                        </article>
                      ))}
                    </div>
                  )}
                  {live && (
                    <p className="wb-runs-note-pending" role="status">
                      <LoaderCircle className="wb-spin" size={14} aria-hidden="true" />
                      {detail.agentLabel} is still working{doing ? `: ${doing.toLowerCase()}` : ""}
                      {detail.steps > 0
                        ? ` (${detail.steps} ${detail.steps === 1 ? "step" : "steps"} so far)`
                        : ""}
                    </p>
                  )}
                </section>
              </>
            )}

            <section className="wb-runs-section" aria-label="What it delivered">
              <header>
                <Paperclip size={15} aria-hidden="true" />
                <h3>What it delivered</h3>
              </header>
              {detail.state === "running" && detail.attachments === null ? (
                <p className="wb-runs-missing">
                  Nothing yet. Files attach to the ticket when the run finishes.
                </p>
              ) : detail.attachments === null ? (
                <p className="wb-runs-missing">
                  Deliverables were not recorded for this run. The ticket itself is the record.
                </p>
              ) : detail.attachments.length === 0 ? (
                <p className="wb-runs-missing">No files were attached to the ticket by this run.</p>
              ) : (
                <div className="wb-runs-files">
                  {detail.attachments.map((file) => (
                    <div
                      className="wb-runs-file"
                      data-ok={file.ok ? "true" : "false"}
                      key={file.path}
                    >
                      {file.ok ? (
                        <CheckCircle2 size={14} aria-hidden="true" />
                      ) : (
                        <XCircle size={14} aria-hidden="true" />
                      )}
                      <code>{file.path}</code>
                      {!file.ok && <small>{file.error || "upload failed"}</small>}
                    </div>
                  ))}
                </div>
              )}
              {detail.review.postedComment ? (
                <>
                  <header>
                    <MessageSquareText size={15} aria-hidden="true" />
                    <h3>The comment it posted</h3>
                  </header>
                  <div className="wb-runs-comment">{detail.review.postedComment}</div>
                </>
              ) : detail.state === "finished" ? (
                <p className="wb-runs-missing">
                  The record does not carry the posted comment. The ticket has the final text.
                </p>
              ) : null}
            </section>

            <section className="wb-runs-section" aria-label="Questions about this run">
              <header>
                <MessagesSquare size={15} aria-hidden="true" />
                <h3>Ask about the work</h3>
                <small>kept with the run</small>
              </header>
              <div className="wb-runs-honesty">
                <CircleAlert size={15} aria-hidden="true" />
                <span>
                  Answers come from a separate session reviewing this run's record, not from the
                  agent that did the work. A running agent is never interrupted.
                </span>
              </div>
              {questionsError && (
                <div className="wb-runs-error" role="alert">
                  <AlertCircle size={15} aria-hidden="true" />
                  {questionsError}
                </div>
              )}
              {(questions ?? []).length > 0 && (
                <div className="wb-runs-qa">
                  {(questions ?? []).map((entry) => (
                    <div className="wb-runs-question" key={entry.id}>
                      <div className="wb-runs-q">
                        <header>
                          <User size={11} aria-hidden="true" />
                          <strong>You asked</strong>
                          <time dateTime={entry.askedAt}>{at(entry.askedAt)}</time>
                        </header>
                        {entry.question}
                      </div>
                      {entry.state === "answering" ? (
                        <div className="wb-runs-a" role="status">
                          <header>
                            <LoaderCircle className="wb-spin" size={11} aria-hidden="true" />
                            <strong>A review session is reading the run</strong>
                          </header>
                          Answer on its way. It stays here when it lands.
                        </div>
                      ) : (
                        <div className="wb-runs-a" data-state={entry.state}>
                          <header>
                            <MessagesSquare size={11} aria-hidden="true" />
                            <strong>Review session</strong>
                            {entry.answeredAt && (
                              <time dateTime={entry.answeredAt}>{at(entry.answeredAt)}</time>
                            )}
                          </header>
                          {entry.state === "failed"
                            ? entry.error || "The review session failed to answer."
                            : entry.answer}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="wb-runs-composer">
                <textarea
                  value={questionDraft}
                  onChange={(event) => setQuestionDraft(event.target.value)}
                  placeholder="Why was this choice made? What does the attached file contain?"
                  rows={2}
                />
                <div className="wb-runs-composer-actions">
                  <button
                    type="button"
                    className="wb-secondary-button"
                    disabled={asking || !questionDraft.trim()}
                    onClick={() => void ask()}
                  >
                    <Send size={15} />
                    {asking ? "Sending…" : "Ask"}
                  </button>
                  <small>Works the same on a run that finished days ago.</small>
                </div>
              </div>
            </section>

            <section className="wb-runs-section" aria-label="Request changes">
              <header>
                <CornerDownRight size={15} aria-hidden="true" />
                <h3>Request changes</h3>
              </header>
              <p
                className="wb-runs-approach"
                style={{ fontSize: "12.5px", color: "var(--text-soft)" }}
              >
                This starts a new run on {detail.issueKey} carrying your request and this run's
                record as its instruction. It appears in the list linked to this one. This run
                itself is never altered.
              </p>
              {changeError && (
                <div className="wb-runs-error" role="alert">
                  <AlertCircle size={15} aria-hidden="true" />
                  {changeError}
                </div>
              )}
              {changeStarted ? (
                <div className="wb-runs-notice" role="status">
                  <CheckCircle2 size={15} aria-hidden="true" />
                  <span>
                    A follow-up run on {changeStarted.issueKey} started with{" "}
                    {changeStarted.agentLabel} and is now in the list, linked to this run.
                  </span>
                </div>
              ) : (
                <div className="wb-runs-composer">
                  <textarea
                    value={changeDraft}
                    onChange={(event) => setChangeDraft(event.target.value)}
                    placeholder="What should be different about the delivered work"
                    rows={3}
                  />
                  <div className="wb-runs-composer-actions">
                    <button
                      type="button"
                      className="wb-primary-button"
                      disabled={changeBusy || !changeDraft.trim()}
                      onClick={() => void requestChanges()}
                    >
                      {changeBusy ? (
                        <LoaderCircle className="wb-spin" size={15} />
                      ) : (
                        <CornerDownRight size={15} />
                      )}
                      {changeBusy ? "Starting…" : "Start a follow-up run"}
                    </button>
                    <small>Runs with the same agent, {detail.agentLabel}.</small>
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </section>
    </div>,
    document.body
  );
}
