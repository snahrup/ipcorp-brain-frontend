import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function openPort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose()))
  );
  return port;
}

async function waitForHealth(url, child, stderr) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Gateway exited before readiness: ${stderr()}`);
    }
    try {
      const response = await fetch(`${url}/healthz`);
      if (response.ok) return;
    } catch {
      // The listener may still be starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Gateway did not become ready: ${stderr()}`);
}

async function waitForMeetingJob(baseUrl, workItemId, expectedStatus) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(
      `${baseUrl}/api/meeting-closeout/jobs/${encodeURIComponent(workItemId)}`
    );
    const body = await response.json();
    if (body.job?.status === expectedStatus) return body.job;
    if (["completed", "failed", "stop_requested"].includes(body.job?.status)) {
      throw new Error(
        `Meeting job reached ${body.job.status}, expected ${expectedStatus}: ${JSON.stringify(body.job.failure)}`
      );
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(`Meeting job did not reach ${expectedStatus}.`);
}

// The synthesis package this fake model returns. Every evidence line is copied
// verbatim from the transcript the test posts, so nothing is dropped by the
// verbatim check and the assertions below read the real verification path.
const FAKE_PACKAGE = {
  summary:
    "Steve and Patrick Stiller reviewed the Fabric delivery. Steve agreed to send the workbook. Patrick Stiller asked for the source mapping to land on MT-42.",
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
      title: "Add the source mapping to MT-42",
      rationale: "Patrick Stiller assigned the mapping update in the meeting.",
      evidence: "Patrick: Update MT-42 with the source mapping.",
    },
  ],
  documentRequests: [
    {
      text: "The Fabric workbook",
      owner: "Patrick Stiller",
      evidence: "Steve: I will send the Fabric workbook to Patrick tomorrow.",
    },
  ],
  reminderCandidates: [],
  supportingMaterial: [],
  emailDrafts: [],
  themes: ["Fabric delivery", "Source mapping"],
  notes: [],
};

