// Checks added after the independent review of 2026-08-16.
//
// The reviewer mutation-tested every protection in Phase 1 and found several that could be
// deleted with no check failing. Each test here covers one of those, so the protection now
// has something that fails when it is removed. No live external effect is performed anywhere.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createActivityLifecycle } from "../activity-reconciliation/activity-lifecycle.mjs";
import { buildTodaySnapshot } from "../today-snapshot.mjs";
import { scanForSecrets } from "./action-identity.mjs";
import { listEffects, prepareEffect, readbackEffect } from "./effect-lifecycle.mjs";
import {
  completeWorkItem,
  createWorkItem,
  openWorkbenchState,
  projectWorkItems,
} from "./index.mjs";
import { projectSavedStepJob, requestSavedStepJobStop, runSavedStepJob } from "./step-runner.mjs";

async function withState(run) {
  const root = await mkdtemp(join(tmpdir(), "action-safe-review-"));
  try {
    return await run(await openWorkbenchState({ mode: "test", root }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const T0 = "2026-08-16T12:00:00.000Z";
const plus = (ms) => new Date(Date.parse(T0) + ms).toISOString();

// Finding 1. AS-07 sentence one. The abort used to fire only after the step had already
// resolved, so a provider would run to completion and bill the call before anyone noticed
// the stop.
test("AS-07b a stop reaches a step that is still running", async () => {
  await withState(async (state) => {
    let sawAbort = false;
    const steps = [
      {
        name: "slow",
        run: async ({ signal }) => {
          await requestSavedStepJobStop(state, {
            workItemId: "stop-live",
            reason: "user pressed stop",
          });
          for (let i = 0; i < 400 && !signal.aborted; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
          sawAbort = signal.aborted;
          // What a real provider does when its request is aborted.
          const abort = new Error("aborted");
          abort.name = "AbortError";
          throw abort;
        },
        validate: async () => true,
      },
    ];

    const result = await runSavedStepJob(state, {
      workItemId: "stop-live",
      owner: "worker-a",
      input: {},
      steps,
      stopPollMs: 5,
    });

    assert.equal(sawAbort, true, "the running step must observe the abort signal");
    assert.equal(result.status, "stopped");

    const item = (await projectWorkItems(state)).find((entry) => entry.id === "stop-live");
    assert.ok(
      item.quarantine?.some((entry) => entry.reason === "output_returned_after_stop"),
      "output returned after the abort fired must be quarantined"
    );
    const projection = await projectSavedStepJob(state, "stop-live");
    assert.notEqual(projection.steps[0]?.status, "succeeded", "cancelled work must not be saved");
    assert.notEqual(
      projection.steps[0]?.status,
      "failed",
      "a cancelled step is stopped, not failed"
    );
  });
});

// Finding 3. The compatibility fallback reintroduced the very collision AS-03 removes: an id
// containing unsafe characters could resolve to a legacy directory belonging to a different id
// that folded to the same name.
test("AS-03c an unsafe id never reads a legacy directory that another id could own", async () => {
  await withState(async (state) => {
    const steps = [
      {
        name: "only",
        run: async ({ input }) => ({ seen: input.marker }),
        validate: async ({ output }) => typeof output.seen === "string",
      },
    ];

    // A job written before the collision fix, under the folding segment.
    const legacy = join(state.paths.snapshots, "saved-step-jobs", "job_alpha");
    await mkdir(join(legacy, "steps"), { recursive: true });
    await writeFile(join(legacy, "input.json"), JSON.stringify({ input: { marker: "legacy" } }));

    const unsafe = await runSavedStepJob(state, {
      workItemId: "job/alpha",
      owner: "worker-a",
      input: { marker: "unsafe" },
      steps,
      now: T0,
    });
    assert.equal(unsafe.status, "completed");

    const stillThere = JSON.parse(await readFile(join(legacy, "input.json"), "utf8"));
    assert.equal(
      stillThere.input.marker,
      "legacy",
      "the unsafe id must not have written into the legacy directory"
    );
  });
});

// Finding 4. AS-08 names the current lease generation, and nothing tested it.
test("AS-08c completion is refused when the caller's lease generation is stale", async () => {
  await withState(async (state) => {
    await createWorkItem(state, { id: "wi-stale", title: "Stale completer", createdAt: T0 });
    const first = await state.claimWorkItem("wi-stale", {
      owner: "worker-a",
      leaseMs: 1000,
      now: T0,
    });
    await state.claimWorkItem("wi-stale", {
      owner: "worker-b",
      leaseMs: 60_000,
      now: plus(5000),
    });

    const stale = await completeWorkItem(state, {
      workItemId: "wi-stale",
      owner: "worker-a",
      leaseId: first.lease.leaseId,
      leaseGeneration: first.lease.leaseGeneration,
      now: plus(6000),
    });
    assert.equal(stale.status, "rejected", "the displaced owner must not complete the work");
    assert.match(stale.reason, /stale_lease_generation/);

    const items = await projectWorkItems(state);
    assert.notEqual(items[0].status, "completed");
  });
});

// Finding 2. The activity lifecycle read the current lease out of state and handed it straight
// back to be compared against itself, which always matched. It presents its own identity now.
test("AS-08d activity reconciliation cannot complete a run another owner has taken", async () => {
  await withState(async (state) => {
    const lifecycle = createActivityLifecycle({
      state,
      owner: "activity-reconciliation-1001",
      leaseMs: 1000,
      isOwnerAlive: async () => true,
    });
    const run = {
      id: "activity-taken",
      status: "running",
      startedAt: T0,
      lastActivityAt: T0,
      resumeCount: 0,
      resumable: true,
      phase: { id: "preparing", label: "Preparing", index: 1, total: 8, startedAt: T0 },
      counts: {},
      sources: {},
      meetings: [],
    };
    await lifecycle.prepareRun(run);
    await lifecycle.claimRun(run);

    const taken = await state.claimWorkItem("activity-taken", {
      owner: "someone-else-2002",
      leaseMs: 60_000,
      now: plus(5000),
    });
    assert.equal(taken.status, "claimed", "the second worker takes over after the lease lapses");

    const result = await lifecycle.runCompleted({
      ...run,
      status: "completed",
      finishedAt: plus(6000),
      lastActivityAt: plus(6000),
    });
    assert.equal(
      result.completion.status,
      "rejected",
      "a run that was taken over must not be completed by the displaced owner"
    );
  });
});

// Finding 10. Prepare idempotence and the readback guard were both removable silently.
test("AS-06c a repeated prepare is one effect, and readback refuses an unconfirmed one", async () => {
  await withState(async (state) => {
    await createWorkItem(state, { id: "wi-dup", title: "Duplicate", createdAt: T0 });
    const input = {
      workItemId: "wi-dup",
      actionId: "act-d",
      actionRevisionId: "rev-d",
      destination: "jira",
      operation: "create_issue",
      payload: { summary: "one" },
      now: T0,
    };
    const first = await prepareEffect(state, input);
    const second = await prepareEffect(state, { ...input, now: plus(10) });
    assert.equal(first.status, "prepared");
    assert.equal(second.status, "duplicate", "the same revision and operation is one effect");
    assert.equal(first.effect.effectId, second.effect.effectId);
    assert.equal((await listEffects(state, "wi-dup")).length, 1);

    const early = await readbackEffect(state, {
      effectId: first.effect.effectId,
      observed: { key: "MT-9" },
      now: plus(20),
    });
    assert.equal(early.status, "not_confirmed", "readback must refuse an unconfirmed effect");
  });
});

// Finding 6. The scan covered each source's data only. An error string and a status detail
// are exactly where a token lands when a call fails to authenticate.
test("AS-09e a secret in an error string or a status detail never reaches the payload", () => {
  const leaking = buildTodaySnapshot({
    capturedAt: T0,
    jira: {
      status: "error",
      observedAt: T0,
      error: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789",
      detail: "token ATATT3xFfGF0abcdefghijklmnopqrstuvwxyz0123456789 was rejected",
    },
  });
  const serialized = JSON.stringify(leaking);
  assert.ok(
    !serialized.includes("abcdefghijklmnopqrstuvwxyz0123456789"),
    "no secret may survive anywhere in the served payload"
  );
  assert.ok(serialized.includes("[redacted: secret scan]"));
});

// Finding 7. The walk recursed object values only.
test("AS-09f the secret scan covers object keys, Map, Set, and Buffer", () => {
  const token = "ATATT3xFfGF0abcdefghijklmnopqrstuvwxyz0123456789";
  assert.equal(scanForSecrets({ [token]: "value" }).ok, false, "a key can hold the secret");
  assert.equal(scanForSecrets({ m: new Map([["k", token]]) }).ok, false, "Map values count");
  assert.equal(scanForSecrets({ s: new Set([token]) }).ok, false, "Set values count");
  assert.equal(scanForSecrets({ b: Buffer.from(token) }).ok, false, "Buffer bytes count");

  const cyclic = { safe: "fine" };
  cyclic.self = cyclic;
  assert.equal(scanForSecrets(cyclic).ok, true, "a cycle must not hang the scan");
});
