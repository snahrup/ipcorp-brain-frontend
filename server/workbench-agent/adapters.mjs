import { execFile as execFileCallback } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { getEnterpriseMcpAdapter } from "./enterprise-mcp.mjs";
import { sanitizeForClient, WorkbenchAgentError } from "./protocol.mjs";

const execFileDefault = promisify(execFileCallback);
const FRONTEND_ROOT =
  process.env.IPCORP_BRAIN_FRONTEND_PATH ||
  "C:\\Users\\snahrup\\CascadeProjects\\ipcorp-brain-frontend";

function assertInsideRoot(candidate, root = FRONTEND_ROOT) {
  const base = resolve(root);
  const resolved = resolve(base, String(candidate || ""));
  if (resolved !== base && !resolved.startsWith(`${base}${sep}`)) {
    throw new WorkbenchAgentError(
      403,
      "Path is outside the Workbench checkout.",
      "outside_workspace",
      {
        path: candidate,
      }
    );
  }
  return resolved;
}

function relativeToRoot(candidate, root = FRONTEND_ROOT) {
  const base = resolve(root);
  const resolved = assertInsideRoot(candidate, base);
  const value = relative(base, resolved).replaceAll("\\", "/");
  if (!value || value.startsWith("..")) {
    throw new WorkbenchAgentError(
      403,
      "Path is outside the Workbench checkout.",
      "outside_workspace"
    );
  }
  return value;
}

function assertIssueKey(key) {
  const value = String(key || "").trim();
  if (!/^MT-\d+$/.test(value)) {
    throw new WorkbenchAgentError(400, "A valid MT issue key is required.", "invalid_issue_key");
  }
  return value;
}

function assertNotebookId(notebookId) {
  const value = String(notebookId || "").trim();
  if (!/^[a-f0-9-]{12,}$/i.test(value)) {
    throw new WorkbenchAgentError(
      400,
      "NotebookLM requires an explicit notebook ID.",
      "invalid_notebook_id"
    );
  }
  return value;
}

const NOTEBOOKLM_TYPES = new Set([
  "audio",
  "cinematic-video",
  "data-table",
  "flashcards",
  "infographic",
  "mind-map",
  "quiz",
  "report",
  "slide-deck",
  "video",
]);
const NOTEBOOKLM_REPORT_FORMATS = new Set(["briefing-doc", "study-guide", "blog-post", "custom"]);

function assertNotebookType(value = "report") {
  const type = String(value || "report").trim();
  if (!NOTEBOOKLM_TYPES.has(type)) {
    throw new WorkbenchAgentError(
      400,
      "NotebookLM artifact type is not allowed.",
      "invalid_notebook_type",
      {
        type,
      }
    );
  }
  return type;
}

function assertNotebookFormat(value) {
  if (!value) {
    return null;
  }
  const format = String(value).trim();
  if (!NOTEBOOKLM_REPORT_FORMATS.has(format)) {
    throw new WorkbenchAgentError(
      400,
      "NotebookLM report format is not allowed.",
      "invalid_notebook_format",
      {
        format,
      }
    );
  }
  return format;
}

export function isAllowedVerificationCommand(command) {
  const value = String(command || "").trim();
  return (
    value === "npm run typecheck" ||
    value === "npm run build" ||
    value === "git status --short" ||
    /^node --test server[\\/]workbench-agent[\\/][a-z0-9._-]+\.test\.mjs$/i.test(value) ||
    /^npx biome check server[\\/]workbench-agent[\\/][a-z0-9._-]+\.mjs$/i.test(value) ||
    /^rg --line-number --fixed-strings .+ server[\\/]workbench-agent$/i.test(value)
  );
}

