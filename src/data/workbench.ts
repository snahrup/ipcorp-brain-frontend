import { brain } from "../data";
import type {
  CapabilityManifest,
  SourcePassport,
  SourceReference,
  TeamWorkbenchSnapshot,
  TeamWorkItem,
  WorkLane,
  WorkState,
} from "../types/workbench";

const brainSource = (reference: string, evidenceRefs?: string[]): SourceReference => ({
  source: "brain",
  label: "Team knowledge",
  reference,
  evidenceRefs,
});

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ageMs = (iso?: string | null) => {
  if (!iso) return Number.NaN;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? Date.now() - parsed : Number.NaN;
};
const ageDays = (ms: number) => (Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : undefined);

// manifest.generatedAt only records when the export last ran, so it is always "now" and
// says nothing about how current the content is. Freshness has to be judged per source
// lane. The natively lane (action proposals, prepared insights, packets) stopped
// producing on 2026-06-11, while questions, risks and meetings are parsed from the live
// Brain markdown on every sync.
const nativelyAgeMs = ageMs(
  brain.manifest.sourceHighWater?.latestNativelyRun ??
    brain.manifest.sourceHighWater?.brainStatusUpdatedAt
);
const preparedLaneIsStale = Number.isFinite(nativelyAgeMs) && nativelyAgeMs > WEEK_MS;
const preparedLaneAgeDays = ageDays(nativelyAgeMs);

const liveLaneAgeMs = ageMs(brain.meetingIndex?.updatedAt);
const brainSnapshotIsStale = Number.isFinite(liveLaneAgeMs)
  ? liveLaneAgeMs > WEEK_MS
  : preparedLaneIsStale;

const proposalItems: TeamWorkItem[] = brain.actionProposals.map((proposal) => {
  const normalizedStatus = proposal.status.toLowerCase();
  const state: WorkState =
    normalizedStatus === "done" || normalizedStatus === "completed"
      ? "done"
      : normalizedStatus === "approved" || normalizedStatus === "in_progress"
        ? "in-progress"
        : normalizedStatus === "waiting" || normalizedStatus === "blocked"
          ? "waiting"
          : "needs-you";

  return {
    id: `proposal-${proposal.id}`,
    title: proposal.title,
    summary:
      proposal.proposal?.whyNow ??
      proposal.proposal?.suggestedAction ??
      "A prepared next step from the Workbench.",
    state,
    urgency: proposal.risk?.level?.toLowerCase() === "high" ? "soon" : "normal",
    owner: proposal.proposal?.target,
    updatedAt: proposal.updatedAt ?? proposal.createdAt,
    kind: "proposal",
    sources: [
      brainSource(`Action proposal ${proposal.id}`, [
        ...(proposal.evidenceRefs ?? []),
        ...(proposal.sourceInsightRefs ?? []),
      ]),
    ],
    detail: { kind: "proposal", value: proposal },
    isHistorical: preparedLaneIsStale,
    sourceAgeDays: preparedLaneAgeDays,
  };
});

const questionItems: TeamWorkItem[] = brain.openQuestions.map((question) => ({
  id: `question-${question.id}`,
  title: question.question,
  summary: `Answer needed from ${question.answerOwner || "the right owner"} for ${question.target}.`,
  state: question.status.toLowerCase().includes("answer") ? "done" : "waiting",
  urgency: question.priority.toLowerCase() === "high" ? "soon" : "normal",
  owner: question.answerOwner,
  dueLabel: question.target,
  kind: "question",
  sources: [brainSource(`Open question ${question.id}`)],
  detail: { kind: "question", value: question },
}));

const riskItems: TeamWorkItem[] = brain.risks
  .filter((risk) => ["high", "critical"].includes(risk.severity.toLowerCase()))
  .map((risk) => ({
    id: `risk-${risk.id}`,
    title: risk.risk,
    summary: risk.mitigation,
    state: "in-progress",
    urgency: risk.severity.toLowerCase() === "critical" ? "overdue" : "soon",
    owner: risk.owner,
    updatedAt: risk.lastReviewed,
    kind: "risk",
    sources: [brainSource(`Risk ${risk.id}`)],
    detail: { kind: "risk", value: risk },
  }));

const allWorkItems = [...proposalItems, ...questionItems, ...riskItems];

