// Foreman meeting countdown scheduler. Track FB-3.
// Spec: docs/brainstorm/2026-08-17-foreman-briefing-spec.md section 6, checks
// 8 and 9. This module NEVER talks to the network: meetings are handed in
// (from the calendar cache a human visit warmed), timers are injectable, and
// state lives in the foreman state dir. Check 8 holds by construction here
// and is asserted against the broker ledger in the live smoke.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { foremanStateDir } from "./ledger.mjs";

const T30_MS = 30 * 60_000;
const T15_MS = 15 * 60_000;

export function isCalendarMarker(title) {
  const value = String(title ?? "");
  return /^\s*reminder\s*[:-]/i.test(value) || /\bwfh\b/i.test(value);
}

function ms(value) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

// Local ISO without offset, matching the calendar lane's own format.
function fmtLocal(epochMs) {
  const d = new Date(epochMs);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(
    d.getMinutes()
  )}:${p(d.getSeconds())}`;
}

export function scheduleFromMeetings(meetings, options = {}) {
  const nowMs = ms(options.now);
  if (nowMs === null) throw new Error("scheduleFromMeetings requires options.now");
  const toasts = [];
  const skipped = [];
  for (const meeting of meetings ?? []) {
    const title = String(meeting.title ?? "");
    if (isCalendarMarker(title)) {
      skipped.push({ id: meeting.id, reason: "calendar-marker" });
      continue;
    }
    const startMs = ms(meeting.start);
    if (startMs === null) {
      skipped.push({ id: meeting.id, reason: "no-start-time" });
      continue;
    }
    if (startMs <= nowMs) {
      skipped.push({ id: meeting.id, reason: "already-started" });
      continue;
    }
    const toastMs = Math.max(nowMs, startMs - T30_MS);
    toasts.push({
      meetingId: meeting.id,
      title,
      start: fmtLocal(startMs),
      toastAt: fmtLocal(toastMs),
      kind: "t30",
    });
  }
  toasts.sort((a, b) => (a.toastAt < b.toastAt ? -1 : a.toastAt > b.toastAt ? 1 : 0));
  return { toasts, skipped };
}

export function laterReRaiseAt(meeting, options = {}) {
  const nowMs = ms(options.now);
  const startMs = ms(meeting?.start);
  if (nowMs === null || startMs === null) return null;
  if (nowMs >= startMs) return null;
  return fmtLocal(Math.max(nowMs, startMs - T15_MS));
}

function countdownDir() {
  return join(foremanStateDir(), "countdown");
}

function countdownPath(date) {
  return join(countdownDir(), `${date}.json`);
}

export function loadCountdown(date) {
  const path = countdownPath(date);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function saveCountdown(state) {
  mkdirSync(countdownDir(), { recursive: true });
  writeFileSync(countdownPath(state.date), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function recordOutcome(date, meetingId, action, options = {}) {
  const state = loadCountdown(date) ?? { date, scheduled: [], skipped: [], outcomes: {} };
  state.outcomes = state.outcomes ?? {};
  state.outcomes[meetingId] = { action, at: options.at ?? new Date().toISOString() };
  saveCountdown(state);
  return state;
}

const realTimers = {
  set: (fn, delay) => setTimeout(fn, delay),
  clear: (handle) => clearTimeout(handle),
};

// One armed set per day per process; re-arming replaces it entirely so a
// second human visit never doubles the timers.
const ARMED = new Map();

// Test seam only: the registry is process-scoped on purpose, so suites reset
// it between cases instead of inheriting each other's handles.
export function resetArmedCountdowns() {
  ARMED.clear();
}

export function armCountdown({ date, meetings, now, raise, timers = realTimers }) {
  if (!date) throw new Error("armCountdown requires a date");
  const nowMs = ms(now);
  if (nowMs === null) throw new Error("armCountdown requires now");

  for (const handle of ARMED.get(date) ?? []) timers.clear(handle);
  ARMED.set(date, []);

  const { toasts, skipped } = scheduleFromMeetings(meetings, { now });
  const state = loadCountdown(date) ?? { date, outcomes: {} };
  state.date = date;
  state.scheduled = toasts;
  state.skipped = skipped;
  state.armedAt = fmtLocal(nowMs);
  state.outcomes = state.outcomes ?? {};
  saveCountdown(state);

  let scheduled = 0;
  for (const toast of toasts) {
    if (state.outcomes[toast.meetingId]) continue;
    const delay = Math.max(0, ms(toast.toastAt) - nowMs);
    const handle = timers.set(() => raise(toast), delay);
    ARMED.get(date).push(handle);
    scheduled += 1;
  }
  return { scheduled, skipped: skipped.length };
}

// A "later" outcome schedules exactly one re-raise at T-15 (or immediately
// when T-15 has already passed but the meeting has not started).
export function recordLaterAndReRaise({ date, meetingId, now, raise, timers = realTimers }) {
  const state = recordOutcome(date, meetingId, "later", { at: now });
  const entry = (state.scheduled ?? []).find((toast) => toast.meetingId === meetingId);
  if (!entry) return { reRaiseAt: null };
  const at = laterReRaiseAt(entry, { now });
  if (!at) return { reRaiseAt: null };
  const delay = Math.max(0, ms(at) - ms(now));
  const handle = timers.set(() => raise({ ...entry, kind: "t15" }), delay);
  ARMED.set(date, [...(ARMED.get(date) ?? []), handle]);
  // The item may ring once more, so the outcome no longer suppresses it.
  delete state.outcomes[meetingId];
  state.laterAt = state.laterAt ?? {};
  state.laterAt[meetingId] = at;
  saveCountdown(state);
  return { reRaiseAt: at };
}
