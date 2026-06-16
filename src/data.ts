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
