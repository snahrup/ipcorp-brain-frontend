import type { ViewKey } from "../../lib/search";
import { viewCopy } from "../../lib/viewConfig";
import type { DestinationSection, WorkbenchAgentDestination } from "./types";

const sections = <T extends readonly DestinationSection[]>(items: T) => items;

export const WORKBENCH_DESTINATIONS: Record<
  ViewKey,
  { label: string; sections: readonly DestinationSection[] }
> = {
  today: {
    label: viewCopy.today.label,
    sections: sections([
      {
        key: "today-view",
        label: "Start with what is current.",
        hints: ["today", "needs attention", "start"],
      },
    ]),
  },
  "agent-board": {
    label: viewCopy["agent-board"].label,
    sections: sections([
      {
        key: "agent-board-view",
        label: "What the agent is doing, without asking it.",
        hints: ["agent board", "kanban", "automation status", "waiting on steve"],
      },
    ]),
  },
  autonomy: {
    label: viewCopy.autonomy.label,
    sections: sections([
      {
        key: "autonomy-view",
        label: "Watch the work, not the status word.",
        hints: ["autonomy", "agent runs", "what did the agent do", "review a run", "supervise"],
      },
    ]),
  },
  work: {
    label: viewCopy.work.label,
    sections: sections([
      {
        key: "work-view",
        label: "Keep the next move visible.",
        hints: ["work", "next move", "jira"],
      },
      { key: "work-source", label: "Work source", hints: ["source", "jira source"] },
    ]),
  },
  library: {
    label: viewCopy.library.label,
    sections: sections([
      {
        key: "team-library",
        label: "Open the context behind the work.",
        hints: ["library", "context"],
      },
      {
        key: "collections",
        label: "Choose the work you need to review",
        hints: ["collections", "review work"],
      },
      {
        key: "library-jobs",
        label: "Start with the job in front of you",
        hints: ["job", "start"],
      },
      {
        key: "library-search",
        label: "Search every available item",
        hints: ["search", "find item"],
      },
    ]),
  },
  "data-work": {
    label: viewCopy["data-work"].label,
    sections: sections([
      {
        key: "data-work-view",
        label: "Open specialist tools only when the work needs them.",
        hints: ["data work", "specialist tools"],
      },
      { key: "data-work-open-explore", label: "Explore data", hints: ["explore", "data"] },
      {
        key: "data-work-open-compare",
        label: "Compare sources",
        hints: ["compare", "sources"],
      },
      { key: "data-work-open-review", label: "Review SQL", hints: ["sql", "review"] },
      { key: "data-work-open-lineage", label: "Trace fields", hints: ["trace", "fields"] },
      { key: "data-work-open-translate", label: "Convert SQL", hints: ["convert", "sql"] },
      { key: "data-work-open-models", label: "Models & tests", hints: ["models", "tests"] },
    ]),
  },
  connections: {
    label: viewCopy.connections.label,
    sections: sections([
      {
        key: "connections-view",
        label: "Know what the team can safely use.",
        hints: ["connections", "safe use"],
      },
      {
        key: "source-connection-status",
        label: "Source connection status",
        hints: ["source status", "connections status"],
      },
      { key: "microsoft365", label: "Copilot Cowork · Microsoft 365", hints: ["m365", "teams"] },
      { key: "jira", label: "Jira", hints: ["jira", "issues"] },
      { key: "data-work", label: "Data work", hints: ["fabric", "power bi", "sql"] },
    ]),
  },
  readiness: {
    label: viewCopy.readiness.label,
    sections: sections([
      {
        key: "open-next-packet",
        label: "Start with the right work.",
        hints: ["start", "next packet"],
      },
      { key: "recommended-next-steps", label: "Recommended next steps", hints: ["next steps"] },
      { key: "brain-inventory", label: "Brain inventory", hints: ["inventory", "brain"] },
      { key: "meeting-signals", label: "Meeting signals", hints: ["meetings", "signals"] },
    ]),
  },
  meetings: {
    label: viewCopy.meetings.label,
    sections: sections([
      {
        key: "meetings-workspace",
        label: "Walk in knowing what changed.",
        hints: ["meetings", "what changed"],
      },
      { key: "meeting-calendar", label: "Meeting calendar", hints: ["calendar", "dates"] },
      {
        key: "meeting-infographic-audit",
        label: "Infographic coverage audit",
        hints: ["infographic", "coverage"],
      },
    ]),
  },
  "daily-prep": {
    label: viewCopy["daily-prep"].label,
    sections: sections([
      {
        key: "daily-meeting-prep-page",
        label: "Meeting prep for today",
        hints: ["daily prep", "meeting prep"],
      },
      { key: "daily-prep-summary", label: "Daily prep summary", hints: ["summary"] },
      { key: "today-packages", label: "Today's packages", hints: ["today", "packages"] },
      {
        key: "daily-prep-package-detail",
        label: "Preparation context",
        hints: ["context", "detail"],
      },
      { key: "daily-prep-print", label: "Package files", hints: ["files", "print", "download"] },
    ]),
  },
  "meeting-wrap-up": {
    label: viewCopy["meeting-wrap-up"].label,
    sections: sections([
      {
        key: "meeting-wrap-up-page",
        label: "Close out today's meetings.",
        hints: ["wrap up", "close out"],
      },
      {
        key: "meeting-closeout-panel",
        label: "Select a meeting to process",
        hints: ["select meeting", "meeting picker"],
      },
    ]),
  },
  "weekly-status": {
    label: viewCopy["weekly-status"].label,
    sections: sections([
      {
        key: "weekly-status-page",
        label: "Write and draft this week's status update.",
        hints: ["weekly status", "status update", "status email", "status report"],
      },
      {
        key: "weekly-status-preview",
        label: "The email preview and the Outlook draft",
        hints: ["preview", "outlook draft", "send"],
      },
    ]),
  },
  workshops: {
    label: viewCopy.workshops.label,
    sections: sections([
      { key: "workshop-overview", label: "Domain ownership, run of show", hints: ["overview"] },
      {
        key: "workshop-readiness",
        label: "Everything you need before the room fills up.",
        hints: ["prepare", "readiness"],
      },
      {
        key: "workshop-timeline",
        label: "The two hours, at a glance",
        hints: ["run of show", "timeline"],
      },
      { key: "workshop-decisions", label: "What today decides", hints: ["decisions", "outcomes"] },
      { key: "workshop-roster", label: "The roster", hints: ["roster", "people"] },
      { key: "workshop-parking", label: "Parking lot", hints: ["parking lot"] },
      { key: "workshop-export", label: "Read-back and export", hints: ["export", "read back"] },
    ]),
  },
  timeline: {
    label: viewCopy.timeline.label,
    sections: sections([
      {
        key: "timeline-view",
        label: "See the order things actually happened in.",
        hints: ["timeline", "order"],
      },
      { key: "brain-chronology", label: "Brain chronology", hints: ["chronology", "dates"] },
    ]),
  },
  packets: {
    label: viewCopy.packets.label,
    sections: sections([
      {
        key: "packet-list",
        label: "Each packet is a stakeholder-safe brief.",
        hints: ["packets", "briefs"],
      },
    ]),
  },
  insights: {
    label: viewCopy.insights.label,
    sections: sections([
      {
        key: "brain-explorer-route",
        label: "Trace the context behind a decision.",
        hints: ["insights", "context", "decision"],
      },
    ]),
  },
  actions: {
    label: viewCopy.actions.label,
    sections: sections([
      {
        key: "actions-overview",
        label: "Actions are proposed moves, not silent automation.",
        hints: ["actions", "proposals"],
      },
      { key: "review", label: "Review before execution", hints: ["review", "proposed"] },
      { key: "other", label: "Other recommendations", hints: ["other", "recommendation"] },
    ]),
  },
  questions: {
    label: viewCopy.questions.label,
    sections: sections([
      {
        key: "questions-overview",
        label: "Questions make ownership and next targets explicit.",
        hints: ["questions", "ownership"],
      },
      { key: "critical-questions", label: "Critical (Block Decisions)", hints: ["critical"] },
      { key: "high-priority-questions", label: "High Priority", hints: ["high priority"] },
      { key: "medium-priority-questions", label: "Medium Priority", hints: ["medium priority"] },
    ]),
  },
  risks: {
    label: viewCopy.risks.label,
    sections: sections([
      {
        key: "risks-overview",
        label: "Risks connect concern, likelihood, owner, and mitigation.",
        hints: ["risks", "mitigation"],
      },
      { key: "high-risks", label: "High", hints: ["high risks"] },
      { key: "medium-risks", label: "Medium", hints: ["medium risks"] },
      { key: "low-risks", label: "Low", hints: ["low risks"] },
    ]),
  },
  decisions: {
    label: viewCopy.decisions.label,
    sections: sections([
      {
        key: "decisions-overview",
        label: "ADRs capture architecture choices and pending candidates.",
        hints: ["decisions", "adrs"],
      },
      { key: "proposed-adrs", label: "Proposed ADRs", hints: ["proposed", "adr"] },
      { key: "adr-candidates", label: "ADR candidates", hints: ["candidates", "future"] },
    ]),
  },
  sources: {
    label: viewCopy.sources.label,
    sections: sections([
      {
        key: "sources-overview",
        label: "Know what the app can safely claim.",
        hints: ["sources", "claims"],
      },
      {
        key: "prepared-artifacts",
        label: "Prepared artifacts only",
        hints: ["prepared", "artifacts"],
      },
      { key: "reads-from", label: "Reads from", hints: ["reads", "sources"] },
      { key: "no-live-calls", label: "Should not call live", hints: ["no live calls", "safe"] },
      { key: "stakeholder-snapshot", label: "Stakeholder-safe snapshot", hints: ["snapshot"] },
    ]),
  },
};

