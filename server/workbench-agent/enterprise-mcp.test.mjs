import assert from "node:assert/strict";
import test from "node:test";
import {
  createEnterpriseMcpAdapter,
  isPowerBiRead,
  validateFinancialRead,
  validateReadOnlySql,
} from "./enterprise-mcp.mjs";

test("SQL validation accepts bounded reads and single aggregates", () => {
  assert.equal(
    validateReadOnlySql("SELECT TOP 25 Name FROM dbo.Items ORDER BY Name"),
    "SELECT TOP 25 Name FROM dbo.Items ORDER BY Name"
  );
  assert.equal(
    validateReadOnlySql(
      "WITH recent AS (SELECT TOP 20 * FROM dbo.Items) SELECT TOP 20 * FROM recent"
    ),
    "WITH recent AS (SELECT TOP 20 * FROM dbo.Items) SELECT TOP 20 * FROM recent"
  );
  assert.equal(
    validateReadOnlySql("SELECT COUNT(*) AS total FROM dbo.Items"),
    "SELECT COUNT(*) AS total FROM dbo.Items"
  );
});

test("SQL validation rejects writes, batches, comments, and unbounded detail", () => {
  const rejected = [
    "UPDATE dbo.Items SET Name = 'x'",
    "SELECT TOP 5 * INTO #items FROM dbo.Items",
    "SELECT TOP 5 * FROM dbo.Items; SELECT TOP 5 * FROM dbo.Other",
    "SELECT TOP 5 * FROM dbo.Items -- comment",
    "SELECT * FROM dbo.Items",
    "SELECT TOP 201 * FROM dbo.Items",
  ];
  for (const query of rejected) {
    assert.throws(() => validateReadOnlySql(query));
  }
});

test("financial SQL reads require one explicit company filter", () => {
  assert.doesNotThrow(() =>
    validateFinancialRead(
      "m3-fdb",
      "SELECT TOP 20 * FROM MVXJDTA.OOLINE WHERE CONO = 100 ORDER BY ORNO"
    )
  );
  assert.doesNotThrow(() =>
    validateFinancialRead(
      "m3-fdb",
      "SELECT TOP 20 TABLE_NAME FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_NAME"
    )
  );
  assert.throws(() => validateFinancialRead("m3-fdb", "SELECT COUNT(*) FROM MVXJDTA.OOLINE"));
  assert.throws(() => validateFinancialRead("powerdata", "SELECT SUM(SalesAmount) FROM dbo.Sales"));
});

test("SQL adapter routes only a registered source and redacts sensitive result keys", async () => {
  const calls = [];
  const adapter = createEnterpriseMcpAdapter({
    callTool: async (server, tool, args) => {
      calls.push({ server, tool, args });
      return { rows: [{ total: 3 }], access_token: "never-return-this" };
    },
  });

  const result = await adapter.querySql({
    source: "powerdata",
    query: "SELECT COUNT(*) AS total FROM dbo.Items",
  });
  assert.deepEqual(calls, [
    {
      server: "sql-gateway",
      tool: "query",
      args: {
        server: "SQL2019Dev",
        database: "IPC_PowerData_TST",
        sql: "SELECT COUNT(*) AS total FROM dbo.Items",
        max_rows: 200,
      },
    },
  ]);
  assert.equal(result.access_token, "[redacted]");
  await assert.rejects(() => adapter.querySql({ source: "unknown", query: "SELECT 1" }));
});

test("SQL inventory includes the full verified VPN source map", async () => {
  const calls = [];
  const adapter = createEnterpriseMcpAdapter({
    callTool: async (server, tool, args) => {
      calls.push({ server, tool, args });
      return { content: [{ type: "text", text: "IPC_CPR\nEAMPROD12\nDI_PRD_Staging" }] };
    },
  });

  assert.equal(adapter.listSources().length, 25);
  assert.equal(adapter.listSqlServers().length, 15);
  assert.equal(adapter.listSources().find((source) => source.id === "m3-fdb").database, "M3FDBPRD");
  assert.equal(adapter.sqlMcpRuntime().version, "2.0.9");
  assert.equal(adapter.sqlMcpRuntime().operations.length, 7);
  await adapter.listSqlDatabases({ server: "sql2016live" });
  await adapter.listSqlTables({ source: "etq-prod", nameLike: "%batch%" });
  assert.deepEqual(calls, [
    {
      server: "sql-gateway",
      tool: "list_databases",
      args: { server: "SQL2016LIVE" },
    },
    {
      server: "sql-gateway",
      tool: "list_tables",
      args: {
        server: "M3-DB3",
        database: "ETQStagingPRD",
        name_like: "%batch%",
      },
    },
  ]);
});

