import seedJson from "../data/frontend-seed.json";

// Re-export canonical types so existing imports continue to work during refactor.
// The source of truth is now src/types/brain.ts.
export type {
  ActionProposal,
  Adr,
  AdrCandidate,
  BrainSeed,
  CortexInsight,
  MeetingEntry,
  MeetingIndex,
  OpenQuestion,
  PrepPacket,
  Risk,
  SourceHealthItem,
  Status,
} from "./types/brain";

import type { BrainSeed } from "./types/brain";

export const brain = seedJson as BrainSeed;

export const sourceHealthEntries = Object.entries(brain.status.sourceHealth ?? {}) as Array<
  [string, import("./types/brain").SourceHealthItem]
>;

export const sortedInsights = [...brain.cortexInsights].sort(
  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
);

export const openProposals = brain.actionProposals.filter(
  (proposal) => proposal.status === "proposed"
);

export const nextBestPacket =
  brain.prepPackets.find((packet) => packet.id === "weekly-fabric-post-onsite-synthesis") ??
  brain.prepPackets[0];

export const packetById = new Map(brain.prepPackets.map((packet) => [packet.id, packet]));

export const formatDate = (value?: string | null) => {
  if (!value) return "Date not set";
  const hasTime = value.includes("T");
  // A bare YYYY-MM-DD parses as UTC midnight, which renders as the previous day in any
  // negative offset. A calendar date has no timezone, so build it in local time.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(value.slice(0, 10)) && !hasTime;
  const date = dateOnly
    ? (() => {
        const [y, m, d] = value.slice(0, 10).split("-").map(Number);
        return new Date(y, m - 1, d);
      })()
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: hasTime ? "numeric" : undefined,
    minute: hasTime ? "2-digit" : undefined,
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
