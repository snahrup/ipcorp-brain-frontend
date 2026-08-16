import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openWorkbenchState } from "./index.mjs";
import {
  listRecoverableSavedStepJobs,
  projectSavedStepJob,
  requestSavedStepJobStop,
  runSavedStepJob,
} from "./step-runner.mjs";

async function tempState() {
  const root = await mkdtemp(join(tmpdir(), "workbench-step-runner-test-"));
  const state = await openWorkbenchState({ mode: "test", root });
  return { root, state };
}

async function cleanup(root) {
  await rm(root, { recursive: true, force: true });
}

function baseJob(overrides = {}) {
  return {
    workItemId: "meeting-job-1",
    title: "Meeting job",
    kind: "meeting-closeout",
    owner: "step-runner-test",
    leaseMs: 60_000,
    now: "2026-08-14T13:00:00.000Z",
    input: {
      meetingId: "fabric-standup",
      transcript: "RAW SECRET TRANSCRIPT SHOULD ONLY LIVE IN SNAPSHOTS",
    },
    ...overrides,
  };
}

function textOf(value) {
  return JSON.stringify(value);
}

test("runner completes ordered steps and exposes only redacted progress", async () => {
  const { root, state } = await tempState();
  try {
    const calls = [];
    const result = await runSavedStepJob(state, {
      ...baseJob(),
      steps: [
        {
          name: "discover",
          run: async () => {
            calls.push("discover");
            return {
              found: true,
              secretEcho: "RAW SECRET TRANSCRIPT SHOULD ONLY LIVE IN SNAPSHOTS",
            };
          },
          validate: async ({ output }) => output.found === true,
        },
        {
          name: "synthesize",
          getInput: ({ outputs }) => ({ discovered: outputs.discover.found }),
          run: async () => {
            calls.push("synthesize");
            return { summaryRef: "summary.md" };
          },
          validate: async ({ output }) => output.summaryRef === "summary.md",
        },
      ],
    });

    assert.equal(result.status, "completed");
    assert.deepEqual(calls, ["discover", "synthesize"]);

    const projection = await projectSavedStepJob(state, "meeting-job-1");
    assert.equal(projection.status, "completed");
    assert.deepEqual(
      projection.steps.map((step) => step.name),
      ["discover", "synthesize"]
    );
    assert.deepEqual(
      projection.turnReceipt.steps.map((step) => step.name),
      ["discover", "synthesize"]
    );

    const rawStatus = textOf(projection);
    assert.ok(!rawStatus.includes("RAW SECRET"));

    const events = await readFile(state.paths.events, "utf8");
    assert.ok(!events.includes("RAW SECRET"));
  } finally {
    await cleanup(root);
  }
});

test("stop requests are honored between steps and resume continues unfinished work", async () => {
  const { root, state } = await tempState();
  try {
    const calls = [];
    const steps = [
      {
        name: "discover",
        run: async () => {
          calls.push("discover");
          await requestSavedStepJobStop(state, {
            workItemId: "meeting-job-1",
            reason: "user requested pause",
            now: "2026-08-14T13:00:05.000Z",
          });
          return { found: true };
        },
        validate: async ({ output }) => output.found === true,
      },
      {
        name: "synthesize",
        run: async () => {
          calls.push("synthesize");
          return { summaryRef: "summary.md" };
        },
        validate: async ({ output }) => output.summaryRef === "summary.md",
      },
    ];

    const stopped = await runSavedStepJob(state, baseJob({ steps }));
    assert.equal(stopped.status, "stopped");
    assert.deepEqual(calls, ["discover"]);

    const resumed = await runSavedStepJob(state, baseJob({ steps, resume: true }));
    assert.equal(resumed.status, "completed");
    assert.deepEqual(calls, ["discover", "synthesize"]);

    const projection = await projectSavedStepJob(state, "meeting-job-1");
    assert.equal(projection.steps[0].attempts, 1);
    assert.equal(projection.steps[1].attempts, 1);
  } finally {
    await cleanup(root);
  }
});

test("missing artifacts rerun a successful step instead of trusting stale status", async () => {
  const { root, state } = await tempState();
  try {
    let calls = 0;
    const steps = [
      {
        name: "discover",
        run: async () => {
          calls += 1;
          return { found: true, calls };
        },
        validate: async ({ output }) => output.found === true,
      },
    ];

    await runSavedStepJob(state, baseJob({ steps }));
    const first = await projectSavedStepJob(state, "meeting-job-1");
    await unlink(join(state.paths.snapshots, first.steps[0].outputRefs[0].path));

    const rerun = await runSavedStepJob(state, baseJob({ steps, resume: true }));
    assert.equal(rerun.status, "completed");
    assert.equal(calls, 2);
    const projection = await projectSavedStepJob(state, "meeting-job-1");
    assert.equal(projection.steps[0].attempts, 2);
  } finally {
    await cleanup(root);
  }
});

