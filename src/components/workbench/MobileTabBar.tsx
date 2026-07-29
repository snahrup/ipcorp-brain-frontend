import { BookOpen, BriefcaseBusiness, CalendarDays, Home, PlugZap } from "lucide-react";
import type { ViewKey } from "../../lib/search";
import "./mobile-tab-bar.css";

type Tab = { key: ViewKey; label: string; icon: typeof Home };

/**
 * The five destinations that belong on a phone. Data work is deliberately not here:
 * it is a desktop tool surface and would make the bar too crowded to hit accurately.
 */
const TABS: Tab[] = [
  { key: "today", label: "Today", icon: Home },
  { key: "work", label: "Work", icon: BriefcaseBusiness },
  { key: "meetings", label: "Meetings", icon: CalendarDays },
  { key: "library", label: "Library", icon: BookOpen },
  { key: "connections", label: "Sources", icon: PlugZap },
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
        const active = activeView === tab.key;
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
