import { classifyAction, summarizeActionForPrompt, validateSemanticAction } from "./actions.mjs";
import {
  createDevSpaceAdapter,
  createNotebookLmAdapter,
  createWorkbenchAdapter,
  microsoft365McpConfig,
} from "./adapters.mjs";
import { destinationRegistry, normalizeDestination } from "./destinations.mjs";
import {
  ENTERPRISE_SERVICE_NAMES,
  FABRIC_CORE_READ_TOOL_NAMES,
  FABRIC_CORE_REVIEW_TOOL_NAMES,
  FABRIC_READ_TOOL_NAMES,
  FABRIC_REFERENCE_READ_TOOL_NAMES,
  FABRIC_REFERENCE_REVIEW_TOOL_NAMES,
  FABRIC_REVIEW_TOOL_NAMES,
  FABRIC_RTI_READ_TOOL_NAMES,
  FABRIC_RTI_REVIEW_TOOL_NAMES,
  getEnterpriseMcpAdapter,
  POWERBI_REMOTE_TOOL_NAMES,
  POWERBI_TOOL_NAMES,
  SQL_SOURCE_DEFINITIONS,
} from "./enterprise-mcp.mjs";
import { okToolResult, sanitizeForClient, WorkbenchAgentError } from "./protocol.mjs";

const LOCAL_TOOL_PREFIX = "mcp__workbench_agent__";
const LOCAL_TOOL_NAMES = [
  "lookup_destination",
  "review_page_action",
  "read_workbench",
  "read_jira",
  "read_notebooklm",
  "review_jira_issue_update",
  "review_notebooklm_generation",
  "read_devspace_file",
  "run_devspace_verification",
  "review_devspace_change",
  "list_enterprise_sources",
  "discover_enterprise_tools",
  "list_sql_servers",
  "list_sql_databases",
  "list_sql_tables",
  "query_sql",
  "read_powerbi",
  "read_powerbi_remote",
  "review_powerbi_change",
  "read_fabric",
  "review_fabric_action",
  "read_fabric_reference",
  "review_fabric_reference_action",
  "read_fabric_core",
  "review_fabric_core_action",
  "read_fabric_rti",
  "review_fabric_rti_action",
].map((name) => `${LOCAL_TOOL_PREFIX}${name}`);

const M365_READ_TOOLS = [
  "mcp__microsoft365__outlook_calendar_search",
  "mcp__microsoft365__meeting_prep_packages",
  "mcp__microsoft365__brain_workspace_search",
  "mcp__microsoft365__brain_workspace_read",
  "mcp__microsoft365__teams_meeting_transcripts",
];
const JIRA_READ_RESOURCES = [
  "status",
  "initiative",
  "search",
  "count",
  "issue-evidence",
  "projects",
  "fields",
  "link-types",
  "permissions",
];
const M365_GENERIC_READ_TOOLS = new Set([
  "mcp__microsoft365__outlook_email",
  "mcp__microsoft365__microsoft_teams",
  "mcp__microsoft365__sharepoint_onedrive",
]);
const M365_READ_INTENT_RE =
  /\b(read|search|find|lookup|look up|list|get|fetch|summarize|summarise|preview|inspect|show|open|retrieve|describe|status|check)\b/i;
const M365_ACTION_INTENT_RE =
  /\b(send|reply|forward|draft|create|update|delete|remove|archive|trash|move|schedule|invite|book|cancel|respond|accept|decline|upload|write|edit|save|share|post|message)\b/i;
const LOCAL_MAINTENANCE_ORIGINS = new Set(["http://127.0.0.1:5217", "http://localhost:5217"]);

function assertLocalMaintenanceSession(context, deps) {
  if (deps.allowEnterpriseForTests === true) return;
  if (!LOCAL_MAINTENANCE_ORIGINS.has(context.session?.origin)) {
    throw new WorkbenchAgentError(
      403,
      "SQL, Power BI, and Fabric tools are available only from the local owner Workbench.",
      "local_owner_required"
    );
  }
}

