// Phase 1 acceptance checks: Action-Safe State.
// Frozen before implementation in docs/mythos/gates/20260816-action-safe-state.md.
// Every check here must be able to fail. No live external effect is performed anywhere.

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildPublicModel,
  createActionRevision,
  matchActionLineage,
  scanForSecrets,
} from "./action-identity.mjs";
import {
  claimEffect,
  confirmEffect,
  listEffects,
  prepareEffect,
  readbackEffect,
  reconcileEffect,
  recordAttemptOutcome,
} from "./effect-lifecycle.mjs";
import {
  appendEvent,
  completeWorkItem,
  createWorkItem,
  isOwnerWriteCurrent,
  openWorkbenchState,
  projectWorkItems,
  quarantineRecord,
  stateSegmentFor,
} from "./index.mjs";
import { readSavedStepJobOutput, runSavedStepJob } from "./step-runner.mjs";

async function tempRoot() {
  return mkdtemp(join(tmpdir(), "action-safe-state-"));
}

async function withState(run) {
  const root = await tempRoot();
  try {
    return await run(await openWorkbenchState({ mode: "test", root }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const T0 = "2026-08-16T12:00:00.000Z";
const plus = (ms) => new Date(Date.parse(T0) + ms).toISOString();

// AS-01 One work-item id cannot be redefined.
test("AS-01 a second create for the same work item id is refused, not silently applied", async () => {
  await withState(async (state) => {
    const first = await createWorkItem(state, {
      id: "wi-1",
      title: "First definition",
      kind: "meeting-closeout",
      createdAt: T0,
      eventId: "evt-create-1",
    });
    assert.equal(first.status, "appended");

    const second = await createWorkItem(state, {
      id: "wi-1",
      title: "Different definition",
      kind: "something-else",
      createdAt: plus(1000),
      eventId: "evt-create-2",
    });
    assert.equal(second.status, "conflict", "a redefinition must be a recorded conflict");

    const [item] = await projectWorkItems(state);
    assert.equal(item.title, "First definition", "the first definition must survive");
    assert.equal(item.kind, "meeting-closeout");
  });
});

// AS-02 Changed evidence creates a revision, not a second action.
test("AS-02 changed evidence revises one lineage instead of creating a second action", async () => {
  const lineage = {
    meetingId: "meeting-fabric-standup-2026-08-14",
    workClass: "jira-followup",
    owner: "steve",
    intent: "track the M3 batch reconciliation follow-up",
  };

  const first = createActionRevision({
    ...lineage,
    evidence: { transcript: "original transcript text" },
    payload: { summary: "first payload" },
  });
  const second = createActionRevision({
    ...lineage,
    evidence: { transcript: "CORRECTED transcript text" },
    payload: { summary: "second payload" },
  });

  assert.equal(first.actionId, second.actionId, "lineage must survive changed evidence");
  assert.notEqual(first.actionRevisionId, second.actionRevisionId);
  assert.ok(
    !first.actionId.includes(first.evidenceHash),
    "the action id must not carry an evidence hash"
  );
  assert.equal(matchActionLineage(first, second), true);

  const otherIntent = createActionRevision({
    ...lineage,
    intent: "a completely different commitment",
    evidence: { transcript: "original transcript text" },
    payload: { summary: "first payload" },
  });
  assert.notEqual(first.actionId, otherIntent.actionId, "a different intent is a different action");
});

// AS-03 Unsafe ids cannot collide on one state path.
test("AS-03 ids that differ only in unsafe characters do not share a state path", async () => {
  const a = stateSegmentFor("meeting/2026-08-14");
  const b = stateSegmentFor("meeting_2026-08-14");
  const c = stateSegmentFor("meeting:2026-08-14");

  assert.notEqual(a, b, "a slash and an underscore must not fold together");
  assert.notEqual(a, c);
  assert.notEqual(b, c);
  assert.equal(a, stateSegmentFor("meeting/2026-08-14"), "the same id must be stable");
  assert.ok(/^[a-zA-Z0-9._-]+$/.test(a), "the segment must still be filesystem safe");
});

test("AS-03b two colliding job ids do not share saved steps on disk", async () => {
  await withState(async (state) => {
    const steps = [
      {
        name: "only",
        run: async ({ input }) => ({ seen: input.marker }),
        validate: async ({ output }) => typeof output.seen === "string",
      },
    ];

    const left = await runSavedStepJob(state, {
      workItemId: "job/alpha",
      owner: "worker-a",
      input: { marker: "left" },
      steps,
      now: T0,
    });
    const right = await runSavedStepJob(state, {
      workItemId: "job_alpha",
      owner: "worker-a",
      input: { marker: "right" },
      steps,
      now: T0,
    });
    assert.equal(left.status, "completed");
    assert.equal(right.status, "completed");

    assert.equal(
      await readSavedStepJobOutput(state, "job/alpha", "only").then((o) => o.seen),
      "left"
    );
    assert.equal(
      await readSavedStepJobOutput(state, "job_alpha", "only").then((o) => o.seen),
      "right",
      "the second job must not have overwritten the first"
    );
  });
});

// AS-04 An expired lease admits a new owner, and the old owner cannot write.
test("AS-04 an expired lease admits a new owner and the old owner cannot write afterward", async () => {
  await withState(async (state) => {
    await createWorkItem(state, { id: "wi-lease", title: "Long step", createdAt: T0 });

    const first = await state.claimWorkItem("wi-lease", {
      owner: "worker-a",
      leaseMs: 1000,
      now: T0,
    });
    assert.equal(first.status, "claimed");
    assert.ok(first.lease.leaseGeneration >= 1, "a claim must issue a lease generation");

    const second = await state.claimWorkItem("wi-lease", {
      owner: "worker-b",
      leaseMs: 60_000,
      now: plus(5000),
    });
    assert.equal(second.status, "claimed", "an expired lease must admit a new owner");
    assert.ok(
      second.lease.leaseGeneration > first.lease.leaseGeneration,
      "the new owner must get a higher generation"
    );

    const staleWrite = await isOwnerWriteCurrent(state, "wi-lease", {
      owner: "worker-a",
      leaseId: first.lease.leaseId,
      leaseGeneration: first.lease.leaseGeneration,
      now: plus(6000),
    });
    assert.equal(staleWrite.ok, false, "the old owner must be refused");
    assert.equal(staleWrite.reason, "stale_lease_generation");

    const liveWrite = await isOwnerWriteCurrent(state, "wi-lease", {
      owner: "worker-b",
      leaseId: second.lease.leaseId,
      leaseGeneration: second.lease.leaseGeneration,
      now: plus(6000),
    });
    assert.equal(liveWrite.ok, true);
  });
});

test("AS-04b a lease carries process start identity, not pid alone", async () => {
  await withState(async (state) => {
    await createWorkItem(state, { id: "wi-pid", title: "Pid recycle", createdAt: T0 });
    const claim = await state.claimWorkItem("wi-pid", {
      owner: "worker-a",
      leaseMs: 60_000,
      now: T0,
    });
    assert.ok(claim.lease.ownerIdentity, "a lease must record an owner identity");
    assert.notEqual(
      String(claim.lease.ownerIdentity),
      String(process.pid),
      "identity must be more than the pid"
    );
  });
});

// AS-05 Resume cannot displace a live owner.
test("AS-05 resume refuses to displace a live owner and takes over a dead one", async () => {
  await withState(async (state) => {
    await createWorkItem(state, { id: "wi-resume", title: "Resume safety", createdAt: T0 });
    const claim = await state.claimWorkItem("wi-resume", {
      owner: "worker-a",
      leaseMs: 60_000,
      now: T0,
    });

    const refused = await state.resumeWorkItem("wi-resume", {
      reason: "unrelated resume",
      now: plus(1000),
      isOwnerAlive: () => true,
    });
    assert.equal(refused.status, "refused", "a live owner must not be displaced");

    const items = await projectWorkItems(state);
    assert.equal(items[0].lease?.leaseId, claim.lease.leaseId, "the live lease must survive");

    const allowed = await state.resumeWorkItem("wi-resume", {
      reason: "owner process is gone",
      now: plus(2000),
      isOwnerAlive: () => false,
      recoveryCondition: "owner_process_absent",
    });
    assert.equal(allowed.status, "resumed", "a genuinely dead owner may be replaced");
  });
});

// AS-06 Process loss after an external response creates an uncertain effect.
test("AS-06 process loss after the destination responded leaves an uncertain effect, never a second request", async () => {
  await withState(async (state) => {
    await createWorkItem(state, { id: "wi-effect", title: "Jira create", createdAt: T0 });

    const prepared = await prepareEffect(state, {
      workItemId: "wi-effect",
      actionId: "act-1",
      actionRevisionId: "rev-1",
      destination: "jira",
      operation: "create_issue",
      payload: { summary: "Reconcile the M3 batch export" },
      now: T0,
    });
    assert.equal(prepared.effect.status, "prepared");
    assert.ok(
      prepared.effect.repeatSuppressionKey,
      "an effect must carry a repeat-suppression key"
    );

    const claimed = await claimEffect(state, {
      effectId: prepared.effect.effectId,
      owner: "worker-a",
      now: plus(100),
    });
    assert.equal(claimed.effect.status, "claimed");

    const attempt = await recordAttemptOutcome(state, {
      effectId: prepared.effect.effectId,
      effectAttemptId: claimed.effect.effectAttemptId,
      outcome: "unknown",
      now: plus(200),
    });
    assert.equal(attempt.effect.status, "uncertain", "an unknown outcome must be uncertain");

    const retry = await claimEffect(state, {
      effectId: prepared.effect.effectId,
      owner: "worker-b",
      now: plus(300),
    });
    assert.equal(retry.status, "reconcile_required", "an uncertain effect must reconcile first");
    assert.equal(retry.effect.status, "uncertain");

    const reconciled = await reconcileEffect(state, {
      effectId: prepared.effect.effectId,
      found: true,
      destinationRef: "MT-1234",
      now: plus(400),
    });
    assert.equal(
      reconciled.effect.status,
      "confirmed",
      "reconciliation found it, so no new request"
    );

    const effects = await listEffects(state, "wi-effect");
    assert.equal(effects.length, 1, "exactly one effect record, never a duplicate");
    assert.equal(effects[0].attempts.length, 1, "no second attempt was issued");
  });
});

test("AS-06b a confirmed effect is not complete until it is read back", async () => {
  await withState(async (state) => {
    await createWorkItem(state, { id: "wi-readback", title: "Readback", createdAt: T0 });
    const prepared = await prepareEffect(state, {
      workItemId: "wi-readback",
      actionId: "act-2",
      actionRevisionId: "rev-2",
      destination: "jira",
      operation: "create_issue",
      payload: { summary: "Readback check" },
      now: T0,
    });
    const claimed = await claimEffect(state, {
      effectId: prepared.effect.effectId,
      owner: "worker-a",
      now: plus(100),
    });
    const confirmed = await confirmEffect(state, {
      effectId: prepared.effect.effectId,
      effectAttemptId: claimed.effect.effectAttemptId,
      destinationRef: "MT-2001",
      now: plus(200),
    });
    assert.equal(confirmed.effect.status, "confirmed");
    assert.equal(confirmed.effect.readback, null);

    const read = await readbackEffect(state, {
      effectId: prepared.effect.effectId,
      observed: { key: "MT-2001", summary: "Readback check" },
      now: plus(300),
    });
    assert.equal(read.effect.status, "read_back");
    assert.ok(read.effect.readback.observedAt);
  });
});

// AS-07 A stop reaches the provider or invalidates its output.
test("AS-07 output produced after a stop is quarantined and never selected", async () => {
  await withState(async (state) => {
    await createWorkItem(state, { id: "wi-stop", title: "Stop safety", createdAt: T0 });
    const quarantined = await quarantineRecord(state, {
      workItemId: "wi-stop",
      reason: "output_returned_after_stop",
      record: { stepName: "generate", output: { text: "late output" } },
      now: plus(500),
    });
    assert.equal(quarantined.status, "quarantined");

    const items = await projectWorkItems(state);
    assert.equal(items[0].status, "quarantined_output", "the item must show the quarantine");
    assert.ok(
      items[0].quarantine?.some((entry) => entry.reason === "output_returned_after_stop"),
      "the quarantine reason must be recorded"
    );
  });
});

// AS-08 Completion without a verification receipt is rejected.
test("AS-08 externally acting work cannot be completed without a verification receipt", async () => {
  await withState(async (state) => {
    await createWorkItem(state, {
      id: "wi-complete",
      title: "Acting work",
      kind: "external-effect",
      externallyActing: true,
      createdAt: T0,
    });
    const claim = await state.claimWorkItem("wi-complete", {
      owner: "worker-a",
      leaseMs: 60_000,
      now: T0,
    });

    const bare = await appendEvent(state, {
      id: "evt-sneaky-complete",
      type: "work_item.completed",
      at: plus(100),
      workItemId: "wi-complete",
      payload: { receiptHash: "whatever" },
    });
    assert.equal(bare.status, "rejected", "a raw completion event must be refused");

    let items = await projectWorkItems(state);
    assert.notEqual(items[0].status, "completed", "the item must not read as completed");

    const missingReadback = await completeWorkItem(state, {
      workItemId: "wi-complete",
      owner: "worker-a",
      leaseId: claim.lease.leaseId,
      leaseGeneration: claim.lease.leaseGeneration,
      verification: {
        actionRevisionId: "rev-1",
        effectReceiptId: "eff-1",
        destinationReadback: null,
        checks: ["evidence", "destination"],
        unresolvedUncertainty: false,
      },
      now: plus(200),
    });
    assert.equal(missingReadback.status, "rejected");
    assert.match(missingReadback.reason, /readback/i);

    const uncertain = await completeWorkItem(state, {
      workItemId: "wi-complete",
      owner: "worker-a",
      leaseId: claim.lease.leaseId,
      leaseGeneration: claim.lease.leaseGeneration,
      verification: {
        actionRevisionId: "rev-1",
        effectReceiptId: "eff-1",
        destinationReadback: { key: "MT-1" },
        checks: ["evidence", "destination"],
        unresolvedUncertainty: true,
      },
      now: plus(300),
    });
    assert.equal(uncertain.status, "rejected", "unresolved uncertainty must reject completion");

    const good = await completeWorkItem(state, {
      workItemId: "wi-complete",
      owner: "worker-a",
      leaseId: claim.lease.leaseId,
      leaseGeneration: claim.lease.leaseGeneration,
      verification: {
        actionRevisionId: "rev-1",
        effectReceiptId: "eff-1",
        destinationReadback: { key: "MT-1" },
        checks: ["evidence", "destination"],
        unresolvedUncertainty: false,
      },
      now: plus(400),
    });
    assert.equal(good.status, "completed");

    items = await projectWorkItems(state);
    assert.equal(items[0].status, "completed");
  });
});

test("AS-08b internal work still completes without an external receipt", async () => {
  await withState(async (state) => {
    await createWorkItem(state, { id: "wi-internal", title: "Internal only", createdAt: T0 });
    const claim = await state.claimWorkItem("wi-internal", {
      owner: "worker-a",
      leaseMs: 60_000,
      now: T0,
    });
    const done = await completeWorkItem(state, {
      workItemId: "wi-internal",
      owner: "worker-a",
      leaseId: claim.lease.leaseId,
      leaseGeneration: claim.lease.leaseGeneration,
      now: plus(100),
    });
    assert.equal(done.status, "completed");
  });
});

// AS-09 Public page models refuse unapproved fields.
test("AS-09 a public model refuses fields that are not on its allowlist", () => {
  const built = buildPublicModel({
    allow: ["id", "title", "status"],
    record: { id: "wi-1", title: "Visible", status: "pending" },
  });
  assert.deepEqual(built.model, { id: "wi-1", title: "Visible", status: "pending" });

  assert.throws(
    () =>
      buildPublicModel({
        allow: ["id", "title"],
        record: { id: "wi-1", title: "Visible", rawTranscript: "private body" },
      }),
    /rawTranscript/,
    "an unapproved field must be named and refused"
  );
});

test("AS-09b a secret scan finds credentials in saved state and page payloads", () => {
  const clean = scanForSecrets({ id: "wi-1", summary: "Reconcile the batch export" });
  assert.equal(clean.ok, true);
  assert.deepEqual(clean.findings, []);

  const jiraToken = scanForSecrets({
    id: "wi-2",
    note: "use ATATT3xFfGF0abcdefghijklmnopqrstuvwxyz0123456789 to authenticate",
  });
  assert.equal(jiraToken.ok, false);
  assert.ok(jiraToken.findings.length >= 1);

  const bearer = scanForSecrets({
    nested: { header: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789" },
  });
  assert.equal(bearer.ok, false);
});
