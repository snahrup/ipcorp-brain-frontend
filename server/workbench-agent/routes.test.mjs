import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createWorkbenchAgentRouter } from "./routes.mjs";
import { REQUEST_TOKEN_HEADER, SESSION_COOKIE } from "./sessions.mjs";

const ORIGIN = "http://127.0.0.1:5217";

async function fixture(options = {}) {
  const router = createWorkbenchAgentRouter({
    allowedOrigins: new Set([ORIGIN]),
    agentRunner:
      options.agentRunner ||
      async function* () {
        yield { type: "status", status: "thinking" };
        yield { type: "text", text: "Current Workbench answer." };
        yield { type: "done", ok: true };
      },
    executeReview:
      options.executeReview === "default"
        ? undefined
        : options.executeReview ||
          (async (record) => ({
            ok: true,
            data: { toolName: record.toolName, target: record.target },
          })),
    readiness:
      options.readiness ||
      (async () => ({
        checkedAt: "2026-08-06T00:00:00.000Z",
        connectors: [{ id: "workbench", state: "ready" }],
        microsoft365Writes: "read-only in this service lane",
      })),
  });
  const server = createServer(async (request, response) => {
    const handled = await router.handle(
      request,
      response,
      new URL(request.url || "/", "http://127.0.0.1")
    );
    if (!handled) {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function session(baseUrl) {
  const response = await fetch(`${baseUrl}/api/workbench-agent/session`, {
    method: "POST",
    headers: { Origin: ORIGIN },
  });
  const cookie = response.headers.get("set-cookie").match(new RegExp(`${SESSION_COOKIE}=[^;]+`))[0];
  const body = await response.json();
  return { cookie, requestToken: body.data.requestToken };
}

test("status and streaming chat work for a same-origin owner session", async (t) => {
  const app = await fixture();
  t.after(app.close);
  const status = await fetch(`${app.baseUrl}/api/workbench-agent/status`, {
    headers: { Origin: ORIGIN },
  });
  assert.equal(status.status, 200);
  assert.equal(status.headers.get("access-control-allow-credentials"), "true");
  const statusBody = await status.json();
  assert.equal(statusBody.data.connectors[0].state, "ready");

  const owner = await session(app.baseUrl);
  const chat = await fetch(`${app.baseUrl}/api/workbench-agent/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: owner.cookie,
      Origin: ORIGIN,
      [REQUEST_TOKEN_HEADER]: owner.requestToken,
    },
    body: JSON.stringify({ message: "Where is Jira?", view: "today", availableActions: [] }),
  });
  assert.equal(chat.status, 200);
  const lines = (await chat.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(lines[0].type, "status");
  assert.equal(lines.at(-1).type, "done");
});

test("route allows an origin-less status read but denies forged origins and owner actions", async (t) => {
  const app = await fixture({ executeReview: "default" });
  t.after(app.close);
  const denied = await fetch(`${app.baseUrl}/api/workbench-agent/status`, {
    headers: { Origin: "https://example.test" },
  });
  assert.equal(denied.status, 403);

  const noOrigin = await fetch(`${app.baseUrl}/api/workbench-agent/status`);
  assert.equal(noOrigin.status, 200);

  const noOriginSession = await fetch(`${app.baseUrl}/api/workbench-agent/session`, {
    method: "POST",
  });
  assert.equal(noOriginSession.status, 403);
  assert.equal((await noOriginSession.json()).code, "origin_required");

  const missingSession = await fetch(`${app.baseUrl}/api/workbench-agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ message: "hello" }),
  });
  assert.equal(missingSession.status, 401);
});

test("forged page actions are rejected before reaching the runner", async (t) => {
  const app = await fixture();
  t.after(app.close);
  const owner = await session(app.baseUrl);
  const response = await fetch(`${app.baseUrl}/api/workbench-agent/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: owner.cookie,
      Origin: ORIGIN,
      [REQUEST_TOKEN_HEADER]: owner.requestToken,
    },
    body: JSON.stringify({
      message: "apply it",
      requestedActionKey: "jira:apply",
      availableActions: [{ key: "today:open", kind: "open", label: "Open" }],
    }),
  });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.code, "forged_action");
});

test("direct auto page action carries a requested value", async (t) => {
  const app = await fixture();
  t.after(app.close);
  const owner = await session(app.baseUrl);
  const response = await fetch(`${app.baseUrl}/api/workbench-agent/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: owner.cookie,
      Origin: ORIGIN,
      [REQUEST_TOKEN_HEADER]: owner.requestToken,
    },
    body: JSON.stringify({
      availableActions: [{ key: "filter:issue", kind: "fill", label: "Filter issue" }],
      message: "filter to MT-44",
      requestedActionKey: "filter:issue",
      requestedActionValue: "MT-44",
    }),
  });
  assert.equal(response.status, 200);
  const lines = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(lines[0], {
    actionKey: "filter:issue",
    type: "action",
    value: "MT-44",
  });
});

