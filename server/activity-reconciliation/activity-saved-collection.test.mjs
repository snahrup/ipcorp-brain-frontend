// Phase 2 acceptance checks: activity on saved steps.
// Frozen in docs/mythos/gates/20260817-activity-on-saved-steps.md before implementation.
// No live external effect anywhere: every reader here is an inert function.

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openWorkbenchState, projectWorkItems } from "../workbench-state/index.mjs";
import {
  readSavedStepJobOutput,
  requestSavedStepJobStop,
} from "../workbench-state/step-runner.mjs";
import { runSavedActivityCollection } from "./activity-saved-collection.mjs";

async function withState(run) {
  const root = await mkdtemp(join(tmpdir(), "activity-saved-"));
  try {
    return await run(await openWorkbenchState({ mode: "test", root }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const TWO = ["outlook_received", "teams_direct_messages"];
const WINDOWS = {
  outlook_received: { from: "2026-08-10", to: "2026-08-16" },
  teams_direct_messages: { from: "2026-08-10", to: "2026-08-16" },
};

function countingReader(results, calls) {
  return async ({ sourceId }) => {
    calls.set(sourceId, (calls.get(sourceId) || 0) + 1);
    const next = results[sourceId];
    if (next instanceof Error) throw next;
    return next ?? { state: "empty", items: [] };
  };
}

// AJ-01: one saved step per source, each with its own artifact.
test("AJ-01 each selected source runs as its own saved step with its own artifact", async () => {
  await withState(async (state) => {
    const calls = new Map();
    const result = await runSavedActivityCollection({
      state,
      runId: "run-1",
      owner: "activity-1",
      windows: WINDOWS,
      selectedSourceIds: TWO,
      readSource: countingReader(
        {
          outlook_received: { state: "current", items: [{ stableId: "m-1", hash: "a" }] },
          teams_direct_messages: { state: "empty", items: [] },
        },
        calls
      ),
    });

    assert.equal(result.status, "completed");
    assert.deepEqual(Object.keys(result.sources).sort(), [...TWO].sort());
    for (const id of TWO) assert.equal(calls.get(id), 1);

    const outlook = await readSavedStepJobOutput(state, "run-1", "source:outlook_received");
    assert.equal(outlook.state, "current");
    assert.equal(outlook.items[0].stableId, "m-1");
    const teams = await readSavedStepJobOutput(state, "run-1", "source:teams_direct_messages");
    assert.equal(teams.state, "empty");
  });
});

// AJ-02 and AJ-03: interruption, then resume under the same run id, finished sources skipped.
test("AJ-02/03 a resumed run keeps its id and does not read finished sources again", async () => {
  await withState(async (state) => {
    const calls = new Map();
    const boom = new Error("network fell over mid-run");

    // First pass: outlook succeeds, teams THROWS at the engine level by aborting the job:
    // simulate process death by making the second reader reject with a non-source error the
    // step turns into a failed artifact... instead, simulate death harder: run only the
    // first source, as a killed process would leave exactly one finished step behind.
    const first = await runSavedActivityCollection({
      state,
      runId: "run-2",
      owner: "activity-1",
      windows: WINDOWS,
      selectedSourceIds: ["outlook_received"],
      readSource: countingReader(
        { outlook_received: { state: "current", items: [{ stableId: "m-1", hash: "a" }] } },
        calls
      ),
    });
    assert.equal(first.status, "completed");
    void boom;

    // Second pass: the same run id, now with both sources selected, as a restart would do.
    const resumed = await runSavedActivityCollection({
      state,
      runId: "run-2",
      owner: "activity-1",
      windows: WINDOWS,
      selectedSourceIds: TWO,
      resume: true,
      readSource: countingReader(
        {
          outlook_received: { state: "current", items: [{ stableId: "m-1", hash: "a" }] },
          teams_direct_messages: { state: "current", items: [{ stableId: "t-1", hash: "b" }] },
        },
        calls
      ),
    });

    assert.equal(resumed.status, "completed");
    assert.equal(resumed.workItemId, "run-2", "the same run id must survive the resume");
    assert.equal(
      calls.get("outlook_received"),
      1,
      "the finished source must skip on its saved artifact, not read again"
    );
    assert.equal(calls.get("teams_direct_messages"), 1);
    assert.equal(resumed.sources.outlook_received.status, "skipped");
    assert.equal(resumed.sources.teams_direct_messages.status, "succeeded");

    const items = await projectWorkItems(state);
    assert.equal(
      items.filter((item) => item.id === "run-2").length,
      1,
      "one run id is one work item, never two"
    );
  });
});

// AJ-04: one reader failing is a failed source, not a failed run.
test("AJ-04 a failed source is isolated and the other sources keep their results", async () => {
  await withState(async (state) => {
    const calls = new Map();
    const result = await runSavedActivityCollection({
      state,
      runId: "run-3",
      owner: "activity-1",
      windows: WINDOWS,
      selectedSourceIds: TWO,
      readSource: countingReader(
        {
          outlook_received: new Error("mailbox unreachable"),
          teams_direct_messages: { state: "current", items: [{ stableId: "t-1", hash: "b" }] },
        },
        calls
      ),
    });

    assert.equal(result.status, "completed", "the run itself completes");
    const failed = await readSavedStepJobOutput(state, "run-3", "source:outlook_received");
    assert.equal(failed.state, "failed");
    assert.match(failed.detail, /mailbox unreachable/);
    const ok = await readSavedStepJobOutput(state, "run-3", "source:teams_direct_messages");
    assert.equal(ok.state, "current");
    assert.equal(ok.items.length, 1, "the healthy source keeps its result");
  });
});

// AJ-05: identical windows and positions, second run reads nothing.
test("AJ-05 an unchanged repeat run calls no reader at all", async () => {
  await withState(async (state) => {
    const calls = new Map();
    const readers = {
      outlook_received: { state: "current", items: [{ stableId: "m-1", hash: "a" }] },
      teams_direct_messages: { state: "empty", items: [] },
    };
    const options = {
      state,
      runId: "run-4",
      owner: "activity-1",
      windows: WINDOWS,
      positions: { outlook_received: { completedThrough: "2026-08-16" } },
      selectedSourceIds: TWO,
      readSource: countingReader(readers, calls),
    };

    assert.equal((await runSavedActivityCollection(options)).status, "completed");
    const second = await runSavedActivityCollection({ ...options, resume: true });
    assert.equal(second.status, "completed");

    for (const id of TWO) {
      assert.equal(calls.get(id), 1, `${id} must not be read again on an unchanged repeat`);
      assert.equal(second.sources[id].status, "skipped");
    }
  });
});

// AJ-06: a moved position reruns exactly that source; identity is the reader's stable id.
test("AJ-06 a moved position reruns that source once and the changed item keeps its id", async () => {
  await withState(async (state) => {
    const calls = new Map();
    const base = {
      state,
      runId: "run-5",
      owner: "activity-1",
      windows: WINDOWS,
      selectedSourceIds: TWO,
    };

    await runSavedActivityCollection({
      ...base,
      positions: { outlook_received: { completedThrough: "2026-08-15" } },
      readSource: countingReader(
        {
          outlook_received: { state: "current", items: [{ stableId: "m-1", hash: "a" }] },
          teams_direct_messages: { state: "empty", items: [] },
        },
        calls
      ),
    });

    const moved = await runSavedActivityCollection({
      ...base,
      resume: true,
      positions: { outlook_received: { completedThrough: "2026-08-16" } },
      readSource: countingReader(
        {
          outlook_received: {
            state: "current",
            items: [{ stableId: "m-1", hash: "CHANGED", classification: "changed" }],
          },
          teams_direct_messages: { state: "empty", items: [] },
        },
        calls
      ),
    });

    assert.equal(moved.status, "completed");
    assert.equal(calls.get("outlook_received"), 2, "the moved source reruns exactly once more");
    assert.equal(calls.get("teams_direct_messages"), 1, "the unmoved source stays skipped");

    const output = await readSavedStepJobOutput(state, "run-5", "source:outlook_received");
    assert.equal(output.items.length, 1, "the changed item returns exactly once");
    assert.equal(output.items[0].stableId, "m-1", "under the same stable identity");
    assert.equal(output.items[0].hash, "CHANGED");
  });
});

// AJ-07: stop reaches a reader that is still running.
test("AJ-07 a stop aborts an in-flight reader and the run reports stopped", async () => {
  await withState(async (state) => {
    let sawAbort = false;
    const result = await runSavedActivityCollection({
      state,
      runId: "run-6",
      owner: "activity-1",
      windows: WINDOWS,
      selectedSourceIds: ["outlook_received"],
      stopPollMs: 5,
      readSource: async ({ signal }) => {
        await requestSavedStepJobStop(state, {
          workItemId: "run-6",
          reason: "user pressed stop",
        });
        for (let i = 0; i < 400 && !signal.aborted; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        sawAbort = signal.aborted;
        const abort = new Error("aborted");
        abort.name = "AbortError";
        throw abort;
      },
    });

    assert.equal(sawAbort, true, "the reader must observe the abort");
    assert.equal(result.status, "stopped");
    const items = await projectWorkItems(state);
    const item = items.find((entry) => entry.id === "run-6");
    assert.ok(
      item.quarantine?.some((entry) => entry.reason === "output_returned_after_stop"),
      "the cancelled reader's work is quarantined"
    );
  });
});

// AJ-08. The unused clock option was removed from the lifecycle rather than half-wired.
// This guard fails if someone reintroduces it without honoring it.
test("AJ-08 the activity lifecycle takes no clock option", async () => {
  const source = await readFile(new URL("./activity-lifecycle.mjs", import.meta.url), "utf8");
  assert.ok(
    !source.includes("options.clock"),
    "activity-lifecycle.mjs must not accept a clock option it does not honor"
  );
});
