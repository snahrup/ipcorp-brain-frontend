export type JiraStatus = {
  id: string;
  name: string;
  category: "new" | "indeterminate" | "done" | "undefined" | string;
};

export type JiraPerson = {
  accountId: string;
  displayName: string;
};

export type JiraAttachment = {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  createdAt: string | null;
  author: string;
};

export type JiraIssue = {
  key: string;
  summary: string;
  description: string;
  descriptionAdf: unknown | null;
  status: JiraStatus;
  priority: { id: string; name: string };
  assignee: JiraPerson | null;
  issueType: string;
  parentKey: string | null;
  labels: string[];
  dueDate: string | null;
  startDate: string | null;
  updatedAt: string;
  createdAt: string;
  timeTracking: {
    originalEstimate: string | null;
    remainingEstimate: string | null;
    timeSpent: string | null;
    originalEstimateSeconds: number | null;
    remainingEstimateSeconds: number | null;
    timeSpentSeconds: number | null;
  };
  attachments: JiraAttachment[];
  subtasks: Array<{ key: string; summary: string; status: string }>;
  links: Array<{
    id: string;
    type: string;
    direction: "inward" | "outward";
    key: string;
    summary: string;
  }>;
  comments: Array<{
    id: string;
    author: string;
    body: string;
    createdAt: string;
    updatedAt: string;
  }>;
  worklogs: Array<{
    id: string;
    author: string;
    comment: string;
    timeSpent: string | null;
    timeSpentSeconds: number;
    createdAt: string;
  }>;
  /**
   * The real max of `updatedAt`, every comment's createdAt, and every worklog's
   * createdAt — computed server-side rather than trusted from Jira's `updated` field
   * alone, so it is correct even if a workflow post-function or a silent field sync
   * ever touches `updated` without a comment or worklog alongside it.
   */
  lastActivityAt: string;
  /** One line: who did the most recent thing, and the narrative text if there is one. */
  lastActivitySummary: string;
};

export type JiraTransition = {
  id: string;
  name: string;
  to: string;
};

export type JiraInitiative = {
  projectKey: "MT";
  name: string;
  issues: JiraIssue[];
  statuses: JiraStatus[];
  assignees: JiraPerson[];
  priorities: Array<{ id: string; name: string }>;
  fetchedAt: string;
};

export type JiraIssueDetail = {
  issue: JiraIssue;
  transitions: JiraTransition[];
};

export type SubtaskProposal = {
  summary: string;
  description: string;
  estimateMinutes: number;
  /** Jira-formatted estimate string, e.g. "1h 30m". */
  estimate: string;
};

export type SubtaskBreakdown = {
  issueKey: string;
  parentEstimate: string | null;
  parentMinutes: number;
  totalMinutes: number;
  subtasks: SubtaskProposal[];
  generatedAt: string;
};

export type SubtaskApplyResult = {
  parent: JiraIssue;
  created: Array<{ key: string; summary: string }>;
  errors: string[];
  partial: boolean;
};

export type JiraConnection = {
  connected: boolean;
  initiativeKey: "MT";
  user: string;
  credentialSource: string;
};

export type ReconciliationSourceState = {
  id: string;
  label: string;
  state: "current" | "prepared" | "partial" | "unavailable" | "error" | "loading";
  detail: string;
};

export type ReconciliationProposal = {
  id: string;
  issueKey: string;
  category?:
    | "review-current-relevance"
    | "candidate-cancel-or-supersede"
    | "explicit-source-crosswalk"
    | "candidate-new-work"
    | string;
  title: string;
  /** How this scan sees the underlying evidence: brand new, changed since it was
   * last handled, or carried forward unresolved from an earlier scan. */
  freshness?: "new" | "changed" | "carried";
  /** Stable evidence identity used by the scan ledger to remember dispositions. */
  fingerprint?: string | null;
  effect: Record<string, unknown>;
  exactJiraEffect: string;
  sourceReferences: Array<{ label: string; reference: string }>;
  uncertainty?: string;
};

export type ReconciliationPreview = {
  id: string;
  scope: {
    projectKey: "MT";
    label: string;
    guarded: true;
  };
  generatedAt: string;
  sourceStates: ReconciliationSourceState[];
  proposals: ReconciliationProposal[];
  conflicts: Array<{ id: string; title: string; detail: string; blocking: boolean }>;
  portfolioSummary: {
    totalIssues: number;
    openIssues: number;
    doneIssues: number;
    staleOpenIssues: number;
    newestJiraUpdate: string | null;
    evidenceRecords: number;
    candidateChanges: number;
    safeToAutoApply: number;
    teamLibraryFiles: number;
    microsoft365Items: number;
    /** ISO timestamp of the previous scan, or null on the very first one. */
    sinceLastScan: string | null;
    scanCount: number;
    newEvidence: number;
    changedEvidence: number;
    carriedEvidence: number;
    resolvedEvidence: number;
    /** Start of the activity window; null when the window is switched off. */
    activityWindowFrom: string | null;
    activityWindowLabel: string;
    /** Counted and disclosed, never proposed. */
    olderThanWindow: number;
    undatedEvidence: number;
  };
  summary: string;
};