test("review actions require confirmation and reject replay", async (t) => {
  const app = await fixture();
  t.after(app.close);
  const owner = await session(app.baseUrl);
  const chat = await fetch(`${app.baseUrl}/api/workbench-agent/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: owner.cookie,
      Origin: ORIGIN,
      [REQUEST_TOKEN_HEADER]: owner.requestToken,
    },
    body: JSON.stringify({
      message: "apply it",
      requestedActionKey: "jira:apply",
      availableActions: [
        {
          key: "jira:apply",
          kind: "apply",
          label: "Apply Jira update",
          target: { issueKey: "MT-1" },
          summary: "Apply the reviewed update.",
        },
      ],
    }),
  });
  const reviewLines = (await chat.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const review = reviewLines[0].review;
  assert.ok(review.id);

  const confirmBody = {
    reviewId: review.id,
    toolName: "workbench.page-action",
    args: { actionKey: "jira:apply" },
    target: { issueKey: "MT-1" },
  };
  const first = await fetch(`${app.baseUrl}/api/workbench-agent/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: owner.cookie,
      Origin: ORIGIN,
      [REQUEST_TOKEN_HEADER]: owner.requestToken,
    },
    body: JSON.stringify(confirmBody),
  });
  assert.equal(first.status, 200);

  const replay = await fetch(`${app.baseUrl}/api/workbench-agent/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: owner.cookie,
      Origin: ORIGIN,
      [REQUEST_TOKEN_HEADER]: owner.requestToken,
    },
    body: JSON.stringify(confirmBody),
  });
  assert.equal(replay.status, 409);
});

test("review confirmation can use only the review id", async (t) => {
  const app = await fixture({ executeReview: "default" });
  t.after(app.close);
  const owner = await session(app.baseUrl);
  const chat = await fetch(`${app.baseUrl}/api/workbench-agent/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: owner.cookie,
      Origin: ORIGIN,
      [REQUEST_TOKEN_HEADER]: owner.requestToken,
    },
    body: JSON.stringify({
      message: "apply it",
      requestedActionKey: "jira:apply",
      availableActions: [
        {
          key: "jira:apply",
          kind: "apply",
          label: "Apply Jira update",
          target: { issueKey: "MT-2" },
          summary: "Apply the reviewed update.",
        },
      ],
    }),
  });
  const reviewLines = (await chat.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const review = reviewLines[0].review;

  const confirmed = await fetch(`${app.baseUrl}/api/workbench-agent/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: owner.cookie,
      Origin: ORIGIN,
      [REQUEST_TOKEN_HEADER]: owner.requestToken,
    },
    body: JSON.stringify({ reviewId: review.id }),
  });
  assert.equal(confirmed.status, 200);
  const body = await confirmed.json();
  assert.equal(body.data.receipt.data.command.actionKey, "jira:apply");
  assert.equal(body.data.receipt.data.command.type, "page-action");
  assert.equal(body.data.receipt.data.receipt.source, "workbench-agent");
  assert.equal(body.data.receipt.data.receipt.title, "Apply Jira update");
  assert.ok(!body.data.receipt.data.receipt.toolName);
});
