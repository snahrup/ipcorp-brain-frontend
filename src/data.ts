import seedJson from "../data/frontend-seed.json";

export type SourceHealthItem = {
  status?: string;
  latestInput?: string;
  latestCapturedAt?: string;
  latestOutcomeAt?: string;
  latestExportedAt?: string;
  latestGeneratedAt?: string;
  note?: string;
};

export type Status = {
  updatedAt: string;
  freshnessLabel: string;
  counts: Record<string, number>;
  sourceHealth: Record<string, SourceHealthItem>;
  contradictionsNeedingSteve?: Array<{
    id: string;
    severity: string;
    status: string;
    newInfo: string;
    existingRule: string;
    sourceRefs: string[];
    recommendation: string;
  }>;
  readinessImprovements?: Array<{
    id: string;
    title: string;
    summary: string;
    sourceRefs: string[];
  }>;
  runtimeBoundary?: {
    nativelyReadsFrom: string[];
    nativelyShouldNotCallLive: string[];
    nativelyMayReadMetadata: string[];
    boundaryStatement: string;
  };
};

export type MeetingIndex = {
  updatedAt: string;
  readinessSummary: {
    status: string;
    nextBestPacket: string;
    note: string;
  };
  upcoming: MeetingEntry[];
  active: MeetingEntry[];
  recent: MeetingEntry[];
  missingOrStalePackets?: Array<{
    id: string;
    severity: string;
    note: string;
    source: string;
  }>;
};

export type MeetingEntry = {
  id?: string;
  title: string;
  startsAt?: string | null;
  date?: string;
  readinessStatus: string;
  packet?: string;
  source?: string;
  whyNow?: string;
  feedsPackets?: string[];
  feedsInsights?: string[];
};

export type PrepPacket = {
  id: string;
  title: string;
  startsAt?: string | null;
  attendees?: string[];
  summary: string;
  whyItMatters?: string;
  currentState?: string[];
  relatedWork?: string[];
  openQuestions?: string[];
  openCommitments?: string[];
  talkingPoints?: string[];
  risks?: string[];
  suggestedPosture?: string;
  evidenceRefs?: string[];
  liveContextMarkdown?: string;
  decisionsPending?: string[];
  relatedPriorMeetings?: string[];
};

export type CortexInsight = {
  id: string;
  type: string;
  title: string;
  summary: string;
  createdAt: string;
  confidence: number;
  reasoning: {
    trigger?: string;
    observations?: string[];
    connections?: string[];
    chain?: string[];
    alternativesConsidered?: string[];
    confidenceFactors?: string[];
  };
  recommendedAction?: string;
  actionProposalRefs?: string[];
  tags?: string[];
  updatedAt?: string;
};

export type ActionProposal = {
  id: string;
  type: string;
  title: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  sourceInsightRefs?: string[];
  evidenceRefs?: string[];
  proposal?: {
    target?: string;
    suggestedAction?: string;
    suggestedWording?: string;
    whyNow?: string;
  };
  approval?: {
    required: boolean;
    reason?: string;
  };
  risk?: {
    level?: string;
    notes?: string;
  };
  executionReadiness?: unknown;
  tags?: string[];
};

export type OpenQuestion = {
  id: string;
  priority: string;
  question: string;
  answerOwner: string;
  target: string;
  status: string;
};

export type Risk = {
  id: string;
  risk: string;
  severity: string;
  likelihood: string;
  exposed: string;
  mitigation: string;
  owner: string;
  lastReviewed?: string;
};

export type Adr = {
  number: string;
  title: string;
  status: string;
  date: string;
  decider: string;
  supersedes?: string;
};

export type AdrCandidate = {
  dateFlagged: string;
  topic: string;
  source: string;
  status: string;
};

export type BrainSeed = {
  manifest: {
    generatedAt: string;
    classification: string;
    counts: Record<string, number>;
    redactionPolicy: string;
  };
  status: Status;
  meetingIndex: MeetingIndex;
  prepPackets: PrepPacket[];
  cortexInsights: CortexInsight[];
  actionProposals: ActionProposal[];
  openQuestions: OpenQuestion[];
  risks: Risk[];
  adrs: {
    adrs: Adr[];
    candidates: AdrCandidate[];
  };
};

export const brain = seedJson as BrainSeed;

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
    minute: value.includes("T") ? "2-digit" : undefined
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
