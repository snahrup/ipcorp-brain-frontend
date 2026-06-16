// Pure utility functions for the IP Corp Brain frontend.
// These have no side effects and are safe to use anywhere.

import type { MeetingEntry, PrepPacket } from "../types/brain";

const statusTranslations: Array<[RegExp, string]> = [
  [/calendar.*confirmation/i, "Ready · confirm calendar"],
  [/needs.*scheduling/i, "Ready · needs scheduling"],
  [/needs.*mike.*feedback/i, "Ready · needs feedback"],
  [/needs.*date/i, "Ready · needs date"],
  [/outcome.*executed/i, "Outcome executed"],
  [/fresh.*project.*memory.*design/i, "Fresh · design direction applied"],
  [/fresh.*no.*new.*inputs/i, "Fresh · no new inputs"],
  [/local.*export.*reviewed/i, "Local export reviewed"],
  [/proposed/i, "Proposed"],
  [/open/i, "Open"],
  [/ready/i, "Ready"],
  [/stale/i, "Stale"],
  [/blocked/i, "Blocked"],
];

export const formatDate = (value?: string | null) => {
  if (!value) return "Date not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: value.includes("T") ? "numeric" : undefined,
    minute: value.includes("T") ? "2-digit" : undefined,
  }).format(date);
};

export const compactNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: value > 999 ? "compact" : "standard" }).format(value);

export const labelize = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const clampText = (value: string | undefined, length = 160) => {
  if (!value) return "";
  return value.length > length ? `${value.slice(0, length - 1).trim()}...` : value;
};

export const normalize = (value: string | undefined | null) =>
  (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const formatStatus = (value?: string) => {
  if (!value) return "Unknown";
  const match = statusTranslations.find(([pattern]) => pattern.test(value));
  if (match) return match[1];
  return labelize(value)
    .replace(/\bAdr\b/g, "ADR")
    .replace(/\bPcd\b/g, "PCD")
    .replace(/\bEtq\b/g, "ETQ")
    .replace(/\bSql\b/g, "SQL")
    .replace(/\bBi\b/g, "BI");
};

export const toneForStatus = (value?: string): string => {
  const status = normalize(value);
  if (!status) return "neutral";
  if (status.includes("stale") || status.includes("risk") || status.includes("blocked"))
    return "orange";
  if (status.includes("need") || status.includes("proposed") || status.includes("confirm"))
    return "amber";
  if (status.includes("ready") || status.includes("fresh") || status.includes("executed"))
    return "green";
  return "neutral";
};

export const formatPriority = (value?: string) => {
  if (!value) return "Unprioritized";
  const normalized = value.toUpperCase();
  if (/^P\d/.test(normalized)) return `${normalized} priority`;
  return labelize(value);
};

export const stripMarkdown = (value: string) =>
  value
    .replace(/[`*_#[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const groupBy = <T>(items: T[], getKey: (item: T) => string) => {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    const key = getKey(item);
    groups[key] = groups[key] ?? [];
    groups[key].push(item);
    return groups;
  }, {});
};

/**
 * Turns ugly internal source/evidence references into clean, professional labels.
 *
 * The end user should never need to see raw backend naming conventions
 * (natively paths, UUIDs, internal filenames, nativelyMeetingId, etc.).
 */
export function humanizeEvidenceRef(raw: string | undefined | null): string {
  if (!raw) return "Unknown source";

  const input = raw.trim();

  // === Natively meeting captures (very common ugly pattern) ===
  if (/natively[\\/]meeting-captures/i.test(input)) {
    const dateMatch = input.match(/(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? formatShortDate(dateMatch[1]) : "";

    const partMatch = input.match(/\(part\s*(\d+)\)/i) || input.match(/part[-_]?(\d+)/i);
    const part = partMatch ? ` (part ${partMatch[1]})` : "";

    if (date) {
      return `Natively capture • ${date}${part}`;
    }
    return `Natively meeting capture${part}`;
  }

  // === Other natively artifacts ===
  if (/natively[\\/]/i.test(input)) {
    // If it contains JSON or technical fields, treat it as opaque
    if (input.includes("{") || /nativelyMeetingId|partId/i.test(input)) {
      return "Natively capture";
    }

    const filename = input.split(/[\\/]/).pop() || input;

    if (/status|meeting-index|contract/i.test(filename)) {
      return "Natively contract layer";
    }
    if (/meeting-capture/i.test(filename)) {
      return "Natively capture";
    }
    return "Natively artifact";
  }

  // === Long filesystem paths with dates or UUIDs ===
  if (/[A-Za-z]:[\\/]|[\\/]/.test(input) && input.length > 40) {
    const segments = input.split(/[\\/]/);
    const lastSegment = segments[segments.length - 1] || "";

    // If the last segment still looks like technical garbage, summarize it
    if (/\d{4}-\d{2}-\d{2}|untitled-session|[0-9a-f]{8,}/i.test(lastSegment)) {
      const dateMatch = input.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        return `Capture • ${formatShortDate(dateMatch[1])}`;
      }
      return "Internal capture";
    }

    // Otherwise just show a cleaned filename
    return lastSegment
      .replace(/[-_]/g, " ")
      .replace(/\.(json|md|txt|packet)$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // === Strip long technical IDs anywhere ===
  let cleaned = input
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "")
    .replace(/[0-9a-f]{16,}/gi, "")
    .replace(/nativelyMeetingId|partId|schemaVersion/gi, "")
    .replace(/[{}":,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length > 60) {
    cleaned = cleaned.slice(0, 57) + "…";
  }

  if (!cleaned) {
    return "Internal reference";
  }

  return cleaned;
}

function formatShortDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
  } catch {
    return dateStr;
  }
}

export function getRawEvidenceRef(raw: string | undefined | null): string {
  return raw || "";
}

export const uniqueMeetings = (meetings: MeetingEntry[]) => {
  const seen = new Set<string>();
  return meetings.filter((meeting) => {
    const key = meeting.id ?? `${meeting.title}-${meeting.startsAt ?? meeting.date ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getLinkedPacket = (meeting: MeetingEntry, packetById: Map<string, PrepPacket>) => {
  if (!meeting.packet) return undefined;
  const id = meeting.packet.replace("prep-packets/", "").replace(".packet.json", "");
  return packetById.get(id);
};
