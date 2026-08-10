import { WorkbenchAgentError } from "./protocol.mjs";

export const VIEW_KEYS = [
  "today",
  "work",
  "library",
  "data-work",
  "connections",
  "readiness",
  "meetings",
  "daily-prep",
  "meeting-wrap-up",
  "workshops",
  "timeline",
  "packets",
  "insights",
  "actions",
  "questions",
  "risks",
  "decisions",
  "sources",
];

export const DEFAULT_SECTIONS = {
  today: ["summary", "active-work", "needs-review", "sources"],
  work: ["jira-work", "portfolio", "reconciliation", "activity"],
  library: ["team-library", "guides", "files", "preview"],
  "data-work": ["models", "sources", "migrations", "quality"],
  connections: ["jira", "microsoft365", "team-library", "local-services"],
  readiness: ["checks", "risks", "owners", "next-steps"],
  meetings: ["calendar", "packages", "captures", "closeout", "prep-coverage"],
  "daily-prep": ["today", "packages", "skipped", "evidence"],
  "meeting-wrap-up": ["meetings", "review", "drafts", "receipts"],
  workshops: ["library", "guided-tools", "outputs"],
  timeline: ["current", "milestones", "history"],
  packets: ["briefings", "attachments", "exports"],
  insights: ["overview", "findings", "trends"],
  actions: ["open", "reviewed", "done"],
  questions: ["open", "answered", "sources"],
  risks: ["active", "mitigations", "history"],
  decisions: ["recent", "records", "sources"],
  sources: ["health", "evidence", "exports"],
};

export function normalizeDestination(input, clientSections = {}) {
  const view = String(input?.view || "").trim();
  if (!VIEW_KEYS.includes(view)) {
    throw new WorkbenchAgentError(
      400,
      "Destination view is not registered.",
      "invalid_destination",
      {
        view,
      }
    );
  }

  const mergedSections = new Set([...(DEFAULT_SECTIONS[view] || [])]);
  for (const section of Array.isArray(clientSections?.[view]) ? clientSections[view] : []) {
    if (typeof section === "string" && section.trim()) {
      mergedSections.add(section.trim());
    }
  }

  const section = input?.section ? String(input.section).trim() : null;
  if (section && !mergedSections.has(section)) {
    throw new WorkbenchAgentError(
      400,
      "Destination section is not registered.",
      "invalid_section",
      {
        view,
        section,
      }
    );
  }

  return {
    view,
    section,
    label: String(input?.label || view).slice(0, 120),
    availableSections: [...mergedSections],
  };
}

export function destinationRegistry(clientSections = {}) {
  return VIEW_KEYS.map((view) => ({
    view,
    sections: [
      ...new Set([
        ...(DEFAULT_SECTIONS[view] || []),
        ...(Array.isArray(clientSections?.[view]) ? clientSections[view] : []),
      ]),
    ],
  }));
}
