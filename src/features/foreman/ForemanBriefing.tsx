import { AlertCircle, ArrowRight, LoaderCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { GATEWAY } from "../../lib/gateway";
import {
  type BriefingStage,
  nextStage,
  restoreStage,
  serializeStage,
  toQuickBrief,
} from "./machine";
import "./foreman.css";

const DAY_MS = 86_400_000;

type BriefingAnswer = {
  verb: string;
  at: string;
  ballpark?: string;
  snooze?: { returnAt: string; wakeOnActivity?: boolean };
  note?: string;
};

type BriefingItem = {
  id: string;
  kind: string;
  hash: string;
  summary: string;
  dueDate: string | null;
  priority?: string | null;
  sourceRefs: string[];
  answer?: BriefingAnswer;
};

type BriefingNarration = {
  arrival: string;
  orientation: string;
  changes: Record<string, string>;
  items: Record<string, { whyNow: string }>;
  clear: string;
};

type BriefingRun = {
  runId: string;
  date: string;
  generatedAt: string | null;
  narration?: BriefingNarration;
  narrationStatus?: string;
  sources: Record<string, { status: string; observedAt: string | null; detail?: string | null }>;
  counts: { upFirst: number; waiting: number | null; open: number };
  closeOut: { answered: number; unanswered: number; verbs?: Record<string, number> };
  changes: Array<{ key: string; summary: string; status: string }>;
  items: BriefingItem[];
  parked: Array<{ id: string; returnAt: string; wakeOnActivity: boolean }>;
  suppressed: Array<{ id: string; reason: string }>;
  exclusions: Array<{ id: string; reason: string }>;
  receipts: Array<{ at: string; itemId: string; verb: string; routedTo: string }>;
};

export function foremanBriefingEnabled(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get("briefing") === "1") return true;
    return window.localStorage.getItem("foreman-briefing") === "on";
  } catch {
    return false;
  }
}

async function readBriefing(): Promise<BriefingRun> {
  const response = await fetch(`${GATEWAY}/foreman/briefing`);
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    data?: BriefingRun;
    error?: string;
  } | null;
  if (!response.ok || !payload?.ok || !payload.data) {
    throw new Error(payload?.error || `The briefing read returned HTTP ${response.status}.`);
  }
  return payload.data;
}

