/**
 * The decide station. One question answered purely: given a work class, what
 * may happen to an item of that class right now. Two columns per class
 * (autonomy: ask < show < auto; model: none | local | subscription | top)
 * plus a named tool set.
 *
 * Steve's ground rules, as code rather than intention:
 * - Send-class actions are ask-first as CODE. A policy file that tries to
 *   raise them is refused at load, so a bad policy never even runs.
 * - Autonomy is earned: promote only on a streak of verified successes AND a
 *   week in the current tier; one verified failure demotes immediately.
 * - Unknown work fails closed to ask-first.
 * - No clocks in here; `now` is injected so every rule is provable.
 */

export const PINNED_ASK_FIRST = ["email-send", "meeting-invite"];

const AUTONOMY_ORDER = ["ask", "show", "auto"];
const MODEL_TIERS = new Set(["none", "local", "subscription", "top"]);
const WEEK_MS = 7 * 24 * 3_600_000;

export function loadPolicy(raw) {
  const classes = raw?.classes;
  if (!classes || typeof classes !== "object") {
    throw new Error("The policy file has no classes.");
  }
  for (const [id, entry] of Object.entries(classes)) {
    if (!AUTONOMY_ORDER.includes(entry.autonomy)) {
      throw new Error(`Class "${id}" has an unknown autonomy tier "${entry.autonomy}".`);
    }
    if (!MODEL_TIERS.has(entry.model)) {
      throw new Error(`Class "${id}" has an unknown model tier "${entry.model}".`);
    }
    if (PINNED_ASK_FIRST.includes(id) && entry.autonomy !== "ask") {
      throw new Error(
        `Class "${id}" is pinned ask-first in code; the policy file cannot raise it to "${entry.autonomy}".`
      );
    }
  }
  return { version: raw.version ?? 0, classes };
}

export function classify(classId, policy) {
  const entry = policy.classes[classId];
  if (!entry) {
    // Fail closed: new kinds of work meet a human before they meet autonomy.
    return {
      classId,
      autonomyTier: "ask",
      modelTier: "top",
      toolSet: "none",
      detail: `"${classId}" is not in the policy. It stays ask-first until a policy commit names it.`,
    };
  }
  return {
    classId,
    autonomyTier: entry.autonomy,
    modelTier: entry.model,
    toolSet: entry.tools || "none",
    detail: "",
  };
}

/**
 * Earned autonomy, one outcome at a time. State is per class:
 * { tier, streak, tierSince, promoteAt, classId? }.
 */
export function recordOutcome(state, verified, now) {
  const at = now instanceof Date ? now : new Date(now);
  if (!verified) {
    const index = Math.max(0, AUTONOMY_ORDER.indexOf(state.tier) - 1);
    return {
      ...state,
      tier: AUTONOMY_ORDER[index],
      streak: 0,
      tierSince: AUTONOMY_ORDER[index] === state.tier ? state.tierSince : at.toISOString(),
    };
  }

  const streak = state.streak + 1;
  const pinned = state.classId && PINNED_ASK_FIRST.includes(state.classId);
  const weekServed = at.getTime() - Date.parse(state.tierSince) >= WEEK_MS;
  const atTop = state.tier === AUTONOMY_ORDER[AUTONOMY_ORDER.length - 1];

  if (pinned || atTop || streak < state.promoteAt || !weekServed) {
    return { ...state, streak };
  }

  const nextTier = AUTONOMY_ORDER[AUTONOMY_ORDER.indexOf(state.tier) + 1];
  return { ...state, tier: nextTier, streak: 0, tierSince: at.toISOString() };
}
