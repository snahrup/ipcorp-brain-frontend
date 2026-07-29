import {
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Home,
  PlugZap,
  ShieldCheck,
} from "lucide-react";
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
  { key: "work", label: "Work", helper: "List and board", icon: BriefcaseBusiness },
  { key: "meetings", label: "Meetings", helper: "Prepare and follow up", icon: CalendarDays },
  { key: "library", label: "Team Library", helper: "Trusted shared context", icon: BookOpen },
];

const secondaryItems: SidebarItem[] = [
  {
    key: "data-work",
    label: "Data work",
    helper: "Optional specialist tools",
    imageSrc: "/fabric-icons/fabric.png",
  },
  { key: "connections", label: "Connections", helper: "Source and access status", icon: PlugZap },
];

const allItems = [...primaryItems, ...secondaryItems];

export function WorkbenchSidebar({
  activeView,
  expanded,
  onNavigate,
  onToggle,
}: {
  activeView: ViewKey;
  expanded: boolean;
  onNavigate: (view: ViewKey) => void;
  onToggle: () => void;
}) {
  const activeItem = allItems.find((item) => item.key === activeView) ?? primaryItems[0];

  const renderItem = (item: SidebarItem) => {
    const Icon = item.icon;
    const active = activeView === item.key;
    const count = item.key === "work" ? undefined : item.count;

    return (
      <button
        type="button"
        key={item.key}
        className={`wb-nav-item ${active ? "is-active" : ""}`}
        data-testid={`nav-${item.key}`}
        data-view={item.key}
        aria-current={active ? "page" : undefined}
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
          <div className="wb-brand-context">
            <img src="/fabric-icons/fabric.png" alt="" aria-hidden="true" />
            <span>
              <small>Workbench</small>
              <strong>{activeItem.label}</strong>
              <em>Team workspace</em>
            </span>
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
