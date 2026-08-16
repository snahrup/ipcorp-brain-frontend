// Phase 1: the external-effect lifecycle, implemented once and reused by Jira, Brain,
// Outlook, Teams, and providers.
//
//   prepared -> claimed -> attempting -> confirmed -> read_back
//                              |
//                              +-> uncertain -> reconcile -> confirmed | failed
//
// The rule that matters: an uncertain result never becomes a second request. The destination
// is reconciled first. The saved-step runner records started, runs, saves, then records
// success, so a process that dies after the destination accepted but before success was
// recorded would otherwise repeat the request on resume.

import { randomUUID } from "node:crypto";
import { createEffectAttemptId, createEffectId, hashValue } from "./action-identity.mjs";
import { appendEvent, listEvents } from "./index.mjs";

export const EFFECT_SCHEMA_VERSION = 1;

export const EFFECT_EVENT_TYPES = Object.freeze({
  PREPARED: "effect.prepared",
  CLAIMED: "effect.claimed",
  OUTCOME: "effect.attempt_outcome",
  CONFIRMED: "effect.confirmed",
  RECONCILED: "effect.reconciled",
  READ_BACK: "effect.read_back",
});

export const EFFECT_STATUSES = Object.freeze([
  "prepared",
  "claimed",
  "attempting",
  "confirmed",
  "uncertain",
  "read_back",
  "failed",
]);

function requiredString(value, label) {
  if (!value || typeof value !== "string") throw new Error(`Effect ${label} is required.`);
  return value;
}

function nowIso(value) {
  if (!value) return new Date().toISOString();
  if (Number.isNaN(Date.parse(value))) throw new Error("Effect now must be an ISO timestamp.");
  return value;
}

function projectEffects(events) {
  const effects = new Map();

  for (const event of events) {
    const effectId = event.payload?.effectId;
    if (!effectId || !Object.values(EFFECT_EVENT_TYPES).includes(event.type)) continue;

    if (event.type === EFFECT_EVENT_TYPES.PREPARED) {
      if (effects.has(effectId)) continue;
      effects.set(effectId, {
        schemaVersion: EFFECT_SCHEMA_VERSION,
        effectId,
        workItemId: event.workItemId,
        actionId: event.payload.actionId,
        actionRevisionId: event.payload.actionRevisionId,
        destination: event.payload.destination,
        operation: event.payload.operation,
        payloadHash: event.payload.payloadHash,
        repeatSuppressionKey: event.payload.repeatSuppressionKey,
        status: "prepared",
        effectAttemptId: null,
        attempts: [],
        destinationRef: null,
        readback: null,
        reconciliations: [],
        updatedAt: event.at,
      });
      continue;
    }

    const effect = effects.get(effectId);
    if (!effect) continue;
    effect.updatedAt = event.at;

    if (event.type === EFFECT_EVENT_TYPES.CLAIMED) {
      effect.status = "claimed";
      effect.effectAttemptId = event.payload.effectAttemptId;
      effect.attempts.push({
        effectAttemptId: event.payload.effectAttemptId,
        owner: event.payload.owner,
        startedAt: event.at,
        outcome: null,
      });
    }

    if (event.type === EFFECT_EVENT_TYPES.OUTCOME) {
      const attempt = effect.attempts.find(
        (entry) => entry.effectAttemptId === event.payload.effectAttemptId
      );
      if (attempt) {
        attempt.outcome = event.payload.outcome;
        attempt.endedAt = event.at;
      }
      if (event.payload.outcome === "unknown") effect.status = "uncertain";
      else if (event.payload.outcome === "failed") effect.status = "failed";
      else if (event.payload.outcome === "accepted") effect.status = "attempting";
    }

    if (event.type === EFFECT_EVENT_TYPES.CONFIRMED) {
      effect.status = "confirmed";
      effect.destinationRef = event.payload.destinationRef || effect.destinationRef;
      const attempt = effect.attempts.find(
        (entry) => entry.effectAttemptId === event.payload.effectAttemptId
      );
      if (attempt) {
        attempt.outcome = "confirmed";
        attempt.endedAt = event.at;
      }
    }

    if (event.type === EFFECT_EVENT_TYPES.RECONCILED) {
      effect.reconciliations.push({
        at: event.at,
        found: event.payload.found,
        destinationRef: event.payload.destinationRef || null,
      });
      if (event.payload.found) {
        effect.status = "confirmed";
        effect.destinationRef = event.payload.destinationRef || effect.destinationRef;
      } else {
        effect.status = "failed";
      }
    }

    if (event.type === EFFECT_EVENT_TYPES.READ_BACK) {
      effect.status = "read_back";
      effect.readback = {
        observedAt: event.at,
        observed: event.payload.observed ?? null,
        matchesPayload: event.payload.matchesPayload ?? null,
      };
    }
  }

  return [...effects.values()];
}

async function loadEffect(state, effectId) {
  const effects = projectEffects(await listEvents(state));
  return effects.find((entry) => entry.effectId === effectId) || null;
}

export async function listEffects(state, workItemId) {
  const effects = projectEffects(await listEvents(state));
  if (!workItemId) return effects;
  return effects.filter((effect) => effect.workItemId === workItemId);
}

export async function getEffect(state, effectId) {
  return loadEffect(state, requiredString(effectId, "effectId"));
}

/**
 * Prepare is idempotent by construction: the same revision, destination, and operation produce
 * the same effect id, which is also the repeat-suppression key.
 */
