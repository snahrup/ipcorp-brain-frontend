import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ACTIVITY_SOURCES,
  createActivityReconciliationService,
} from "./activity-reconciliation.mjs";
import { createActivityReconciliationRouter } from "./activity-router.mjs";
import { createActivityStore } from "./activity-store.mjs";

function emptySources(to) {
  return ACTIVITY_SOURCES.map((source) => ({
    id: source.id,
    state: "empty",
    items: [],
    confirmedThrough: to,
    detail: "Read succeeded.",
  }));
}

async function serve(t, service) {
  const router = createActivityReconciliationRouter(service);
  const server = createServer(async (request, response) => {
    const result = await router.handle(request, new URL(request.url || "/", "http://127.0.0.1"));
    response.writeHead(result.status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result.body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

test("start, status, and recap routes share one saved activity run", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "activity-router-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  let sourceCalls = 0;
  let releaseSources;
  const sourceBlocker = new Promise((resolve) => {
    releaseSources = resolve;
  });
  const service = createActivityReconciliationService({
    store: createActivityStore(join(root, "state.json")),
    clock: () => new Date("2026-08-06T14:00:00.000Z"),
    collectSources: async ({ windows }) => {
      sourceCalls += 1;
      await sourceBlocker;
      return { sources: emptySources(windows.outlook_received.to) };
    },
  });
  const baseUrl = await serve(t, service);

  const startedResponse = await fetch(`${baseUrl}/api/work/activity-reconciliation/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(startedResponse.status, 202);
  const started = await startedResponse.json();
  assert.equal(started.ok, true);

  const attachedResponse = await fetch(`${baseUrl}/api/work/activity-reconciliation/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const attached = await attachedResponse.json();
  assert.equal(attached.data.run.id, started.data.run.id);

  releaseSources();
  await service.waitForRun(started.data.run.id);
  const status = await (
    await fetch(`${baseUrl}/api/work/activity-reconciliation/status?runId=${started.data.run.id}`)
  ).json();
  assert.equal(status.data.status, "completed");
  const recap = await (
    await fetch(`${baseUrl}/api/work/activity-reconciliation/recap?runId=${started.data.run.id}`)
  ).json();
  assert.equal(recap.data.runId, started.data.run.id);
  assert.deepEqual(recap.data.recap.groups, []);
  assert.equal(sourceCalls, 1);
});
