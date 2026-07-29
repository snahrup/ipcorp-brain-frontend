import type { Detail } from "./brain";

export type WorkSource = "brain" | "microsoft365" | "jira" | "fabric";

export type ConnectionState =
  | "current"
  | "prepared"
  | "local-only"
  | "stale"
  | "partial"
  | "unavailable"
  | "not-connected"
  | "off";

export type SourceReference = {
  source: WorkSource;
  label: string;
  reference: string;
  evidenceRefs?: string[];
};

export type SourcePassport = {
  id: WorkSource;
  name: string;
  purpose: string;
  state: ConnectionState;
  asOf?: string;
  freshUntil?: string;
  teamLive: boolean;
  ownerLocal?: boolean;
  summary: string;
  limitations: string[];
  capabilities: string[];
};

export type WorkState = "needs-you" | "in-progress" | "waiting" | "done";

export type TeamWorkItem = {
  id: string;
  title: string;
  summary: string;
  state: WorkState;
  urgency: "normal" | "soon" | "overdue";
  owner?: string;
  dueLabel?: string;
  updatedAt?: string;
  kind: "proposal" | "question" | "risk" | "decision";
  sources: SourceReference[];
  detail?: Detail;
  /**
   * True when the item's own source lane has stopped producing, so it is prepared
   * history rather than a current priority. Today never promotes these.
   */
  isHistorical?: boolean;
  /** Age in days of the lane this item came from, when known. */
  sourceAgeDays?: number;
};

export type WorkLane = {
  id: WorkState;
  label: string;
  helper: string;
  items: TeamWorkItem[];
};

export type ApprovalPreview = {
  id: string;
  system: "microsoft365" | "jira";
  action: string;
  target: string;
  itemTitle: string;
  before: string;
  after: string;
  basedOn: SourceReference[];
  disclosure: string;
};

export type CapabilityState = "available" | "preparation-only" | "unavailable" | "off";

export type CapabilityManifest = {
  id: string;
  label: string;
  plainSummary: string;
  technicalName: string;
  state: CapabilityState;
};

export type TeamWorkbenchSnapshot = {
  generatedAt: string;
  classification: string;
  sources: SourcePassport[];
  workItems: TeamWorkItem[];
  lanes: WorkLane[];
  capabilities: CapabilityManifest[];
};
