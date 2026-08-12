import {
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  History,
  Home,
  Mail,
  PlugZap,
  Presentation,
  ShieldCheck,
  SquareKanban,
} from "lucide-react";
import { STAGES } from "../../features/workshops/data";
import type { WorkshopSurface } from "../../features/workshops/types";
import type { ViewKey } from "../../lib/search";
import "./WorkbenchSidebar.css";

type SidebarItem = {
  key: ViewKey;
  label: string;
  helper: string;
  icon?: typeof Home;
  imageSrc?: string;
  count?: number;
};

const primaryItems: SidebarItem[] = [
  { key: "today", label: "Today", helper: "What needs attention", icon: Home },
  {
    key: "agent-board",
    label: "Agent Board",
    helper: "Is the agent keeping up",
    icon: SquareKanban,
  },
  { key: "work", label: "Work", helper: "List and board", icon: BriefcaseBusiness },
  { key: "meetings", label: "Meetings", helper: "Prepare and follow up", icon: CalendarDays },
  {
    key: "weekly-status",
    label: "Weekly Status",
    helper: "Write and draft the update",
    icon: Mail,
  },
  { key: "workshops", label: "Workshops", helper: "Run a working session", icon: Presentation },
  { key: "timeline", label: "Timeline", helper: "The chronology, day by day", icon: History },
  { key: "library", label: "Team Library", helper: "Trusted shared context", icon: BookOpen },
];

const workshopPages: { key: WorkshopSurface; label: string; helper: string }[] = [
  { key: "prepare", label: "Prepare", helper: "Run of show, know the room" },
  { key: "present", label: "Present", helper: "Screenshare deck" },
  { key: "run", label: "Workshop", helper: "Eight stages, live capture" },
  { key: "handouts", label: "Handouts", helper: "Per-person take-away" },
];

export type WorkshopNav = {
  surface: WorkshopSurface;
  step: number;
  onSurface: (surface: WorkshopSurface) => void;
  onStep: (step: number) => void;
  stageStatus: (index: number) => "done" | "partial" | "empty";
};

const STATUS_COLOR: Record<"done" | "partial" | "empty", string> = {
  done: "#1e7b4d",
  partial: "#b0761a",
  empty: "#d5d9de",
};

const secondaryItems: SidebarItem[] = [
  {
    key: "data-work",
    label: "Data work",
    helper: "Optional specialist tools",
    imageSrc: "/fabric-icons/fabric.png",
  },
  { key: "connections", label: "Connections", helper: "Source and access status", icon: PlugZap },
];

