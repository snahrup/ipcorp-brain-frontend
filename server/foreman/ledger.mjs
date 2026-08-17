// Foreman Briefing anti-repetition ledger. Track FB-1.
// Spec: docs/brainstorm/2026-08-17-foreman-briefing-spec.md sections 4 and 9.
// Identity follows the Phase 1 model: a stable item id is the lineage, the
// content hash is the revision. Run state lives outside the repo on purpose
// (Tailwind's source scan reloads the app on any non-ignored repo write).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function foremanStateDir() {
  const override = process.env.FOREMAN_STATE_DIR;
  if (override) return override;
  const base = process.env.LOCALAPPDATA;
  if (!base) {
    throw new Error("LOCALAPPDATA is not set and FOREMAN_STATE_DIR is not overridden");
  }
  return join(base, "IPCorpBrain", "foreman", "runs");
}

function runPath(date) {
  return join(foremanStateDir(), `${date}.json`);
}

export function saveRun(run) {
  if (!run?.date) {
    throw new Error("saveRun requires a run with a date");
  }
  mkdirSync(foremanStateDir(), { recursive: true });
  writeFileSync(runPath(run.date), `${JSON.stringify(run, null, 2)}\n`, "utf8");
}

export function loadRun(date) {
  const path = runPath(date);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function reconcileAgainstLedger(prevRun, candidates, options = {}) {
  if (!options.today) {
    throw new Error("reconcileAgainstLedger requires options.today (YYYY-MM-DD)");
  }
  const prevById = new Map((prevRun?.items ?? []).map((item) => [item.id, item]));

  const eligible = [];
  const suppressed = [];
  for (const candidate of candidates) {
    const prev = prevById.get(candidate.id);
    if (!prev?.answer) {
      eligible.push(candidate);
      continue;
    }
    if (prev.hash !== candidate.hash) {
      // Changed evidence is a new revision of the same lineage; it returns.
      eligible.push(candidate);
      continue;
    }
    if (prev.answer.verb === "snooze") {
      const snooze = prev.answer.snooze ?? {};
      const dateReached = Boolean(snooze.returnAt) && options.today >= snooze.returnAt;
      const wokeOnActivity = Boolean(snooze.wakeOnActivity) && Boolean(candidate.hasNewActivity);
      if (dateReached || wokeOnActivity) {
        eligible.push(candidate);
        continue;
      }
      suppressed.push({ id: candidate.id, reason: "snoozed", returnAt: snooze.returnAt ?? null });
      continue;
    }
    suppressed.push({
      id: candidate.id,
      reason: "answered-unchanged",
      answeredAt: prev.answer.at ?? null,
    });
  }

  return { eligible, suppressed };
}

export function closeOutYesterday(prevRun) {
  const items = prevRun?.items ?? [];
  let answered = 0;
  let unanswered = 0;
  const verbs = {};
  for (const item of items) {
    if (item.answer?.verb) {
      answered += 1;
      verbs[item.answer.verb] = (verbs[item.answer.verb] ?? 0) + 1;
    } else {
      unanswered += 1;
    }
  }
  return { answered, unanswered, verbs };
}
