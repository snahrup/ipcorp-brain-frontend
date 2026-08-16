import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTodaySnapshot,
  TODAY_SNAPSHOT_SOURCE_IDS,
  TODAY_SNAPSHOT_VERSION,
} from "./today-snapshot.mjs";

const CAPTURED_AT = "2026-08-14T06:30:00.000Z";

test("today snapshot emits one versioned id, capture time, and source observations", () => {
  const snapshot = buildTodaySnapshot({
    capturedAt: CAPTURED_AT,
    jira: {
      ok: true,
      observedAt: "2026-08-14T06:29:00.000Z",
      data: { issues: [{ key: "MT-470", summary: "Current work" }] },
    },
    agentBoard: {
      ok: true,
      observedAt: "2026-08-14T06:29:10.000Z",
      data: { lanes: [{ id: "delivered", cards: [] }] },
    },
    reconciliation: {
      ok: true,
      observedAt: "2026-08-14T06:29:20.000Z",
      data: { runs: [{ id: "run-1", status: "partial_success" }] },
    },
    loop: {
      ok: true,
      observedAt: "2026-08-14T06:29:30.000Z",
      data: { mode: "shadow", todayVerdicts: [] },
    },
  });

  assert.equal(snapshot.version, TODAY_SNAPSHOT_VERSION);
  assert.match(snapshot.snapshotId, /^today-20260814T063000000Z-[a-f0-9]{12}$/);
  assert.equal(snapshot.capturedAt, CAPTURED_AT);
  assert.equal(snapshot.partial, false);
  assert.deepEqual(Object.keys(snapshot.sources), TODAY_SNAPSHOT_SOURCE_IDS);
  assert.equal(snapshot.sources.jira.status, "ok");
  assert.equal(snapshot.sources.agentBoard.status, "ok");
  assert.equal(snapshot.sources.reconciliation.status, "ok");
  assert.equal(snapshot.sources.loop.status, "ok");
  assert.equal(snapshot.jira.issues[0].key, "MT-470");
  assert.equal(snapshot.agentBoard.lanes[0].id, "delivered");
  assert.equal(snapshot.reconciliation.runs[0].id, "run-1");
  assert.equal(snapshot.loop.mode, "shadow");
});

test("today snapshot keeps usable source data when another source fails", () => {
  const snapshot = buildTodaySnapshot({
    capturedAt: CAPTURED_AT,
    jira: {
      ok: true,
      observedAt: "2026-08-14T06:29:00.000Z",
      data: { issues: [{ key: "MT-512", updatedAt: CAPTURED_AT }] },
    },
    agentBoard: {
      ok: false,
      observedAt: "2026-08-14T06:29:10.000Z",
      error: "Agent Board state could not be read.",
      data: { lanes: [{ id: "delivered", cards: [{ id: "cached-card" }] }] },
    },
    reconciliation: {
      ok: true,
      observedAt: "2026-08-14T06:29:20.000Z",
      data: { runs: [] },
    },
    loop: {
      ok: true,
      observedAt: "2026-08-14T06:29:30.000Z",
      data: { mode: "shadow", todayVerdicts: [{ id: "v-1" }] },
    },
  });

  assert.equal(snapshot.partial, true);
  assert.equal(snapshot.sources.agentBoard.status, "error");
  assert.match(snapshot.sources.agentBoard.error, /could not be read/i);
  assert.ok(
    snapshot.notes.some(
      (note) => note.source === "agentBoard" && /could not be read/i.test(note.message)
    )
  );
  assert.equal(snapshot.jira.issues[0].key, "MT-512");
  assert.equal(snapshot.agentBoard.lanes[0].cards[0].id, "cached-card");
  assert.equal(snapshot.loop.todayVerdicts[0].id, "v-1");
});

test("today snapshot marks missing sources without hiding collected sources", () => {
  const snapshot = buildTodaySnapshot({
    capturedAt: CAPTURED_AT,
    jira: {
      ok: true,
      observedAt: "2026-08-14T06:29:00.000Z",
      data: { issues: [] },
    },
  });

  assert.equal(snapshot.partial, true);
  assert.equal(snapshot.sources.jira.status, "ok");
  assert.equal(snapshot.sources.agentBoard.status, "missing");
  assert.equal(snapshot.sources.reconciliation.status, "missing");
  assert.equal(snapshot.sources.loop.status, "missing");
  assert.deepEqual(snapshot.agentBoard, null);
  assert.deepEqual(snapshot.reconciliation, null);
  assert.deepEqual(snapshot.loop, null);
  assert.equal(snapshot.notes.filter((note) => note.status === "missing").length, 3);
});

test("today snapshot accepts value as an alias for already-collected source data", () => {
  const snapshot = buildTodaySnapshot({
    capturedAt: CAPTURED_AT,
    loop: {
      ok: true,
      observedAt: "2026-08-14T06:29:30.000Z",
      value: { mode: "shadow", lastPass: "2026-08-14T06:25:00.000Z" },
    },
  });

  assert.equal(snapshot.sources.loop.status, "ok");
  assert.equal(snapshot.loop.lastPass, "2026-08-14T06:25:00.000Z");
});

test("today snapshot preserves data and detail from a partial source", () => {
  const snapshot = buildTodaySnapshot({
    capturedAt: CAPTURED_AT,
    reconciliation: {
      status: "partial",
      observedAt: "2026-08-14T06:29:20.000Z",
      detail: "Two meeting packages were repaired and one transcript still needs review.",
      data: { runs: [{ id: "run-partial", status: "partial_success" }] },
    },
  });

  assert.equal(snapshot.partial, true);
  assert.equal(snapshot.sources.reconciliation.status, "partial");
  assert.equal(
    snapshot.sources.reconciliation.detail,
    "Two meeting packages were repaired and one transcript still needs review."
  );
  assert.equal(snapshot.reconciliation.runs[0].id, "run-partial");
  assert.ok(
    snapshot.notes.some((note) => note.source === "reconciliation" && note.status === "partial")
  );
});

test("today snapshot marks unavailable sources separately from errors", () => {
  const snapshot = buildTodaySnapshot({
    capturedAt: CAPTURED_AT,
    jira: {
      status: "unavailable",
      observedAt: null,
      detail: "Jira credentials were not readable.",
      data: { issues: [{ key: "MT-470", summary: "Cached current issue" }] },
    },
  });

  assert.equal(snapshot.partial, true);
  assert.equal(snapshot.sources.jira.status, "unavailable");
  assert.equal(snapshot.sources.jira.observedAt, null);
  assert.equal(snapshot.sources.jira.error, null);
  assert.equal(snapshot.sources.jira.detail, "Jira credentials were not readable.");
  assert.equal(snapshot.jira.issues[0].key, "MT-470");
});