export function WorkbenchSidebar({
  activeView,
  expanded,
  onNavigate,
  onToggle,
  workshopNav,
}: {
  activeView: ViewKey;
  expanded: boolean;
  onNavigate: (view: ViewKey) => void;
  onToggle: () => void;
  workshopNav?: WorkshopNav;
}) {
  const renderItem = (item: SidebarItem) => {
    const Icon = item.icon;
    const active =
      activeView === item.key ||
      (item.key === "meetings" &&
        (activeView === "daily-prep" || activeView === "meeting-wrap-up"));
    const count = item.key === "work" ? undefined : item.count;

    return (
      <div className="wb-nav-entry" key={item.key}>
        <button
          type="button"
          className={`wb-nav-item ${active ? "is-active" : ""}`}
          data-testid={`nav-${item.key}`}
          data-view={item.key}
          aria-current={activeView === item.key ? "page" : undefined}
          aria-label={item.label}
          onClick={() => onNavigate(item.key)}
          title={expanded ? undefined : item.label}
        >
          {item.imageSrc ? (
            <img className="wb-nav-native-icon" src={item.imageSrc} alt="" aria-hidden="true" />
          ) : (
            Icon && <Icon size={20} aria-hidden="true" />
          )}
          {expanded && (
            <span className="wb-nav-copy">
              <strong>{item.label}</strong>
              <small>{item.helper}</small>
            </span>
          )}
          {expanded && count ? <span className="wb-nav-count">{count}</span> : null}
        </button>
        {/* The workshop pages only unfold once you are actually in Workshops, so the
            rail stays the same length for everyone else. */}
        {expanded && item.key === "workshops" && activeView === "workshops" && workshopNav ? (
          <div className="wb-nav-subitems">
            {workshopPages.map((page) => (
              <div key={page.key}>
                <button
                  type="button"
                  className={`wb-nav-subitem ${workshopNav.surface === page.key ? "is-active" : ""}`}
                  data-testid={`nav-workshops-${page.key}`}
                  aria-current={workshopNav.surface === page.key ? "page" : undefined}
                  onClick={() => workshopNav.onSurface(page.key)}
                >
                  <span>{page.label}</span>
                  <small>{page.helper}</small>
                </button>

                {page.key === "run" && workshopNav.surface === "run" ? (
                  <div className="wb-nav-stages">
                    {STAGES.map((stage, index) => (
                      <button
                        type="button"
                        key={stage.n}
                        className={`wb-nav-stage ${workshopNav.step === index ? "is-active" : ""}`}
                        aria-current={workshopNav.step === index ? "step" : undefined}
                        onClick={() => workshopNav.onStep(index)}
                      >
                        <span className="wb-nav-stage-num">{stage.n}</span>
                        <span className="wb-nav-stage-name">{stage.name}</span>
                        <span
                          className="wb-nav-stage-dot"
                          style={{ background: STATUS_COLOR[workshopNav.stageStatus(index)] }}
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {expanded && item.key === "meetings" ? (
          <div className="wb-nav-subitems">
            <button
              type="button"
              className={`wb-nav-subitem ${activeView === "meetings" ? "is-active" : ""}`}
              data-testid="nav-meetings-overview"
              aria-current={activeView === "meetings" ? "page" : undefined}
              onClick={() => onNavigate("meetings")}
            >
              <span>Meetings Overview</span>
              <small>History and meeting signals</small>
            </button>
            <button
              type="button"
              className={`wb-nav-subitem ${activeView === "daily-prep" ? "is-active" : ""}`}
              data-testid="nav-daily-prep"
              aria-current={activeView === "daily-prep" ? "page" : undefined}
              onClick={() => onNavigate("daily-prep")}
            >
              <span>Daily Prep</span>
              <small>Before the meeting</small>
            </button>
            <button
              type="button"
              className={`wb-nav-subitem ${activeView === "meeting-wrap-up" ? "is-active" : ""}`}
              data-testid="nav-meeting-wrap-up"
              aria-current={activeView === "meeting-wrap-up" ? "page" : undefined}
              onClick={() => onNavigate("meeting-wrap-up")}
            >
              <span>Meeting Wrap-up</span>
              <small>After the meeting</small>
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <aside
      className={`wb-sidebar ${expanded ? "is-expanded" : "is-collapsed"}`}
      data-active-view={activeView}
      aria-label="IP Corporation Workbench navigation"
    >
      <div className="wb-brand" data-testid="workbench-brand">
        {expanded && (
          <img
            className="wb-brand-corporate-logo"
            src="/brand/ip-corporation-official.png"
            alt="IP Corporation"
          />
        )}
        <span className="wb-brand-compact-crop" aria-hidden="true">
          <img src="/brand/ip-corporation-official.png" alt="" />
        </span>

        {expanded && (
          // The active view already names itself in the page header, so repeating it
          // here made the brand block twice as tall as it needed to be. One quiet line
          // of product identity is enough.
          <div className="wb-brand-context">
            <span className="wb-brand-product-line">
              <strong>Workbench</strong>
              <em>Team workspace</em>
            </span>
            <img
              className="wb-brand-platform"
              src="/fabric-icons/fabric.png"
              alt="Microsoft Fabric"
              title="Powered by Microsoft Fabric"
            />
          </div>
        )}
      </div>

      <nav aria-label="Primary">
        <span className="wb-nav-label">{expanded ? "Workspace" : "Main"}</span>
        {primaryItems.map(renderItem)}
      </nav>

      <nav className="wb-nav-secondary" aria-label="Tools and connections">
        <span className="wb-nav-label">{expanded ? "Tools" : "More"}</span>
        {secondaryItems.map(renderItem)}
      </nav>

      <div className="wb-sidebar-footer">
        <div className="wb-team-safe-card">
          <ShieldCheck size={20} aria-hidden="true" />
          {expanded && (
            <p>
              Team-safe view
              <small>Jira on demand · Prepared knowledge</small>
            </p>
          )}
          <button
            type="button"
            className="wb-sidebar-toggle"
            onClick={onToggle}
            aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
          >
            {expanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>

        {expanded && (
          <div className="wb-powered-by">
            <small>Powered by</small>
            <img src="/fabric-icons/fabric.png" alt="" aria-hidden="true" />
            <strong>Microsoft Fabric</strong>
          </div>
        )}
      </div>
    </aside>
  );
}
