import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Brain,
  CalendarDays,
  FileCheck2,
  GitBranch,
  History,
  ListChecks,
  MessageSquareText,
  RadioTower,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import type { ViewKey } from "./search";

export const viewCopy: Record<
  ViewKey,
  { label: string; eyebrow: string; title: string; summary: string; action: string }
> = {
  today: {
    label: "Today",
    eyebrow: "Team workbench",
    title: "Start with what is current.",
    summary: "Prepared work, open decisions, waiting items, and recent progress in one place.",
    action: "Review first up",
  },
  "agent-board": {
    label: "Agent Board",
    eyebrow: "Automation status",
    title: "What the agent is doing, without asking it.",
    summary:
      "Only the agent's own pipelines write this board. Cards age amber then red on their own, so a glance answers whether it is keeping up.",
    action: "Check what is waiting on you",
  },
  work: {
    label: "Work",
    eyebrow: "Team knowledge work",
    title: "Keep the next move visible.",
    summary:
      "Use the Jira workspace deliberately. Availability and authentication come only from an observed gateway response.",
    action: "Review prepared work",
  },
  library: {
    label: "Team Library",
    eyebrow: "Trusted shared context",
    title: "Find the context behind the work.",
    summary:
      "Prepared meeting notes, decisions, questions, risks, and the connection map stay together.",
    action: "Open a collection",
  },
  "data-work": {
    label: "Data work",
    eyebrow: "Optional specialist tools",
    title: "Open data tools only when the work needs them.",
    summary:
      "Review grounded Fabric and Altimate capabilities without adding weight to the daily Workbench.",
    action: "Choose a data tool",
  },
  connections: {
    label: "Connections",
    eyebrow: "Source and access status",
    title: "Know what is stale, local-only, or not checked.",
    summary: "Each source separates prepared metadata from an observed connection state.",
    action: "Review source status",
  },
  readiness: {
    label: "Start Here",
    eyebrow: "Readiness command center",
    title: "Start with the right work.",
    summary:
      "Review the evidence gap, open the next packet, and clear gated actions from one place.",
    action: "Review the next best packet",
  },
  meetings: {
    label: "Meetings",
    eyebrow: "Signal intake",
    title: "Use meetings to understand what changed.",
    summary:
      "Upcoming, active, and recent meetings are grouped by the role they play in readiness.",
    action: "Open the linked packet",
  },
  "daily-prep": {
    label: "Daily meeting prep",
    eyebrow: "Morning review",
    title: "Review today’s meeting packages before the day begins.",
    summary:
      "Open the prepared context, confirm what is available, and print the package for discussion.",
    action: "Open today’s prep",
  },
  "meeting-wrap-up": {
    label: "Meeting Wrap-up",
    eyebrow: "Post-meeting review",
    title: "Turn today’s meetings into reviewable follow-up.",
    summary:
      "Process a listed meeting, review the recommended changes, and keep the completed package in the Brain.",
    action: "Process a meeting",
  },
  "weekly-status": {
    label: "Weekly Status",
    eyebrow: "Weekly deliverable",
    title: "Send leadership the week in one read.",
    summary:
      "Generate the status update from the week's real Jira movement, edit it, then create the Outlook draft.",
    action: "Generate this week's update",
  },
  workshops: {
    label: "Workshops",
    eyebrow: "Working sessions",
    title: "Run the session and leave with the decisions.",
    summary:
      "Prepare the run of show, walk the room through it, capture what gets decided, and hand each person their part.",
    action: "Open the run of show",
  },
  timeline: {
    label: "Timeline",
    eyebrow: "Brain chronology",
    title: "See the order things actually happened in.",
    summary:
      "Meetings, decisions, flagged topics, insights, and risk reviews on the day each record carries. Quiet stretches stay quiet.",
    action: "Scrub the rail",
  },
  packets: {
    label: "Prep Packets",
    eyebrow: "Meeting preparation",
    title: "Each packet is a stakeholder-safe brief.",
    summary:
      "Packets combine current state, open questions, risks, talking points, posture, and evidence references.",
    action: "Open a packet",
  },
  insights: {
    label: "Insights",
    eyebrow: "Cortex reasoning",
    title: "Insights explain the pattern behind the work.",
    summary:
      "Use this area to inspect synthesized observations, confidence, tags, and recommended actions.",
    action: "Review the reasoning trail",
  },
  actions: {
    label: "Actions",
    eyebrow: "Approval queue",
    title: "Actions are proposed moves, not silent automation.",
    summary:
      "Each recommendation shows the suggested action, wording, risk level, and what approval it needs before anything happens.",
    action: "Review gated actions",
  },
  questions: {
    label: "Questions",
    eyebrow: "Open loop register",
    title: "Questions make ownership and next targets explicit.",
    summary:
      "Use this queue to find who owns each answer, what it blocks, and when it should be resolved.",
    action: "Find a blocking question",
  },
  risks: {
    label: "Risks",
    eyebrow: "Exposure register",
    title: "Risks connect concern, likelihood, owner, and mitigation.",
    summary:
      "This board turns architecture risk into reviewable work instead of vague anxiety fog.",
    action: "Review mitigation",
  },
  decisions: {
    label: "Decisions",
    eyebrow: "Decision memory",
    title: "ADRs capture architecture choices and pending candidates.",
    summary:
      "Use this register to see proposed decisions, candidate topics, superseded items, and deciders.",
    action: "Open an ADR",
  },
  sources: {
    label: "Source Health",
    eyebrow: "Trust and boundary checks",
    title: "Know what the app can safely claim.",
    summary:
      "Source health explains freshness, input lanes, runtime boundaries, and redaction policy.",
    action: "Inspect freshness",
  },
};

