import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createMeetingCloseoutSteps } from "./meeting-closeout.mjs";
import {
  getMeetingCloseoutJob,
  recoverMeetingCloseoutJobs,
  resumeMeetingCloseoutJob,
  startMeetingCloseoutJob,
  stopMeetingCloseoutJob,
  waitForMeetingCloseoutJob,
} from "./meeting-closeout-job.mjs";
import { openWorkbenchState } from "./workbench-state/index.mjs";
import {
  prepareSavedStepJob,
  projectSavedStepJob,
  requestSavedStepJobStop,
  runSavedStepJob,
} from "./workbench-state/step-runner.mjs";

const meeting = {
  id: "durable-closeout-test",
  title: "Durable Delivery Review",
  start: "2026-08-14T14:00:00-04:00",
  end: "2026-08-14T14:30:00-04:00",
  organizer: "Patrick Stiller",
  attendees: ["Steve Nahrup", "Patrick Stiller"],
};

const transcript = [
  "Steve: I will send the Fabric workbook to Patrick tomorrow.",
  "Patrick: Update MT-42 with the source mapping.",
  "Steve: Email Patrick with the recap.",
  "RAW SECRET TRANSCRIPT MUST NOT APPEAR IN STATUS.",
].join("\n");

function modelOutput() {
  return `PACKAGE:\n${JSON.stringify({
    summary: "Steve and Patrick aligned on the next Fabric delivery steps.",
    commitments: [
      {
        text: "Send the Fabric workbook to Patrick Stiller.",
        evidence: "Steve: I will send the Fabric workbook to Patrick tomorrow.",
        due: "tomorrow",
      },
    ],
    jiraProposals: [
      {
        operation: "Update",
        jiraKey: "MT-42",
        title: "Update MT-42 with the source mapping",
        rationale: "Patrick asked for the source mapping on the existing item.",
        evidence: "Patrick: Update MT-42 with the source mapping.",
      },
    ],
    documentRequests: [],
    reminderCandidates: [],
    supportingMaterial: [],
    emailDrafts: [
      {
        to: "Patrick Stiller",
        subject: "Delivery review recap",
        body: "Patrick,\n\nHere is the recap.\n\nSteve",
        evidence: "Steve: Email Patrick with the recap.",
      },
    ],
    themes: ["Fabric delivery", "Source mapping"],
    notes: [],
  })}\nEND PACKAGE`;
}

async function prepareBrainRoot(root) {
  await mkdir(root, { recursive: true });
  await Promise.all([
    writeFile(
      join(root, "AGENTS.md"),
      "# Brain instructions\n\nRead INGESTION_PLAYBOOK.md before writing.\n",
      "utf8"
    ),
    writeFile(
      join(root, "INGESTION_PLAYBOOK.md"),
      "# Ingestion playbook\n\n## MANDATORY Brain CHANGELOG/MANIFEST rule\n",
      "utf8"
    ),
    writeFile(
      join(root, "CHANGELOG.md"),
      [
        "# CHANGELOG & MANIFEST",
        "",
        "## SECTION 1 - CHANGELOG",
        "",
        "| 2026-08-14 | 09:00 ET | Workbench | Existing file | Existing checked change. |",
        "",
        "## SECTION 2 - MANIFEST",
        "",
        "| 1 | staged.md | core/staged.md | **INSTALL** | Earlier staged file. |",
        "",
        "### Processed manifest items",
        "- 2026-08-14 09:05 ET - Workbench - item #1 installed and checked.",
        "",
      ].join("\n"),
      "utf8"
    ),
  ]);
}

async function testEnvironment(t, name) {
  const root = await mkdtemp(join(tmpdir(), `${name}-`));
  const brainRoot = join(root, "brain");
  const state = await openWorkbenchState({ mode: "test", root: join(root, "state") });
  await prepareBrainRoot(brainRoot);
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    root,
    brainRoot,
    state,
    options: {
      state,
      closeoutOptions: {
        brainRoot,
        runModel: async () => modelOutput(),
        codexInfographicOptions: {
          fixtureImagePath: resolve("public", "brand", "ip-corporation-official.png"),
        },
      },
    },
  };
}

async function waitUntil(check, message) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  throw new Error(message);
}