test("failed steps retry at the exact failed step and preserve prior outputs", async () => {
  const { root, state } = await tempState();
  try {
    const calls = [];
    let synthAttempts = 0;
    const steps = [
      {
        name: "discover",
        run: async () => {
          calls.push("discover");
          return { found: true };
        },
        validate: async ({ output }) => output.found === true,
      },
      {
        name: "synthesize",
        run: async () => {
          synthAttempts += 1;
          calls.push(`synthesize-${synthAttempts}`);
          if (synthAttempts === 1) throw new Error("model failed");
          return { summaryRef: "summary.md" };
        },
        validate: async ({ output }) => output.summaryRef === "summary.md",
      },
    ];

    const failed = await runSavedStepJob(state, baseJob({ steps }));
    assert.equal(failed.status, "failed");
    assert.deepEqual(calls, ["discover", "synthesize-1"]);

    const completed = await runSavedStepJob(state, baseJob({ steps, resume: true }));
    assert.equal(completed.status, "completed");
    assert.deepEqual(calls, ["discover", "synthesize-1", "synthesize-2"]);

    const projection = await projectSavedStepJob(state, "meeting-job-1");
    assert.equal(projection.steps[0].attempts, 1);
    assert.equal(projection.steps[1].attempts, 2);
  } finally {
    await cleanup(root);
  }
});

test("changed step input reruns even when an old artifact still validates", async () => {
  const { root, state } = await tempState();
  try {
    const inputs = [];
    const steps = [
      {
        name: "discover",
        getInput: ({ input }) => ({ transcript: input.transcript }),
        run: async ({ stepInput }) => {
          inputs.push(stepInput.transcript);
          return { length: stepInput.transcript.length };
        },
        validate: async ({ output }) => Number.isInteger(output.length),
      },
    ];

    await runSavedStepJob(state, baseJob({ steps }));
    await runSavedStepJob(
      state,
      baseJob({
        steps,
        resume: true,
        input: { meetingId: "fabric-standup", transcript: "CHANGED RAW SECRET" },
      })
    );

    assert.deepEqual(inputs, [
      "RAW SECRET TRANSCRIPT SHOULD ONLY LIVE IN SNAPSHOTS",
      "CHANGED RAW SECRET",
    ]);
    const projection = await projectSavedStepJob(state, "meeting-job-1");
    assert.equal(projection.steps[0].attempts, 2);
  } finally {
    await cleanup(root);
  }
});

test("leases prevent a second owner from running the same job", async () => {
  const { root, state } = await tempState();
  try {
    const steps = [
      {
        name: "discover",
        run: async () => ({ found: true }),
        validate: async ({ output }) => output.found === true,
      },
    ];
    await runSavedStepJob(state, baseJob({ steps }));
    const claim = await state.claimWorkItem("meeting-job-1", {
      owner: "other-owner",
      leaseMs: 60_000,
      now: "2026-08-14T13:10:00.000Z",
    });
    assert.equal(claim.status, "claimed");

    let ran = false;
    const busy = await runSavedStepJob(
      state,
      baseJob({
        owner: "step-runner-test",
        steps: [
          {
            name: "discover",
            run: async () => {
              ran = true;
              return { found: true };
            },
          },
        ],
        now: "2026-08-14T13:10:10.000Z",
      })
    );
    assert.equal(busy.status, "busy");
    assert.equal(ran, false);
  } finally {
    await cleanup(root);
  }
});

test("recoverable jobs list unfinished matching work only", async () => {
  const { root, state } = await tempState();
  try {
    await runSavedStepJob(
      state,
      baseJob({
        workItemId: "recoverable",
        steps: [
          {
            name: "discover",
            run: async () => {
              throw new Error("not yet");
            },
          },
        ],
      })
    );
    await runSavedStepJob(
      state,
      baseJob({
        workItemId: "complete",
        steps: [
          {
            name: "discover",
            run: async () => ({ found: true }),
            validate: async ({ output }) => output.found === true,
          },
        ],
      })
    );

    const jobs = await listRecoverableSavedStepJobs(state, { kind: "meeting-closeout" });
    assert.deepEqual(
      jobs.map((job) => job.workItemId),
      ["recoverable"]
    );
  } finally {
    await cleanup(root);
  }
});
