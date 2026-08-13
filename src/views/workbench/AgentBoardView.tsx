import { AlertCircle, ArrowUpRight, LoaderCircle, RefreshCw, SquareKanban } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WorkspaceHero } from "../../components/workbench/WorkspaceHero";
import { GATEWAY } from "../../lib/gateway";
import { AgentBoardCardModal } from "./AgentBoardCardModal";
import { type Board, type BoardReference, referenceOf, resolveHref } from "./agent-board-model";
import "./agent-board.css";

/**
 * The Agent Board is the trust instrument: only the agent's pipelines write
 * the state it renders, so a glance answers "is it keeping up". Nothing here
 * is editable. Staleness is the signal: cards age amber then red on their own,
 * and a source that cannot be read is a red card, never a quietly empty lane.
 *
 * Cards are readable, never writable. A card naming a Jira issue opens that
 * issue in Jira, one naming a file the gateway can serve opens the file, and
 * one with identity but no page of its own opens a read-only detail. A card
 * with nothing to point at stays plain text, so the board never offers a link
 * that goes nowhere.
 */

/**
 * A standup item points at one board card, carrying that card's own reference
 * so a tap does exactly what tapping the card does: open the real thing when
 * there is one, its read-only detail when there is not. An item about no single
 * source carries no reference and stays plain text.
 */
type StandupRef = BoardReference & { cardId: string };

type StandupItem = {
  group: "act" | "happened";
  text: string;
  count: number | null;
  verification: "verified" | "unverified";
  ref: StandupRef | null;
};

type Standup = {
  forDate: string;
  body: string;
  at: string;
  headline?: string;
  items?: StandupItem[];
};

type LoopStatus = {
  mode: string;
  shadowRuns: number;
  todayVerdicts: {
    workItemId: string;
    title: string;
    classId: string;
    autonomyTier: string;
    modelTier: string;
  }[];
  latestStandup: Standup | null;
};

const REFRESH_MS = 60_000;

const STANDUP_GROUPS: { id: StandupItem["group"]; label: string }[] = [
  { id: "act", label: "Waiting on you" },
  { id: "happened", label: "What happened" },
];

const FLASH_MS = 2200;

