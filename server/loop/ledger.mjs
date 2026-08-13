import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * The append-only record the loop trusts. Same shape and rules as the ERD's
 * ledger; the engine is the house atomic-JSON pattern for v1 because the
 * SQLite native dep segfaults on this machine (see the port spec). The API
 * is the agreement: receipts cannot be updated or deleted through it at
 * all, corrections supersede, and "done" only exists as a join against
 * verification.
 */

function emptyState() {
  return {
    version: 1,
    classStates: {},
    workItems: [],
    runs: [],
    verifications: [],
    receipts: [],
    approvals: [],
    escalations: [],
    briefings: [],
  };
}

async function loadState(path) {
  try {
    const raw = JSON.parse(await readFile(path, "utf8"));
    return { ...emptyState(), ...raw };
  } catch (error) {
    if (error?.code === "ENOENT") return emptyState();
    // A corrupt ledger is an incident, not a shrug: fail loudly rather than
    // silently starting a fresh history.
    throw new Error(`The loop ledger at ${path} is unreadable: ${error.message}`);
  }
}

async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(tmp, path);
}

export async function openLedger(path) {
  let state = await loadState(path);

  // One writer per process; every mutation reloads nothing and persists
  // atomically, matching the activity store's discipline.
  const persist = async () => saveState(path, state);

  return {
    async recordRun(run) {
      if (!run?.id) throw new Error("A run needs an id.");
      state.runs.push({ heartbeatMissed: 0, ...run });
      await persist();
      return run;
    },

    async recordVerification(verification) {
      if (!verification?.runId) throw new Error("A verification needs a runId.");
      state.verifications.push(verification);
      await persist();
      return verification;
    },

    async appendReceipt(receipt) {
      if (!receipt?.runId) throw new Error("A receipt needs a runId.");
      const row = { id: `receipt-${randomUUID()}`, supersedes: null, ...receipt };
      state.receipts.push(row);
      await persist();
      return row;
    },

    async receiptsForRun(runId) {
      return state.receipts.filter((row) => row.runId === runId);
    },

    async runsWithVerification() {
      const byRun = new Map();
      for (const verification of state.verifications) {
        byRun.set(verification.runId, verification.result);
      }
      return state.runs.map((run) => ({
        ...run,
        verification: byRun.get(run.id) || "unverified",
      }));
    },

    async tokensByClass({ since }) {
      const cutoff = Date.parse(since || 0) || 0;
      const classByRun = new Map(state.runs.map((run) => [run.id, run.classId]));
      const totals = {};
      for (const receipt of state.receipts) {
        const at = Date.parse(receipt.at || "") || 0;
        if (at < cutoff) continue;
        const classId = classByRun.get(receipt.runId) || "unknown";
        if (!totals[classId]) totals[classId] = { runs: 0, tokensIn: 0, tokensOut: 0 };
        const bucket = totals[classId];
        bucket.runs += 1;
        bucket.tokensIn += Number(receipt.tokensIn || 0);
        bucket.tokensOut += Number(receipt.tokensOut || 0);
      }
      return totals;
    },

    async saveClassState(classId, classState) {
      state.classStates[classId] = { classId, ...classState };
      await persist();
      return state.classStates[classId];
    },

    async classState(classId) {
      return state.classStates[classId] || null;
    },

    async reload() {
      state = await loadState(path);
    },
  };
}
