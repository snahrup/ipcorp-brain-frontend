import { useCallback, useEffect, useRef, useState } from "react";
import {
  BATCH_CHAIN,
  COMPANY_CARDS,
  DOMAINS,
  KIND_COLORS,
  MEDALLION_FLOW,
  PRESENT_SEATS,
  PRESENT_STATS,
  STAGES,
  WAVE_META,
  WAVE_ORDER,
} from "./data";
import type { WorkshopController } from "./useWorkshopState";
import { SLIDE_COUNT } from "./useWorkshopState";

export function PresentSurface({
  controller,
  onExit,
  onOpenWorkshop,
}: {
  controller: WorkshopController;
  onExit: () => void;
  onOpenWorkshop: () => void;
}) {
  const { state, patch, say } = controller;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const slide = Math.min(state.slide, SLIDE_COUNT - 1);

  const move = useCallback(
    (delta: number) => {
      patch({ slide: Math.max(0, Math.min(SLIDE_COUNT - 1, slide + delta)) });
    },
    [patch, slide]
  );

  const leaveFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const element = shellRef.current;
    if (!element) return;
    if (document.fullscreenElement) {
      leaveFullscreen();
      return;
    }
    element.requestFullscreen().catch(() => {
      // Some browsers refuse without a trusted gesture; the deck still runs windowed.
      say("Fullscreen was blocked. Use the browser's own fullscreen instead.");
    });
  }, [leaveFullscreen, say]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (["ArrowRight", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        move(1);
      } else if (["ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        move(-1);
      } else if (event.key === "Escape") {
        leaveFullscreen();
        onExit();
      } else if (event.key.toLowerCase() === "f") {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, onExit, toggleFullscreen, leaveFullscreen]);

  const slides = [
    // 1
    <div className="ws-slide is-dark" key="s0">
      <span className="ws-kicker" style={{ color: "#7fb2e0" }}>
        Domain ownership
      </span>
      <h2>One roster, two hours.</h2>
      <p className="ws-slide-sub">
        We already have a roster of candidates. Today we go through it together, amend it, and leave
        with names the leadership team can approve.
      </p>
    </div>,
    // 2
    <div className="ws-slide" key="s1">
      <h3>Why we are in this room</h3>
      <p className="ws-slide-sub">Four numbers that are true right now.</p>
      <div className="ws-slide-body">
        <div className="ws-grid">
          {PRESENT_STATS.map((stat) => (
            <div className="ws-card" key={stat.big}>
              <div className="ws-big">{stat.big}</div>
              <p className="ws-card-note" style={{ marginTop: 8 }}>
                {stat.label}
              </p>
              <span className="ws-src">source · {stat.src}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,
    // 3
    <div className="ws-slide" key="s2">
      <h3>What a domain is</h3>
      <div className="ws-slide-body">
        <div className="ws-grid">
          <div className="ws-card" style={{ borderLeft: "4px solid #c8102e" }}>
            <span className="ws-kicker" style={{ color: "#c8102e" }}>
              Not
            </span>
            <p className="ws-card-note" style={{ marginTop: 8, fontSize: 15 }}>
              A department, a system, a report, or a team. Not a reorganization, and not a new job
              for anyone.
            </p>
          </div>
          <div className="ws-card" style={{ borderLeft: "4px solid #1e7b4d" }}>
            <span className="ws-kicker" style={{ color: "#1e7b4d" }}>
              Is
            </span>
            <p className="ws-card-note" style={{ marginTop: 8, fontSize: 15 }}>
              A grouping of data that shares one business meaning, with one person who settles what
              it means and one who keeps it clean.
            </p>
          </div>
        </div>
      </div>
    </div>,
    // 4
    <div className="ws-slide" key="s3">
      <h3>Five companies, one rule</h3>
      <div className="ws-slide-body">
        <div className="ws-grid">
          {COMPANY_CARDS.map((company) => (
            <div
              className="ws-card"
              key={company.name}
              style={{ borderTop: `3px solid ${company.color}` }}
            >
              <strong style={{ fontSize: 15, color: "#14314f" }}>{company.name}</strong>
              <p className="ws-card-note" style={{ marginTop: 6 }}>
                {company.line}
              </p>
            </div>
          ))}
        </div>
        <div
          className="ws-card"
          style={{ borderLeft: "4px solid #c8102e", background: "rgba(200,16,46,0.04)" }}
        >
          <strong style={{ fontSize: 15, color: "#14314f" }}>
            No operating company sees another company's numbers.
          </strong>
          <p className="ws-card-note" style={{ marginTop: 6 }}>
            This is not a preference. It is enforced through separate workspaces and capacities, and
            any cross-company dataset needs Architecture Board and Security approval.
          </p>
        </div>
      </div>
    </div>,
    // 5
    <div className="ws-slide" key="s4">
      <h3>The domains on the table</h3>
      <p className="ws-slide-sub">Nine in total. Five need names today.</p>
      <div className="ws-slide-body">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {DOMAINS.map((domain) => {
            const wave = WAVE_META[state.waves[domain.key]];
            return (
              <span
                className="ws-seq-chip"
                key={domain.key}
                style={{
                  borderColor: wave.color,
                  color: wave.color,
                  fontWeight: 700,
                  fontSize: 15,
                  padding: "9px 18px",
                }}
              >
                {domain.name}
              </span>
            );
          })}
        </div>
      </div>
    </div>,
    // 6
    <div className="ws-slide" key="s5">
      <h3>One key ties it together</h3>
      <p className="ws-slide-sub">
        Batch ID is the single value that follows a batch across every system it touches.
      </p>
      <div className="ws-slide-body">
        <div className="ws-grid">
          {BATCH_CHAIN.map((link, index) => (
            <div className="ws-card" key={link.sys}>
              <span className="ws-kicker">Step {index + 1}</span>
              <strong style={{ display: "block", marginTop: 6, fontSize: 16, color: "#14314f" }}>
                {link.sys}
              </strong>
              <p className="ws-card-note" style={{ marginTop: 6 }}>
                {link.t}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>,
    // 7
    <div className="ws-slide" key="s6">
      <h3>The four seats</h3>
      <div className="ws-slide-body">
        <div className="ws-grid">
          {PRESENT_SEATS.map((seat) => (
            <div className="ws-card" key={seat.abbr}>
              <span className="ws-avatar" aria-hidden="true">
                {seat.abbr}
              </span>
              <strong style={{ display: "block", marginTop: 10, fontSize: 16, color: "#14314f" }}>
                {seat.title}
              </strong>
              <p className="ws-card-note" style={{ marginTop: 6 }}>
                {seat.body}
              </p>
              <p className="ws-card-note" style={{ marginTop: 8, fontStyle: "italic" }}>
                {seat.ex}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>,
    // 8
    <div className="ws-slide" key="s7">
      <h3>Raw to certified</h3>
      <div className="ws-slide-body">
        <div className="ws-grid">
          {MEDALLION_FLOW.map((layer) => (
            <div
              className="ws-card"
              key={layer.name}
              style={{ borderTop: `3px solid ${layer.color}` }}
            >
              <strong style={{ fontSize: 17, color: "#14314f" }}>{layer.name}</strong>
              <div className="ws-kicker" style={{ marginTop: 6 }}>
                {layer.k}
              </div>
              <p className="ws-card-note" style={{ marginTop: 8 }}>
                {layer.v}
              </p>
            </div>
          ))}
          <div className="ws-dark">
            <strong style={{ fontSize: 17, color: "#ffffff" }}>Certified</strong>
            <div className="ws-dark-num">The seal of trust</div>
            <p>
              Owner and steward named, definition documented, security reviewed, quality checks
              passing, lineage visible. Refinement is not the finish line. Certification is.
            </p>
          </div>
        </div>
      </div>
    </div>,
    // 9
    <div className="ws-slide" key="s8">
      <h3>We do not do all nine at once</h3>
      <div className="ws-slide-body">
        <div className="ws-grid">
          {WAVE_ORDER.map((wave) => (
            <div
              className="ws-card"
              key={wave}
              style={{ borderTop: `3px solid ${WAVE_META[wave].color}` }}
            >
              <strong style={{ fontSize: 16, color: "#14314f" }}>{WAVE_META[wave].label}</strong>
              <p className="ws-card-note" style={{ marginTop: 6 }}>
                {WAVE_META[wave].sub}
              </p>
              <p className="ws-card-note" style={{ marginTop: 10 }}>
                {DOMAINS.filter((domain) => state.waves[domain.key] === wave)
                  .map((domain) => domain.name)
                  .join(", ") || "None yet"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>,
    // 10
    <div className="ws-slide" key="s9">
      <h3>What we need from you</h3>
      <div className="ws-slide-body">
        <div className="ws-grid">
          {[
            {
              k: "React",
              v: "The roster is already filled in. Tell us where it is wrong, not where it is blank.",
            },
            {
              k: "Decide",
              v: "Three decisions have to land out loud: the sequence, the Sales question, and how isolation is enforced.",
            },
            {
              k: "Accept",
              v: "If your name stays on a seat, you are accepting what that seat does. We will read it back before you agree.",
            },
          ].map((item, index) => (
            <div className="ws-card" key={item.k}>
              <span className="ws-kicker">{String(index + 1).padStart(2, "0")}</span>
              <strong style={{ display: "block", marginTop: 6, fontSize: 20, color: "#14314f" }}>
                {item.k}
              </strong>
              <p className="ws-card-note" style={{ marginTop: 8 }}>
                {item.v}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>,
    // 11
    <div className="ws-slide" key="s10">
      <h3>How the two hours run</h3>
      <div className="ws-slide-body">
        <div className="ws-agenda">
          {STAGES.map((stage) => (
            <div
              className="ws-agenda-seg"
              key={stage.n}
              style={{
                background: KIND_COLORS[stage.kind],
                width: `${((stage.min / 120) * 100).toFixed(2)}%`,
              }}
            >
              <strong>{stage.n}</strong>
              <span>{stage.name}</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="ws-btn is-primary"
          style={{ justifySelf: "start", padding: "12px 22px", fontSize: 15 }}
          onClick={() => {
            leaveFullscreen();
            onOpenWorkshop();
          }}
        >
          Start the working session
        </button>
      </div>
    </div>,
  ];

  return (
    <div className={`ws-present ${isFullscreen ? "is-fs" : ""}`} ref={shellRef}>
      {slides[slide]}

      <div className="ws-present-bar">
        <button
          type="button"
          className="ws-btn is-small"
          onClick={() => {
            leaveFullscreen();
            onExit();
          }}
        >
          Exit · Esc
        </button>
        <button type="button" className="ws-btn is-small" onClick={toggleFullscreen}>
          {isFullscreen ? "Exit fullscreen · F" : "Fullscreen · F"}
        </button>

        <div className="ws-dots">
          {Array.from({ length: SLIDE_COUNT }).map((_, index) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: dots are positional by definition
              key={index}
              type="button"
              className={index === slide ? "is-on" : ""}
              aria-label={`Slide ${index + 1}`}
              onClick={() => patch({ slide: index })}
            />
          ))}
        </div>

        <span className="ws-mono" style={{ fontSize: 12, color: "#8a9099" }}>
          {slide + 1}/{SLIDE_COUNT}
        </span>
        <button
          type="button"
          className="ws-btn is-small"
          onClick={() => move(-1)}
          disabled={slide === 0}
        >
          Back
        </button>
        <button
          type="button"
          className="ws-btn is-small is-primary"
          onClick={() => move(1)}
          disabled={slide === SLIDE_COUNT - 1}
        >
          Next
        </button>
      </div>
    </div>
  );
}
