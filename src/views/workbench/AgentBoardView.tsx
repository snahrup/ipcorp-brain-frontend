import { AlertCircle, LoaderCircle, RefreshCw, SquareKanban } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { WorkspaceHero } from "../../components/workbench/WorkspaceHero";
import { GATEWAY } from "../../lib/gateway";
import "./agent-board.css";

/**
 * The Agent Board is the trust instrument: only the agent's pipelines write
 * the state it renders, so a glance answers "is it keeping up". Nothing here
 * is editable. Staleness is the signal: cards age amber then red on their own,
 * and a source that cannot be read is a red card, never a quietly empty lane.
 */

type BoardCard = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  at: string;
  age: string;
  tone: "ok" | "amber" | "red";
  meta: string[];
};

type BoardLane = { id: string; label: string; helper: string; cards: BoardCard[] };

type Board = {
  generatedAt: string;
  date: string;
  sources: { id: string; label: string; ok: boolean; detail: string }[];
  lanes: BoardLane[];
};

const REFRESH_MS = 60_000;

export function AgentBoardView() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${GATEWAY}/agent-board`);
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
          <button className="wb-hero-button" type="button" onClick={() => void load()}>
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
                  lane.cards.map((item) => (
                    <article
                      className="wb-board-card"
                      key={item.id}
                      data-tone={item.tone}
                      data-kind={item.kind}
                    >
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
                    </article>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
