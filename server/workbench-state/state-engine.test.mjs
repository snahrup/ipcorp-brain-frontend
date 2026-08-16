import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  appendEvent,
  createWorkItem,
  listEvents,
  openWorkbenchState,
  projectWorkItems,
  resetWorkbenchStateRootForTests,
  resolveWorkbenchStateRoot,
  validateTurnReceipt,
} from "./index.mjs";

async function tempRoot() {
  return mkdtemp(join(tmpdir(), "workbench-state-test-"));
}

test("test mode requires a temp root and refuses the production root", async () => {
  assert.throws(() => resolveWorkbenchStateRoot({ mode: "test" }), /explicit temporary root/i);

  const production = resolveWorkbenchStateRoot({ mode: "production" });
  assert.throws(
    () => resolveWorkbenchStateRoot({ mode: "test", root: production.root }),
    /production root/i
  );
  assert.throws(
    () => resolveWorkbenchStateRoot({ mode: "test", root: join(homedir(), "workbench-test") }),
    /temp folder/i
  );
});

test("events append once, replay in order, and same-content event IDs are no-ops", async () => {
  const root = await tempRoot();
  try {
    const state = await openWorkbenchState({ mode: "test", root });
    const event = {
      id: "evt-1",
      type: "work_item.created",
      at: "2026-08-14T13:00:00.000Z",
      workItemId: "wi-1",
      payload: { title: "Rebuild Today snapshot", kind: "today-refresh" },
    };

    assert.equal((await appendEvent(state, event)).status, "appended");
    assert.equal((await appendEvent(state, event)).status, "duplicate");

    const events = await listEvents(state);
    assert.equal(events.length, 1);
    assert.equal(events[0].id, "evt-1");
    assert.equal(events[0].sequence, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an event ID with different content is recorded as a conflict and does not change replay", async () => {
  const root = await tempRoot();
  try {
    const state = await openWorkbenchState({ mode: "test", root });
    await appendEvent(state, {
      id: "evt-1",
      type: "work_item.created",
      at: "2026-08-14T13:00:00.000Z",
      workItemId: "wi-1",
      payload: { title: "Original", kind: "today-refresh" },
    });

    const result = await appendEvent(state, {
      id: "evt-1",
      type: "work_item.created",
      at: "2026-08-14T13:01:00.000Z",
      workItemId: "wi-1",
      payload: { title: "Changed", kind: "today-refresh" },
    });

    assert.equal(result.status, "conflict");
    assert.equal((await listEvents(state)).length, 1);

    const conflicts = (await readFile(state.paths.conflicts, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].eventId, "evt-1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parallel event appends keep unique ordered sequences", async () => {
  const root = await tempRoot();
  try {
    const state = await openWorkbenchState({ mode: "test", root });
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        appendEvent(state, {
          id: `evt-${index}`,
          type: "source.observed",
          at: `2026-08-14T13:00:${String(index).padStart(2, "0")}.000Z`,
          payload: { index },
        })
      )
    );

    const events = await listEvents(state);
    assert.equal(events.length, 20);
    assert.deepEqual(
      events.map((event) => event.sequence),
      Array.from({ length: 20 }, (_, index) => index + 1)
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("work items can be created, claimed, renewed, released, resumed, and projected", async () => {
  const root = await tempRoot();
  try {
    const state = await openWorkbenchState({ mode: "test", root });
    await createWorkItem(state, {
      id: "wi-1",
      title: "Reconcile meeting package",
      kind: "meeting-closeout",
      priority: "high",
      createdAt: "2026-08-14T13:00:00.000Z",
      sourceObservationIds: ["obs-1"],
      dependencies: ["wi-0"],
    });

    const claim = await state.claimWorkItem("wi-1", {
      owner: "crimson-atlas-621",
      leaseMs: 60_000,
      now: "2026-08-14T13:01:00.000Z",
      eventId: "evt-claim-wi-1",
    });
    assert.equal(claim.status, "claimed");
    assert.ok(claim.lease.leaseId);
    assert.equal(
      (
        await state.claimWorkItem("wi-1", {
          owner: "crimson-atlas-621",
          leaseMs: 60_000,
          now: "2026-08-14T13:01:00.000Z",
          eventId: "evt-claim-wi-1",
        })
      ).status,
      "duplicate"
    );

    const denied = await state.claimWorkItem("wi-1", {
      owner: "other-session",
      leaseMs: 60_000,
      now: "2026-08-14T13:01:10.000Z",
    });
    assert.equal(denied.status, "busy");

    const wrongToken = await state.renewWorkItemLease("wi-1", {
      owner: "crimson-atlas-621",
      leaseId: "wrong-token",
      leaseMs: 60_000,
      now: "2026-08-14T13:01:20.000Z",
    });
    assert.equal(wrongToken.status, "busy");

    const renewed = await state.renewWorkItemLease("wi-1", {
      owner: "crimson-atlas-621",
      leaseId: claim.lease.leaseId,
      leaseMs: 60_000,
      now: "2026-08-14T13:01:30.000Z",
      eventId: "evt-renew-wi-1",
    });
    assert.equal(renewed.status, "renewed");
    assert.equal(
      (
        await state.renewWorkItemLease("wi-1", {
          owner: "crimson-atlas-621",
          leaseId: claim.lease.leaseId,
          leaseMs: 60_000,
          now: "2026-08-14T13:01:30.000Z",
          eventId: "evt-renew-wi-1",
        })
      ).status,
      "duplicate"
    );
    const released = await state.releaseWorkItem("wi-1", {
      owner: "crimson-atlas-621",
      leaseId: claim.lease.leaseId,
      now: "2026-08-14T13:02:00.000Z",
      eventId: "evt-release-wi-1",
    });
    assert.equal(released.status, "released");
    assert.equal(
      (
        await state.releaseWorkItem("wi-1", {
          owner: "crimson-atlas-621",
          leaseId: claim.lease.leaseId,
          now: "2026-08-14T13:02:00.000Z",
          eventId: "evt-release-wi-1",
        })
      ).status,
      "duplicate"
    );
    await state.resumeWorkItem("wi-1", {
      reason: "Workbench restarted",
      now: "2026-08-14T13:03:00.000Z",
    });

    const projected = await projectWorkItems(state);
    assert.equal(projected.length, 1);
    assert.equal(projected[0].id, "wi-1");
    assert.equal(projected[0].status, "pending");
    assert.equal(projected[0].lease, null);
    assert.deepEqual(projected[0].sourceObservationIds, ["obs-1"]);
    assert.deepEqual(projected[0].dependencies, ["wi-0"]);
    assert.match(projected[0].history.map((entry) => entry.type).join(" "), /resumed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lease event conflicts leave replayed lease state unchanged", async () => {
  const root = await tempRoot();
  try {
    const state = await openWorkbenchState({ mode: "test", root });
    await createWorkItem(state, {
      id: "wi-conflict",
      title: "Keep lease and replay aligned",
      createdAt: "2026-08-14T13:00:00.000Z",
      eventId: "evt-reused",
    });

    const rejectedClaim = await state.claimWorkItem("wi-conflict", {
      owner: "crimson-atlas-621",
      leaseMs: 60_000,
      now: "2026-08-14T13:01:00.000Z",
      eventId: "evt-reused",
    });
    assert.equal(rejectedClaim.status, "conflict");
    assert.equal((await projectWorkItems(state))[0].status, "pending");

    const claim = await state.claimWorkItem("wi-conflict", {
      owner: "crimson-atlas-621",
      leaseMs: 60_000,
      now: "2026-08-14T13:02:00.000Z",
      eventId: "evt-claim",
    });
    assert.equal(claim.status, "claimed");

    const rejectedRelease = await state.releaseWorkItem("wi-conflict", {
      owner: "crimson-atlas-621",
      leaseId: claim.lease.leaseId,
      now: "2026-08-14T13:02:30.000Z",
      eventId: "evt-reused",
    });
    assert.equal(rejectedRelease.status, "conflict");
    const projected = (await projectWorkItems(state))[0];
    assert.equal(projected.status, "claimed");
    assert.equal(projected.lease.leaseId, claim.lease.leaseId);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("test cleanup removes only the validated temporary state root", async () => {
  const root = await tempRoot();
  const state = await openWorkbenchState({ mode: "test", root });
  await appendEvent(state, {
    id: "evt-cleanup",
    type: "source.observed",
    at: "2026-08-14T13:00:00.000Z",
    payload: {},
  });

  await resetWorkbenchStateRootForTests(root);
  await assert.rejects(readFile(state.paths.events, "utf8"), { code: "ENOENT" });
});

test("turn receipt validation requires ordered successful phases before completion", () => {
  const complete = validateTurnReceipt({
    id: "turn-1",
    status: "complete",
    phases: [
      { name: "host_execute", status: "success" },
      { name: "typed_result", status: "success" },
      { name: "validation", status: "success" },
      { name: "durable_writeback", status: "success" },
      { name: "quota_spend", status: "success" },
      { name: "scheduler_ack", status: "success" },
    ],
  });
  assert.equal(complete.ok, true);

  const missing = validateTurnReceipt({
    id: "turn-2",
    status: "complete",
    phases: [
      { name: "host_execute", status: "success" },
      { name: "typed_result", status: "success" },
      { name: "validation", status: "success" },
    ],
  });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing, ["durable_writeback", "quota_spend", "scheduler_ack"]);
  assert.match(missing.reason, /missing/i);

  const failed = validateTurnReceipt({
    id: "turn-3",
    status: "complete",
    phases: [
      { name: "host_execute", status: "success" },
      { name: "typed_result", status: "success" },
      { name: "validation", status: "failed" },
      { name: "durable_writeback", status: "success" },
      { name: "quota_spend", status: "success" },
      { name: "scheduler_ack", status: "success" },
    ],
  });
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.failed, ["validation"]);

  const unordered = validateTurnReceipt({
    id: "turn-4",
    status: "complete",
    phases: [
      { name: "typed_result", status: "success" },
      { name: "host_execute", status: "success" },
      { name: "validation", status: "success" },
      { name: "durable_writeback", status: "success" },
      { name: "quota_spend", status: "success" },
      { name: "scheduler_ack", status: "success" },
    ],
  });
  assert.equal(unordered.ok, false);
  assert.match(unordered.reason, /order/i);

  const duplicate = validateTurnReceipt({
    id: "turn-5",
    status: "complete",
    phases: [
      { name: "host_execute", status: "success" },
      { name: "typed_result", status: "success" },
      { name: "typed_result", status: "success" },
      { name: "validation", status: "success" },
      { name: "durable_writeback", status: "success" },
      { name: "quota_spend", status: "success" },
      { name: "scheduler_ack", status: "success" },
    ],
  });
  assert.equal(duplicate.ok, false);
  assert.deepEqual(duplicate.duplicates, ["typed_result"]);
});