export function AgentBoardView() {
  const [board, setBoard] = useState<Board | null>(null);
  const [loop, setLoop] = useState<LoopStatus | null>(null);
  const [loopError, setLoopError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [flashedCard, setFlashedCard] = useState<string | null>(null);
  // The open card is held by id, never as a copied object. The board is re-read
  // every minute, and a detached copy would keep showing state the board no
  // longer has.
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  // `live` is only ever true when Steve presses Refresh. The timer below reads
  // whatever is already cached, because a poll that starts a Microsoft call is
  // how forty billed Copilot tasks appeared overnight on 2026-08-13, at exact
  // fifteen minute intervals, which reads as automation to anyone auditing it.
  const load = useCallback(async (live = false) => {
    setLoading(true);
    try {
      const response = await fetch(`${GATEWAY}/agent-board${live ? "?refresh=1" : ""}`);
      const payload = (await response.json()) as { ok: boolean; data?: Board; error?: string };
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error || `The board read returned HTTP ${response.status}.`);
      }
      setBoard(payload.data);
      setError(null);
    } catch (cause) {
      // The board never pretends: a failed read replaces the lanes with the
      // failure, because stale lanes that look current are the exact thing
      // this screen exists to prevent.
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
    try {
      const response = await fetch(`${GATEWAY}/loop/status`);
      const payload = (await response.json()) as { ok: boolean; data?: LoopStatus; error?: string };
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error || "The loop status read failed.");
      }
      setLoop(payload.data);
      setLoopError(null);
    } catch (cause) {
      setLoop(null);
      setLoopError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const waiting = board?.lanes.find((lane) => lane.id === "waiting");
  const working = board?.lanes.find((lane) => lane.id === "working");
  const delivered = board?.lanes.find((lane) => lane.id === "delivered");
  const brokenSources = (board?.sources ?? []).filter((source) => !source.ok);

  const standup = loop?.latestStandup ?? null;
  const standupItems = standup?.items ?? [];
  // Only a reference that resolves against the board actually on screen gets
  // to be tappable. A standup written this morning can name a card that has
  // since left the board, and a dead link is worse than plain text.
  const cardIds = useMemo(() => {
    const ids = new Set<string>();
    for (const lane of board?.lanes ?? []) {
      for (const card of lane.cards) ids.add(card.id);
    }
    return ids;
  }, [board]);

  // Resolved against the board on screen, every render. A card that leaves the
  // board takes its open detail with it rather than lingering as a snapshot.
  const openCard = useMemo(() => {
    if (!openCardId || !board) return null;
    for (const lane of board.lanes) {
      const found = lane.cards.find((card) => card.id === openCardId);
      if (found) return { card: found, lane };
    }
    return null;
  }, [board, openCardId]);

  useEffect(() => {
    if (openCardId && board && !openCard) setOpenCardId(null);
  }, [board, openCard, openCardId]);

  const focusCard = useCallback((id: string) => {
    const node = document.getElementById(`board-card-${id}`);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashedCard(id);
    window.setTimeout(
      () => setFlashedCard((current) => (current === id ? null : current)),
      FLASH_MS
    );
  }, []);

  return (
    <div className="wb-page" data-testid="agent-board-view">
      <WorkspaceHero
        kicker="Agent Board"
        title="What the agent is doing, without asking it."
        stats={[
          { label: "Waiting on you", value: waiting?.cards.length ?? 0, tone: "attention" },
          { label: "Working now", value: working?.cards.length ?? 0 },
          { label: "Delivered today", value: delivered?.cards.length ?? 0 },
          {
            label: "Sources readable",
            value: board ? board.sources.filter((s) => s.ok).length : 0,
          },
        ]}
        action={
          <button className="wb-hero-button" type="button" onClick={() => void load(true)}>
            <RefreshCw size={16} className={loading ? "wb-spin" : undefined} />
            Refresh
          </button>
        }
      />

      {board && (
        <div className="wb-board-freshness" data-testid="board-freshness">
          <SquareKanban size={14} aria-hidden="true" />
          <span>
            Maintained by the agent alone. Assembled from live pipeline state at{" "}
            {new Date(board.generatedAt).toLocaleTimeString()} and re-read every minute.
          </span>
        </div>
      )}

      {brokenSources.length > 0 && (
        <div className="wb-board-sources-down" role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          {brokenSources.map((source) => (
            <span key={source.id}>
              {source.label}: {source.detail}
            </span>
          ))}
        </div>
      )}

      {standup && (
        <section className="wb-board-standup" data-testid="board-standup">
          <header>
            <h2>Standup, {standup.forDate}</h2>
            <span>from the foreman, assembled from receipts</span>
          </header>
          {standup.headline ? (
            <>
              <p className="wb-standup-headline">{standup.headline}</p>
              {STANDUP_GROUPS.map((group) => {
                const rows = standupItems.filter((item) => item.group === group.id);
                if (rows.length === 0) return null;
                return (
                  <div className="wb-standup-group" data-group={group.id} key={group.id}>
                    <h3>{group.label}</h3>
                    <ul>
                      {rows.map((item) => {
                        // A tap on an item does what a tap on its card does:
                        // the real thing when there is one, the card's own
                        // detail when there is not, nothing when the card has
                        // already left the board.
                        const ref = item.ref && cardIds.has(item.ref.cardId) ? item.ref : null;
                        const href = ref ? resolveHref(ref.href) : null;
                        return (
                          <li
                            className="wb-standup-item"
                            data-verification={item.verification}
                            key={`${group.id}-${item.ref?.cardId ?? "unlinked"}-${item.text}`}
                          >
                            {item.count !== null && (
                              <span className="wb-standup-count">{item.count}</span>
                            )}
                            {href ? (
                              <a
                                className="wb-standup-link"
                                href={href}
                                rel="noreferrer"
                                target="_blank"
                              >
                                {item.text}
                                <ArrowUpRight aria-hidden="true" size={12} />
                              </a>
                            ) : ref ? (
                              <button
                                className="wb-standup-link"
                                onClick={() =>
                                  ref.type === "none"
                                    ? focusCard(ref.cardId)
                                    : setOpenCardId(ref.cardId)
                                }
                                type="button"
                              >
                                {item.text}
                              </button>
                            ) : (
                              <span className="wb-standup-text">{item.text}</span>
                            )}
                            {item.verification === "unverified" && (
                              <span className="wb-standup-unverified">unverified</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </>
          ) : (
            // Briefings written before the scannable format, and any morning
            // the items came back empty, still have their sentences to show.
            <p>{standup.body}</p>
          )}
        </section>
      )}

      {loop && loop.mode === "shadow" && Array.isArray(loop.todayVerdicts) && (
        <section className="wb-board-shadow" data-testid="board-shadow-strip">
          <header>
            <h2>Shadow: what the loop WOULD do</h2>
            <span>
              {loop.todayVerdicts.length} verdict{loop.todayVerdicts.length === 1 ? "" : "s"} today,
              nothing executed
            </span>
          </header>
          <div className="wb-board-shadow-items">
            {loop.todayVerdicts.slice(0, 8).map((verdict) => (
              <span
                className="wb-board-shadow-item"
                data-tier={verdict.autonomyTier}
                key={verdict.workItemId}
                title={verdict.title}
              >
                <strong>{verdict.autonomyTier}</strong> {verdict.classId}
              </span>
            ))}
            {loop.todayVerdicts.length === 0 && (
              <span className="wb-board-empty">No verdicts yet today.</span>
            )}
          </div>
        </section>
      )}

      {loopError && (
        <p className="wb-board-empty" data-testid="board-loop-error">
          Loop status unreadable: {loopError}
        </p>
      )}

      {error ? (
        <section className="wb-jira-state wb-jira-state-error" role="alert">
          <AlertCircle size={28} aria-hidden="true" />
          <h2>The board could not be read</h2>
          <p>{error}</p>
          <div className="wb-jira-state-actions">
            <button className="wb-button-primary" type="button" onClick={() => void load()}>
              <RefreshCw size={16} />
              Try again
            </button>
            <span>Nothing cached is shown in its place.</span>
          </div>
        </section>
      ) : !board ? (
        <section className="wb-jira-state" aria-live="polite">
          <LoaderCircle className="wb-spin" size={26} aria-hidden="true" />
          <p>Reading the agent's pipeline state.</p>
        </section>
      ) : (
        <div className="wb-board-lanes">
          {board.lanes.map((lane) => (
            <section className="wb-board-lane" key={lane.id} data-lane={lane.id}>
              <header className="wb-board-lane-head">
                <h2>{lane.label}</h2>
                <span className="wb-band-count">{lane.cards.length}</span>
                <p>{lane.helper}</p>
              </header>
              <div className="wb-board-cards">
                {lane.cards.length === 0 ? (
                  <p className="wb-board-empty">Nothing here right now.</p>
                ) : (
                  lane.cards.map((item) => {
                    const reference = referenceOf(item);
                    const href = resolveHref(reference.href);
                    const body = (
                      <>
                        <div className="wb-board-card-top">
                          <span className="wb-board-kind">{item.kind.replace(/-/g, " ")}</span>
                          {item.age && <span className="wb-board-age">{item.age}</span>}
                        </div>
                        <strong>{item.title}</strong>
                        {item.detail && <p>{item.detail}</p>}
                        {item.meta.length > 0 && (
                          <div className="wb-board-meta">
                            {item.meta.map((entry) => (
                              <span className="wb-pill" key={entry}>
                                {entry}
                              </span>
                            ))}
                          </div>
                        )}
                        {reference.type !== "none" && (
                          <span className="wb-board-go">
                            {href ? reference.label : "Open the detail"}
                            {href && <ArrowUpRight aria-hidden="true" size={13} />}
                          </span>
                        )}
                      </>
                    );
                    const shared = {
                      className: "wb-board-card",
                      "data-flash": flashedCard === item.id ? "true" : undefined,
                      "data-kind": item.kind,
                      "data-reference": reference.type,
                      "data-tone": item.tone,
                      id: `board-card-${item.id}`,
                    };
                    // A real target opens the real thing, in a new tab so the
                    // board stays where it was.
                    if (href) {
                      return (
                        <a {...shared} href={href} key={item.id} rel="noreferrer" target="_blank">
                          {body}
                        </a>
                      );
                    }
                    // Identity but no page: the detail is all there is, and it
                    // is read only.
                    if (reference.type !== "none") {
                      return (
                        <button
                          {...shared}
                          key={item.id}
                          onClick={() => setOpenCardId(item.id)}
                          type="button"
                        >
                          {body}
                        </button>
                      );
                    }
                    // Nothing to point at, so nothing that looks tappable.
                    return (
                      <article {...shared} key={item.id}>
                        {body}
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {openCard && (
        <AgentBoardCardModal
          card={openCard.card}
          lane={openCard.lane}
          onClose={() => setOpenCardId(null)}
        />
      )}
    </div>
  );
}
