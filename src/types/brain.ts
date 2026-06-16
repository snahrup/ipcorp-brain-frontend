// Canonical domain types for the IP Corp Architecture Brain (sanitized read model)
// Keep this file in sync with DATA_CONTRACT.md and the private brain's natively/ layer.

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

// UI detail union (used by drawer)
export type Detail =
  | { kind: "packet"; value: PrepPacket }
  | { kind: "insight"; value: CortexInsight }
  | { kind: "proposal"; value: ActionProposal }
  | { kind: "question"; value: OpenQuestion }
  | { kind: "risk"; value: Risk }
  | { kind: "adr"; value: Adr | AdrCandidate; label: string }
  | { kind: "meeting"; value: MeetingEntry };
