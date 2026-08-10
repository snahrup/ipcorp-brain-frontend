import assert from "node:assert/strict";
import test from "node:test";
import { classifyAction, normalizeAvailableActions, validateSemanticAction } from "./actions.mjs";
import {
  assertInsideRoot,
  checkServiceReadiness,
  createDevSpaceAdapter,
  createNotebookLmAdapter,
  isAllowedVerificationCommand,
} from "./adapters.mjs";
import { normalizeDestination, VIEW_KEYS } from "./destinations.mjs";
import { sanitizeForClient } from "./protocol.mjs";
import { assertLocalMaintenanceSession, permissionForTool, runAgentTurn } from "./sdk-runner.mjs";

test("destination lookup covers each Workbench view and rejects unknown sections", () => {
  for (const view of VIEW_KEYS) {
    assert.equal(normalizeDestination({ view }).view, view);
  }
  assert.throws(() => normalizeDestination({ view: "missing" }), /not registered/);
  assert.throws(() => normalizeDestination({ view: "today", section: "unknown" }), /section/);
  assert.equal(
    normalizeDestination({ view: "today", section: "hero" }, { today: ["hero"] }).section,
    "hero"
  );
});

test("semantic action validation accepts only current page keys", () => {
  const actions = normalizeAvailableActions([
    { key: "today:open-source", kind: "open", label: "Open source" },
    { key: "jira:apply", kind: "apply", label: "Apply reviewed update" },
  ]);
  assert.equal(validateSemanticAction("today:open-source", actions).kind, "open");
  assert.equal(classifyAction(actions[0]).mode, "auto");
  assert.equal(classifyAction(actions[1]).mode, "review");
  assert.throws(() => validateSemanticAction("jira:delete", actions), /not supplied/);
});

test("path and command checks keep DevSpace inside the checkout", () => {
  const root = "C:\\Users\\snahrup\\CascadeProjects\\ipcorp-brain-frontend";
  assert.match(assertInsideRoot("server\\workbench-agent\\index.mjs", root), /workbench-agent/);
  assert.throws(
    () => assertInsideRoot("..\\ipcorp-architecture-brain\\README.md", root),
    /outside/
  );
  assert.equal(isAllowedVerificationCommand("npm run typecheck"), true);
  assert.equal(isAllowedVerificationCommand("Remove-Item -Recurse ."), false);
});

test("connector output sanitizing removes secrets", () => {
  const clean = sanitizeForClient({
    apiKey: "api-secret",
    issueKey: "MT-9",
    key: "MT-9",
    ok: true,
    token: "abc",
    nested: { Authorization: "Bearer secret", value: "visible" },
  });
  assert.equal(clean.apiKey, "[redacted]");
  assert.equal(clean.issueKey, "MT-9");
  assert.equal(clean.key, "MT-9");
  assert.equal(clean.token, "[redacted]");
  assert.equal(clean.nested.Authorization, "[redacted]");
  assert.equal(clean.nested.value, "visible");
});

test("SDK permissions allow only registered local and Microsoft 365 read tools", () => {
  assert.equal(permissionForTool("mcp__workbench_agent__read_workbench", {}).behavior, "allow");
  assert.equal(permissionForTool("mcp__workbench_agent__read_jira", {}).behavior, "allow");
  assert.equal(
    permissionForTool("mcp__workbench_agent__review_jira_issue_update", {}).behavior,
    "allow"
  );
  assert.equal(
    permissionForTool("mcp__microsoft365__outlook_email", {
      request: "read recent email related to the dashboard",
    }).behavior,
    "allow"
  );
  assert.equal(
    permissionForTool("mcp__microsoft365__microsoft_teams", {
      request: "search Teams messages about Jira MT-10",
    }).behavior,
    "allow"
  );
  assert.equal(
    permissionForTool("mcp__microsoft365__sharepoint_onedrive", {
      request: "lookup files in the Team Library",
    }).behavior,
    "allow"
  );
  assert.equal(
    permissionForTool("mcp__microsoft365__outlook_email", {
      request: "send Patrick Stiller an update",
    }).behavior,
    "deny"
  );
  assert.equal(
    permissionForTool("mcp__microsoft365__microsoft_teams", {
      request: "post this message to Teams",
    }).behavior,
    "deny"
  );
  assert.equal(
    permissionForTool("mcp__microsoft365__sharepoint_onedrive", {
      request: "upload the generated file",
    }).behavior,
    "deny"
  );
  assert.equal(
    permissionForTool("mcp__microsoft365__outlook_email", {
      request: "dashboard",
    }).behavior,
    "deny"
  );
  assert.equal(
    permissionForTool("mcp__microsoft365__teams_meeting_transcripts", {}).behavior,
    "allow"
  );
  assert.equal(permissionForTool("mcp__microsoft365__outlook_email_send", {}).behavior, "deny");
  assert.equal(permissionForTool("Bash", { command: "dir" }).behavior, "deny");
});