const laneMeta: Array<Pick<WorkLane, "id" | "label" | "helper">> = [
  { id: "needs-you", label: "Needs you", helper: "Prepared work waiting for a decision." },
  { id: "in-progress", label: "In progress", helper: "Work that already has an owner." },
  { id: "waiting", label: "Waiting", helper: "Blocked on an answer, source, or connection." },
  { id: "done", label: "Done", helper: "Recently resolved prepared work." },
];

export const workLanes: WorkLane[] = laneMeta.map((lane) => ({
  ...lane,
  items: allWorkItems.filter((item) => item.state === lane.id),
}));

export const sourcePassports: SourcePassport[] = [
  {
    id: "brain",
    name: "Workbench",
    purpose: "Trusted decisions, meeting context, risks, questions, and evidence.",
    state: brainSnapshotIsStale ? "stale" : "prepared",
    asOf: brain.manifest.generatedAt,
    teamLive: true,
    summary: brainSnapshotIsStale
      ? "Prepared snapshot needs a source refresh"
      : "Prepared team-safe snapshot",
    limitations: [
      "This interface shows curated artifacts, not raw captures or private repository material.",
      ...(brainSnapshotIsStale
        ? ["The prepared snapshot is older than seven days and should not be treated as current."]
        : []),
    ],
    capabilities: ["Team Library", "Prepared meeting notes", "Team knowledge work"],
  },
  {
    id: "microsoft365",
    name: "Copilot Cowork · Microsoft 365",
    purpose:
      "Read-only Email, Calendar, Teams, and Files through the approved local Copilot Cowork connector.",
    state: "local-only",
    teamLive: false,
    ownerLocal: true,
    summary: "Availability not checked in this view",
    limitations: [
      "Opening Connections does not start a Microsoft 365 request or verify authentication.",
      "Prepared meeting context is separate from any live Microsoft 365 result.",
    ],
    capabilities: [
      "Owner-local Microsoft 365 workflow",
      "Bounded MDM evidence reconciliation",
      "Prepared meeting context",
    ],
  },
  {
    id: "jira",
    name: "Jira",
    purpose:
      "Issue ownership, status, comments, and workflow through the configured local gateway.",
    state: "local-only",
    teamLive: false,
    ownerLocal: true,
    summary: "Availability not checked in this view",
    limitations: [
      "Opening Connections does not contact Jira or prove that authentication is current.",
      "Only an observed Jira response can establish a connected, unavailable, or authentication-required state.",
    ],
    capabilities: ["Local Jira gateway", "Prepared transition previews"],
  },
  {
    id: "fabric",
    name: "Data work",
    purpose: "Optional Fabric and Altimate analysis tools loaded only when opened.",
    state: "off",
    teamLive: false,
    ownerLocal: true,
    summary: "Local-only tools; availability not checked",
    limitations: [
      "No background polling or specialist data process runs from the daily Workbench.",
      "Tool availability is shown independently inside Data work.",
    ],
    capabilities: ["SQL review", "Compare sources", "Field lineage", "SQL conversion"],
  },
];

export const dataWorkCapabilities: CapabilityManifest[] = [
  {
    id: "explore",
    label: "Explore data",
    plainSummary: "Ask a bounded question and review the result before using it.",
    technicalName: "sql_execute",
    state: "preparation-only",
  },
  {
    id: "compare",
    label: "Compare sources",
    plainSummary: "Check whether two sources agree and explain meaningful differences.",
    technicalName: "data_diff",
    state: "preparation-only",
  },
  {
    id: "review",
    label: "Review SQL",
    plainSummary: "Find correctness, safety, and performance problems in a query.",
    technicalName: "sql_analyze",
    state: "available",
  },
  {
    id: "lineage",
    label: "Trace fields",
    plainSummary: "See where a field comes from and what it can affect.",
    technicalName: "column_lineage",
    state: "available",
  },
  {
    id: "translate",
    label: "Convert SQL",
    plainSummary: "Translate SQL between supported systems with review notes.",
    technicalName: "sql_translate",
    state: "available",
  },
  {
    id: "models",
    label: "Models & tests",
    plainSummary: "Review model definitions and test outcomes when a project is connected.",
    technicalName: "dbt tools",
    state: "unavailable",
  },
];

export const workbenchSnapshot: TeamWorkbenchSnapshot = {
  // The live Brain lane, not the export timestamp. This is what Today gates on.
  generatedAt: brain.meetingIndex?.updatedAt ?? brain.manifest.generatedAt,
  classification: brain.manifest.classification,
  sources: sourcePassports,
  workItems: allWorkItems,
  lanes: workLanes,
  capabilities: dataWorkCapabilities,
};