export const WORKBENCH_VIEW_KEYS = Object.keys(WORKBENCH_DESTINATIONS) as ViewKey[];

export const workbenchAgentDestinations = WORKBENCH_VIEW_KEYS.map((view) => ({
  view,
  label: WORKBENCH_DESTINATIONS[view].label,
  aliases: [WORKBENCH_DESTINATIONS[view].label],
  sections: WORKBENCH_DESTINATIONS[view].sections.map((section) => section.key),
}));

export function isViewKey(value: string): value is ViewKey {
  return WORKBENCH_VIEW_KEYS.includes(value as ViewKey);
}

export function resolveDestination(
  destination: WorkbenchAgentDestination
): { view: ViewKey; section?: DestinationSection; label: string } | null {
  if (!isViewKey(destination.view)) return null;
  const view = WORKBENCH_DESTINATIONS[destination.view];
  if (!destination.section) return { view: destination.view, label: view.label };
  const section = resolveSection(destination.view, destination.section);
  if (!section) return null;
  return { view: destination.view, section, label: `${view.label}: ${section.label}` };
}

export function resolveSection(view: ViewKey, keyOrHint: string): DestinationSection | null {
  const needle = keyOrHint.trim().toLowerCase();
  if (!needle) return null;
  return (
    WORKBENCH_DESTINATIONS[view].sections.find(
      (section) =>
        section.key === needle ||
        section.label.toLowerCase() === needle ||
        section.hints.some((hint) => hint.toLowerCase() === needle)
    ) ?? null
  );
}

export function serializeDestinations() {
  return WORKBENCH_VIEW_KEYS.map((view) => ({
    view,
    label: WORKBENCH_DESTINATIONS[view].label,
    sections: WORKBENCH_DESTINATIONS[view].sections.map((section) => ({
      key: section.key,
      label: section.label,
    })),
  }));
}
