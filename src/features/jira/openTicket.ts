/**
 * Opening a ticket without leaving the Workbench.
 *
 * Ticket references appear all over the app: the activity view, the
 * reconciliation modal, meeting follow-ups, the briefing. Every one of them
 * used to be an anchor to ip-corporation.atlassian.net with target="_blank",
 * so following a reference meant a new browser window and losing whatever was
 * on screen. A reference should open the same modal the Work screen opens.
 *
 * A window event carries it rather than prop-drilling through a dozen
 * components, matching how the graph surfaces already talk to each other.
 */
export const OPEN_TICKET_EVENT = "workbench:open-ticket";

const KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/;

/** Extracts the issue key from a Jira browse URL, or null when it is not one. */
export function ticketKeyFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const match = /\/browse\/([A-Za-z][A-Za-z0-9]*-\d+)/.exec(String(href));
  if (!match) return null;
  const key = match[1].toUpperCase();
  return KEY_PATTERN.test(key) ? key : null;
}

export function isTicketKey(value: string | null | undefined): boolean {
  return Boolean(value && KEY_PATTERN.test(String(value).toUpperCase()));
}

/** Asks the app to open the ticket modal. No-op outside a browser. */
export function openTicket(issueKey: string): boolean {
  const key = String(issueKey || "").toUpperCase();
  if (!isTicketKey(key)) return false;
  if (typeof window === "undefined") return false;
  window.dispatchEvent(new CustomEvent(OPEN_TICKET_EVENT, { detail: { issueKey: key } }));
  return true;
}

/**
 * Click handler for anything that still carries a Jira href. Intercepts the
 * navigation and opens the modal instead; a modified click (new tab, middle
 * button) is left alone, because that is someone deliberately asking for Jira.
 */
export function interceptTicketClick(
  event: {
    preventDefault: () => void;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    button?: number;
  },
  href: string | null | undefined
): boolean {
  if (event.metaKey || event.ctrlKey || event.shiftKey || (event.button ?? 0) !== 0) return false;
  const key = ticketKeyFromHref(href);
  if (!key) return false;
  event.preventDefault();
  return openTicket(key);
}