test("start returns before work finishes and exposes redacted durable progress", async (t) => {
  const environment = await testEnvironment(t, "meeting-closeout-job-complete");
  let releaseModel;
  const modelReady = new Promise((resolveReady) => {
    releaseModel = resolveReady;
  });
  const options = {
    ...environment.options,
    closeoutOptions: {
      ...environment.options.closeoutOptions,
      runModel: async () => {
        await modelReady;
        return modelOutput();
      },
    },
  };
  const started = await startMeetingCloseoutJob({ meeting, transcript }, options);
  assert.equal(started.accepted, true);
  assert.equal(started.job.status, "pending");
  assert.equal(started.job.steps.length, 8);
  assert.ok(!JSON.stringify(started.job).includes("RAW SECRET"));

  const running = await waitUntil(
    () =>
      getMeetingCloseoutJob(started.job.workItemId, options).then(
        (job) => job.status === "running" && job
      ),
    "The meeting job never started."
  );
  assert.ok(running.steps.some((step) => step.status === "running"));
  releaseModel();

  const completed = await waitForMeetingCloseoutJob(started.job.workItemId, options);
  assert.equal(completed.status, "completed");
  assert.equal(completed.result.ok, true);
  assert.equal(completed.result.inspection.complete, true);
  assert.equal(
    completed.steps.every((step) => ["succeeded", "skipped"].includes(step.status)),
    true
  );
  assert.ok(!JSON.stringify(completed).includes("RAW SECRET"));
  assert.ok(!(await readFile(environment.state.paths.events, "utf8")).includes("RAW SECRET"));
});

test("a stop request pauses between stages and resume continues saved work", async (t) => {
  const environment = await testEnvironment(t, "meeting-closeout-job-stop");
  let releaseModel;
  const modelReady = new Promise((resolveReady) => {
    releaseModel = resolveReady;
  });
  const options = {
    ...environment.options,
    closeoutOptions: {
      ...environment.options.closeoutOptions,
      runModel: async () => {
        await modelReady;
        return modelOutput();
      },
    },
  };
  const started = await startMeetingCloseoutJob({ meeting, transcript }, options);
  await waitUntil(
    () =>
      getMeetingCloseoutJob(started.job.workItemId, options).then(
        (job) => job.steps.find((step) => step.name === "synthesize")?.status === "running"
      ),
    "Synthesis never started."
  );
  const stopRequested = await stopMeetingCloseoutJob(started.job.workItemId, options);
  assert.equal(stopRequested.stopRequested, true);
  const tooSoon = await resumeMeetingCloseoutJob(started.job.workItemId, options);
  assert.equal(tooSoon.accepted, false);
  assert.equal(tooSoon.job.isActive, true);
  releaseModel();
  const stopped = await waitForMeetingCloseoutJob(started.job.workItemId, options);
  assert.equal(stopped.status, "stop_requested");
  assert.equal(stopped.steps.find((step) => step.name === "store").status, "pending");

  const resumed = await resumeMeetingCloseoutJob(started.job.workItemId, options);
  assert.equal(resumed.accepted, true);
  const completed = await waitForMeetingCloseoutJob(started.job.workItemId, options);
  assert.equal(completed.status, "completed");
  assert.equal(completed.steps.find((step) => step.name === "synthesize").attempts, 1);
  assert.equal(completed.steps.find((step) => step.name === "store").attempts, 1);
});

test("a failed visual waits for explicit resume and retries only that stage", async (t) => {
  const environment = await testEnvironment(t, "meeting-closeout-job-recover");
  const failing = {
    ...environment.options,
    closeoutOptions: {
      brainRoot: environment.brainRoot,
      runModel: async () => modelOutput(),
      generateInfographic: async () => {
        throw new Error("Injected image failure.");
      },
    },
  };
  const started = await startMeetingCloseoutJob({ meeting, transcript }, failing);
  const failed = await waitForMeetingCloseoutJob(started.job.workItemId, failing);
  assert.equal(failed.status, "failed");
  assert.equal(failed.failure.stepName, "generate_visual");
  assert.equal(failed.steps.find((step) => step.name === "store").attempts, 1);

  const recoveredIds = await recoverMeetingCloseoutJobs(environment.options);
  assert.deepEqual(recoveredIds, []);
  await resumeMeetingCloseoutJob(started.job.workItemId, environment.options);
  const completed = await waitForMeetingCloseoutJob(started.job.workItemId, environment.options);
  assert.equal(completed.status, "completed");
  assert.equal(completed.steps.find((step) => step.name === "store").attempts, 1);
  assert.equal(completed.steps.find((step) => step.name === "generate_visual").attempts, 2);
  const visualStatus = JSON.parse(
    await readFile(
      join(environment.brainRoot, completed.result.package.files.infographicStatus),
      "utf8"
    )
  );
  assert.deepEqual(
    visualStatus.attemptHistory.map((attempt) => attempt.outcome),
    ["failed", "generated"]
  );
});

