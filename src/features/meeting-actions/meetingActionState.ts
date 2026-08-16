import type { MeetingEntry } from "../../types/brain";
import type { Board, BoardCard, BoardLane } from "../../views/workbench/agent-board-model";

export type MeetingFollowUp = NonNullable<MeetingEntry["followUps"]>[number];
export type BoardReadState = "loading" | "ready" | "error";
export type MeetingActionWorkState =
  | "checking"
  | "running"
  | "completed"
  | "waiting"
  | "not-started"
  | "unavailable";

export type MeetingActionView = {
  actionId: string;
  jira: { key: string; href: string } | null;
  jiraLabel: string;
  workState: MeetingActionWorkState;
  workLabel: string;
  detail: string;
  evidence: string[];
  boardCardId: string | null;
};

const JIRA_BASE_URL = "https://ip-corporation.atlassian.net";
const JIRA_KEY = /^(?:IPC|MT)-\d+$/i;
const LANE_ORDER = ["working", "delivered", "waiting", "watching"];

function validJiraKey(value: string | undefined): string | null {
  const key = String(value || "")
    .trim()
    .toUpperCase();
  return JIRA_KEY.test(key) ? key : null;
}

function allCards(board: Board | null): Array<{ lane: BoardLane; card: BoardCard }> {
  if (!board) return [];
  return [...board.lanes]
    .sort((a, b) => LANE_ORDER.indexOf(a.id) - LANE_ORDER.indexOf(b.id))
    .flatMap((lane) => lane.cards.map((card) => ({ lane, card })));
}

function ticketAgentFor(board: Board | null, jiraKey: string | null) {
  if (!jiraKey) return null;
  return (
    allCards(board).find(
      ({ card }) =>
        card.kind === "ticket-agent" &&
        card.reference?.type === "jira" &&
        card.reference.id.toUpperCase() === jiraKey
    ) ?? null
  );
}

function commitmentFor(
  board: Board | null,
  meetingId: string | undefined,
  commitmentIndex: number
) {
  if (!meetingId || commitmentIndex < 0) return null;
  const expectedId = `commitment-${meetingId}-${commitmentIndex}`;
  return allCards(board).find(({ card }) => card.id === expectedId) ?? null;
}

function viewFromTicketAgent(
  actionId: string,
  jira: MeetingActionView["jira"],
  match: { lane: BoardLane; card: BoardCard }
): MeetingActionView {
  const { lane, card } = match;
  if (lane.id === "working") {
    return {
      actionId,
      jira,
      jiraLabel: jira?.key ?? "No Jira issue linked",
      workState: "running",
      workLabel: "Running now",
      detail: card.detail,
      evidence: card.evidence ?? [],
      boardCardId: card.id,
    };
  }
  if (lane.id === "delivered") {
    return {
      actionId,
      jira,
      jiraLabel: jira?.key ?? "No Jira issue linked",
      workState: "completed",
      workLabel: "Completed",
      detail: card.detail,
      evidence: card.evidence ?? [],
      boardCardId: card.id,
    };
  }
  return {
    actionId,
    jira,
    jiraLabel: jira?.key ?? "No Jira issue linked",
    workState: "waiting",
    workLabel: "Waiting",
    detail: card.detail,
    evidence: card.evidence ?? [],
    boardCardId: card.id,
  };
}

export function resolveMeetingAction(input: {
  meeting: MeetingEntry;
  item: MeetingFollowUp;
  commitmentIndex: number;
  board: Board | null;
  boardReadState: BoardReadState;
  boardError?: string | null;
}): MeetingActionView {
  const { meeting, item, commitmentIndex, board, boardReadState, boardError } = input;
  const jiraKey = validJiraKey(item.jiraKey);
  const jira = jiraKey
    ? { key: jiraKey, href: `${JIRA_BASE_URL}/browse/${encodeURIComponent(jiraKey)}` }
    : null;

  if (boardReadState === "loading") {
    return {
      actionId: item.actionId,
      jira,
      jiraLabel: jira?.key ?? "No Jira issue linked",
      workState: "checking",
      workLabel: "Checking run status",
      detail: "Reading the saved Agent Board state.",
      evidence: [],
      boardCardId: null,
    };
  }

  if (boardReadState === "error") {
    return {
      actionId: item.actionId,
      jira,
      jiraLabel: jira?.key ?? "No Jira issue linked",
      workState: "unavailable",
      workLabel: "Run status unavailable",
      detail: boardError || "The saved Agent Board state could not be read.",
      evidence: [],
      boardCardId: null,
    };
  }

  const ticketAgent = ticketAgentFor(board, jiraKey);
  if (ticketAgent) return viewFromTicketAgent(item.actionId, jira, ticketAgent);

  if (item.kind === "commitment") {
    const commitment = commitmentFor(board, meeting.id, commitmentIndex);
    if (commitment) {
      return {
        actionId: item.actionId,
        jira,
        jiraLabel: jira?.key ?? "No Jira issue linked",
        workState: "waiting",
        workLabel: "Waiting, no run linked",
        detail: commitment.card.detail,
        evidence: commitment.card.evidence ?? [],
        boardCardId: commitment.card.id,
      };
    }
  }

  return {
    actionId: item.actionId,
    jira,
    jiraLabel: jira?.key ?? "No Jira issue linked",
    workState: "not-started",
    workLabel: "Autonomous work not started",
    detail: jira
      ? "The issue is linked, but no saved ticket-agent run exists for it."
      : "No Jira issue or saved agent run is linked to this follow-up.",
    evidence: [],
    boardCardId: null,
  };
}
