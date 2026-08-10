// Ported from evilrabbit/lifeline (MIT). Geometry only — no styling.

import type { LifelineMarker } from "./types";

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Joins class names, skipping falsy entries. Local stand-in for upstream `cn`. */
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * A composited layer resting on a fractional offset resamples its whole
 * subtree — text goes soft. Snapping to the device pixel grid (not whole CSS
 * pixels) keeps half-pixel steps on retina, so motion stays smooth.
 */
export function snapToDevicePixel(value: number) {
  const dpr = window.devicePixelRatio || 1;
  return Math.round(value * dpr) / dpr;
}

export function hasMarkerContent(marker: LifelineMarker) {
  return marker.events.length > 0 || (marker.people?.length ?? 0) > 0;
}

export function hasMarkerPeople(marker: LifelineMarker) {
  return (marker.people?.length ?? 0) > 0;
}

/**
 * Upstream sizes a column from its event count and the gap to the next
 * marker, so a quiet stretch reads as a quiet stretch. Event cards here are
 * taller than upstream's one-line events, so the per-event step is larger.
 */
export function getMarkerHeight(marker: LifelineMarker, nextUnit?: number) {
  if (!hasMarkerContent(marker)) return 48;

  const people = marker.people?.length ?? 0;
  const peopleOnly = people > 0 && marker.events.length === 0;

  let height = 96;
  height += marker.events.length * 76;
  if (peopleOnly) height += 88;
  else if (people > 0) height += 108;

  if (nextUnit === undefined) {
    return Math.min(720, Math.max(peopleOnly ? 148 : 188, height));
  }

  const gap = Math.max(1, nextUnit - marker.unit);
  height += Math.min(32, gap * 3);

  return Math.min(720, Math.max(peopleOnly ? 148 : 188, height));
}

export function getMarkerWidth(marker: LifelineMarker, nextUnit?: number) {
  const hasContent = hasMarkerContent(marker);

  if (nextUnit === undefined) return hasContent ? 360 : 80;
  if (!hasContent) return 80;

  const people = marker.people?.length ?? 0;
  if (people > 0 && marker.events.length === 0) return 220;

  // Days, not years: the gap between two working days is 1-4, so the
  // multiplier is larger than upstream's 36-per-year to keep the same feel.
  const gap = Math.max(1, nextUnit - marker.unit);
  return Math.min(420, Math.max(300, 264 + gap * 26));
}