test("startup recovery continues a prepared job without another transcript paste", async (t) => {
  const environment = await testEnvironment(t, "meeting-closeout-job-startup");
  const workItemId = "meeting-closeout-startup-interruption";
  const input = { meeting, transcript };
  await prepareSavedStepJob(environment.state, {
    workItemId,
    title: "Interrupted meeting closeout",
    kind: "meeting-closeout",
    owner: "meeting-closeout-startup-test",
    input,
    steps: createMeetingCloseoutSteps(environment.options.closeoutOptions),
  });
  await environment.state.claimWorkItem(workItemId, {
    owner: "meeting-closeout-gateway-2147483647",
    leaseMs: 30 * 60 * 1000,
  });

  const recoveredIds = await recoverMeetingCloseoutJobs(environment.options);
  assert.deepEqual(recoveredIds, [workItemId]);
  const completed = await waitForMeetingCloseoutJob(workItemId, environment.options);
  assert.equal(completed.status, "completed");
  assert.equal(completed.result.ok, true);
});

test("startup recovery leaves a live meeting worker lease alone", async (t) => {
  const environment = await testEnvironment(t, "meeting-closeout-job-live-lease");
  const workItemId = "meeting-closeout-live-worker";
  const input = { meeting, transcript };
  await prepareSavedStepJob(environment.state, {
    workItemId,
    title: "Live meeting closeout",
    kind: "meeting-closeout",
    owner: "meeting-closeout-startup-test",
    input,
    steps: createMeetingCloseoutSteps(environment.options.closeoutOptions),
  });
  await environment.state.claimWorkItem(workItemId, {
    owner: `meeting-closeout-gateway-${process.pid}`,
    leaseMs: 30 * 60 * 1000,
  });

  const recoveredIds = await recoverMeetingCloseoutJobs(environment.options);
  assert.deepEqual(recoveredIds, []);
  const unchanged = await getMeetingCloseoutJob(workItemId, environment.options);
  assert.equal(unchanged.status, "pending");
});

test("an interruption after each closeout stage resumes without repeating saved work", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-every-stage-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const stoppableStages = [
    "discover",
    "reconcile_sources",
    "synthesize",
    "store",
    "generate_visual",
    "associate",
    "verify_display",
  ];

  for (const stopAfter of stoppableStages) {
    const brainRoot = join(root, `brain-${stopAfter}`);
    const state = await openWorkbenchState({
      mode: "test",
      root: join(root, `state-${stopAfter}`),
    });
    await prepareBrainRoot(brainRoot);
    const workItemId = `meeting-closeout-after-${stopAfter}`;
    const closeoutOptions = {
      brainRoot,
      runModel: async () => modelOutput(),
      codexInfographicOptions: {
        fixtureImagePath: resolve("public", "brand", "ip-corporation-official.png"),
      },
    };
    const steps = createMeetingCloseoutSteps(closeoutOptions);
    const interruptedSteps = steps.map((step) =>
      step.name === stopAfter
        ? {
            ...step,
            validate: async (context) => {
              const valid = await step.validate(context);
              if (valid) {
                await requestSavedStepJobStop(state, {
                  workItemId,
                  reason: `test interruption after ${stopAfter}`,
                });
              }
              return valid;
            },
          }
        : step
    );
    const input = { meeting: { ...meeting, id: `${meeting.id}-${stopAfter}` }, transcript };
    const runner = {
      workItemId,
      title: `Meeting stage interruption: ${stopAfter}`,
      kind: "meeting-closeout",
      owner: "meeting-closeout-stage-test",
      input,
    };

    const interrupted = await runSavedStepJob(state, { ...runner, steps: interruptedSteps });
    assert.equal(interrupted.status, "stopped", `Expected a stop after ${stopAfter}.`);
    const resumed = await runSavedStepJob(state, { ...runner, steps, resume: true });
    assert.equal(resumed.status, "completed", `Expected resume after ${stopAfter}.`);

    const projection = await projectSavedStepJob(state, workItemId);
    assert.equal(
      projection.steps.find((step) => step.name === stopAfter).attempts,
      1,
      `${stopAfter} repeated after its saved result was checked.`
    );
    assert.equal(
      projection.steps.every((step) => step.attempts === 1),
      true,
      `Resume after ${stopAfter} repeated a completed stage.`
    );
  }
});
