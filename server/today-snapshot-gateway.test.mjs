import assert from "node:assert/strict";
import test from "node:test";

import { assembleTodaySnapshot } from "./jira-gateway.mjs";

const NOW = new Date("2026-08-14T07:15:00.000Z");

test("Today assembly reads each source once and keeps the Agent Board cache-only", async () => {
  const calls = { jira: 0, board: 0, reconciliation: 0, loop: 0 };
  let boardOptions = null;
  const snapshot = await assembleTodaySnapshot({
    now: NOW,
    loadJira: async () => {
      calls.jira += 1;
      return { fetchedAt: NOW.toISOString(), issues: [] };
    },
    loadAgentBoard: async (options) => {
      calls.board += 1;
      boardOptions = options;
      return { generatedAt: NOW.toISOString(), sources: [], lanes: [] };
    },
    loadReconciliation: async () => {
      calls.reconciliation += 1;
      return null;
    },
    loadLoop: async () => {
      calls.loop += 1;
      return { mode: "shadow", todayVerdicts: [] };
    },
  });

  assert.deepEqual(calls, { jira: 1, board: 1, reconciliation: 1, loop: 1 });
  assert.deepEqual(boardOptions, { cachedOnly: true });
  assert.equal(snapshot.partial, false);
  assert.equal(snapshot.capturedAt, NOW.toISOString());
});

test("Today assembly keeps healthy data when Jira fails", async () => {
  const snapshot = await assembleTodaySnapshot({
    now: NOW,
    loadJira: async () => {
      throw new Error("Jira is unavailable.");
    },
    loadAgentBoard: async () => ({
      generatedAt: NOW.toISOString(),
      sources: [],
      lanes: [{ id: "delivered", cards: [{ id: "saved-work" }] }],
    }),
    loadReconciliation: async () => ({ id: "activity-1", status: "completed" }),
    loadLoop: async () => ({ mode: "off", todayVerdicts: [] }),
  });

  assert.equal(snapshot.partial, true);
  assert.equal(snapshot.sources.jira.status, "error");
  assert.equal(snapshot.jira, null);
  assert.equal(snapshot.agentBoard.lanes[0].cards[0].id, "saved-work");
  assert.equal(snapshot.reconciliation.id, "activity-1");
  assert.equal(snapshot.loop.mode, "off");
});

test("Today assembly exposes partial Agent Board source reads without discarding cards", async () => {
  const snapshot = await assembleTodaySnapshot({
    now: NOW,
    loadJira: async () => ({ fetchedAt: NOW.toISOString(), issues: [] }),
    loadAgentBoard: async () => ({
      generatedAt: NOW.toISOString(),
      sources: [
        { id: "calendar", label: "Calendar", ok: false, detail: "Cached calendar is old." },
      ],
      lanes: [{ id: "waiting", cards: [{ id: "paste-needed" }] }],
    }),
    loadReconciliation: async () => null,
    loadLoop: async () => ({ mode: "shadow", todayVerdicts: [] }),
  });

  assert.equal(snapshot.partial, true);
  assert.equal(snapshot.sources.agentBoard.status, "partial");
  assert.match(snapshot.sources.agentBoard.detail, /Cached calendar is old/i);
  assert.equal(snapshot.agentBoard.lanes[0].cards[0].id, "paste-needed");
});
