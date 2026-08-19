// Search index, scoring, and filtering logic for the IP Corp Brain global search.

import {
  CalendarDays,
  FileCheck2,
  GitBranch,
  ListChecks,
  type LucideIcon,
  MessageSquareText,
  RadioTower,
  Sparkles,
  Split,
  TriangleAlert,
} from "lucide-react";
import { brain, sortedInsights } from "../data";
import type { Detail, SourceHealthItem } from "../types/brain";
import {
  formatDate,
  formatPriority,
  formatStatus,
  labelize,
  normalize,
  stripMarkdown,
  uniqueMeetings,
} from "./utils";

export type ViewKey =
  | "today"
  | "agent-board"
  | "autonomy"
  | "work"
  | "library"
  | "data-work"
  | "connections"
  | "readiness"
  | "meetings"
  | "daily-prep"
  | "meeting-wrap-up"
  | "weekly-status"
  | "workshops"
  | "timeline"
  | "packets"
  | "insights"
  | "actions"
  | "questions"
  | "risks"
  | "decisions"
  | "sources";

export type SearchResult = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  meta: string;
  icon: LucideIcon;
  view: ViewKey;
  detail?: Detail;
};

const sourceHealthEntries = Object.entries(brain.status.sourceHealth ?? {}) as Array<
  [string, SourceHealthItem]
>;

const allMeetings = uniqueMeetings([
  ...brain.meetingIndex.upcoming,
  ...brain.meetingIndex.active,
  ...brain.meetingIndex.recent,
]);

export function createSearchIndex(): SearchResult[] {
  const packets = brain.prepPackets.map<SearchResult>((packet) => ({
    id: `packet-${packet.id}`,
    kind: "Packet",
    title: packet.title,
    summary: packet.summary,
    meta: `${packet.openQuestions?.length ?? 0} questions · ${packet.risks?.length ?? 0} risks`,
    icon: FileCheck2,
    view: "packets",
    detail: { kind: "packet", value: packet },
  }));

  const meetings = allMeetings.map<SearchResult>((meeting, index) => ({
    id: `meeting-${meeting.id ?? index}`,
    kind: "Meeting",
    title: meeting.title,
    summary: meeting.whyNow ?? meeting.readinessStatus,
    meta: formatStatus(meeting.readinessStatus),
    icon: CalendarDays,
    view: "meetings",
    detail: { kind: "meeting", value: meeting },
  }));

  const insights = sortedInsights.map<SearchResult>((insight) => ({
    id: `insight-${insight.id}`,
    kind: "Insight",
    title: insight.title,
    summary: insight.summary,
    meta: `${Math.round(insight.confidence * 100)}% confidence`,
    icon: Sparkles,
    view: "insights",
    detail: { kind: "insight", value: insight },
  }));

  const proposals = brain.actionProposals.map<SearchResult>((proposal) => ({
    id: `proposal-${proposal.id}`,
    kind: "Action",
    title: proposal.title,
    summary: proposal.proposal?.suggestedAction ?? proposal.proposal?.whyNow ?? proposal.status,
    meta: formatStatus(proposal.status),
    icon: ListChecks,
    view: "actions",
    detail: { kind: "proposal", value: proposal },
  }));

  const questions = brain.openQuestions.map<SearchResult>((question) => ({
    id: `question-${question.id}`,
    kind: "Question",
    title: question.question,
    summary: `Owner: ${question.answerOwner}. Target: ${question.target}.`,
    meta: `${formatPriority(question.priority)} · ${formatStatus(question.status)}`,
    icon: MessageSquareText,
    view: "questions",
    detail: { kind: "question", value: question },
  }));

  const risks = brain.risks.map<SearchResult>((risk) => ({
    id: `risk-${risk.id}`,
    kind: "Risk",
    title: risk.risk,
    summary: risk.mitigation,
    meta: `${labelize(risk.severity)} · owner ${risk.owner}`,
    icon: TriangleAlert,
    view: "risks",
    detail: { kind: "risk", value: risk },
  }));

  const adrs = brain.adrs.adrs.map<SearchResult>((adr) => ({
    id: `adr-${adr.number}`,
    kind: "ADR",
    title: adr.title,
    summary: `Decider: ${adr.decider}`,
    meta: `${formatStatus(adr.status)} · ${formatDate(adr.date)}`,
    icon: GitBranch,
    view: "decisions",
    detail: { kind: "adr", value: adr, label: `ADR-${adr.number.slice(-4)}` },
  }));

  const candidates = brain.adrs.candidates.map<SearchResult>((candidate, index) => ({
    id: `candidate-${index}`,
    kind: "ADR candidate",
    title: stripMarkdown(candidate.topic),
    summary: candidate.source,
    meta: `${formatStatus(candidate.status)} · ${formatDate(candidate.dateFlagged)}`,
    icon: Split,
    view: "decisions",
    detail: { kind: "adr", value: candidate, label: "ADR candidate" },
  }));

  const sources = sourceHealthEntries.map<SearchResult>(([key, item]) => ({
    id: `source-${key}`,
    kind: "Source health",
    title: labelize(key),
    summary: item.note ?? item.status ?? "Source health lane",
    meta: formatStatus(item.status ?? "Unknown"),
    icon: RadioTower,
    view: "sources",
  }));

  return [
    ...packets,
    ...meetings,
    ...insights,
    ...proposals,
    ...questions,
    ...risks,
    ...adrs,
    ...candidates,
    ...sources,
  ];
}

export function filterSearchResults(index: SearchResult[], query: string) {
  const normalized = normalize(query);
  if (!normalized) return [];
  return index
    .map((result) => {
      const haystack = normalize(
        [result.kind, result.title, result.summary, result.meta].join(" ")
      );
      const score = scoreResult(haystack, normalized, result.title);
      return { result, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.result);
}

function scoreResult(haystack: string, query: string, title: string) {
  const terms = query.split(/\s+/).filter(Boolean);
  const titleHaystack = normalize(title);
  const matches = terms.filter((term) => haystack.includes(term)).length;
  if (!matches) return 0;
  const titleBoost = terms.some((term) => titleHaystack.includes(term)) ? 3 : 0;
  const exactBoost = haystack.includes(query) ? 4 : 0;
  return matches + titleBoost + exactBoost;
}

export function filterByQuery<T>(
  items: T[],
  query: string,
  fields: (item: T) => Array<string | undefined | null>
) {
  const normalized = normalize(query);
  if (!normalized) return items;
  const terms = normalized.split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const haystack = normalize(fields(item).filter(Boolean).join(" "));
    return terms.every((term) => haystack.includes(term));
  });
}