export function createWorkbenchAdapter(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrl = options.baseUrl || "http://127.0.0.1:8817";
  const readRoutes = {
    status: "/healthz",
    "jira-status": "/api/jira/status",
    "jira-initiative": "/api/jira/initiative",
    "jira-link-types": "/api/jira/agent/link-types",
    "team-library-manifest": "/api/team-library/manifest",
    "m365-reconcile-evidence": "/api/m365/reconcile-evidence",
  };

  async function read(resource, args = {}) {
    const key = String(resource || "").trim();
    let path = readRoutes[key];
    if (key === "team-library-preview") {
      path = `/api/team-library/preview?path=${encodeURIComponent(String(args.path || ""))}`;
    }
    if (key === "daily-prep") {
      path = `/api/meeting-prep/daily?date=${encodeURIComponent(String(args.date || ""))}`;
    }
    if (key === "jira-search") {
      const params = new URLSearchParams();
      if (args.jql) params.set("jql", String(args.jql));
      if (Array.isArray(args.fields) && args.fields.length) {
        params.set("fields", args.fields.map(String).join(","));
      }
      if (args.limit) params.set("limit", String(args.limit));
      if (Array.isArray(args.reconcileIssues) && args.reconcileIssues.length) {
        params.set("reconcileIssues", args.reconcileIssues.map(String).join(","));
      }
      path = `/api/jira/agent/search?${params}`;
    }
    if (key === "jira-count") {
      const params = new URLSearchParams();
      if (args.jql) params.set("jql", String(args.jql));
      path = `/api/jira/agent/count?${params}`;
    }
    if (key === "jira-issue-evidence") {
      path = `/api/jira/agent/issues/${assertIssueKey(args.issueKey)}/evidence`;
    }
    if (key === "jira-projects") {
      const params = new URLSearchParams();
      if (args.query) params.set("query", String(args.query));
      if (args.limit) params.set("limit", String(args.limit));
      path = `/api/jira/agent/projects?${params}`;
    }
    if (key === "jira-fields") {
      const params = new URLSearchParams();
      if (args.query) params.set("query", String(args.query));
      if (args.type) params.set("type", String(args.type));
      if (args.limit) params.set("limit", String(args.limit));
      path = `/api/jira/agent/fields?${params}`;
    }
    if (key === "jira-permissions") {
      const params = new URLSearchParams();
      if (args.issueKey) params.set("issueKey", assertIssueKey(args.issueKey));
      path = `/api/jira/agent/permissions?${params}`;
    }
    if (!path) {
      throw new WorkbenchAgentError(
        400,
        "Workbench resource is not registered.",
        "invalid_workbench_resource",
        {
          resource,
        }
      );
    }
    const response = await fetchImpl(`${baseUrl}${path}`, {
      headers: { Accept: "application/json" },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new WorkbenchAgentError(
        response.status,
        body.error || "Workbench read failed.",
        body.code || "read_failed"
      );
    }
    return sanitizeForClient(body);
  }

  async function writeAfterReview(action) {
    const key = String(action?.toolName || "");
    if (key === "workbench.page-action") {
      const actionKey = String(action.args?.actionKey || "");
      return {
        command: { actionKey, type: "page-action" },
        receipt: {
          id: action.id,
          title: action.title || "Confirmed page action",
          detail: `Ready for the browser to execute ${actionKey}.`,
          source: "workbench-agent",
          createdAt: new Date(action.usedAt || Date.now()).toISOString(),
        },
      };
    }
    if (key === "jira.issue.update") {
      const issueKey = assertIssueKey(action.args?.issueKey);
      const response = await fetchImpl(`${baseUrl}/api/jira/issues/${issueKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(action.args?.body || {}),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new WorkbenchAgentError(
          response.status,
          body.error || "Jira update failed.",
          body.code || "jira_failed"
        );
      }
      return sanitizeForClient(body);
    }
    return { ok: true, mode: "ui-command", command: sanitizeForClient(action) };
  }

  const readJira = (resource, args = {}) => read(`jira-${String(resource || "").trim()}`, args);

  return { read, readJira, writeAfterReview };
}

export function createNotebookLmAdapter(options = {}) {
  const execFile = options.execFile || execFileDefault;
  const bin = options.bin || process.env.NOTEBOOKLM_CLI || "notebooklm";
  const timeout = options.timeout || 60_000;

  async function run(args) {
    const { stdout } = await execFile(bin, args, { timeout });
    try {
      return JSON.parse(stdout);
    } catch {
      return { text: stdout.trim() };
    }
  }

  return {
    status: () => run(["status", "--json"]),
    list: () => run(["list", "--json"]),
    artifacts: (notebookId) =>
      run(["artifact", "list", "-n", assertNotebookId(notebookId), "--json"]),
    reviewGeneration: ({ notebookId, prompt, artifactType = "report", format }) => {
      const type = assertNotebookType(artifactType);
      const safeFormat = type === "report" ? assertNotebookFormat(format) : null;
      return {
        toolName: "notebooklm.generate",
        actionKind: "notebooklm-generate",
        args: {
          artifactType: type,
          format: safeFormat,
          notebookId: assertNotebookId(notebookId),
          prompt: String(prompt || ""),
        },
        target: { connector: "notebooklm", notebookId: assertNotebookId(notebookId) },
        title: "Generate NotebookLM artifact",
        preview: `Notebook: ${assertNotebookId(notebookId)}\nArtifact type: ${type}${
          safeFormat ? `\nFormat: ${safeFormat}` : ""
        }\nPrompt:\n${String(prompt || "").slice(0, 4_000)}`,
      };
    },
    executeAfterReview: (args) => {
      const type = assertNotebookType(args.artifactType);
      const cliArgs = ["generate", type];
      const description = String(args.prompt || "").trim();
      if (description) {
        cliArgs.push(description);
      }
      cliArgs.push("-n", assertNotebookId(args.notebookId), "--no-wait", "--json");
      const format = type === "report" ? assertNotebookFormat(args.format) : null;
      if (format) {
        cliArgs.push("--format", format);
      }
      return run(cliArgs);
    },
  };
}

export function createDevSpaceAdapter(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const endpoint = options.endpoint || process.env.DEVSPACE_MCP_URL || "http://127.0.0.1:7676/mcp";
  const authPath = options.authPath || "C:\\Users\\snahrup\\.devspace\\auth.json";
  const workspaceRoot = resolve(options.workspaceRoot || FRONTEND_ROOT);
  let workspaceIdPromise = null;

  async function ownerToken() {
    if (options.ownerToken) {
      return options.ownerToken;
    }
    const raw = await readFile(authPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.ownerToken) {
      throw new WorkbenchAgentError(
        503,
        "DevSpace owner token is unavailable.",
        "devspace_auth_missing"
      );
    }
    return parsed.ownerToken;
  }

  async function callTool(name, args) {
    const auth = await ownerToken();
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `workbench-agent-${Date.now()}`,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.error) {
      throw new WorkbenchAgentError(
        response.status || 502,
        body.error?.message || "DevSpace request failed.",
        "devspace_failed"
      );
    }
    return sanitizeForClient(body.result);
  }

  async function workspaceId() {
    if (!workspaceIdPromise) {
      workspaceIdPromise = callTool("open_workspace", { path: workspaceRoot }).then((result) => {
        const contentText = result?.content?.find?.((item) => typeof item?.text === "string")?.text;
        let parsed = null;
        if (contentText) {
          try {
            parsed = JSON.parse(contentText);
          } catch {
            parsed = null;
          }
        }
        const id =
          result?.workspaceId ||
          result?.workspace_id ||
          result?.id ||
          parsed?.workspaceId ||
          parsed?.workspace_id ||
          parsed?.id;
        if (!id) {
          throw new WorkbenchAgentError(
            502,
            "DevSpace did not return a workspace id.",
            "devspace_workspace_missing"
          );
        }
        return id;
      });
    }
    return workspaceIdPromise;
  }

  return {
    assertInsideRoot: (value) => assertInsideRoot(value, workspaceRoot),
    checkWorkspace: async () => ({ workspaceId: await workspaceId() }),
    read: async (filePath) =>
      callTool("read", {
        workspaceId: await workspaceId(),
        path: relativeToRoot(filePath, workspaceRoot),
      }),
    runVerification: async (command) => {
      if (!isAllowedVerificationCommand(command)) {
        throw new WorkbenchAgentError(
          403,
          "Command requires review before running.",
          "command_review_required",
          {
            command,
          }
        );
      }
      return callTool("bash", { workspaceId: await workspaceId(), command });
    },
    reviewChange: ({ toolName, filePath, command, content, oldText, newText }) => {
      const relativePath = filePath ? relativeToRoot(filePath, workspaceRoot) : null;
      const target = filePath ? { path: relativePath } : { command: String(command || "") };
      const edits =
        oldText !== undefined || newText !== undefined
          ? [{ oldText: String(oldText || ""), newText: String(newText || "") }]
          : [];
      return {
        toolName:
          toolName ||
          (edits.length ? "devspace.edit" : filePath ? "devspace.write" : "devspace.bash"),
        actionKind: filePath ? "devspace-write" : "devspace-command",
        args: { command, content, edits },
        target,
        title: filePath ? "Change Workbench file" : "Run Workbench command",
        preview: filePath
          ? `Path: ${target.path}\n\n${String(
              edits.length ? JSON.stringify(edits, null, 2) : content || ""
            ).slice(0, 8_000)}`
          : `Command:\n${String(command || "").slice(0, 2_000)}`,
      };
    },
    executeAfterReview: async (record) => {
      if (record.toolName === "devspace.bash") {
        return callTool("bash", {
          workspaceId: await workspaceId(),
          command: String(record.target?.command || record.args?.command || ""),
        });
      }
      if (record.toolName === "devspace.write") {
        return callTool("write", {
          workspaceId: await workspaceId(),
          path: relativeToRoot(record.target?.path, workspaceRoot),
          content: String(record.args?.content || ""),
        });
      }
      if (record.toolName === "devspace.edit") {
        return callTool("edit", {
          workspaceId: await workspaceId(),
          path: relativeToRoot(record.target?.path, workspaceRoot),
          edits: Array.isArray(record.args?.edits) ? record.args.edits : [],
        });
      }
      throw new WorkbenchAgentError(
        403,
        "DevSpace action is not executable by this service.",
        "devspace_denied"
      );
    },
  };
}

export async function checkServiceReadiness(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const workbenchUrl = options.baseUrl || "http://127.0.0.1:8817";
  const devspaceHealthUrl = options.devspaceHealthUrl || "http://127.0.0.1:7676/healthz";
  const devspace = options.devspace || createDevSpaceAdapter(options);
  const notebooklm = options.notebooklm || createNotebookLmAdapter(options);
  const enterprise = getEnterpriseMcpAdapter(options);
  const m365ServerPath =
    options.m365ServerPath || "C:\\Users\\snahrup\\CascadeProjects\\copilot_cowork_mcp\\server.py";
  const checkedAt = new Date().toISOString();

  async function checked(id, label, fn) {
    try {
      const result = await fn();
      return {
        id,
        label,
        state: result.state || "ready",
        detail: result.detail || "Checked successfully.",
        summary: sanitizeForClient(result.summary || {}),
      };
    } catch (error) {
      return {
        id,
        label,
        state: "unavailable",
        detail: error instanceof Error ? error.message : "Readiness check failed.",
      };
    }
  }

  const timeout = AbortSignal.timeout(options.timeoutMs || 2_500);
  const enterpriseReadiness = enterprise.status();
  const connectors = await Promise.all([
    checked("workbench", "Workbench local API", async () => {
      const response = await fetchImpl(`${workbenchUrl}/healthz`, { signal: timeout });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json().catch(() => ({}));
      return { summary: { ok: Boolean(body.ok), service: body.service || "workbench-api" } };
    }),
    checked("notebooklm", "NotebookLM CLI", () => notebooklm.status()),
    checked("microsoft365", "Microsoft 365 read MCP", async () => {
      await access(m365ServerPath);
      return {
        state: "limited",
        detail: "Connector file is present. A live Microsoft 365 read runs when the user asks.",
        summary: { mode: "read-on-request" },
      };
    }),
    checked("devspace", "DevSpace workspace MCP", async () => {
      const response = await fetchImpl(devspaceHealthUrl, { signal: timeout });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const health = await response.json().catch(() => ({}));
      if (options.checkDevspaceWorkspace) {
        await devspace.checkWorkspace();
        return { summary: { ok: Boolean(health.ok), workspace: "opened" } };
      }
      return {
        state: "limited",
        detail:
          "DevSpace is listening. Owner auth and workspace open are checked before a workspace action runs.",
        summary: { ok: Boolean(health.ok), workspace: "checked-on-request" },
      };
    }),
    checked("jira", "Jira through Workbench API", async () => {
      const response = await fetchImpl(`${workbenchUrl}/api/jira/status`, { signal: timeout });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json().catch(() => ({}));
      return {
        summary: {
          connected: Boolean(body.data?.connected || body.ok),
          initiativeKey: body.data?.initiativeKey || "MT",
        },
      };
    }),
    checked("team-library", "Team Library manifest", async () => {
      const response = await fetchImpl(`${workbenchUrl}/api/team-library/manifest`, {
        signal: timeout,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json().catch(() => ({}));
      return {
        summary: {
          files: Number(body.data?.totalFiles || 0),
          state: body.data?.state || "unknown",
          missingSections: Array.isArray(body.data?.missingSections)
            ? body.data.missingSections.length
            : 0,
        },
      };
    }),
    checked("sql", "SQL data sources", async () => (await enterpriseReadiness).sql),
    checked("powerbi", "Power BI models", async () => (await enterpriseReadiness).powerbi),
    checked("fabric", "Microsoft Fabric", async () => (await enterpriseReadiness).fabric),
  ]);

  return {
    checkedAt,
    connectors,
    microsoft365Writes: "read-only in this service lane",
  };
}

export function microsoft365McpConfig(options = {}) {
  const serverPath =
    options.serverPath || "C:\\Users\\snahrup\\CascadeProjects\\copilot_cowork_mcp\\server.py";
  return {
    type: "stdio",
    command: options.python || "python",
    args: [serverPath],
    env: {
      ...(options.env || {}),
      COWORK_BRAIN_ROOT:
        options.brainRoot ||
        "C:\\Users\\snahrup\\OneDrive - IP-Corporation\\ipcorp-architecture-brain",
    },
  };
}

export { assertInsideRoot, relativeToRoot };