async function postAnswer(body: {
  itemId: string;
  verb: string;
  ballpark?: string;
  snooze?: { returnAt: string };
}): Promise<BriefingRun> {
  const response = await fetch(`${GATEWAY}/foreman/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    data?: BriefingRun;
    error?: string;
  } | null;
  if (!response.ok || !payload?.ok || !payload.data) {
    throw new Error(payload?.error || `The answer write returned HTTP ${response.status}.`);
  }
  return payload.data;
}

async function postNarrate(): Promise<BriefingRun> {
  const response = await fetch(`${GATEWAY}/foreman/narrate`, { method: "POST" });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    data?: BriefingRun;
    error?: string;
  } | null;
  if (!response.ok || !payload?.ok || !payload.data) {
    throw new Error(payload?.error || `The narration returned HTTP ${response.status}.`);
  }
  return payload.data;
}

function day(value?: string | null) {
  if (!value) return null;
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function dueLabel(value: string | null, todayUtc: number) {
  const due = day(value);
  if (due === null) return null;
  const diff = Math.round((due - todayUtc) / DAY_MS);
  if (diff < -1) return `${Math.abs(diff)} days overdue`;
  if (diff === -1) return "1 day overdue";
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `Due in ${diff} days`;
}

function greeting(now: Date) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning, Steve.";
  if (hour < 17) return "Good afternoon, Steve.";
  return "Good evening, Steve.";
}

function tomorrowOf(date: string) {
  const num = day(date);
  if (num === null) return date;
  return new Date(num + DAY_MS).toISOString().slice(0, 10);
}

const KIND_LABEL: Record<string, string> = {
  "start-work": "START WORK",
  estimate: "GIVE A BALLPARK",
};

const BALLPARKS = ["15m", "30m", "1h", "Half day"];
const STAGE_KEY = "foreman-briefing-stage";

export function ForemanBriefing() {
  const [run, setRun] = useState<BriefingRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [stage, setStage] = useState<BriefingStage>({ kind: "arrival" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRun(await readBriefing());
    } catch (cause) {
      setRun(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const itemCount = run?.items.length ?? 0;

  // Resumability: restore exactly once after the first briefing arrives.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !run) return;
    restored.current = true;
    try {
      const raw = window.sessionStorage.getItem(STAGE_KEY);
      if (raw) setStage(restoreStage(raw, run.items.length));
    } catch {
      // A blocked sessionStorage read just means the briefing starts at arrival.
    }
  }, [run]);

  // Quick brief is an escape overlay, not progress, so it is never saved as
  // the resume point; the last guided stage is what a reload comes back to.
  // Saving waits for the restore attempt: the mount-time arrival stage must
  // not clobber the saved resume point before restore has read it.
  useEffect(() => {
    if (!restored.current) return;
    if (stage.kind === "quick-brief") return;
    try {
      window.sessionStorage.setItem(STAGE_KEY, serializeStage(stage));
    } catch {
      // Nothing to do; the stage simply will not resume.
    }
  }, [stage]);

  const advance = useCallback(() => {
    setStage((current) =>
      current.kind === "quick-brief" ? current : nextStage(current, itemCount)
    );
  }, [itemCount]);

  // Esc opens the quick brief; ArrowRight advances. Navigation only: no key
  // in this surface approves, dismisses, snoozes, or executes anything.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.key === "Escape") setStage(toQuickBrief());
      else if (event.key === "ArrowRight") advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance]);

  // Arming the countdown is the human-visit signal for the calendar. It fires
  // once per page open; failure is quiet because the next visit re-arms.
  const armFired = useRef(false);
  useEffect(() => {
    if (!run || armFired.current) return;
    armFired.current = true;
    void fetch(`${GATEWAY}/foreman/countdown/arm`, { method: "POST" }).catch(() => {
      // Quiet: toasts simply stay un-armed until the next visit.
    });
  }, [run]);

  // Narration fires once in the background after the briefing loads. Its
  // failure is quiet on purpose: the mechanical copy IS the fail-closed state.
  const [narrating, setNarrating] = useState(false);
  const narrateFired = useRef(false);
  useEffect(() => {
    if (!run || narrateFired.current || run.narrationStatus) return;
    narrateFired.current = true;
    setNarrating(true);
    postNarrate()
      .then((updated) =>
        setRun((prev) =>
          prev && prev.receipts.length > updated.receipts.length
            ? { ...prev, narration: updated.narration, narrationStatus: updated.narrationStatus }
            : updated
        )
      )
      .catch(() => {
        // Quiet. Nothing canned ever stands in for the narration.
      })
      .finally(() => setNarrating(false));
  }, [run]);

  const answer = useCallback(
    async (
      itemId: string,
      verb: string,
      extra?: { ballpark?: string; snooze?: { returnAt: string } }
    ) => {
      if (answering) return;
      setAnswering(true);
      try {
        const updated = await postAnswer({ itemId, verb, ...extra });
        setRun((prev) => ({
          ...updated,
          narration: updated.narration ?? prev?.narration,
          narrationStatus: updated.narrationStatus ?? prev?.narrationStatus,
        }));
        setStage((current) => nextStage(current, updated.items.length));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setAnswering(false);
      }
    },
    [answering]
  );

  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  const sourceProblems = Object.entries(run?.sources ?? {})
    .filter(([, source]) => source.status !== "ok")
    .map(([id, source]) => `${id}: ${source.detail || source.status}`);

  const resumeTarget = (() => {
    try {
      return restoreStage(window.sessionStorage.getItem(STAGE_KEY), itemCount);
    } catch {
      return { kind: "arrival" } as BriefingStage;
    }
  })();

  if (loading && !run) {
    return (
      <div className="fb-root" data-testid="foreman-briefing">
        <div className="fb-center" aria-live="polite">
          <LoaderCircle className="fb-spin" size={26} aria-hidden="true" />
          <p>Reading the briefing.</p>
        </div>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="fb-root" data-testid="foreman-briefing">
        <div className="fb-center" role="alert">
          <AlertCircle size={26} aria-hidden="true" />
          <h2>The briefing could not be read</h2>
          <p>{error ?? "No briefing was returned."}</p>
          <div className="fb-btnrow">
            <button className="fb-primary" type="button" onClick={() => void load()}>
              <RefreshCw size={15} aria-hidden="true" />
              Try again
            </button>
            <a className="fb-quiet" href="/">
              Open Current State
            </a>
          </div>
          <p className="fb-footnote">Old results are not shown in its place.</p>
        </div>
      </div>
    );
  }

  const answeredReceipts = run.receipts ?? [];

  return (
    <div className="fb-root" data-testid="foreman-briefing">
      <div className="fb-stagewrap" key={serializeStage(stage)}>
        {stage.kind === "arrival" && (
          <section className="fb-stage" data-testid="fb-arrival">
            <span className="fb-kicker">THE FOREMAN BRIEFING</span>
            <h1>{greeting(now)}</h1>
            {run.narration?.arrival ? (
              <p className="fb-lede" data-testid="fb-narr-arrival">
                {run.narration.arrival}
              </p>
            ) : (
              <p className="fb-lede">
                I read the current Workbench snapshot: Jira, the agent board, reconciliation, and
                the loop.
              </p>
            )}
            <p className="fb-counts" data-testid="fb-counts">
              <b>{run.counts.upFirst} need you.</b>{" "}
              {run.counts.waiting !== null ? `${run.counts.waiting} waiting on you. ` : ""}
              {run.counts.open} open in MT.
            </p>
            <p className="fb-cost">ABOUT {Math.max(1, run.items.length)} MINUTES</p>
            <div className="fb-btnrow">
              <button className="fb-primary" type="button" onClick={advance} data-testid="fb-begin">
                BEGIN BRIEFING
              </button>
              <button
                className="fb-ghost"
                type="button"
                onClick={() => setStage(toQuickBrief())}
                data-testid="fb-open-quick-brief"
              >
                Quick Brief
              </button>
              <a className="fb-quiet" href="/">
                Current State
              </a>
            </div>
            <p className="fb-footnote">
              ESC OPENS THE QUICK BRIEF · ARROWS NAVIGATE · NOTHING EXECUTES WITHOUT A BUTTON
            </p>
            {narrating && (
              <p className="fb-footnote" data-testid="fb-writing">
                THE FOREMAN IS WRITING THE NARRATION
              </p>
            )}
          </section>
        )}

        {stage.kind === "orientation" && (
          <section className="fb-stage" data-testid="fb-orientation">
            <span className="fb-kicker">WHERE WE ARE</span>
            <h1>The signals, resolved.</h1>
            {run.narration?.orientation && (
              <p className="fb-lede" data-testid="fb-narr-orientation">
                {run.narration.orientation}
              </p>
            )}
            <ul className="fb-facts">
              {run.closeOut.answered + run.closeOut.unanswered > 0 && (
                <li>
                  Yesterday closed with {run.closeOut.answered} answered and{" "}
                  {run.closeOut.unanswered} left open.
                </li>
              )}
              <li>{run.changes.length} items changed today.</li>
              {run.counts.waiting !== null && (
                <li>{run.counts.waiting} agent items wait on you.</li>
              )}
              {sourceProblems.map((problem) => (
                <li className="fb-amber" key={problem}>
                  {problem}
                </li>
              ))}
              <li className="fb-muted">Nothing here needs you yet.</li>
            </ul>
            <div className="fb-btnrow">
              <button
                className="fb-primary"
                type="button"
                onClick={advance}
                data-testid="fb-continue"
              >
                CONTINUE
              </button>
            </div>
          </section>
        )}

        {stage.kind === "changes" && (
          <section className="fb-stage" data-testid="fb-changes">
            <span className="fb-kicker">WHAT CHANGED</span>
            <h1>
              {run.changes.length === 0
                ? "Nothing material changed."
                : `${run.changes.length} ${run.changes.length === 1 ? "thing is" : "things are"} different.`}
            </h1>
            <div className="fb-changes">
              {run.changes.map((change) => (
                <article className="fb-change" key={change.key}>
                  <span className="fb-key">{change.key}</span>
                  <div className="fb-changebody">
                    <p>{change.summary}</p>
                    {run.narration?.changes?.[change.key] && (
                      <p className="fb-narrline">{run.narration.changes[change.key]}</p>
                    )}
                  </div>
                  <span className="fb-chip">{change.status}</span>
                </article>
              ))}
            </div>
            <div className="fb-btnrow">
              <button
                className="fb-primary"
                type="button"
                onClick={advance}
                data-testid="fb-continue"
              >
                CONTINUE
              </button>
            </div>
          </section>
        )}

        {stage.kind === "item" && run.items[stage.index] && (
          <section className="fb-stage" data-testid="fb-item">
            <div className="fb-progress">
              {stage.index + 1} OF {run.items.length}
            </div>
            <span className="fb-kicker">
              {KIND_LABEL[run.items[stage.index].kind] ?? run.items[stage.index].kind.toUpperCase()}
            </span>
            <h1>{run.items[stage.index].summary}</h1>
            <p className="fb-itemmeta">
              <span className="fb-key">{run.items[stage.index].id}</span>
              {dueLabel(run.items[stage.index].dueDate, todayUtc) && (
                <span
                  className="fb-chip"
                  data-tone={
                    (day(run.items[stage.index].dueDate) ?? Number.POSITIVE_INFINITY) < todayUtc
                      ? "late"
                      : undefined
                  }
                >
                  {dueLabel(run.items[stage.index].dueDate, todayUtc)}
                </span>
              )}
              {run.items[stage.index].priority && (
                <span className="fb-chip">{run.items[stage.index].priority}</span>
              )}
            </p>
            {run.narration?.items?.[run.items[stage.index].id]?.whyNow && (
              <div className="fb-whynow" data-testid="fb-whynow">
                <div className="fb-seclabel">WHY NOW</div>
                <p>{run.narration?.items?.[run.items[stage.index].id]?.whyNow}</p>
              </div>
            )}
            {run.items[stage.index].answer ? (
              <>
                <p className="fb-answeredline" data-testid="fb-answered">
                  Answered: {run.items[stage.index].answer?.verb}
                  {run.items[stage.index].answer?.ballpark
                    ? ` (${run.items[stage.index].answer?.ballpark})`
                    : ""}
                </p>
                <div className="fb-btnrow">
                  <button
                    className="fb-primary"
                    type="button"
                    onClick={advance}
                    data-testid="fb-continue"
                  >
                    CONTINUE
                  </button>
                </div>
              </>
            ) : run.items[stage.index].kind === "estimate" ? (
              <>
                <p className="fb-lede">The Foreman needs a ballpark before this can be planned.</p>
                <div className="fb-chiprow">
                  {BALLPARKS.map((value) => (
                    <button
                      className="fb-chipbtn"
                      type="button"
                      key={value}
                      disabled={answering}
                      data-testid={`fb-ballpark-${value.replace(/\s+/g, "-").toLowerCase()}`}
                      onClick={() =>
                        void answer(run.items[stage.index].id, "ballpark", { ballpark: value })
                      }
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <div className="fb-btnrow">
                  <button
                    className="fb-ghost"
                    type="button"
                    disabled={answering}
                    data-testid="fb-snooze"
                    onClick={() =>
                      void answer(run.items[stage.index].id, "snooze", {
                        snooze: { returnAt: tomorrowOf(run.date) },
                      })
                    }
                  >
                    SNOOZE UNTIL TOMORROW
                  </button>
                  <button
                    className="fb-ghost"
                    type="button"
                    disabled={answering}
                    data-testid="fb-not-mine"
                    onClick={() => void answer(run.items[stage.index].id, "not-mine")}
                  >
                    NOT MINE
                  </button>
                  <button
                    className="fb-quiet"
                    type="button"
                    onClick={advance}
                    data-testid="fb-skip"
                  >
                    Skip for now
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="fb-btnrow">
                  <button
                    className="fb-primary"
                    type="button"
                    disabled={answering}
                    data-testid="fb-verb-approve"
                    onClick={() => void answer(run.items[stage.index].id, "approve")}
                  >
                    APPROVE FOR TODAY
                  </button>
                  <button
                    className="fb-ghost"
                    type="button"
                    disabled={answering}
                    data-testid="fb-verb-done"
                    onClick={() => void answer(run.items[stage.index].id, "done")}
                  >
                    ALREADY DONE
                  </button>
                  <button
                    className="fb-ghost"
                    type="button"
                    disabled={answering}
                    data-testid="fb-snooze"
                    onClick={() =>
                      void answer(run.items[stage.index].id, "snooze", {
                        snooze: { returnAt: tomorrowOf(run.date) },
                      })
                    }
                  >
                    SNOOZE UNTIL TOMORROW
                  </button>
                  <button
                    className="fb-ghost"
                    type="button"
                    disabled={answering}
                    data-testid="fb-not-mine"
                    onClick={() => void answer(run.items[stage.index].id, "not-mine")}
                  >
                    NOT MINE
                  </button>
                  <button
                    className="fb-quiet"
                    type="button"
                    onClick={advance}
                    data-testid="fb-skip"
                  >
                    Skip for now
                  </button>
                </div>
                <p className="fb-footnote">
                  ANSWERS SAVE TO THE LOCAL RUN LEDGER · JIRA ROUTING ARRIVES WITH FB-2
                </p>
              </>
            )}
            <div className="fb-btnrow fb-openrow">
              <a className="fb-open" href="/work">
                Open in Work
                <ArrowRight size={13} aria-hidden="true" />
              </a>
            </div>
          </section>
        )}

        {stage.kind === "day-plan" && (
          <section className="fb-stage" data-testid="fb-day-plan">
            <span className="fb-kicker">PLAN THE DAY</span>
            <h1>Ballparks, captured.</h1>
            <ul className="fb-facts">
              {run.items
                .filter((item) => item.answer?.verb === "ballpark")
                .map((item) => (
                  <li key={item.id}>
                    <span className="fb-key">{item.id}</span> {item.answer?.ballpark}
                  </li>
                ))}
              {run.items.every((item) => item.answer?.verb !== "ballpark") && (
                <li className="fb-muted">No ballparks were needed today.</li>
              )}
            </ul>
            <p className="fb-lede">
              The calendar and the workload check arrive with the countdown step (FB-3).
            </p>
            <div className="fb-btnrow">
              <button
                className="fb-primary"
                type="button"
                onClick={advance}
                data-testid="fb-continue"
              >
                CONTINUE
              </button>
            </div>
          </section>
        )}

        {stage.kind === "clear" && (
          <section className="fb-stage" data-testid="fb-clear">
            <span className="fb-kicker">YOU'RE CLEAR</span>
            <h1>You're clear for now.</h1>
            {run.narration?.clear && (
              <p className="fb-lede" data-testid="fb-narr-clear">
                {run.narration.clear}
              </p>
            )}
            <ul className="fb-facts">
              {answeredReceipts.map((receipt) => (
                <li key={`${receipt.itemId}-${receipt.at}`}>
                  <span className="fb-tick">✓</span> {receipt.itemId}: {receipt.verb}
                </li>
              ))}
              {answeredReceipts.length === 0 && (
                <li className="fb-muted">No answers were recorded this run.</li>
              )}
              <li className="fb-muted">
                {run.parked.length} parked with return dates. {run.suppressed.length} already
                answered stay quiet.
              </li>
            </ul>
            {run.items[0] && (
              <div className="fb-focuscard">
                <span className="fb-kicker">FIRST FOCUS</span>
                <h3>
                  <span className="fb-key">{run.items[0].id}</span> {run.items[0].summary}
                </h3>
                <a className="fb-primary fb-primarylink" href="/work">
                  START FOCUSED WORK
                </a>
              </div>
            )}
            <div className="fb-btnrow">
              <a className="fb-quiet" href="/">
                Open Current State
              </a>
              <button
                className="fb-quiet"
                type="button"
                onClick={() => setStage(toQuickBrief())}
                data-testid="fb-open-quick-brief"
              >
                Review the quick brief
              </button>
            </div>
          </section>
        )}

        {stage.kind === "quick-brief" && (
          <section className="fb-stage" data-testid="fb-quick-brief">
            <span className="fb-kicker">QUICK BRIEF</span>
            <h1>
              {run.items.length === 0
                ? "Nothing is waiting on you."
                : `${run.items.length} up first, in order.`}
            </h1>
            <ol className="fb-list">
              {run.items.map((item, index) => (
                <li className="fb-row" key={item.id}>
                  <span className="fb-rank">{index + 1}</span>
                  <span className="fb-key">{item.id}</span>
                  <span className="fb-summary">{item.summary}</span>
                  {item.answer ? (
                    <span className="fb-chip fb-okchip">✓ {item.answer.verb}</span>
                  ) : (
                    dueLabel(item.dueDate, todayUtc) && (
                      <span
                        className="fb-chip"
                        data-tone={
                          (day(item.dueDate) ?? Number.POSITIVE_INFINITY) < todayUtc
                            ? "late"
                            : undefined
                        }
                      >
                        {dueLabel(item.dueDate, todayUtc)}
                      </span>
                    )
                  )}
                  <a className="fb-open" href="/work">
                    Open in Work
                    <ArrowRight size={13} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ol>
            <div className="fb-stagefoot">
              <button
                className="fb-primary"
                type="button"
                data-testid="fb-resume"
                onClick={() => setStage(resumeTarget)}
              >
                RESUME GUIDED
              </button>
              <button
                className="fb-ghost"
                type="button"
                onClick={() => setStage({ kind: "item", index: 0 })}
                disabled={run.items.length === 0}
                data-testid="fb-begin-item-1"
              >
                Begin at item 1
              </button>
              <a className="fb-quiet" href="/">
                Everything else lives in Current State
              </a>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
