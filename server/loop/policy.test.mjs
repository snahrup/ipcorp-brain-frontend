import assert from "node:assert/strict";
import test from "node:test";
import { classify, loadPolicy, PINNED_ASK_FIRST, recordOutcome } from "./policy.mjs";

// The decide station. Every rule here is Steve's ground rule made failable:
// two columns per class, sends pinned in code, autonomy earned not granted,
// unknown work fails closed.

const NOW = new Date("2026-08-12T22:00:00.000Z");

const basePolicy = () => ({
  version: 1,
  classes: {
    "meeting-process": {
      autonomy: "auto",
      model: "top",
      tools: "closeout",
      promoteAt: 10,
    },
    "snapshot-sync": { autonomy: "auto", model: "none", tools: "local-files", promoteAt: 10 },
    "jira-comment": { autonomy: "show", model: "top", tools: "jira-write", promoteAt: 10 },
    "ticket-code": { autonomy: "show", model: "subscription", tools: "repo", promoteAt: 10 },
    "log-digest": { autonomy: "auto", model: "local", tools: "read-only", promoteAt: 10 },
    "email-send": { autonomy: "ask", model: "top", tools: "outlook-send", promoteAt: 10 },
    "meeting-invite": { autonomy: "ask", model: "top", tools: "outlook-send", promoteAt: 10 },
  },
});

test("classify returns both columns and the tool set from the policy file", () => {
  const policy = loadPolicy(basePolicy());
  const verdict = classify("ticket-code", policy);
  assert.equal(verdict.autonomyTier, "show");
  assert.equal(verdict.modelTier, "subscription");
  assert.equal(verdict.toolSet, "repo");
});

test("an unknown work class fails closed to ask-first, never auto", () => {
  const policy = loadPolicy(basePolicy());
  const verdict = classify("something-new", policy);
  assert.equal(verdict.autonomyTier, "ask");
  assert.equal(verdict.modelTier, "top");
  assert.match(verdict.detail, /not in the policy/i);
});

test("send and invite classes are pinned ask-first in code; a policy file cannot raise them", () => {
  assert.deepEqual(PINNED_ASK_FIRST, ["email-send", "meeting-invite"]);
  const overreach = basePolicy();
  overreach.classes["email-send"].autonomy = "auto";
  assert.throws(() => loadPolicy(overreach), /pinned ask-first/i);

  const sneaky = basePolicy();
  sneaky.classes["meeting-invite"].autonomy = "show";
  assert.throws(() => loadPolicy(sneaky), /pinned ask-first/i);
});

test("promotion needs the streak AND a week in tier; failure demotes immediately", () => {
  const start = {
    tier: "show",
    streak: 0,
    tierSince: "2026-08-01T00:00:00.000Z",
    promoteAt: 10,
  };

  let state = start;
  for (let i = 0; i < 9; i += 1) state = recordOutcome(state, true, NOW);
  assert.equal(state.tier, "show", "nine successes are not enough");
  assert.equal(state.streak, 9);

  state = recordOutcome(state, true, NOW);
  assert.equal(state.tier, "auto", "ten verified successes plus twelve days promotes");
  assert.equal(state.streak, 0, "streak restarts in the new tier");
  assert.equal(state.tierSince, NOW.toISOString());

  const young = { tier: "show", streak: 9, tierSince: "2026-08-10T00:00:00.000Z", promoteAt: 10 };
  const held = recordOutcome(young, true, NOW);
  assert.equal(held.tier, "show", "two days in tier holds promotion even at streak");
  assert.equal(held.streak, 10, "the streak keeps counting while the week accrues");

  const dropped = recordOutcome({ ...state }, false, NOW);
  assert.equal(dropped.tier, "show", "one verified failure demotes one tier");
  assert.equal(dropped.streak, 0);
});

test("demotion floors at ask and never disappears a class", () => {
  const atFloor = { tier: "ask", streak: 3, tierSince: "2026-08-01T00:00:00.000Z", promoteAt: 10 };
  const still = recordOutcome(atFloor, false, NOW);
  assert.equal(still.tier, "ask");
  assert.equal(still.streak, 0);
});

test("a pinned class never promotes no matter the streak", () => {
  const pinned = {
    tier: "ask",
    streak: 500,
    tierSince: "2026-01-01T00:00:00.000Z",
    promoteAt: 10,
    classId: "email-send",
  };
  const after = recordOutcome(pinned, true, NOW);
  assert.equal(after.tier, "ask", "sends stay ask-first forever");
});
