import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { listEvents, openWorkbenchState } from "../workbench-state/index.mjs";
import { createActivityLifecycle } from "./activity-lifecycle.mjs";

const STARTED_AT = "2026-08-14T13:00:00.000Z";

function activityRun(overrides = {}) {
  return {
    id: "activity-20260814130000-fixture",
    status: "running",
    startedAt: STARTED_AT,
    finishedAt: null,
    lastActivityAt: STARTED_AT,
    resumedAt: null,
    resumeCount: 0,
    resumable: true,
    phase: {
      id: "preparing",
      label: "Preparing the scan window",
      index: 1,
      total: 8,
      startedAt: STARTED_AT,
    },
    counts: {
      observed: 2,
      new: 1,
      changed: 1,
      unchanged: 0,
      jiraProposals: 0,
      emailDrafts: 1,
      meetingsProcessed: 0,
      meetingsPending: 1,
      failures: 0,
    },
    sources: {
      outlook_received: {
        id: "outlook_received",
        state: "current",
        itemCount: 2,
        changedCount: 1,
        unchangedCount: 0,
        confirmedThrough: STARTED_AT,
        detail: "SECRET-SOURCE-DETAIL",
        items: [{ body: "SECRET-MAIL-BODY", token: "SECRET-TOKEN" }],
      },
    },
    meetings: [
      {
        id: "meeting-private-id",
        title: "SECRET-MEETING-TITLE",
        status: "partial",
        jobId: "meeting-job-safe-ref",
        currentStep: "generate_visual",
        detail: "SECRET-MEETING-DETAIL",
        transcript: "SECRET-TRANSCRIPT",
      },
    ],
    receiptRefs: [{ kind: "activity-run", id: "saved-receipt-safe-ref" }],
    emailDrafts: [{ subject: "SECRET-SUBJECT", body: "SECRET-DRAFT-BODY" }],
    ...overrides,
  };
}

async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "activity-lifecycle-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const state = await openWorkbenchState({ mode: "test", root });
  const current = { value: STARTED_AT };
  const lifecycle = createActivityLifecycle({
    state,
    owner: options.owner || "activity-reconciliation-1001",
    leaseMs: options.leaseMs || 60_000,
    clock: () => new Date(current.value),
    isOwnerAlive: options.isOwnerAlive || (async () => true),
  });
  return { current, lifecycle, root, state };
}

test("preparing and claiming a run are exact on retry, and a phase update renews the lease", async (t) => {
  const { current, lifecycle, state } = await fixture(t);
  const run = activityRun();

  assert.equal((await lifecycle.prepareRun(run)).status, "appended");
  assert.equal((await lifecycle.prepareRun(run)).status, "duplicate");
  assert.equal((await lifecycle.claimRun(run)).status, "claimed");
  assert.equal((await lifecycle.claimRun(run)).status, "duplicate");

  current.value = "2026-08-14T13:00:30.000Z";
  const changed = activityRun({
    lastActivityAt: current.value,
    phase: {
      id: "reading_sources",
      label: "Reading source activity",
      index: 2,
      total: 8,
      startedAt: current.value,
    },
  });
  const result = await lifecycle.phaseChanged(changed);
  assert.equal(result.event.status, "appended");
  assert.equal(result.lease.status, "renewed");
  assert.equal((await lifecycle.phaseChanged(changed)).event.status, "duplicate");
  assert.equal((await lifecycle.phaseChanged(changed)).lease.status, "duplicate");

  const events = await listEvents(state);
  assert.equal(events.filter((event) => event.type === "work_item.created").length, 1);
  assert.equal(events.filter((event) => event.type === "work_item.claimed").length, 1);
  assert.equal(events.filter((event) => event.type === "work_item.lease_renewed").length, 1);
  assert.equal(events.filter((event) => event.type === "activity.phase_changed").length, 1);
});

test("phase history contains only the approved summary fields", async (t) => {
  const { current, lifecycle, state } = await fixture(t);
  const run = activityRun();
  await lifecycle.prepareRun(run);
  await lifecycle.claimRun(run);
  current.value = "2026-08-14T13:00:20.000Z";
  await lifecycle.phaseChanged(
    activityRun({
      lastActivityAt: current.value,
      phase: {
        id: "processing_meetings",
        label: "Checking completed meetings",
        index: 4,
        total: 8,
        startedAt: current.value,
      },
    })
  );

  const serialized = JSON.stringify(await listEvents(state));
  for (const secret of [
    "SECRET-SOURCE-DETAIL",
    "SECRET-MAIL-BODY",
    "SECRET-TOKEN",
    "SECRET-MEETING-TITLE",
    "SECRET-MEETING-DETAIL",
    "SECRET-TRANSCRIPT",
    "SECRET-SUBJECT",
    "SECRET-DRAFT-BODY",
  ]) {
    assert.equal(serialized.includes(secret), false, `${secret} leaked into common history`);
  }
  assert.match(serialized, /meeting-job-safe-ref/);
  assert.match(serialized, /saved-receipt-safe-ref/);
  assert.match(serialized, /outlook_received/);
});

test("a live owner is refused without changing its lease", async (t) => {
  const first = await fixture(t, { owner: "activity-reconciliation-1001" });
  const run = activityRun();
  await first.lifecycle.prepareRun(run);
  await first.lifecycle.claimRun(run);

  const second = createActivityLifecycle({
    state: first.state,
    owner: "activity-reconciliation-2002",
    leaseMs: 60_000,
    clock: () => new Date("2026-08-14T13:00:10.000Z"),
    isOwnerAlive: async (owner) => owner === "activity-reconciliation-1001",
  });
  const result = await second.claimRun(run);
  assert.equal(result.status, "busy");
  assert.equal(result.lease.owner, "activity-reconciliation-1001");

  const projected = await second.projectRun(run.id);
  assert.equal(projected.item.lease.owner, "activity-reconciliation-1001");
});

