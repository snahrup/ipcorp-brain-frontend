import { randomUUID } from "node:crypto";
import { classify } from "./policy.mjs";

/**
 * First light. The scheduler reads the SAME state the Agent Board renders,
 * classifies every open item under the policy, and does nothing: shadow
 * runs and receipts record what WOULD happen, with zero tokens and no
 * verification row, so every shadow line honestly reads unverified.
 *
 * The kind map is deliberately explicit and small. A kind missing here
 * keeps its kind as the class id, which the policy then fails closed to
 * ask-first; nothing is silently skipped and nothing is silently promoted.
 */

export const KIND_TO_CLASS = {
  "recommended-change": "jira-create",
  "email-draft": "draft-deliver",
  "meeting-capture": "transcript-paste",
};

const OPEN_LANES = new Set(["waiting", "watching"]);

function dayOf(iso) {
  return String(iso || "").slice(0, 10);
}

export async function shadowPass({ board, policy, ledger, now }) {
  const at = now instanceof Date ? now : new Date(now);
  const today = dayOf(at.toISOString());

  const existing = await ledger.runsWithVerification();
  const shadowedToday = new Set(
    existing
      .filter((run) => run.state === "shadow" && dayOf(run.startedAt) === today)
      .map((run) => run.workItemId)
  );

  let considered = 0;
  let recorded = 0;
  const verdicts = [];

  for (const lane of board.lanes || []) {
    if (!OPEN_LANES.has(lane.id)) continue;
    for (const item of lane.cards || []) {
      if (item.kind === "source-error" || item.kind === "calendar") continue;
      considered += 1;
      if (shadowedToday.has(item.id)) continue;

      const classId = KIND_TO_CLASS[item.kind] || item.kind;
      const verdict = classify(classId, policy);
      const runId = `shadow-${randomUUID()}`;

      await ledger.recordRun({
        id: runId,
        workItemId: item.id,
        classId,
        agentRole: "shadow",
        modelUsed: "none",
        state: "shadow",
        autonomyTier: verdict.autonomyTier,
        modelTier: verdict.modelTier,
        title: String(item.title || "").slice(0, 120),
        startedAt: at.toISOString(),
        finishedAt: at.toISOString(),
      });
      await ledger.appendReceipt({
        runId,
        outcome: `WOULD handle "${item.title}" as ${classId}: ${verdict.autonomyTier} tier, ${verdict.modelTier} model.${verdict.detail ? ` ${verdict.detail}` : ""}`,
        tokensIn: 0,
        tokensOut: 0,
        changedRefs: [],
        at: at.toISOString(),
      });
      recorded += 1;
      verdicts.push({
        workItemId: item.id,
        title: item.title,
        classId,
        autonomyTier: verdict.autonomyTier,
        modelTier: verdict.modelTier,
      });
    }
  }

  return { passAt: at.toISOString(), considered, recorded, verdicts };
}