test("gateway serves the complete pasted-transcript path against a temporary Brain", async () => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-gateway-"));
  const brainRoot = join(root, "brain");
  const stateDir = join(root, "state");
  const agentRunsRoot = join(root, "agent-runs");
  const fakeModelPath = join(root, "fake-synthesis-model.mjs");
  const fixturePath = join(root, "fixture.json");
  const port = await openPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const meeting = {
    id: "gateway-meeting",
    title: "Fabric Delivery Review",
    start: "2026-08-04T14:00:00-04:00",
    end: "2026-08-04T14:30:00-04:00",
    organizer: "Patrick Stiller",
    attendees: ["Steve Nahrup", "Patrick Stiller"],
  };

  await mkdir(brainRoot, { recursive: true });
  await Promise.all([
    writeFile(
      join(brainRoot, "AGENTS.md"),
      "# Brain instructions\n\nRead INGESTION_PLAYBOOK.md before writing.\n",
      "utf8"
    ),
    writeFile(
      join(brainRoot, "INGESTION_PLAYBOOK.md"),
      "# Ingestion playbook\n\n## MANDATORY Brain CHANGELOG/MANIFEST rule\n",
      "utf8"
    ),
    writeFile(
      join(brainRoot, "CHANGELOG.md"),
      [
        "# CHANGELOG & MANIFEST",
        "",
        "## SECTION 1 - CHANGELOG",
        "",
        "| 2026-08-05 | 09:00 ET | Workbench | Existing file | Existing checked change. |",
        "",
        "## SECTION 2 - MANIFEST",
        "",
        "| 1 | staged.md | core/staged.md | **INSTALL** | Earlier staged file. |",
        "| 2 | notes.md | Stays outside Brain | **DO NOT INGEST** | Reference only. |",
        "",
        "### Processed manifest items",
        "- 2026-08-05 09:05 ET - Workbench - item #1 installed and checked.",
        "",
      ].join("\n"),
      "utf8"
    ),
  ]);

  await writeFile(
    fixturePath,
    JSON.stringify({
      calendarAvailable: true,
      todayMeetings: [meeting],
      transcripts: { [meeting.id]: null },
    }),
    "utf8"
  );

  // Without this the gateway spawns the real `claude` binary on Opus, so a test
  // run cost a live model call and wrote its prompt into Steve's own
  // %LOCALAPPDATA%\IPCorpBrain\meeting-closeout folder.
  await writeFile(
    fakeModelPath,
    `process.stdout.write("PACKAGE:\\n" + ${JSON.stringify(JSON.stringify(FAKE_PACKAGE))} + "\\nEND PACKAGE\\n");\n`,
    "utf8"
  );
  await mkdir(agentRunsRoot, { recursive: true });
  await writeFile(
    join(agentRunsRoot, "MT-999.1786670000000.summary.json"),
    JSON.stringify({
      issueKey: "MT-999",
      agent: "codex",
      agentLabel: "Codex",
      state: "finished",
      startedAt: "2026-08-13T20:00:00.000Z",
      finishedAt: "2026-08-13T20:10:00.000Z",
      verdict: "DONE",
      note: "Saved result.",
      steps: 4,
      lastAction: "Read",
      exitCode: 0,
    }),
    "utf8"
  );

  let stderr = "";
  const child = spawn(process.execPath, ["server/jira-gateway.mjs"], {
    cwd: appRoot,
    env: {
      ...process.env,
      IPCORP_JIRA_GATEWAY_PORT: String(port),
      MEETING_CLOSEOUT_FIXTURE: fixturePath,
      MEETING_CLOSEOUT_BRAIN_ROOT: brainRoot,
      MEETING_CLOSEOUT_STATE_DIR: stateDir,
      MEETING_CLOSEOUT_JOB_STATE_DIR: join(root, "workbench-state"),
      MEETING_CLOSEOUT_SYNTHESIS_BIN: `"${process.execPath}" "${fakeModelPath}"`,
      IPCORP_MEETING_INFOGRAPHICS_PATH: join(brainRoot, "natively", "meeting-infographics"),
      MEETING_CLOSEOUT_CODEX_FIXTURE_IMAGE: resolve(
        appRoot,
        "public",
        "brand",
        "ip-corporation-official.png"
      ),
      IPCORP_AGENT_RUNS_DIR: agentRunsRoot,
      IPCORP_AGENT_RUNS_LEGACY_DIR: join(root, "legacy-agent-runs"),
    },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  try {
    await waitForHealth(baseUrl, child, () => stderr);

    const runsResponse = await fetch(`${baseUrl}/api/agents/runs`);
    const runs = await runsResponse.json();
    assert.equal(runsResponse.status, 200);
    assert.ok(Array.isArray(runs.data));
    assert.equal(runs.data[0].issueKey, "MT-999");
    assert.equal(runs.data[0].verdict, "DONE");

    const todayResponse = await fetch(`${baseUrl}/api/meeting-closeout/today`);
    const today = await todayResponse.json();
    assert.equal(todayResponse.status, 200);
    assert.equal(today.data.availability, "current");
    assert.equal(today.data.meetings.length, 1);
    assert.equal(today.data.meetings[0].id, meeting.id);

    const unavailableResponse = await fetch(`${baseUrl}/api/meeting-closeout/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meeting }),
    });
    const unavailable = await unavailableResponse.json();
    assert.equal(unavailableResponse.status, 202);
    const unavailableJob = await waitForMeetingJob(baseUrl, unavailable.job.workItemId, "failed");
    assert.equal(unavailableJob.failure.code, "transcript_unavailable");

    const transcript = [
      "Steve: I will send the Fabric workbook to Patrick tomorrow.",
      "Patrick: Update MT-42 with the source mapping.",
      "Steve: Email Patrick with the recap.",
    ].join("\n");
    const packageResponse = await fetch(`${baseUrl}/api/meeting-closeout/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meeting,
        transcript,
        contextNotes: "Patrick Stiller asked for the workbook link.",
      }),
    });
    const packageStarted = await packageResponse.json();
    assert.equal(packageResponse.status, 202);
    assert.equal(packageStarted.ok, true);
    const completedJob = await waitForMeetingJob(
      baseUrl,
      packageStarted.job.workItemId,
      "completed"
    );
    const packageBody = completedJob.result;
    assert.equal(packageBody.ok, true);
    assert.equal(packageBody.package.externalActions.emailSent, false);
    assert.equal(packageBody.package.externalActions.jiraChanged, false);

    // The package came from the model the test supplied, through the real
    // verbatim verification, and the prompt landed in the test's own state
    // folder instead of Steve's.
    assert.match(packageBody.package.summary, /^Steve and Patrick Stiller reviewed/);
    assert.equal(packageBody.package.commitments.length, 1);
    assert.equal(packageBody.package.jiraProposals[0].jiraKey, "MT-42");
    const prompts = (await readdir(stateDir)).filter((name) =>
      name.startsWith("synthesis-prompt.")
    );
    assert.equal(prompts.length, 1);
    assert.match(await readFile(join(stateDir, prompts[0]), "utf8"), /Update MT-42/);

    const packagesResponse = await fetch(`${baseUrl}/api/meeting-closeout/packages`);
    const packages = await packagesResponse.json();
    assert.equal(packagesResponse.status, 200);
    assert.equal(packages.data.length, 1);
    assert.equal(packages.data[0].id, packageBody.package.id);

    const infographic = await readFile(join(brainRoot, packageBody.package.files.infographic));
    assert.deepEqual(infographic.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    assert.match(packageBody.package.files.infographic, /-codex\.png$/);
    const imageResponse = await fetch(
      `${baseUrl}/api/meetings/infographic?id=${encodeURIComponent(packageBody.package.infographic.saved.id)}&file=${encodeURIComponent(packageBody.package.infographic.saved.file)}`
    );
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), infographic);
    const infographicStatus = JSON.parse(
      await readFile(join(brainRoot, packageBody.package.files.infographicStatus), "utf8")
    );
    assert.equal(infographicStatus.generator.provider, "codex");
    assert.equal(infographicStatus.generator.imageModel, "gpt-image-2");
    assert.equal(infographicStatus.attemptHistory.length, 1);
    assert.equal(infographicStatus.attemptHistory[0].outcome, "generated");
  } finally {
    child.kill();
    await new Promise((resolveExit) => {
      if (child.exitCode !== null) {
        resolveExit();
        return;
      }
      const timeout = setTimeout(resolveExit, 2_000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolveExit();
      });
    });
    await rm(root, { recursive: true, force: true });
  }
});