test("enterprise MCP failures never appear as successful reads", async () => {
  const adapter = createEnterpriseMcpAdapter({
    callTool: async () => ({ content: [{ type: "text", text: "ERROR connecting to source" }] }),
  });

  await assert.rejects(
    adapter.querySql({ source: "powerdata", query: "SELECT COUNT(*) AS total FROM dbo.Items" }),
    (error) =>
      error.code === "enterprise_mcp_call_failed" &&
      error.message === "SQL read failed. Check VPN and source availability."
  );
});

test("Power BI reads are separated from reviewed model changes", async () => {
  assert.equal(isPowerBiRead("table_operations", { request: { operation: "List" } }), true);
  assert.equal(
    isPowerBiRead("dax_query_operations", {
      request: { operation: "Execute", query: 'EVALUATE ROW("Value", 1)' },
    }),
    true
  );
  assert.equal(isPowerBiRead("measure_operations", { request: { operation: "Update" } }), false);
  assert.equal(
    isPowerBiRead("database_operations", {
      request: { operation: "ExportToTmdlFolder", tmdlFolderPath: "C:/models" },
    }),
    false
  );

  const calls = [];
  const adapter = createEnterpriseMcpAdapter({
    callTool: async (server, tool, args) => {
      calls.push({ server, tool, args });
      return { ok: true };
    },
  });
  await adapter.readPowerBi({
    toolName: "table_operations",
    args: { request: { operation: "List" } },
  });
  const review = adapter.reviewPowerBiChange({
    toolName: "measure_operations",
    args: {
      request: {
        operation: "Update",
        tableName: "Sales",
        measureName: "Revenue",
        updateDefinition: { expression: "SUM(Sales[Amount])" },
      },
    },
  });
  assert.equal(review.toolName, "powerbi.change");
  assert.match(review.preview, /Revenue/);
  await adapter.executeAfterReview({ toolName: review.toolName, args: review.args });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].tool, "measure_operations");
});

test("Fabric reads and reviewed administration actions use separate lists", async () => {
  const calls = [];
  const adapter = createEnterpriseMcpAdapter({
    callTool: async (server, tool, args) => {
      calls.push({ server, tool, args });
      return { ok: true };
    },
  });
  await adapter.readFabric({ toolName: "list_workspaces", args: {} });
  await assert.rejects(() => adapter.readFabric({ toolName: "clear_fabric_data_cache", args: {} }));
  const review = adapter.reviewFabricAction({
    toolName: "clear_fabric_data_cache",
    args: { show_stats: true },
  });
  assert.equal(review.risk, "high");
  await adapter.executeAfterReview({ toolName: review.toolName, args: review.args });
  assert.deepEqual(
    calls.map((call) => call.tool),
    ["list_workspaces", "clear_fabric_data_cache"]
  );
});

test("hosted Power BI and current Fabric service families are callable through fixed lists", async () => {
  const calls = [];
  const adapter = createEnterpriseMcpAdapter({
    callTool: async (server, tool, args) => {
      calls.push({ server, tool, args });
      return { ok: true };
    },
  });

  await adapter.readPowerBiRemote({ toolName: "GetSemanticModelSchema", args: { modelId: "1" } });
  await adapter.readFabricReference({ toolName: "docs_workloads", args: {} });
  await adapter.readFabricCore({ toolName: "search_catalog", args: { query: "sales" } });
  await adapter.readFabricRti({ toolName: "kusto_known_services", args: {} });
  const coreReview = adapter.reviewFabricCoreAction({
    toolName: "create_folder",
    args: { workspaceId: "w1", displayName: "Planning" },
  });
  await adapter.executeAfterReview({ toolName: coreReview.toolName, args: coreReview.args });

  assert.deepEqual(
    calls.map((call) => [call.server, call.tool]),
    [
      ["powerbi-remote", "GetSemanticModelSchema"],
      ["fabric-reference", "docs_workloads"],
      ["fabric-core", "search_catalog"],
      ["fabric-rti", "kusto_known_services"],
      ["fabric-core", "create_folder"],
    ]
  );
  await adapter.readFabricRti({ toolName: "kusto_query", args: { query: ".show tables" } });
  await assert.rejects(() =>
    adapter.readFabricRti({ toolName: "kusto_query", args: { query: ".drop table Sales" } })
  );
  await assert.rejects(() =>
    adapter.readFabricRti({
      toolName: "kusto_query",
      args: { query: "// inspect\n.purge table Sales" },
    })
  );
});

test("enterprise tool discovery reports current schemas and disabled additions", async () => {
  const adapter = createEnterpriseMcpAdapter({
    listTools: async () => [
      {
        name: "list_workspaces",
        description: "List workspaces",
        inputSchema: { type: "object", properties: {} },
      },
      { name: "future_write", description: "Future operation", inputSchema: { type: "object" } },
    ],
  });
  const tools = await adapter.describeTools({ service: "fabric-core" });
  assert.equal(tools[0].mode, "read");
  assert.equal(tools[1].mode, "not-enabled");
});
