import { ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { GATEWAY } from "../../lib/gateway";
import type { MeetingEntry } from "../../types/brain";
import type { Board } from "../../views/workbench/agent-board-model";
import {
  type BoardReadState,
  type MeetingFollowUp,
  resolveMeetingAction,
} from "./meetingActionState";

const BOARD_POLL_MS = 15_000;

function kindLabel(kind: MeetingFollowUp["kind"]) {
  switch (kind) {
    case "commitment":
      return "Owed";
    case "document-request":
      return "Doc requested";
    case "reminder":
      return "Reminder";
    case "jira-change":
      return "Jira change";
  }
}

export function MeetingActionList({ meeting }: { meeting: MeetingEntry }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [boardReadState, setBoardReadState] = useState<BoardReadState>("loading");
  const [boardError, setBoardError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`${GATEWAY}/agent-board?cache=1`, { cache: "no-store" });
        const payload = (await response.json()) as { ok: boolean; data?: Board; error?: string };
        if (!response.ok || !payload.ok || !payload.data) {
          throw new Error(payload.error || `Agent Board read returned HTTP ${response.status}.`);
        }
        if (!active) return;
        setBoard(payload.data);
        setBoardReadState("ready");
        setBoardError(null);
      } catch (cause) {
        if (!active) return;
        setBoard(null);
        setBoardReadState("error");
        setBoardError(cause instanceof Error ? cause.message : String(cause));
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), BOARD_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const actions = useMemo(() => {
    let commitmentIndex = 0;
    return (meeting.followUps ?? []).map((item) => {
      const itemCommitmentIndex = item.kind === "commitment" ? commitmentIndex++ : -1;
      return {
        item,
        view: resolveMeetingAction({
          meeting,
          item,
          commitmentIndex: itemCommitmentIndex,
          board,
          boardReadState,
          boardError,
        }),
      };
    });
  }, [board, boardError, boardReadState, meeting]);

  if (!actions.length) return null;

  return (
    <div className="nested-card meeting-action-card" data-testid="meeting-followups">
      <span className="mono-kicker">Follow-up and execution</span>
      <ul className="meeting-followup-list" aria-live="polite">
        {actions.map(({ item, view }) => (
          <li
            className="meeting-followup"
            data-action-id={view.actionId}
            data-work-state={view.workState}
            key={view.actionId}
          >
            <div className="meeting-followup-head">
              <span className={`meeting-followup-kind meeting-followup-${item.kind}`}>
                {kindLabel(item.kind)}
              </span>
              <span className={`meeting-action-status meeting-action-status-${view.workState}`}>
                {view.workLabel}
              </span>
            </div>
            <span className="meeting-followup-text">
              {item.text}
              {item.owner ? ` (for ${item.owner})` : ""}
              {item.when ? ` by ${item.when}` : ""}
            </span>
            <div className="meeting-action-links">
              {view.jira ? (
                <a
                  className="meeting-action-jira"
                  href={view.jira.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {view.jira.key}
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              ) : (
                <span className="meeting-action-jira-missing">{view.jiraLabel}</span>
              )}
              {view.boardCardId && (
                <span className="meeting-action-board-reference">Agent Board record linked</span>
              )}
            </div>
            <span className="meeting-action-detail">{view.detail}</span>
            {view.evidence.length > 0 && (
              <details className="meeting-action-evidence">
                <summary>What the saved run says</summary>
                <ul>
                  {view.evidence.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
