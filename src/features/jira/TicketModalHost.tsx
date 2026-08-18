import { useCallback, useEffect, useState } from "react";
import { jiraGateway } from "./api";
import { JiraIssueModal } from "./JiraIssueModal";
import { OPEN_TICKET_EVENT } from "./openTicket";
import type { JiraInitiative } from "./types";

/**
 * Renders the ticket modal for anywhere in the app that references an issue.
 *
 * Mounted once at the shell. The Work screen and Today keep their own modals
 * because they already hold the initiative they need; this one serves every
 * other surface, so a ticket reference in a meeting follow-up or the
 * reconciliation modal opens here instead of throwing a browser window at a
 * Jira tab.
 *
 * The initiative is only fetched when a ticket is actually opened. It is a
 * heavy read, and paying for it on every page load to serve a link that may
 * never be clicked would be the wrong trade.
 */
export function TicketModalHost() {
  const [issueKey, setIssueKey] = useState<string | null>(null);
  const [initiative, setInitiative] = useState<JiraInitiative | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ issueKey?: string }>).detail;
      if (detail?.issueKey) setIssueKey(detail.issueKey);
    };
    window.addEventListener(OPEN_TICKET_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TICKET_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!issueKey || initiative) return;
    let cancelled = false;
    jiraGateway
      .initiative()
      .then((next) => {
        if (!cancelled) setInitiative(next);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Jira could not be read.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [issueKey, initiative]);

  const close = useCallback(() => {
    setIssueKey(null);
    setError(null);
  }, []);

  if (!issueKey) return null;

  // The modal needs the initiative for its status, assignee and priority
  // choices. Until it arrives the reader is told what is happening rather than
  // shown an empty modal or, worse, nothing at all after a click.
  if (!initiative) {
    return (
      <div className="wb-ticket-host-pending" role="status">
        {error ? `${issueKey} could not be opened: ${error}` : `Opening ${issueKey}...`}
        <button type="button" className="wb-button-secondary" onClick={close}>
          Close
        </button>
      </div>
    );
  }

  return (
    <JiraIssueModal
      issueKey={issueKey}
      initiative={initiative}
      onClose={close}
      // The list this modal was opened from is not owned here, so a save
      // refreshes nothing behind it; reopening reads the ticket again.
      onIssueUpdated={() => {}}
    />
  );
}
