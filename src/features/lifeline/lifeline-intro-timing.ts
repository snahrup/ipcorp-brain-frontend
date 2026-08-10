// Ported verbatim from evilrabbit/lifeline (MIT), minus the `years` naming.
//
// The opening sweep does not run at a constant speed. It lingers over the
// first few markers so the reader learns the shape of a column, then eases
// out through the rest. `getEasePower` solves for the exponent that puts the
// slow stretch at LIFELINE_SLOW_TIME_RATIO of the wall-clock duration.

import { clamp } from "./lifeline-utils";

/** Tweak these */
export const LIFELINE_SLOW_MARKERS = 5;
export const LIFELINE_SLOW_TIME_RATIO = 0.38;
export const LIFELINE_SLOW_MARKER_FADE_MS = 720;
export const LIFELINE_FAST_MARKER_FADE_MS = 280;
/** Set > 0 to override the auto-calibrated ease power */
export const LIFELINE_EASE_POWER = 0;

function smoothstep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function getSlowTrackWidth(widths: number[]) {
  return widths.slice(0, LIFELINE_SLOW_MARKERS).reduce((sum, width) => sum + width, 0);
}

export function getSlowTrackPortion(widths: number[]) {
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total <= 0) return 0;
  return getSlowTrackWidth(widths) / total;
}

function getEasePower(widths: number[]) {
  if (LIFELINE_EASE_POWER > 0) return LIFELINE_EASE_POWER;

  const slowPortion = getSlowTrackPortion(widths);
  const softenedPivot = smoothstep(LIFELINE_SLOW_TIME_RATIO);

  if (slowPortion <= 0 || softenedPivot <= 0 || softenedPivot >= 1) {
    return 2.6;
  }

  return Math.log(slowPortion) / Math.log(softenedPivot);
}

function softenedTime(elapsedMs: number, railMs: number) {
  return smoothstep(elapsedMs / railMs);
}

export function trackProgressAtTime(elapsedMs: number, widths: number[], railMs: number) {
  if (railMs <= 0) return 0;

  const t = softenedTime(elapsedMs, railMs);
  return clamp(t ** getEasePower(widths), 0, 1);
}

export function timeAtTrackProgress(progress: number, widths: number[], railMs: number) {
  const clamped = clamp(progress, 0, 1);
  if (clamped <= 0) return 0;
  if (clamped >= 1) return railMs;

  const softened = clamped ** (1 / getEasePower(widths));

  return invertSmoothstep(softened) * railMs;
}

function invertSmoothstep(value: number) {
  const target = clamp(value, 0, 1);
  let lo = 0;
  let hi = 1;

  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (smoothstep(mid) < target) lo = mid;
    else hi = mid;
  }

  return (lo + hi) / 2;
}

export function getTransitionMarkerFadeDuration(index: number) {
  if (index < LIFELINE_SLOW_MARKERS) return LIFELINE_SLOW_MARKER_FADE_MS;

  const rampMarkers = 3;
  const rampIndex = index - LIFELINE_SLOW_MARKERS;
  if (rampIndex >= rampMarkers) return LIFELINE_FAST_MARKER_FADE_MS;

  const blend = smoothstep((rampIndex + 1) / rampMarkers);

  return Math.round(
    LIFELINE_SLOW_MARKER_FADE_MS +
      (LIFELINE_FAST_MARKER_FADE_MS - LIFELINE_SLOW_MARKER_FADE_MS) * blend
  );
}
