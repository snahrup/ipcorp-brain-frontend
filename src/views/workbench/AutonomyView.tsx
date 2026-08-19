import { Bot, ClipboardCheck, Repeat2, ScanSearch, Sunrise } from "lucide-react";
import { useState } from "react";
import { WorkspaceHero } from "../../components/workbench/WorkspaceHero";
import { AgentRunsSurface } from "../../features/agent-runs/AgentRunsSurface";

/**
 * Autonomy: the top-level screen for watching autonomous work.
 *
 * One screen, one switcher, several kinds of background process over time. Only
 * the first view exists today: agent runs on Jira work items. The other views
 * are named and routed so they can be built without reshaping this page, and
 * until they are built they say so instead of rendering anything invented.
 */

type AutonomyViewKey = "runs" | "closeouts" | "reconciliation" | "briefings" | "loop";

const VIEWS: {
  key: AutonomyViewKey;
  label: string;
  icon: typeof Bot;
  path: string;
  /** Null for implemented views; stub copy for the rest. */
  stub: { heading: string; body: string } | null;
}[] = [
  { key: "runs", label: "Agent runs", icon: Bot, path: "/autonomy", stub: null },
  {
    key: "closeouts",
    label: "Closeouts",
    icon: ClipboardCheck,
    path: "/autonomy/closeouts",
    stub: {
      heading: "Meeting closeout jobs",
      body: "What ran after each meeting: the transcript it read, what it captured to the Brain, and what it wrote back. This view is not built yet; the switcher entry and URL are reserved for it.",
    },
  },
  {
    key: "reconciliation",
    label: "Reconciliation",
    icon: ScanSearch,
    path: "/autonomy/reconciliation",
    stub: {
      heading: "Activity reconciliation runs",
      body: "Each evidence sweep across Outlook, Teams and meetings: what it scanned, what it proposed, and what was applied. This view is not built yet; the switcher entry and URL are reserved for it.",
    },
  },
  {
    key: "briefings",
    label: "Briefings",
    icon: Sunrise,
    path: "/autonomy/briefings",
    stub: {
      heading: "Morning briefing generation",
      body: "Each briefing build: the inputs it drew on and whether it was delivered. This view is not built yet; the switcher entry and URL are reserved for it.",
    },
  },
  {
    key: "loop",
    label: "Loop",
    icon: Repeat2,
    path: "/autonomy/loop",
    stub: {
      heading: "The scheduled loop",
      body: "Each cycle of the loop: what it considered, what it decided to run, and what it skipped. This view is not built yet; the switcher entry and URL are reserved for it.",
    },
  },
];

function viewFromPath(pathname: string): AutonomyViewKey {
  const match = VIEWS.find((view) => view.path !== "/autonomy" && pathname.startsWith(view.path));
  return match?.key ?? "runs";
}

export function AutonomyView() {
  const [active, setActive] = useState<AutonomyViewKey>(() =>
    viewFromPath(window.location.pathname)
  );
  const [counts, setCounts] = useState<{ running: number; needsYou: number } | null>(null);

  // Same manner as the Work screen's layout switcher: buttons plus URL paths,
  // replaceState so the back button still leaves the screen, not the mode.
  const selectView = (key: AutonomyViewKey) => {
    setActive(key);
    if (window.location.pathname.startsWith("/autonomy")) {
      const nextPath = VIEWS.find((view) => view.key === key)?.path ?? "/autonomy";
      if (window.location.pathname !== nextPath) {
        window.history.replaceState({}, "", nextPath);
      }
    }
  };

  const activeStub = VIEWS.find((view) => view.key === active)?.stub ?? null;

  return (
    <div className="wb-page" data-testid="autonomy-view">
      <WorkspaceHero
        kicker="Autonomy · Background work"
        title="Watch the work, not the status word."
        stats={
          counts
            ? [
                { label: "Running now", value: counts.running },
                {
                  label: "Needs you",
                  value: counts.needsYou,
                  tone: counts.needsYou > 0 ? "attention" : "good",
                },
              ]
            : []
        }
      />

      <fieldset className="wb-segmented wb-autonomy-switcher">
        <legend className="wb-sr-only">Background process view</legend>
        {VIEWS.map((view) => {
          const Icon = view.icon;
          return (
            <button
              type="button"
              key={view.key}
              aria-pressed={active === view.key}
              className={active === view.key ? "is-active" : ""}
              onClick={() => selectView(view.key)}
            >
              <Icon size={17} /> {view.label}
            </button>
          );
        })}
      </fieldset>

      {activeStub ? (
        <section className="wb-autonomy-stub" aria-label={activeStub.heading}>
          <h2>{activeStub.heading}</h2>
          <p>{activeStub.body}</p>
          <small>Nothing here is simulated. Agent runs are the only view built so far.</small>
        </section>
      ) : (
        <AgentRunsSurface onCounts={setCounts} />
      )}
    </div>
  );
}