function extractText(message) {
  const content = message?.message?.content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

function extractTextDelta(message) {
  const event = message?.event;
  const delta = event?.delta || event?.content_block_delta?.delta;
  if (event?.type === "content_block_delta" && delta?.type === "text_delta") {
    return typeof delta.text === "string" ? delta.text : "";
  }
  if (delta?.type === "text_delta" && typeof delta.text === "string") {
    return delta.text;
  }
  return "";
}

function extractReasoning(message) {
  const event = message?.event;
  const content = event?.delta || event?.content_block_delta?.delta;
  if (content?.type === "thinking_delta" && typeof content.thinking === "string") {
    return content.thinking;
  }
  if (typeof content?.thinking === "string") {
    return content.thinking;
  }
  return "";
}

function stringifyToolInput(input) {
  return JSON.stringify(input || {}).slice(0, 4_000);
}

function permissionForTool(toolName, input) {
  if (LOCAL_TOOL_NAMES.includes(toolName) || M365_READ_TOOLS.includes(toolName)) {
    return { behavior: "allow", updatedInput: input };
  }
  if (M365_GENERIC_READ_TOOLS.has(toolName)) {
    const intentText = stringifyToolInput(input);
    if (M365_ACTION_INTENT_RE.test(intentText)) {
      return {
        behavior: "deny",
        message: "Microsoft 365 changes are unavailable in this Workbench agent service.",
        interrupt: false,
      };
    }
    if (M365_READ_INTENT_RE.test(intentText)) {
      return { behavior: "allow", updatedInput: input };
    }
    return {
      behavior: "deny",
      message: "Microsoft 365 generic tools need explicit read-only wording before they can run.",
      interrupt: false,
    };
  }
  if (toolName === "mcp__workbench__search_workbench") {
    return { behavior: "allow", updatedInput: input };
  }
  return {
    behavior: "deny",
    message: "This Workbench agent can only run registered read tools or create review records.",
    interrupt: false,
  };
}

function buildPrompt(context) {
  return [
    "You are the Workbench agent inside the IP Corp Brain Workbench.",
    "Answer using current evidence, connected service results, and clear unavailable-source notes.",
    "Never expose cookies, tokens, raw prompts, stack traces, or unfiltered tool output.",
    "To move the user, call lookup_destination and then describe the browser command.",
    "To use a page control, call review_page_action with an action key from currentActions and include value for fill or select actions.",
    "Microsoft 365 tools are read-only here. Email, Teams, SharePoint, and calendar changes are unavailable in this service.",
    "Jira reads use REST API v3. Use read_jira for enhanced MT issue search, approximate counts, full issue evidence, projects, fields, link types, permissions, status, and initiative data. Jira changes require a review record and remain limited to MT issues.",
    "SQL, Power BI, and Fabric tools run only from the local owner Workbench.",
    "SQL is read-only, accepts one SELECT or WITH statement, and limits detail reads to 200 rows. Use list_sql_servers, list_sql_databases, and list_sql_tables before querying unfamiliar sources. Microsoft Data API Builder is installed for typed entity MCP profiles, which remain pending until VPN schema discovery. Never combine financial detail across companies. Ask for the company when it is not explicit.",
    "Power BI has a local modeling service and a hosted query service. Use read_powerbi for local model inspection, read_powerbi_remote for hosted semantic-model and report questions, and review_powerbi_change for every local model change.",
    "Fabric has live operations, the hosted Core service, official development and OneLake tools, and Real-Time Intelligence. Use the matching read tool and its matching review tool for every change.",
    "Call discover_enterprise_tools when you need the current input fields for a Power BI or Fabric tool.",
    "Any data, file, Jira, Microsoft 365, NotebookLM generation, download, or DevSpace change must be returned as a review record first.",
    "",
    `Current view: ${context.view || "unknown"}`,
    `Current section: ${context.section || "unknown"}`,
    `Available destinations: ${JSON.stringify(destinationRegistry(context.clientSections))}`,
    `Current actions: ${JSON.stringify(summarizeActionForPrompt(context.availableActions))}`,
    context.history?.length
      ? `Recent conversation: ${JSON.stringify(context.history.slice(-8))}`
      : "",
    "",
    `User request:\n${context.message}`,
  ].join("\n");
}

async function makeLocalMcpServer(context, deps) {
  const [{ createSdkMcpServer, tool }, { z }] = await Promise.all([
    import("@anthropic-ai/claude-agent-sdk"),
    import("zod"),
  ]);
  const workbench = deps.workbench || createWorkbenchAdapter(deps);
  const notebooklm = deps.notebooklm || createNotebookLmAdapter(deps);
  const devspace = deps.devspace || createDevSpaceAdapter(deps);
  const enterprise = getEnterpriseMcpAdapter(deps);
  const queue = (event) => {
    if (!Array.isArray(context.sideEvents)) {
      context.sideEvents = [];
    }
    context.sideEvents.push(event);
  };
  const tracked = async (source, label, fn) => {
    const id = `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    queue({
      type: "activity",
      activity: {
        id,
        source,
        label,
        status: "running",
        startedAt: new Date(startedAt).toISOString(),
      },
    });
    try {
      const data = await fn();
      queue({
        type: "activity",
        activity: {
          id,
          source,
          label,
          status: "completed",
          detail: "Read completed.",
          durationMs: Date.now() - startedAt,
        },
      });
      return data;
    } catch (error) {
      queue({
        type: "activity",
        activity: {
          id,
          source,
          label,
          status: "failed",
          detail:
            error instanceof WorkbenchAgentError ? error.message : `${label} could not complete.`,
          durationMs: Date.now() - startedAt,
        },
      });
      throw error;
    }
  };

  return createSdkMcpServer({
    name: "workbench_agent",
    version: "0.1.0",
    tools: [
      tool(
        "lookup_destination",
        "Validate a Workbench page and section destination.",
        { view: z.string(), section: z.string().optional(), label: z.string().optional() },
        async (args) => {
          const destination = normalizeDestination(args, context.clientSections);
          queue({ type: "navigate", destination });
          return okToolResult({ command: "navigate", destination });
        }
      ),
      tool(
        "review_page_action",
        "Validate a page action key and either return a browser command or create a review record.",
        { actionKey: z.string(), value: z.string().optional() },
        async (args) => {
          const action = validateSemanticAction(args.actionKey, context.availableActions);
          const classification = classifyAction(action);
          const command = { actionKey: action.key };
          if (args.value !== undefined) {
            command.value = args.value;
          }
          if (classification.mode === "auto") {
            queue({ type: "action", ...command });
            return okToolResult({ command: "page-action", action, value: args.value });
          }
          const review = context.sessionStore.createReview(context.session, {
            toolName: "workbench.page-action",
            actionKind: action.kind,
            args: command,
            target: action.target,
            title: action.label,
            preview: action.summary || action.label,
          });
          queue({ type: "review", review });
          return okToolResult({ reviewRequired: true, review });
        }
      ),
      tool(
        "read_workbench",
        "Read current Workbench, Team Library, Jira, or prepared meeting data through existing local APIs.",
        { resource: z.string(), args: z.record(z.unknown()).optional() },
        async (args) =>
          okToolResult({
            source: "workbench",
            data: await tracked("Workbench", `Read ${args.resource}`, () =>
              workbench.read(args.resource, args.args || {})
            ),
          })
      ),
      tool(
        "read_jira",
        "Read Jira REST API v3 status, MT initiative data, enhanced JQL results, approximate counts, issue evidence, projects, fields, link types, or permissions.",
        {
          resource: z.enum(JIRA_READ_RESOURCES),
          issueKey: z.string().optional(),
          jql: z.string().optional(),
          fields: z.array(z.string()).optional(),
          query: z.string().optional(),
          type: z.enum(["custom"]).optional(),
          limit: z.number().int().positive().max(1_000).optional(),
          reconcileIssues: z.array(z.number().int().positive()).max(50).optional(),
        },
        async (args) =>
          okToolResult({
            source: "jira",
            data: await tracked("Jira", `Read ${args.resource}`, () =>
              typeof workbench.readJira === "function"
                ? workbench.readJira(args.resource, args)
                : workbench.read(`jira-${args.resource}`, args)
            ),
          })
      ),
      tool(
        "read_notebooklm",
        "Read NotebookLM status, notebooks, or artifact list.",
        { resource: z.enum(["status", "list", "artifacts"]), notebookId: z.string().optional() },
        async (args) => {
          const data = await tracked("NotebookLM", `Read ${args.resource}`, async () => {
            if (args.resource === "status") return notebooklm.status();
            if (args.resource === "list") return notebooklm.list();
            return notebooklm.artifacts(args.notebookId);
          });
          return okToolResult(data);
        }
      ),
      tool(
        "review_jira_issue_update",
        "Create a review record for updating one MT Jira issue through the Workbench API.",
        {
          body: z.record(z.unknown()),
          expectedUpdated: z.string(),
          issueKey: z.string(),
        },
        async (args) => {
          const issueKey = String(args.issueKey || "").trim();
          if (!/^MT-\d+$/.test(issueKey)) {
            throw new WorkbenchAgentError(
              400,
              "A valid MT issue key is required.",
              "invalid_issue_key"
            );
          }
          const body = {
            ...args.body,
            expectedUpdated: String(args.expectedUpdated || ""),
          };
          if (!body.expectedUpdated) {
            throw new WorkbenchAgentError(
              400,
              "Jira update review needs expectedUpdated.",
              "expected_updated_required"
            );
          }
          const review = context.sessionStore.createReview(context.session, {
            toolName: "jira.issue.update",
            actionKind: "jira-write",
            args: { body, issueKey },
            target: { issueKey },
            title: `Update ${issueKey}`,
            preview: JSON.stringify({ body, issueKey }, null, 2),
          });
          queue({ type: "review", review });
          return okToolResult({ review });
        }
      ),
      tool(
        "review_notebooklm_generation",
        "Create a review record for NotebookLM generation.",
        {
          artifactType: z.string().optional(),
          format: z.string().optional(),
          notebookId: z.string(),
          prompt: z.string(),
        },
        async (args) => {
          const review = context.sessionStore.createReview(
            context.session,
            notebooklm.reviewGeneration(args)
          );
          queue({ type: "review", review });
          return okToolResult({ review });
        }
      ),
      tool(
        "read_devspace_file",
        "Read a file inside the Workbench checkout through DevSpace.",
        { path: z.string() },
        async (args) =>
          okToolResult({
            source: "devspace",
            data: await tracked("DevSpace", `Read ${args.path}`, () => devspace.read(args.path)),
          })
      ),
      tool(
        "run_devspace_verification",
        "Run an allowlisted verification command inside the Workbench checkout.",
        { command: z.string() },
        async (args) =>
          okToolResult({
            source: "devspace",
            data: await tracked("DevSpace", `Check ${args.command}`, () =>
              devspace.runVerification(args.command)
            ),
          })
      ),
      tool(
        "review_devspace_change",
        "Create a review record for a Workbench file or command change.",
        {
          filePath: z.string().optional(),
          command: z.string().optional(),
          content: z.string().optional(),
          newText: z.string().optional(),
          oldText: z.string().optional(),
          toolName: z.string().optional(),
        },
        async (args) => {
          const review = context.sessionStore.createReview(
            context.session,
            devspace.reviewChange(args)
          );
          queue({ type: "review", review });
          return okToolResult({ review });
        }
      ),
      tool(
        "list_enterprise_sources",
        "List registered SQL databases and the Power BI and Fabric services available to the local owner Workbench.",
        {},
        async () => {
          assertLocalMaintenanceSession(context, deps);
          return okToolResult({
            sql: enterprise.listSources(),
            sqlServers: enterprise.listSqlServers(),
            sqlMcp: enterprise.sqlMcpRuntime(),
            services: enterprise.listServices(),
          });
        }
      ),
      tool(
        "discover_enterprise_tools",
        "Return the current tool names, descriptions, input schemas, and read or review mode for one Power BI or Fabric service.",
        { service: z.enum(ENTERPRISE_SERVICE_NAMES) },
        async (args) => {
          assertLocalMaintenanceSession(context, deps);
          return okToolResult({
            service: args.service,
            tools: await tracked(args.service, "Discover current tools", () =>
              enterprise.describeTools(args)
            ),
          });
        }
      ),
      tool(
        "list_sql_servers",
        "List every known IP Corp SQL Server instance and its last verified access state.",
        {},
        async () => {
          assertLocalMaintenanceSession(context, deps);
          return okToolResult({ servers: enterprise.listSqlServers() });
        }
      ),
      tool(
        "list_sql_databases",
        "List databases the read login can currently access on one registered SQL Server. VPN is required.",
        { server: z.string(), purpose: z.string() },
        async (args) => {
          assertLocalMaintenanceSession(context, deps);
          return okToolResult({
            server: args.server,
            data: await tracked("SQL", args.purpose, () => enterprise.listSqlDatabases(args)),
          });
        }
      ),
      tool(
        "list_sql_tables",
        "List tables and views in one registered IP Corp database, optionally filtered by a SQL LIKE pattern. VPN is required.",
        {
          source: z.enum(Object.keys(SQL_SOURCE_DEFINITIONS)),
          nameLike: z.string().optional(),
          purpose: z.string(),
        },
        async (args) => {
          assertLocalMaintenanceSession(context, deps);
          const source = SQL_SOURCE_DEFINITIONS[args.source];
          return okToolResult({
            source: source.label,
            data: await tracked(source.label, args.purpose, () => enterprise.listSqlTables(args)),
          });
        }
      ),
      tool(
        "query_sql",
        "Run one bounded read-only SQL query against a registered IP Corp data source.",
        {
          source: z.enum(Object.keys(SQL_SOURCE_DEFINITIONS)),
          query: z.string(),
          purpose: z.string(),
        },
        async (args) => {
          assertLocalMaintenanceSession(context, deps);
          const source = SQL_SOURCE_DEFINITIONS[args.source];
          const data = await tracked(source.label, args.purpose, () => enterprise.querySql(args));
          return okToolResult({ source: source.label, data });
        }
      ),
      tool(
        "read_powerbi",
        "Inspect a Power BI semantic model or execute a read-only DAX query.",
        {
          toolName: z.enum(POWERBI_TOOL_NAMES),
          args: z.record(z.unknown()),
          purpose: z.string(),
        },
        async (args) => {
          assertLocalMaintenanceSession(context, deps);
          const data = await tracked("Power BI", args.purpose, () => enterprise.readPowerBi(args));
          return okToolResult({ source: "Power BI", data });
        }
      ),
      tool(
        "read_powerbi_remote",
        "Query a hosted Power BI semantic model, generate DAX, inspect model schema, or read report metadata.",
        {
          toolName: z.enum(POWERBI_REMOTE_TOOL_NAMES),
          args: z.record(z.unknown()),
          purpose: z.string(),
        },
        async (args) => {
          assertLocalMaintenanceSession(context, deps);
          const data = await tracked("Power BI hosted service", args.purpose, () =>
            enterprise.readPowerBiRemote(args)
          );
          return okToolResult({ source: "Power BI hosted service", data });
        }
      ),
      tool(
        "review_powerbi_change",
        "Create a review card for one exact Power BI semantic model change.",
        { toolName: z.enum(POWERBI_TOOL_NAMES), args: z.record(z.unknown()) },
        async (args) => {
          assertLocalMaintenanceSession(context, deps);
          const review = context.sessionStore.createReview(
            context.session,
            enterprise.reviewPowerBiChange(args)
          );
          queue({ type: "review", review });
          return okToolResult({ reviewRequired: true, review });
        }
      ),
      tool(
        "read_fabric",
        "Read Fabric workspaces, items, lakehouses, schemas, jobs, schedules, compute, connections, lineage, or capacities.",
        {
          toolName: z.enum(FABRIC_READ_TOOL_NAMES),
          args: z.record(z.unknown()),
          purpose: z.string(),
        },
        async (args) => {
          assertLocalMaintenanceSession(context, deps);
          const data = await tracked("Microsoft Fabric", args.purpose, () =>
            enterprise.readFabric(args)
          );
          return okToolResult({ source: "Microsoft Fabric", data });
        }
      ),
      tool(
        "review_fabric_action",
        "Create a review card for one exact Fabric cache administration action.",
        { toolName: z.enum(FABRIC_REVIEW_TOOL_NAMES), args: z.record(z.unknown()) },
        async (args) => {
          assertLocalMaintenanceSession(context, deps);
          const review = context.sessionStore.createReview(
            context.session,
            enterprise.reviewFabricAction(args)
          );
          queue({ type: "review", review });
          return okToolResult({ reviewRequired: true, review });
        }
      ),
      tool(
        "read_fabric_reference",
        "Read official Fabric API guidance, item schemas, OneLake metadata, and Data Factory metadata.",
        {
          toolName: z.enum(FABRIC_REFERENCE_READ_TOOL_NAMES),
          args: z.record(z.unknown()),
          purpose: z.string(),
        },
        async (args) => {
          assertLocalMaintenanceSession(context, deps);
          const data = await tracked("Fabric development", args.purpose, () =>
            enterprise.readFabricReference(args)
          );
          return okToolResult({ source: "Fabric development", data });
        }
      ),
      tool(
        "review_fabric_reference_action",
        "Create a review card for an exact OneLake or Data Factory action.",
        {
          toolName: z.enum(FABRIC_REFERENCE_REVIEW_TOOL_NAMES),
          args: z.record(z.unknown()),
        },
        async (args) => {
          assertLocalMaintenanceSession(context, deps);
          const review = context.sessionStore.createReview(
            context.session,
            enterprise.reviewFabricReferenceAction(args)
          );
          queue({ type: "review", review });
          return okToolResult({ reviewRequired: true, review });
        }
      ),
      tool(
        "read_fabric_core",
        "Read hosted Fabric Core workspaces, items, roles, folders, capacities, operations, catalog, or service knowledge.",
        {
          toolName: z.enum(FABRIC_CORE_READ_TOOL_NAMES),
          args: z.record(z.unknown()),
          purpose: z.string(),
        },
        async (args) => {
          assertLocalMaintenanceSession(context, deps);
          const data = await tracked("Fabric Core", args.purpose, () =>
            enterprise.readFabricCore(args)
          );
          return okToolResult({ source: "Fabric Core", data });
        }
      ),
      tool(
        "review_fabric_core_action",
        "Create a review card for one exact hosted Fabric Core resource, role, item, or folder action.",
        { toolName: z.enum(FABRIC_CORE_REVIEW_TOOL_NAMES), args: z.record(z.unknown()) },
        async (args) => {
          assertLocalMaintenanceSession(context, deps);
          const review = context.sessionStore.createReview(
            context.session,
            enterprise.reviewFabricCoreAction(args)
          );
          queue({ type: "review", review });
          return okToolResult({ reviewRequired: true, review });
        }
      ),
      tool(
        "read_fabric_rti",
        "Read Fabric Eventhouse, Kusto, Eventstream, Activator, and Map metadata or run a read-only KQL query.",
        {
          toolName: z.enum(FABRIC_RTI_READ_TOOL_NAMES),
          args: z.record(z.unknown()),
          purpose: z.string(),
        },
        async (args) => {
          assertLocalMaintenanceSession(context, deps);
          const data = await tracked("Fabric Real-Time Intelligence", args.purpose, () =>
            enterprise.readFabricRti(args)
          );
          return okToolResult({ source: "Fabric Real-Time Intelligence", data });
        }
      ),
      tool(
        "review_fabric_rti_action",
        "Create a review card for one exact Kusto, Eventstream, Activator, or Map action.",
        { toolName: z.enum(FABRIC_RTI_REVIEW_TOOL_NAMES), args: z.record(z.unknown()) },
        async (args) => {
          assertLocalMaintenanceSession(context, deps);
          const review = context.sessionStore.createReview(
            context.session,
            enterprise.reviewFabricRtiAction(args)
          );
          queue({ type: "review", review });
          return okToolResult({ reviewRequired: true, review });
        }
      ),
    ],
  });
}

export async function* runAgentTurn(context, deps = {}) {
  const sdk = deps.sdk || (await import("@anthropic-ai/claude-agent-sdk"));
  const localMcp = await makeLocalMcpServer(context, deps);
  const abortController = deps.abortController || new AbortController();
  const mcpServers = {
    workbench_agent: localMcp,
  };
  if (deps.enableMicrosoft365 !== false) {
    mcpServers.microsoft365 = microsoft365McpConfig(deps.microsoft365 || {});
  }

  yield { type: "status", status: "thinking" };
  let streamedText = false;
  let assistantText = "";
  const flushSideEvents = function* () {
    while (context.sideEvents?.length) {
      yield context.sideEvents.shift();
    }
  };
  const query = sdk.query({
    prompt: buildPrompt(context),
    options: {
      abortController,
      cwd: deps.cwd || process.cwd(),
      tools: [],
      allowedTools: [...LOCAL_TOOL_NAMES, ...M365_READ_TOOLS, ...M365_GENERIC_READ_TOOLS],
      canUseTool: (toolName, input) => permissionForTool(toolName, input),
      includePartialMessages: true,
      maxThinkingTokens: deps.maxThinkingTokens || 2_048,
      mcpServers,
      permissionMode: "dontAsk",
      env: {
        ...process.env,
        ...(deps.env || {}),
      },
    },
  });

  for await (const message of query) {
    if (message.type === "stream_event") {
      const reasoning = extractReasoning(message);
      if (reasoning) {
        yield { type: "thinking", text: reasoning };
      }
      const delta = extractTextDelta(message);
      if (delta) {
        streamedText = true;
        assistantText += delta;
        yield { type: "delta", text: delta };
      }
      yield* flushSideEvents();
      continue;
    }
    if (message.type === "assistant") {
      const text = extractText(message);
      if (text && !streamedText) {
        assistantText += text;
        yield { type: "delta", text };
      }
      yield* flushSideEvents();
      continue;
    }
    if (message.type === "result") {
      yield* flushSideEvents();
      yield {
        type: "done",
        ok: !message.is_error,
        result: sanitizeForClient(message.subtype === "success" ? message.result : message.errors),
      };
    }
  }
  if (context.session) {
    const history = Array.isArray(context.session.history) ? context.session.history : [];
    context.session.history = [
      ...history,
      { role: "user", text: String(context.message || "").slice(0, 4_000) },
      { role: "assistant", text: assistantText.slice(0, 8_000) },
    ].slice(-8);
  }
}

export async function executeConfirmedReview(record, deps = {}) {
  if (record.toolName?.startsWith("notebooklm.")) {
    const notebooklm = deps.notebooklm || createNotebookLmAdapter(deps);
    return { ok: true, data: await notebooklm.executeAfterReview(record.args || {}) };
  }
  if (record.toolName?.startsWith("devspace.")) {
    const devspace = deps.devspace || createDevSpaceAdapter(deps);
    return { ok: true, data: await devspace.executeAfterReview(record) };
  }
  if (record.toolName?.startsWith("jira.") || record.toolName === "workbench.page-action") {
    const workbench = deps.workbench || createWorkbenchAdapter(deps);
    return { ok: true, data: await workbench.writeAfterReview(record) };
  }
  if (record.toolName === "powerbi.change" || record.toolName === "fabric.admin") {
    const enterprise = getEnterpriseMcpAdapter(deps);
    return { ok: true, data: await enterprise.executeAfterReview(record) };
  }
  if (record.toolName?.startsWith("m365.")) {
    throw new WorkbenchAgentError(
      501,
      "Microsoft 365 changes need a dedicated executor before they can run.",
      "m365_write_unavailable"
    );
  }
  throw new WorkbenchAgentError(
    400,
    "Review record tool is not registered.",
    "unknown_review_tool"
  );
}

export { assertLocalMaintenanceSession, permissionForTool };
