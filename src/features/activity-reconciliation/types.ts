export type ActivitySourceState =
  | "loading"
  | "current"
  | "empty"
  | "partial"
  | "unavailable"
  | "not_authorized"
  | "timed_out"
  | "malformed"
  | "failed"
  | "canceled";

export type ActivityRunStatus =
  | "running"
  | "stopping"
  | "interrupted"
  | "canceled"
  | "partial_success"
  | "completed";

export interface ActivitySourceProgress {
  id: string;
  label: string;
  state: ActivitySourceState;
  itemCount: number;
  changedCount: number;
  unchangedCount: number;
  detail: string;
  startedAt: string | null;
  finishedAt: string | null;
  confirmedThrough: string | null;
}

export interface ActivityJiraChange {
  kind: "comment" | "worklog" | "transition" | "create_issue";
  body?: string;
  comment?: string;
  minutes?: number;
  toStatus?: string;
  summary?: string;
  description?: string;
  projectKey?: string;
  issueType?: string;
  fields?: {
    labels?: string[];
    priority?: { name?: string };
    timetracking?: { originalEstimate?: string; remainingEstimate?: string };
    customfield_11915?: string;
    duedate?: string;
  };
}

export interface ActivityJiraProposal {
  id: string;
  destination: "jira";
  issueKey: string | null;
  title: string;
  actionLabel: string;
  reason: string;
  confidence: "exact" | "candidate" | "strong" | "unmatched" | "stale";
  requiresTargetReview: boolean;
  sourceId: string;
  evidenceIds: string[];
  expectedUpdated: string | null;
  before: { summary: string; status: string; updatedAt: string | null } | null;
  changes: ActivityJiraChange[];
  selectedByDefault: boolean;
}

export interface ActivityEmailDraft {
  id: string;
  destination: "email_draft";
  sourceId: string;
  to: string | null;
  subject: string;
  body: string;
  status: "draft_only";
  outlook?: {
    status: "created" | "failed" | "recipient_review";
    draftId?: string | null;
    detail?: string | null;
  } | null;
}

export interface ActivityMeetingResult {
  id: string;
  evidenceId: string;
  title: string;
  status: "pending_transcript" | "completed" | "repaired" | "partial" | "failed";
  detail: string;
  receipt?: Record<string, unknown> | null;
  links?: Array<{ label: string; href: string }>;
}

export interface ActivityRecapItem {
  id: string;
  kind: "meeting" | "proposal" | "applied" | "failure";
  title: string;
  detail: string;
  receipt: unknown;
  links: Array<{ label: string; href: string | null }>;
}

export interface ActivityRecap {
  generatedAt: string;
  changedItemCount: number;
  proposalCount: number;
  groups: Array<{
    sourceId: string;
    sourceLabel: string;
    destinations: Array<{
      id: string;
      label: string;
      items: ActivityRecapItem[];
    }>;
  }>;
}

export interface ActivityRun {
  id: string;
  status: ActivityRunStatus;
  baseline: boolean;
  startedAt: string;
  finishedAt: string | null;
  lastActivityAt: string;
  resumedAt: string | null;
  resumeCount: number;
  cancelRequested: boolean;
  resumable: boolean;
  phase: { id: string; label: string; index: number; total: number; startedAt: string };
  activity: string;
  windows: Record<
    string,
    {
      from: string;
      to: string;
      lateSweepFrom: string;
      overlapMinutes: number;
      previousPosition: string | null;
    }
  >;
  sources: Record<string, ActivitySourceProgress>;
  counts: {
    observed: number;
    new: number;
    changed: number;
    unchanged: number;
    jiraProposals: number;
    emailDrafts: number;
    meetingsProcessed: number;
    meetingsPending: number;
    failures: number;
  };
  jiraProposals: ActivityJiraProposal[];
  emailDrafts: ActivityEmailDraft[];
  meetings: ActivityMeetingResult[];
  actualChanges: Array<Record<string, unknown>>;
  recap: ActivityRecap | null;
  mdmCheck: {
    status: "completed" | "failed";
    generatedAt: string;
    previewId?: string | null;
    proposalCount?: number;
    detail?: string | null;
  } | null;
  events: Array<{ id: string; at: string; type: string; detail: string }>;
}

export interface ActivityStartResult {
  run: ActivityRun;
  attached: boolean;
  resumed: boolean;
}

export interface ActivityApplyReceipt {
  id: string;
  runId: string;
  proposalIds: string[];
  status: "complete" | "applying" | "recovery_required";
  startedAt: string;
  completedAt: string | null;
  results: Array<Record<string, unknown>>;
}