export const learningCards = [
  {
    icon: FileCheck2,
    label: "Prep Packet",
    body: "A meeting-ready brief: current state, questions, risks, posture, and proof trail.",
  },
  {
    icon: Sparkles,
    label: "Cortex Insight",
    body: "A synthesized pattern with confidence, observations, connections, and a recommended next move.",
  },
  {
    icon: GitBranch,
    label: "ADR",
    body: "Architecture decision record. Use it when an architecture choice needs reviewable memory.",
  },
  {
    icon: ShieldCheck,
    label: "Stakeholder-safe",
    body: "The app shows curated artifacts only; raw captures, credentials, and private notes are excluded.",
  },
];

export const navSections = [
  {
    label: "Orient",
    items: [
      {
        key: "readiness" as ViewKey,
        label: "Start Here",
        helper: "What needs attention now",
        icon: Brain,
      },
      {
        key: "meetings" as ViewKey,
        label: "Meetings",
        helper: "Upcoming, active, recent signals",
        icon: CalendarDays,
      },
      {
        key: "timeline" as ViewKey,
        label: "Timeline",
        helper: "The chronology, day by day",
        icon: History,
      },
    ],
  },
  {
    label: "Prepare",
    items: [
      {
        key: "packets" as ViewKey,
        label: "Prep Packets",
        helper: "Briefs ready to use in meetings",
        icon: FileCheck2,
      },
      {
        key: "insights" as ViewKey,
        label: "Insights",
        helper: "Synthesized patterns and reasoning",
        icon: Sparkles,
      },
    ],
  },
  {
    label: "Resolve",
    items: [
      {
        key: "actions" as ViewKey,
        label: "Actions",
        helper: "Recommendations and next moves",
        icon: ListChecks,
      },
      {
        key: "questions" as ViewKey,
        label: "Questions",
        helper: "Open asks, owners, and targets",
        icon: MessageSquareText,
      },
      {
        key: "risks" as ViewKey,
        label: "Risks",
        helper: "Exposure, severity, mitigation",
        icon: TriangleAlert,
      },
      {
        key: "decisions" as ViewKey,
        label: "Decisions",
        helper: "ADRs and candidates",
        icon: GitBranch,
      },
    ],
  },
  {
    label: "Trust",
    items: [
      {
        key: "sources" as ViewKey,
        label: "Source Health",
        helper: "Freshness, boundaries, redaction",
        icon: RadioTower,
      },
    ],
  },
] as const;

// Re-export needed icons to avoid duplication in App
export {
  Archive,
  Brain,
  CalendarDays,
  FileCheck2,
  GitBranch,
  History,
  ListChecks,
  MessageSquareText,
  RadioTower,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
