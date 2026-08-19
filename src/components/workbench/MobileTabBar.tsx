import { BriefcaseBusiness, CalendarDays, Home, Radar, SquareKanban } from "lucide-react";
import type { ViewKey } from "../../lib/search";
import "./mobile-tab-bar.css";

type Tab = { key: ViewKey; label: string; icon: typeof Home };

/**
 * The five destinations that belong on a phone. Data work is deliberately not
 * here: it is a desktop tool surface and would make the bar too crowded to
 * hit accurately. The Agent Board took Sources' spot on 2026-08-13: Steve
 * checks the loop from his phone constantly, and source health already
 * surfaces on the board itself when something is down. Autonomy took Library's
 * spot on 2026-08-18 for the same reason: supervising runs is a phone activity and
 * the library is not. Swap the line back to restore Library.
 */
const TABS: Tab[] = [
  { key: "today", label: "Today", icon: Home },
  { key: "agent-board", label: "Agent", icon: SquareKanban },
  { key: "work", label: "Work", icon: BriefcaseBusiness },
  { key: "meetings", label: "Meetings", icon: CalendarDays },
  { key: "autonomy", label: "Autonomy", icon: Radar },
];

/**
 * iOS-style bottom tab bar, shown only on small screens.
 *
 * It sits on the home-indicator safe area rather than above it, uses a translucent
 * blurred surface the way a native bar does, and keeps every target at least 44px so it
 * is reliably tappable.
 */
export function MobileTabBar({
  activeView,
  onNavigate,
}: {
  activeView: ViewKey;
  onNavigate: (view: ViewKey) => void;
}) {
  return (
    <nav className="wb-tabbar" aria-label="Main">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active =
          activeView === tab.key ||
          (tab.key === "meetings" &&
            (activeView === "daily-prep" || activeView === "meeting-wrap-up"));
        return (
          <button
            type="button"
            key={tab.key}
            className="wb-tabbar-item"
            data-active={active ? "true" : undefined}
            aria-current={active ? "page" : undefined}
            onClick={() => onNavigate(tab.key)}
          >
            <Icon size={22} strokeWidth={active ? 2.4 : 1.9} aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
