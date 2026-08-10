import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

test("gateway serves the complete pasted-transcript path against a temporary Brain", async () => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-gateway-"));
  const brainRoot = join(root, "brain");
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

  let stderr = "";
  const child = spawn(process.execPath, ["server/jira-gateway.mjs"], {
    cwd: appRoot,
    env: {
      ...process.env,
      IPCORP_JIRA_GATEWAY_PORT: String(port),
      MEETING_CLOSEOUT_FIXTURE: fixturePath,
      MEETING_CLOSEOUT_BRAIN_ROOT: brainRoot,
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
    assert.equal(unavailableResponse.status, 200);
    assert.equal(unavailable.code, "transcript_unavailable");

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
    const packageBody = await packageResponse.json();
    assert.equal(packageResponse.status, 200);
    assert.equal(packageBody.ok, true);
    assert.equal(packageBody.package.externalActions.emailSent, false);
    assert.equal(packageBody.package.externalActions.jiraChanged, false);

    const packagesResponse = await fetch(`${baseUrl}/api/meeting-closeout/packages`);
    const packages = await packagesResponse.json();
    assert.equal(packagesResponse.status, 200);
    assert.equal(packages.data.length, 1);
    assert.equal(packages.data[0].id, packageBody.package.id);

    const infographic = await readFile(
      join(brainRoot, packageBody.package.files.infographic),
      "utf8"
    );
    assert.match(infographic, /Fabric Delivery Review/);
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
