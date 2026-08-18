import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  armCountdown,
  isCalendarMarker,
  laterReRaiseAt,
  loadCountdown,
  recordOutcome,
  resetArmedCountdowns,
  scheduleFromMeetings,
} from "./countdown.mjs";

const DATE = "2026-08-18";
const NOW = "2026-08-18T13:00:00";

const meeting = (id, title, start) => ({ id, title, start });

// Await inside the try, same lesson as the other suites: the override must
// hold until the async body resolves.
async function withTempStateDir(run) {
  const dir = mkdtempSync(join(tmpdir(), "foreman-countdown-"));
  const previous = process.env.FOREMAN_STATE_DIR;
  process.env.FOREMAN_STATE_DIR = dir;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.FOREMAN_STATE_DIR;
    else process.env.FOREMAN_STATE_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

function fakeTimers() {
  const set = [];
  const cleared = [];
  return {
    set,
    cleared,
    timers: {
      set: (fn, ms) => {
        set.push({ fn, ms });
        return set.length;
      },
      clear: (handle) => {
        cleared.push(handle);
      },
    },
  };
}

test("calendar markers never ring", () => {
  assert.equal(isCalendarMarker("Reminder: submit timesheet"), true);
  assert.equal(isCalendarMarker("Kelly - WFH"), true);
  assert.equal(isCalendarMarker("Weekly 1:1 with Patrick"), false);
  const { toasts, skipped } = scheduleFromMeetings(
    [
      meeting("m1", "Reminder: submit timesheet", "2026-08-18T15:00:00"),
      meeting("m2", "Kelly - WFH", "2026-08-18T09:00:00"),
      meeting("m3", "Weekly 1:1 with Patrick", "2026-08-18T14:00:00"),
    ],
    { now: NOW }
  );
  assert.deepEqual(
    toasts.map((toast) => toast.meetingId),
    ["m3"]
  );
  assert.deepEqual(skipped.map((entry) => [entry.id, entry.reason]).sort(), [
    ["m1", "calendar-marker"],
    ["m2", "calendar-marker"],
  ]);
});

test("T-30 math: thirty minutes before, immediate inside the window, never after start", () => {
  const { toasts, skipped } = scheduleFromMeetings(
    [
      meeting("far", "Fabric weekly", "2026-08-18T14:00:00"),
      meeting("near", "Quick sync", "2026-08-18T13:15:00"),
      meeting("gone", "Morning stand-up", "2026-08-18T12:00:00"),
    ],
    { now: NOW }
  );
  const byId = new Map(toasts.map((toast) => [toast.meetingId, toast]));
  assert.equal(byId.get("far").toastAt, "2026-08-18T13:30:00");
  assert.equal(byId.get("near").toastAt, NOW, "inside the window the toast raises immediately");
  assert.equal(byId.get("gone"), undefined);
  assert.deepEqual(
    skipped.map((entry) => [entry.id, entry.reason]),
    [["gone", "already-started"]]
  );
});

test("Later re-raises at T-15, immediately when T-15 has passed, never after start", () => {
  const start = "2026-08-18T14:00:00";
  assert.equal(laterReRaiseAt({ start }, { now: "2026-08-18T13:31:00" }), "2026-08-18T13:45:00");
  assert.equal(
    laterReRaiseAt({ start }, { now: "2026-08-18T13:50:00" }),
    "2026-08-18T13:50:00",
    "past T-15 but before start raises now"
  );
  assert.equal(laterReRaiseAt({ start }, { now: "2026-08-18T14:05:00" }), null);
});

test("outcomes persist per day and survive a re-arm", () =>
  withTempStateDir(() => {
    resetArmedCountdowns();
    const { timers } = fakeTimers();
    const raised = [];
    armCountdown({
      date: DATE,
      meetings: [meeting("m3", "Weekly 1:1 with Patrick", "2026-08-18T14:00:00")],
      now: NOW,
      raise: (entry) => raised.push(entry),
      timers,
    });
    recordOutcome(DATE, "m3", "opened", { at: "2026-08-18T13:31:00" });
    const state = loadCountdown(DATE);
    assert.equal(state.outcomes.m3.action, "opened");
    armCountdown({
      date: DATE,
      meetings: [meeting("m3", "Weekly 1:1 with Patrick", "2026-08-18T14:00:00")],
      now: "2026-08-18T13:05:00",
      raise: (entry) => raised.push(entry),
      timers,
    });
    assert.equal(loadCountdown(DATE).outcomes.m3.action, "opened", "re-arm keeps the outcome");
  }));

test("arming sets one timer per meeting at the right delay, re-arm cancels the old ones, outcomes stop re-ringing", () =>
  withTempStateDir(() => {
    resetArmedCountdowns();
    const { set, cleared, timers } = fakeTimers();
    const raised = [];
    const result = armCountdown({
      date: DATE,
      meetings: [
        meeting("m3", "Weekly 1:1 with Patrick", "2026-08-18T14:00:00"),
        meeting("m4", "Purview advisory", "2026-08-18T16:00:00"),
      ],
      now: NOW,
      raise: (entry) => raised.push(entry),
      timers,
    });
    assert.equal(result.scheduled, 2);
    assert.deepEqual(
      set.map((entry) => entry.ms),
      [30 * 60_000, 150 * 60_000]
    );
    set[0].fn();
    assert.equal(raised[0].meetingId, "m3");
    assert.equal(raised[0].title, "Weekly 1:1 with Patrick");

    recordOutcome(DATE, "m3", "dismissed", { at: "2026-08-18T13:31:00" });
    const again = armCountdown({
      date: DATE,
      meetings: [
        meeting("m3", "Weekly 1:1 with Patrick", "2026-08-18T14:00:00"),
        meeting("m4", "Purview advisory", "2026-08-18T16:00:00"),
      ],
      now: "2026-08-18T13:32:00",
      raise: (entry) => raised.push(entry),
      timers,
    });
    assert.equal(cleared.length, 2, "the first arm's two timers were cancelled");
    assert.equal(again.scheduled, 1, "the dismissed meeting does not re-ring");
  }));
