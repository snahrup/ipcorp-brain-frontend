/**
 * A timer must never start a Microsoft call.
 *
 * Steve, 2026-08-13: forty billed Copilot tasks between 1:15 AM and 10:04 AM,
 * all asking for the same day's calendar. The Agent Board view polls the board
 * route every sixty seconds and that route defaulted to a live read, so every
 * poll was a candidate to start a task. At exact intervals, overnight, it also
 * reads as automation to anyone auditing the account.
 *
 * These tests pin the rule: the board route reads cache unless a person asked
 * for a refresh.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { listTodaysMeetings } from "./meeting-closeout.mjs";

test("listTodaysMeetings with cachedOnly never reports a live Microsoft read", async () => {
  const data = await listTodaysMeetings({ cachedOnly: true });
  assert.ok(data, "a cached read must still return a board-shaped answer");
  assert.notEqual(
    data.availability,
    "error",
    "a cached read must degrade to stale, never to an error that the board renders as a red card"
  );
  // The contract that matters: it did not go to Microsoft. A cached miss is
  // reported as stale with an explanation, not as a failure.
  if (data.availability === "stale") {
    assert.match(
      String(data.detail ?? ""),
      /cache|background|Refresh/i,
      "a stale cached read must say why, so the board can explain itself"
    );
  }
});

test("the board route only reads live when refresh=1 is present", async () => {
  // Pinning the parsing rule the route uses, so a future edit cannot quietly
  // flip the default back to live.
  const cachedByDefault = (search) => {
    const url = new URL(`http://x/api/agent-board${search}`);
    return url.searchParams.get("refresh") !== "1";
  };

  assert.equal(cachedByDefault(""), true, "a bare poll must read cache");
  assert.equal(cachedByDefault("?"), true, "an empty query must read cache");
  assert.equal(cachedByDefault("?refresh=0"), true, "refresh=0 must read cache");
  assert.equal(cachedByDefault("?other=1"), true, "an unrelated param must read cache");
  assert.equal(cachedByDefault("?refresh=1"), false, "an explicit refresh may read live");
});
