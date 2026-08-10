// Ported from evilrabbit/lifeline (MIT) — https://github.com/evilrabbit/lifeline
//
// Upstream models a personal life story: markers are years and `birthYear`
// turns a year into an age. Here the axis is the Brain's own chronology, so
// the numeric unit is "days since the first captured day" and `baseline`
// replaces `birthYear`. Everything else keeps upstream's shape so a future
// upstream read is still a useful diff.
//
// Dropped from the port on purpose: company icons, floating photo cards, the
// hover-image cursor, the lightbox, and the fireworks easter egg. They are
// portfolio flourishes with no Brain equivalent, and the redaction rule means
// this surface carries no imagery it did not export itself.

import type { Detail } from "../../types/brain";

export type LifelineEventSegment =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

/**
 * Which lane an event came from — drives its accent and the legend. Each lane
 * is one real seed collection, so a lane can never show more than the Brain
 * actually exported:
 *
 * - `meeting`   → meetingIndex (upcoming + active + recent)
 * - `decision`  → adrs.adrs, dated by ADR date
 * - `candidate` → adrs.candidates, dated by dateFlagged
 * - `insight`   → cortexInsights, dated by createdAt
 * - `risk`      → risks, dated by lastReviewed
 */
export type LifelineLane = "meeting" | "decision" | "candidate" | "insight" | "risk";

/**
 * Object form lets an event carry the lane accent, a secondary line, and the
 * drawer payload to open when it is clicked.
 */
export interface LifelineEventObject {
  text: string | LifelineEventSegment[];
  lane?: LifelineLane;
  /** Clamped supporting line under the headline. */
  note?: string;
  /** Opens the shared detail drawer. Marks the event interactive. */
  detail?: Detail;
}

export type LifelineEvent = string | LifelineEventSegment[] | LifelineEventObject;

export interface LifelinePerson {
  name: string;
}

export interface LifelineMarker {
  id: string;
  /** Position on the numeric axis — days since `baseline` for this timeline. */
  unit: number;
  /** Shown above the label. Defaults to `unit - baseline`. */
  tag?: number | string;
  /** Shown in place of the raw unit — e.g. "Jul 29". */
  label?: string;
  events: LifelineEvent[];
  people?: LifelinePerson[];
}

export interface LifelineLegendItem {
  lane: LifelineLane;
  label: string;
  count: number;
}

/**
 * How the timeline relates to the page around it.
 *
 * - `"page"` — the timeline *is* the page. It owns the wheel and the arrow
 *   keys, and nothing scrolls behind it.
 * - `"embed"` — the timeline is one module in a scrolling page. Wheel over it
 *   scrubs the rail, and at either end the wheel is handed back so the page
 *   carries on scrolling.
 * - `"auto"` — measured at runtime: page mode only when the timeline covers
 *   most of the viewport *and* there is nothing behind it left to scroll.
 */
export type LifelineMode = "auto" | "page" | "embed";

export interface LifelineProps {
  markers: LifelineMarker[];
  baseline: number;
  className?: string;
  title?: string;
  mode?: LifelineMode;
  /** Column header over the `tag` row. */
  tagLabel?: string;
  /** Column header over the `label` row. */
  unitLabel?: string;
  /** Opens the shared detail drawer for an event that carries a payload. */
  onOpenDetail?: (detail: Detail) => void;
}