export async function prepareEffect(state, input) {
  const at = nowIso(input?.now);
  const actionRevisionId = requiredString(input?.actionRevisionId, "actionRevisionId");
  const destination = requiredString(input?.destination, "destination");
  const operation = requiredString(input?.operation, "operation");
  const effectId = createEffectId({ actionRevisionId, destination, operation });

  const existing = await loadEffect(state, effectId);
  if (existing) return { status: "duplicate", effect: existing };

  await appendEvent(state, {
    id: input?.eventId || `evt-${randomUUID()}`,
    type: EFFECT_EVENT_TYPES.PREPARED,
    at,
    workItemId: requiredString(input?.workItemId, "workItemId"),
    payload: {
      effectId,
      actionId: requiredString(input?.actionId, "actionId"),
      actionRevisionId,
      destination,
      operation,
      payloadHash: hashValue(input?.payload ?? {}),
      repeatSuppressionKey: effectId,
    },
  });

  return { status: "prepared", effect: await loadEffect(state, effectId) };
}

/**
 * Claiming an uncertain effect is refused. Reconcile against the destination first.
 */
export async function claimEffect(state, input) {
  const at = nowIso(input?.now);
  const effectId = requiredString(input?.effectId, "effectId");
  const owner = requiredString(input?.owner, "owner");
  const effect = await loadEffect(state, effectId);
  if (!effect) return { status: "missing", effect: null };

  if (effect.status === "uncertain") {
    return { status: "reconcile_required", effect };
  }
  if (["confirmed", "read_back"].includes(effect.status)) {
    return { status: "already_done", effect };
  }
  if (["claimed", "attempting"].includes(effect.status)) {
    return { status: "busy", effect };
  }

  const effectAttemptId = createEffectAttemptId({
    effectId,
    attempt: effect.attempts.length + 1,
    owner,
  });

  await appendEvent(state, {
    id: input?.eventId || `evt-${randomUUID()}`,
    type: EFFECT_EVENT_TYPES.CLAIMED,
    at,
    workItemId: effect.workItemId,
    payload: { effectId, effectAttemptId, owner, attempt: effect.attempts.length + 1 },
  });

  return { status: "claimed", effect: await loadEffect(state, effectId) };
}

/**
 * outcome is one of: accepted, unknown, failed. An unknown outcome is the process-loss case
 * and it must leave the effect uncertain rather than free for another attempt.
 */
export async function recordAttemptOutcome(state, input) {
  const at = nowIso(input?.now);
  const effectId = requiredString(input?.effectId, "effectId");
  const effectAttemptId = requiredString(input?.effectAttemptId, "effectAttemptId");
  const outcome = requiredString(input?.outcome, "outcome");
  if (!["accepted", "unknown", "failed"].includes(outcome)) {
    throw new Error(`Effect outcome must be accepted, unknown, or failed. Received ${outcome}.`);
  }
  const effect = await loadEffect(state, effectId);
  if (!effect) return { status: "missing", effect: null };

  await appendEvent(state, {
    id: input?.eventId || `evt-${randomUUID()}`,
    type: EFFECT_EVENT_TYPES.OUTCOME,
    at,
    workItemId: effect.workItemId,
    payload: { effectId, effectAttemptId, outcome },
  });

  return { status: outcome, effect: await loadEffect(state, effectId) };
}

export async function confirmEffect(state, input) {
  const at = nowIso(input?.now);
  const effectId = requiredString(input?.effectId, "effectId");
  const effect = await loadEffect(state, effectId);
  if (!effect) return { status: "missing", effect: null };

  await appendEvent(state, {
    id: input?.eventId || `evt-${randomUUID()}`,
    type: EFFECT_EVENT_TYPES.CONFIRMED,
    at,
    workItemId: effect.workItemId,
    payload: {
      effectId,
      effectAttemptId: input?.effectAttemptId || effect.effectAttemptId,
      destinationRef: input?.destinationRef || null,
    },
  });

  return { status: "confirmed", effect: await loadEffect(state, effectId) };
}

/**
 * The only legal way out of uncertain. found=true means the destination already has it, so no
 * second request is issued. found=false means it does not, so a fresh attempt may be claimed.
 */
export async function reconcileEffect(state, input) {
  const at = nowIso(input?.now);
  const effectId = requiredString(input?.effectId, "effectId");
  const effect = await loadEffect(state, effectId);
  if (!effect) return { status: "missing", effect: null };

  await appendEvent(state, {
    id: input?.eventId || `evt-${randomUUID()}`,
    type: EFFECT_EVENT_TYPES.RECONCILED,
    at,
    workItemId: effect.workItemId,
    payload: {
      effectId,
      found: Boolean(input?.found),
      destinationRef: input?.destinationRef || null,
    },
  });

  return {
    status: input?.found ? "confirmed" : "failed",
    effect: await loadEffect(state, effectId),
  };
}

export async function readbackEffect(state, input) {
  const at = nowIso(input?.now);
  const effectId = requiredString(input?.effectId, "effectId");
  const effect = await loadEffect(state, effectId);
  if (!effect) return { status: "missing", effect: null };
  if (!["confirmed", "read_back"].includes(effect.status)) {
    return { status: "not_confirmed", effect };
  }

  await appendEvent(state, {
    id: input?.eventId || `evt-${randomUUID()}`,
    type: EFFECT_EVENT_TYPES.READ_BACK,
    at,
    workItemId: effect.workItemId,
    payload: {
      effectId,
      observed: input?.observed ?? null,
      matchesPayload:
        input?.observed === undefined
          ? null
          : hashValue(input.observed) === effect.payloadHash || null,
    },
  });

  return { status: "read_back", effect: await loadEffect(state, effectId) };
}
