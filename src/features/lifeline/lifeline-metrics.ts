// Ported from evilrabbit/lifeline (MIT). Split out of `lifeline-labels` so the
// scroll hook can read the geometry without importing a component.

export const LIFELINE_LABEL_COLUMN_WIDTH = 60;
export const LIFELINE_LABEL_GAP = 16;
/**
 * Reserved at the head of the track for the pinned label column. The track's
 * total width includes it, and the column paints an opaque background: once
 * the track scrolls, marker text passes underneath and would otherwise read
 * straight through the two headers.
 */
export const LIFELINE_STICKY_SHIELD_WIDTH = LIFELINE_LABEL_COLUMN_WIDTH + LIFELINE_LABEL_GAP;
export const LIFELINE_STICKY_LEFT = 20;
export const LIFELINE_MOBILE_BREAKPOINT = 768;
