import assert from "node:assert/strict";
import test from "node:test";
import {
  getMicrosoft365CoverageState,
  getPreparedDisplayState,
  getSnapshotFreshness,
  preparedStateLabel,
} from "./truthState.ts";

test("classifies the May Brain export as stale in late July", () => {
  const result = getSnapshotFreshness(
    "2026-05-28T00:53:32.551Z",
    Date.parse("2026-07-28T12:00:00Z")
  );

  assert.equal(result.state, "stale");
  assert.equal(result.ageDays, 61);
});

test("does not invent freshness when an as-of value is missing or invalid", () => {
  assert.equal(getSnapshotFreshness(null).state, "unavailable");
  assert.equal(getSnapshotFreshness("not-a-date").state, "unavailable");
});

test("keeps executed prepared proposals out of Needs you", () => {
  const executed = {
    id: "proposal-1",
    title: "Already sent",
    summary: "Historical proposal",
    state: "needs-you",
    urgency: "normal",
    kind: "proposal",
    sources: [],
    detail: {
      kind: "proposal",
      value: { id: "1", type: "email", title: "Already sent", status: "executed" },
    },
  };

  assert.equal(getPreparedDisplayState(executed), "done");
  assert.equal(preparedStateLabel("in-progress", true), "Was marked in progress");
});

test("distinguishes Microsoft 365 partial, empty, auth, timeout, and unavailable states", () => {
  assert.equal(
    getMicrosoft365CoverageState({ available: true, items: [{ source: "Calendar" }] }),
    "available-partial"
  );
  assert.equal(getMicrosoft365CoverageState({ available: true, items: [] }), "empty");
  assert.equal(
    getMicrosoft365CoverageState({ available: false, authRequired: true }),
    "authentication-required"
  );
  assert.equal(getMicrosoft365CoverageState({ available: false, code: "m365_timeout" }), "timeout");
  assert.equal(getMicrosoft365CoverageState({ available: false }), "unavailable");
});
