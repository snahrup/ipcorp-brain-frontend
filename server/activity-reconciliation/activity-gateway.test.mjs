import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ACTIVITY_SOURCES } from "./activity-reconciliation.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

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

async function waitForHealth(baseUrl, child, readStderr) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server stopped early: ${readStderr()}`);
    try {
      if ((await fetch(`${baseUrl}/healthz`)).ok) return;
    } catch {
      // The local listener may still be starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Server did not become ready: ${readStderr()}`);
}

async function waitForRun(baseUrl, runId) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(
      `${baseUrl}/api/work/activity-reconciliation/status?runId=${encodeURIComponent(runId)}`
    );
    const body = await response.json();
    if (!["running", "stopping"].includes(body.data?.status)) return body.data;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error("The fixture activity run did not finish.");
}

test("the mounted activity routes complete a fixture run and reuse one apply receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "activity-gateway-"));
  const fixturePath = join(root, "activity-fixture.json");
  const statePath = join(root, "activity-state.json");
  const port = await openPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const to = "2026-08-06T14:00:00.000Z";
  const sources = ACTIVITY_SOURCES.map((source) => ({
    id: source.id,
    state: "empty",
    confirmedThrough: to,
    detail: "Fixture read succeeded.",
    items: [],
  }));
  sources.find((source) => source.id === "outlook_received").state = "current";
  sources.find((source) => source.id === "outlook_received").items = [
    {
      providerItemId: "fixture-mail",
      eventAt: "2026-08-06T13:30:00.000Z",
      title: "Fabric source mapping",
      summary: "Patrick confirmed the source mapping on MT-42.",
      status: "current",
      jiraKey: "MT-42",
    },
  ];
  await writeFile(
    fixturePath,
    JSON.stringify({
      sources,
      jiraIssues: [
        {
          key: "MT-42",
          summary: "Fabric source mapping",
          description: "Map Fabric source data.",
          status: { name: "In Progress" },
          updatedAt: "2026-08-05T12:00:00.000Z",
          comments: [],
          worklogs: [],
        },
      ],
    }),
    "utf8"
  );

  let stderr = "";
  const child = spawn(process.execPath, ["server/jira-gateway.mjs"], {
    cwd: appRoot,
    env: {
      ...process.env,
      IPCORP_JIRA_GATEWAY_PORT: String(port),
      ACTIVITY_RECONCILIATION_FIXTURE: fixturePath,
      IPCORP_ACTIVITY_RECONCILIATION_STATE_PATH: statePath,
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
    const startResponse = await fetch(`${baseUrl}/api/work/activity-reconciliation/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(startResponse.status, 202);
    const started = await startResponse.json();
    const run = await waitForRun(baseUrl, started.data.run.id);
    assert.equal(run.status, "completed");
    assert.equal(Object.keys(run.sources).length, ACTIVITY_SOURCES.length);
    assert.equal(run.jiraProposals.length, 1);

    const request = {
      runId: run.id,
      proposalIds: [run.jiraProposals[0].id],
      confirmation: "APPLY 1 JIRA CHANGE",
    };
    const firstResponse = await fetch(`${baseUrl}/api/work/activity-reconciliation/jira/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const first = await firstResponse.json();
    assert.equal(firstResponse.status, 200);
    assert.equal(first.data.status, "complete");
    assert.equal(first.data.results[0].receipt.fixture, true);

    const second = await (
      await fetch(`${baseUrl}/api/work/activity-reconciliation/jira/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      })
    ).json();
    assert.equal(second.data.id, first.data.id);
  } finally {
    child.kill();
    await new Promise((resolveExit) => {
      if (child.exitCode !== null) return resolveExit();
      const timeout = setTimeout(resolveExit, 2_000);
      child.once("exit", () => {
        clearTimeout(timeout);
        resolveExit();
      });
    });
    await rm(root, { recursive: true, force: true });
  }
});