test("enterprise MCP tools require a local owner Workbench session", () => {
  assert.doesNotThrow(() =>
    assertLocalMaintenanceSession({ session: { origin: "http://127.0.0.1:5217" } }, {})
  );
  assert.throws(() =>
    assertLocalMaintenanceSession(
      { session: { origin: "https://ip-corp-brain.nahrup.ngrok.app" } },
      {}
    )
  );
});

test("NotebookLM generation uses no-wait CLI args and a strict type list", async () => {
  const calls = [];
  const adapter = createNotebookLmAdapter({
    execFile: async (bin, args) => {
      calls.push({ bin, args });
      return { stdout: JSON.stringify({ ok: true, args }) };
    },
  });
  const review = adapter.reviewGeneration({
    artifactType: "report",
    format: "briefing-doc",
    notebookId: "fd6f032c-75b8-4b3c-b037-4e5188f1dc14",
    prompt: "Summarize the dashboard.",
  });
  await adapter.executeAfterReview(review.args);
  assert.deepEqual(calls[0].args, [
    "generate",
    "report",
    "Summarize the dashboard.",
    "-n",
    "fd6f032c-75b8-4b3c-b037-4e5188f1dc14",
    "--no-wait",
    "--json",
    "--format",
    "briefing-doc",
  ]);
  assert.throws(
    () =>
      adapter.reviewGeneration({
        artifactType: "shell",
        notebookId: "fd6f032c-75b8-4b3c-b037-4e5188f1dc14",
      }),
    /not allowed/
  );
});

test("DevSpace opens the checkout before using workspace-scoped read and edit calls", async () => {
  const calls = [];
  const adapter = createDevSpaceAdapter({
    ownerToken: "local-owner",
    workspaceRoot: "C:\\Users\\snahrup\\CascadeProjects\\ipcorp-brain-frontend",
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body.params);
      if (body.params.name === "open_workspace") {
        return Response.json({ result: { workspaceId: "ws-test" } });
      }
      return Response.json({ result: { ok: true } });
    },
  });

  await adapter.read("server\\workbench-agent\\index.mjs");
  const review = adapter.reviewChange({
    filePath: "server\\workbench-agent\\index.mjs",
    oldText: "old",
    newText: "new",
  });
  await adapter.executeAfterReview(review);

  assert.equal(calls[0].name, "open_workspace");
  assert.equal(calls[1].name, "read");
  assert.equal(calls[1].arguments.workspaceId, "ws-test");
  assert.equal(calls[1].arguments.path, "server/workbench-agent/index.mjs");
  assert.equal(calls[2].name, "edit");
  assert.deepEqual(calls[2].arguments.edits, [{ oldText: "old", newText: "new" }]);
});

test("DevSpace executes a reviewed workspace-scoped command", async () => {
  const calls = [];
  const adapter = createDevSpaceAdapter({
    ownerToken: "local-owner",
    workspaceRoot: "C:\\Users\\snahrup\\CascadeProjects\\ipcorp-brain-frontend",
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body.params);
      if (body.params.name === "open_workspace") {
        return Response.json({ result: { workspaceId: "ws-test" } });
      }
      return Response.json({ result: { ok: true } });
    },
  });

  const review = adapter.reviewChange({ command: "npm run typecheck" });
  await adapter.executeAfterReview(review);
  assert.equal(review.toolName, "devspace.bash");
  assert.equal(calls[0].name, "open_workspace");
  assert.equal(calls[1].name, "bash");
  assert.equal(calls[1].arguments.workspaceId, "ws-test");
  assert.equal(calls[1].arguments.command, "npm run typecheck");
});