test("a dead owner can be released and recovered before lease expiry", async (t) => {
  const first = await fixture(t, { owner: "activity-reconciliation-1001" });
  const run = activityRun();
  await first.lifecycle.prepareRun(run);
  await first.lifecycle.claimRun(run);

  const resumed = activityRun({
    resumedAt: "2026-08-14T13:00:10.000Z",
    lastActivityAt: "2026-08-14T13:00:10.000Z",
    resumeCount: 1,
  });
  const second = createActivityLifecycle({
    state: first.state,
    owner: "activity-reconciliation-2002",
    leaseMs: 60_000,
    clock: () => new Date(resumed.resumedAt),
    isOwnerAlive: async () => false,
  });
  const result = await second.claimRun(resumed);
  assert.equal(result.status, "claimed");
  assert.equal(result.lease.owner, "activity-reconciliation-2002");
  assert.equal(result.recoveredOwner, "activity-reconciliation-1001");

  const events = await listEvents(first.state);
  const types = events.map((event) => event.type);
  const releaseIndex = types.lastIndexOf("work_item.released");
  const resumeIndex = types.lastIndexOf("work_item.resumed");
  const claimIndex = types.lastIndexOf("work_item.claimed");
  assert.ok(releaseIndex < resumeIndex);
  assert.ok(resumeIndex < claimIndex);
});

test("an expired owner can be replaced without displacing a live lease", async (t) => {
  const first = await fixture(t, {
    owner: "activity-reconciliation-1001",
    leaseMs: 1_000,
  });
  const run = activityRun();
  await first.lifecycle.prepareRun(run);
  await first.lifecycle.claimRun(run);

  const resumed = activityRun({
    resumedAt: "2026-08-14T13:00:02.000Z",
    lastActivityAt: "2026-08-14T13:00:02.000Z",
    resumeCount: 1,
  });
  const second = createActivityLifecycle({
    state: first.state,
    owner: "activity-reconciliation-2002",
    leaseMs: 60_000,
    clock: () => new Date(resumed.resumedAt),
    isOwnerAlive: async () => true,
  });
  const result = await second.claimRun(resumed);
  assert.equal(result.status, "claimed");
  assert.equal(result.lease.owner, "activity-reconciliation-2002");
});

test("stopped and interrupted runs release their lease and remain resumable", async (t) => {
  const { current, lifecycle } = await fixture(t);
  const run = activityRun();
  await lifecycle.prepareRun(run);
  await lifecycle.claimRun(run);

  current.value = "2026-08-14T13:00:20.000Z";
  const stopped = await lifecycle.runStopped(
    activityRun({
      status: "canceled",
      finishedAt: current.value,
      lastActivityAt: current.value,
      resumable: true,
    })
  );
  assert.equal(stopped.release.status, "released");
  assert.equal((await lifecycle.projectRun(run.id)).item.lease, null);

  current.value = "2026-08-14T13:00:30.000Z";
  const resumed = activityRun({
    resumedAt: current.value,
    lastActivityAt: current.value,
    resumeCount: 1,
  });
  assert.equal((await lifecycle.claimRun(resumed)).status, "claimed");

  current.value = "2026-08-14T13:00:40.000Z";
  const interrupted = await lifecycle.runInterrupted(
    activityRun({
      status: "interrupted",
      lastActivityAt: current.value,
      resumeCount: 1,
      resumable: true,
    })
  );
  assert.equal(interrupted.release.status, "released");
  const projected = await lifecycle.projectRun(run.id);
  assert.equal(projected.item.status, "pending");
  assert.equal(projected.item.lease, null);
});

test("completion records the ordered receipt before completing the work item", async (t) => {
  const { current, lifecycle, state } = await fixture(t);
  const run = activityRun();
  await lifecycle.prepareRun(run);
  await lifecycle.claimRun(run);

  current.value = "2026-08-14T13:01:00.000Z";
  const completed = activityRun({
    status: "partial_success",
    finishedAt: current.value,
    lastActivityAt: current.value,
    counts: { ...run.counts, failures: 1, meetingsPending: 0, meetingsProcessed: 1 },
  });
  const result = await lifecycle.runCompleted(completed);
  assert.equal(result.receipt.status, "appended");
  assert.equal(result.completion.status, "appended");

  const events = await listEvents(state);
  const receipt = events.find((event) => event.type === "turn_receipt.recorded");
  const completion = events.find((event) => event.type === "work_item.completed");
  assert.ok(receipt.sequence < completion.sequence);
  assert.deepEqual(
    receipt.payload.phases.map((phase) => phase.name),
    [
      "host_execute",
      "typed_result",
      "validation",
      "durable_writeback",
      "quota_spend",
      "scheduler_ack",
    ]
  );
  assert.ok(receipt.payload.phases.every((phase) => phase.status === "success"));

  assert.equal((await lifecycle.runCompleted(completed)).receipt.status, "duplicate");
  assert.equal((await lifecycle.runCompleted(completed)).completion.status, "duplicate");
  const projected = await lifecycle.projectRun(run.id);
  assert.equal(projected.item.status, "completed");
  assert.equal(projected.receipt.id, `activity-receipt:${run.id}`);
});
