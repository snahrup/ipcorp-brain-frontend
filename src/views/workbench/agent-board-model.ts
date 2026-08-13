import { GATEWAY } from "../../lib/gateway";

/**
 * What the gateway hands the Agent Board, and the one rule the screen enforces
 * on top of it: a card is only ever clickable when the agent said what it
 * points at. Everything here comes from server/agent-board.mjs, which fills
 * `reference` on every card and leaves `href` null whenever no link can be
 * built from what is actually known.
 */

export type BoardReferenceType = "jira" | "meeting" | "deliverable" | "receipt" | "none";

export type BoardReference = {
  type: BoardReferenceType;
  id: string;
  label: string;
  href: string | null;
};

export type BoardCard = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  why: string;
  evidence: string[];
  reference: BoardReference;
  at: string;
  age: string;
  tone: "ok" | "amber" | "red";
  meta: string[];
};

export type BoardLane = { id: string; label: string; helper: string; cards: BoardCard[] };

export type Board = {
  generatedAt: string;
  date: string;
  sources: { id: string; label: string; ok: boolean; detail: string }[];
  lanes: BoardLane[];
};

const NO_REFERENCE: BoardReference = { type: "none", id: "", label: "", href: null };

/**
 * A gateway that has not been restarted yet sends cards with no reference at
 * all. Missing is read as nothing to point at, so an old payload renders inert
 * cards rather than links that go nowhere.
 */
export function referenceOf(card: BoardCard): BoardReference {
  const reference = card.reference;
  if (!reference || typeof reference.type !== "string" || reference.type === "none") {
    return NO_REFERENCE;
  }
  return { ...NO_REFERENCE, ...reference };
}

/**
 * Gateway routes are stored relative so they survive the phone tunnel, where
 * 127.0.0.1 means the phone. A Jira link is already absolute and passes through.
 */
export function resolveHref(href: string | null): string | null {
  if (!href) return null;
  return href.startsWith("/api/") ? `${GATEWAY}${href.slice(4)}` : href;
}

export function referenceSummary(reference: BoardReference): string {
  switch (reference.type) {
    case "jira":
      return `Jira issue ${reference.id}`;
    case "meeting":
      return `Meeting ${reference.id}`;
    case "deliverable":
      return `Stored files for ${reference.id}`;
    case "receipt":
      return `Pipeline record ${reference.id}`;
    default:
      return "Nothing outside this card.";
  }
}