test("SDK runner streams text deltas without duplicating the final assistant message", async () => {
  async function* messages() {
    yield {
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
    };
    yield {
      type: "assistant",
      message: { content: [{ type: "text", text: "Hello" }] },
    };
    yield {
      type: "result",
      subtype: "success",
      is_error: false,
      result: "Hello",
    };
  }
  const events = [];
  for await (const event of runAgentTurn(
    {
      availableActions: [],
      clientSections: {},
      message: "Say hello",
      session: {},
      sessionStore: { createReview: () => ({}) },
    },
    {
      enableMicrosoft365: false,
      sdk: { query: () => messages() },
    }
  )) {
    events.push(event);
  }

  assert.deepEqual(
    events.filter((event) => event.type === "delta").map((event) => event.text),
    ["Hello"]
  );
});

test("readiness returns safe summaries with Team Library and limited read-on-request sources", async () => {
  const urls = [];
  const result = await checkServiceReadiness({
    enterprise: {
      status: async () => ({
        sql: { state: "limited", detail: "Five read sources.", summary: { configuredSources: 5 } },
        powerbi: { state: "limited", detail: "Checked on request.", summary: { configured: true } },
        fabric: { state: "limited", detail: "Checked on request.", summary: { configured: true } },
      }),
    },
    m365ServerPath: "C:\\Users\\snahrup\\CascadeProjects\\ipcorp-brain-frontend\\package.json",
    notebooklm: { status: async () => ({ account: "ready", token: "hidden" }) },
    fetchImpl: async (url) => {
      urls.push(url);
      if (String(url).endsWith("/healthz")) {
        return Response.json({ ok: true, service: "gateway", raw: "not returned" });
      }
      if (String(url).endsWith("/api/jira/status")) {
        return Response.json({
          ok: true,
          data: { connected: true, initiativeKey: "MT", raw: "not returned" },
        });
      }
      if (String(url).endsWith("/api/team-library/manifest")) {
        return Response.json({
          ok: true,
          data: {
            missingSections: ["one"],
            state: "local-sync",
            totalFiles: 42,
            files: ["not returned"],
          },
        });
      }
      return Response.json({ ok: true });
    },
  });

  const byId = Object.fromEntries(result.connectors.map((item) => [item.id, item]));
  assert.equal(byId.microsoft365.state, "limited");
  assert.equal(byId.microsoft365.summary.mode, "read-on-request");
  assert.ok(!JSON.stringify(byId.microsoft365).includes("serverPath"));
  assert.equal(byId.devspace.state, "limited");
  assert.equal(byId.sql.summary.configuredSources, 5);
  assert.equal(byId.powerbi.state, "limited");
  assert.equal(byId.fabric.state, "limited");
  assert.equal(byId["team-library"].summary.files, 42);
  assert.equal(byId["team-library"].summary.missingSections, 1);
  assert.ok(urls.some((url) => String(url).endsWith("/api/team-library/manifest")));
  assert.ok(!JSON.stringify(result).includes("not returned"));
  assert.ok(!JSON.stringify(result).includes("hidden"));
});

test("DevSpace readiness is ready only after workspace open is checked", async () => {
  const result = await checkServiceReadiness({
    enterprise: {
      status: async () => ({
        sql: { state: "limited", detail: "Configured." },
        powerbi: { state: "limited", detail: "Configured." },
        fabric: { state: "limited", detail: "Configured." },
      }),
    },
    checkDevspaceWorkspace: true,
    devspace: { checkWorkspace: async () => ({ workspaceId: "ws-test" }) },
    m365ServerPath: "C:\\Users\\snahrup\\CascadeProjects\\ipcorp-brain-frontend\\package.json",
    notebooklm: { status: async () => ({ ok: true }) },
    fetchImpl: async (url) => {
      if (String(url).endsWith("/healthz")) {
        return Response.json({ ok: true });
      }
      if (String(url).endsWith("/api/jira/status")) {
        return Response.json({ ok: true, data: { connected: true, initiativeKey: "MT" } });
      }
      if (String(url).endsWith("/api/team-library/manifest")) {
        return Response.json({
          ok: true,
          data: { missingSections: [], state: "local-sync", totalFiles: 1 },
        });
      }
      return Response.json({ ok: true });
    },
  });

  const devspace = result.connectors.find((item) => item.id === "devspace");
  assert.equal(devspace.state, "ready");
  assert.equal(devspace.summary.workspace, "opened");
});
