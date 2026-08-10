import { HandoutsSurface } from "./HandoutsSurface";
import { PrepareSurface } from "./PrepareSurface";
import { PresentSurface } from "./PresentSurface";
import { PeopleDatalist } from "./parts";
import { RunSurface } from "./RunSurface";
import type { WorkshopSurface } from "./types";
import type { WorkshopController } from "./useWorkshopState";
import { buildSummary, download, formatTime } from "./useWorkshopState";
import "./workshops.css";

const HEADINGS: Record<WorkshopSurface, { kicker: string; title: string }> = {
  prepare: { kicker: "Facilitator prep", title: "Domain ownership, run of show" },
  present: { kicker: "Screenshare", title: "Walkthrough deck" },
  run: { kicker: "Working session", title: "Domain ownership workshop" },
  handouts: { kicker: "After the session", title: "Personal handouts" },
};

export function WorkshopsView({
  surface,
  controller,
  onSurfaceChange,
}: {
  surface: WorkshopSurface;
  controller: WorkshopController;
  onSurfaceChange: (surface: WorkshopSurface) => void;
}) {
  const { state, patch, progress, timerRun, setTimerRun, toast, toastOn, say, isNamed, resetAll } =
    controller;

  if (surface === "present") {
    return (
      <PresentSurface
        controller={controller}
        onExit={() => onSurfaceChange("prepare")}
        onOpenWorkshop={() => {
          patch({ step: 0 });
          onSurfaceChange("run");
        }}
      />
    );
  }

  const heading = HEADINGS[surface];

  return (
    <div className="ws">
      <PeopleDatalist />

      <header className="ws-toolbar">
        <div>
          <span className="ws-kicker">{heading.kicker}</span>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>{heading.title}</h2>
        </div>

        <div className="ws-toolbar-spacer" />

        {surface === "run" ? (
          <button
            type="button"
            className="ws-guide"
            aria-pressed={state.guide}
            onClick={() => patch({ guide: !state.guide })}
            title="Show a draft answer under every field"
          >
            <span className="ws-guide-track" aria-hidden="true">
              <span className="ws-guide-knob" />
            </span>
            <span className="ws-guide-copy">
              <strong>Guidance</strong>
              <small>draft answers</small>
            </span>
          </button>
        ) : null}

        <button
          type="button"
          className={`ws-timer ${timerRun ? "is-running" : ""}`}
          onClick={() => setTimerRun(!timerRun)}
          onDoubleClick={() => {
            setTimerRun(false);
            patch({ timerSec: 0 });
          }}
          title="Click to start or pause. Double-click to reset."
        >
          <span className="ws-timer-dot" aria-hidden="true" />
          {formatTime(state.timerSec)}
        </button>

        <div className="ws-ring" title="How much of the session is captured">
          <span
            className="ws-ring-dial"
            style={{ background: `conic-gradient(#1b5e9e ${progress}%, #e1e4e8 0)` }}
            aria-hidden="true"
          >
            <span>{progress}%</span>
          </span>
        </div>

        <button
          type="button"
          className="ws-btn is-primary"
          onClick={() => {
            download("domain-ownership-workshop.md", buildSummary(state, isNamed), "text/markdown");
            say("Markdown exported");
          }}
        >
          Export
        </button>
      </header>

      {surface === "prepare" && <PrepareSurface controller={controller} />}
      {surface === "run" && <RunSurface controller={controller} />}
      {surface === "handouts" && <HandoutsSurface controller={controller} />}

      <footer className="ws-toolbar ws-np" style={{ paddingTop: 8 }}>
        <div className="ws-toolbar-spacer" />
        <button type="button" className="ws-btn is-danger is-small" onClick={resetAll}>
          Reset the session
        </button>
      </footer>

      <div
        role="status"
        aria-live="polite"
        style={{
          position: "fixed",
          bottom: 26,
          left: "50%",
          transform: `translateX(-50%) translateY(${toastOn ? "0" : "10px"})`,
          background: "#0e2338",
          color: "#ffffff",
          fontSize: 13,
          fontWeight: 600,
          padding: "10px 20px",
          borderRadius: 999,
          boxShadow: "0 18px 50px rgba(14,35,56,0.28)",
          opacity: toastOn ? 1 : 0,
          transition: "opacity 0.25s ease, transform 0.25s ease",
          pointerEvents: "none",
          zIndex: 300,
        }}
      >
        {toast}
      </div>
    </div>
  );
}
