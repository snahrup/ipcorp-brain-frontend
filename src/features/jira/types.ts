export type JiraStatus = {
  id: string;
  name: string;
  category: "new" | "indeterminate" | "done" | "undefined" | string;
};

export type JiraPerson = {
  accountId: string;
  displayName: string;
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
  };
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
  };
  summary: string;
};
