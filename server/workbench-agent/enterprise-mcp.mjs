import { access, readFile } from "node:fs/promises";
import { delimiter, isAbsolute } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { sanitizeForClient, WorkbenchAgentError } from "./protocol.mjs";

const CONFIG_CANDIDATES = [
  process.env.FABRIC_TOOLBOX_MCP_CONFIG,
  "D:\\CascadeProjects\\fabric_toolbox\\.mcp.json",
  "C:\\Users\\snahrup\\CascadeProjects\\fabric_toolbox\\.mcp.json",
].filter(Boolean);

export const SQL_SOURCE_DEFINITIONS = Object.freeze({
  "ipc-cpr": {
    server: "mssql-ipc-cpr",
    host: "SQL2016LIVE",
    database: "IPC_CPR",
    label: "IPC CPR",
    description: "CPR application data",
  },
  eamprod12: {
    server: "mssql-eamprod12",
    host: "SQL2016LIVE",
    database: "EAMPROD12",
    label: "Enterprise asset management",
    description: "Live enterprise asset management data",
  },
  "di-prd-staging": {
    server: "mssql-di-prd-staging",
    host: "SQL2016LIVE",
    database: "DI_PRD_Staging",
    label: "M3 Cloud staging",
    description: "Live M3 Cloud staging for NAC and Molding Products",
  },
  xrite10: {
    server: "mssql-xrite10",
    host: "M3-DB2",
    database: "XRite10",
    label: "X-Rite color data",
    description: "Color matching source data",
  },
  "m3-etl": {
    server: "mssql-m3-etl",
    host: "SQL2016Dev",
    database: "M3TST-ETL",
    label: "M3 reporting replica",
    description: "M3 staging and reporting data",
  },
  mes: {
    server: "mssql-mes",
    host: "SQL2012Test",
    database: "MES",
    label: "MES test",
    description: "MES test data for Interplastic and HK Research",
  },
  "mes-test-snapshot": {
    server: "sql-gateway",
    host: "SQL2012Test",
    database: "MES_20260409",
    label: "MES test snapshot",
    description: "Dated MES test snapshot",
  },
  "diverdata-test": {
    server: "sql-gateway",
    host: "SQL2012Test",
    database: "DiverData",
    label: "DiverData test",
    description: "DiverData reporting source on the MES test server",
  },
  "distribution-test": {
    server: "sql-gateway",
    host: "SQL2012Test",
    database: "distribution",
    label: "SQL replication distribution test",
    description: "Replication distribution metadata on the MES test server",
  },
  "mes-live": {
    server: "sql-gateway",
    host: "SQLMESLive",
    database: "MES",
    label: "MES live",
    description: "Live manufacturing execution data for Interplastic and HK Research",
  },
  "m3-fdb": {
    server: "sql-gateway",
    host: "SQLMESLive",
    database: "M3FDBPRD",
    label: "M3 ERP live",
    description: "Live M3 ERP data with one-company financial reads only",
    companyScoped: true,
  },
  "chemmate-live": {
    server: "sql-gateway",
    host: "SQLMESLive",
    database: "Chemmate",
    label: "Chemmate live",
    description: "Live Chemmate data",
  },
  "distribution-live": {
    server: "sql-gateway",
    host: "SQLMESLive",
    database: "distribution",
    label: "SQL replication distribution live",
    description: "Replication distribution metadata on the live MES server",
  },
  "salesforce-prod": {
    server: "sql-gateway",
    host: "SQL2019LIVE",
    database: "SalesforcePRD",
    label: "Salesforce production mirror",
    description: "Production Salesforce data exposed through SQL",
  },
  "salesforce-test": {
    server: "sql-gateway",
    host: "SQL2019LIVE",
    database: "SalesforceTST",
    label: "Salesforce test mirror",
    description: "Test Salesforce data exposed through SQL",
  },
  "ia-chemmate-prod": {
    server: "sql-gateway",
    host: "SQL2019LIVE",
    database: "IA_ChemmatePRD",
    label: "IA Chemmate production",
    description: "Production IA Chemmate integration data",
  },
  "etq-prod": {
    server: "sql-gateway",
    host: "M3-DB3",
    database: "ETQStagingPRD",
    label: "ETQ production staging",
    description: "Production ETQ staging data",
  },
  "optiva-live": {
    server: "sql-gateway",
    host: "M3-DB3",
    database: "OptivaLive",
    label: "Optiva live",
    description: "Live Optiva formulation data",
  },
  scheduling55: {
    server: "sql-gateway",
    host: "M3-DB3",
    database: "Scheduling55",
    label: "Scheduling 55",
    description: "Production scheduling data",
  },
  "mes-logship": {
    server: "sql-gateway",
    host: "SQLLogShipPRD",
    database: "MES",
    label: "MES log-ship copy",
    description: "Read-only production MES log-ship copy",
  },
  "mes-snapshot-logship": {
    server: "sql-gateway",
    host: "SQLLogShipPRD",
    database: "MES_20260409",
    label: "MES snapshot log-ship copy",
    description: "Dated MES snapshot on the log-ship server",
  },
  "diverdata-logship": {
    server: "sql-gateway",
    host: "SQLLogShipPRD",
    database: "DiverData",
    label: "DiverData log-ship copy",
    description: "Read-only DiverData log-ship copy",
  },
  "distribution-logship": {
    server: "sql-gateway",
    host: "SQLLogShipPRD",
    database: "distribution",
    label: "SQL replication distribution log-ship",
    description: "Replication distribution metadata on the log-ship server",
  },
  powerdata: {
    server: "mssql-powerdata",
    host: "SQL2019Dev",
    database: "IPC_PowerData_TST",
    label: "IPC PowerData test",
    description: "Current readable dashboard and reporting test data",
  },
  "ia-chemmate-test": {
    server: "sql-gateway",
    host: "SQL2019Dev",
    database: "IA_ChemmateTST",
    label: "IA Chemmate test",
    description: "Test IA Chemmate integration data",
  },
});

export const SQL_SERVER_DEFINITIONS = Object.freeze({
  sql2016live: { host: "SQL2016LIVE", state: "verified" },
  "m3-db2": { host: "M3-DB2", state: "verified" },
  sql2019dev: { host: "SQL2019Dev", state: "verified" },
  "m3dev-db1": { host: "M3Dev-DB1", state: "no-readable-databases" },
  sql2016dev: { host: "SQL2016Dev", state: "verified" },
  sql2012test: { host: "SQL2012Test", state: "verified" },
  sqlmeslive: { host: "SQLMESLive", state: "verified" },
  sql2019live: { host: "SQL2019LIVE", state: "verified" },
  "m3-db3": { host: "M3-DB3", state: "verified" },
  sqllogshipprd: { host: "SQLLogShipPRD", state: "verified" },
  saga: { host: "SAGA", state: "different-login-needed" },
  prsql2: { host: "PRSQL2", state: "different-login-needed" },
  sqllab01: { host: "SQLLAB01", state: "different-login-needed" },
  sqlmpshar: { host: "SQLMPShar", state: "different-login-needed" },
  corpsql: { host: "CORPSQL", state: "different-login-needed" },
});

export const POWERBI_TOOL_NAMES = Object.freeze([
  "calculation_group_operations",
  "calendar_operations",
  "column_operations",
  "connection_operations",
  "culture_operations",
  "database_operations",
  "dax_query_operations",
  "function_operations",
  "measure_operations",
  "model_operations",
  "named_expression_operations",
  "object_translation_operations",
  "partition_operations",
  "perspective_operations",
  "query_group_operations",
  "relationship_operations",
  "security_role_operations",
  "table_operations",
  "trace_operations",
  "transaction_operations",
  "user_hierarchy_operations",
]);

export const POWERBI_REMOTE_TOOL_NAMES = Object.freeze([
  "ExecuteQuery",
  "GenerateQuery",
  "GetSemanticModelSchema",
  "GetReportMetadata",
]);

export const FABRIC_READ_TOOL_NAMES = Object.freeze([
  "list_workspaces",
  "get_workspace",
  "list_items",
  "get_item",
  "list_workspaces_with_identity",
  "get_workspace_identity",
  "list_lakehouses",
  "list_tables",
  "get_table_schema",
  "get_all_schemas",
  "list_shortcuts",
  "get_shortcut",
  "list_workspace_shortcuts",
  "list_job_instances",
  "get_job_instance",
  "list_item_schedules",
  "list_workspace_schedules",
  "list_environments",
  "get_environment_details",
  "list_compute_usage",
  "list_connections",
  "get_data_source_usage",
  "get_item_lineage",
  "list_item_dependencies",
  "list_capacities",
]);

export const FABRIC_REVIEW_TOOL_NAMES = Object.freeze([
  "clear_fabric_data_cache",
  "clear_name_resolution_cache",
]);

export const FABRIC_REFERENCE_READ_TOOL_NAMES = Object.freeze([
  "core_search-catalog",
  "datafactory_get-pipeline",
  "datafactory_list-dataflows",
  "datafactory_list-pipelines",
  "docs_api-examples",
  "docs_best-practices",
  "docs_item-definitions",
  "docs_platform-api-spec",
  "docs_workload-api-spec",
  "docs_workloads",
  "onelake_get_data_access_role",
  "onelake_get_settings",
  "onelake_get_shortcut",
  "onelake_get_table",
  "onelake_get_table_config",
  "onelake_get_table_namespace",
  "onelake_list_data_access_roles",
  "onelake_list_files",
  "onelake_list_items",
  "onelake_list_items_dfs",
  "onelake_list_shortcuts",
  "onelake_list_table_namespaces",
  "onelake_list_tables",
  "onelake_list_workspaces",
]);

export const FABRIC_REFERENCE_REVIEW_TOOL_NAMES = Object.freeze([
  "core_create-item",
  "datafactory_create-dataflow",
  "datafactory_create-pipeline",
  "datafactory_execute-query",
  "datafactory_run-pipeline",
  "onelake_create_directory",
  "onelake_create_or_update_data_access_role",
  "onelake_create_shortcut_adls_gen2",
  "onelake_create_shortcut_amazon_s3",
  "onelake_create_shortcut_azure_blob",
  "onelake_create_shortcut_dataverse",
  "onelake_create_shortcut_gcs",
  "onelake_create_shortcut_onedrive_sharepoint",
  "onelake_create_shortcut_onelake",
  "onelake_create_shortcut_s3_compatible",
  "onelake_delete_data_access_role",
  "onelake_delete_directory",
  "onelake_delete_file",
  "onelake_delete_shortcut",
  "onelake_download_file",
  "onelake_modify_diagnostics",
  "onelake_modify_immutability_policy",
  "onelake_reset_shortcut_cache",
  "onelake_upload_file",
]);

export const FABRIC_CORE_READ_TOOL_NAMES = Object.freeze([
  "list_workspaces",
  "get_workspace",
  "list_workspace_roles",
  "get_workspace_role",
  "list_items",
  "get_item",
  "get_item_definition",
  "list_folders",
  "get_folder",
  "list_capacities",
  "get_operation_state",
  "get_operation_result",
  "search_catalog",
  "get_knowledge",
]);

export const FABRIC_CORE_REVIEW_TOOL_NAMES = Object.freeze([
  "create_workspace",
  "update_workspace",
  "delete_workspace",
  "add_workspace_role",
  "update_workspace_role",
  "delete_workspace_role",
  "create_item",
  "update_item",
  "delete_item",
  "update_item_definition",
  "bulk_move_items",
  "create_folder",
  "update_folder",
  "delete_folder",
  "move_folder",
]);

export const FABRIC_RTI_READ_TOOL_NAMES = Object.freeze([
  "kusto_known_services",
  "kusto_query",
  "kusto_show_command",
  "kusto_list_entities",
  "kusto_describe_database",
  "kusto_describe_database_entity",
  "kusto_graph_query",
  "kusto_sample_entity",
  "kusto_deeplink_from_query",
  "kusto_show_queryplan",
  "kusto_diagnostics",
  "eventstream_list",
  "eventstream_get",
  "eventstream_get_definition",
  "eventstream_get_current_definition",
  "eventstream_validate_definition",
  "eventstream_list_available_components",
  "activator_list_artifacts",
  "map_list",
  "map_get",
  "map_get_definition",
]);

export const FABRIC_RTI_REVIEW_TOOL_NAMES = Object.freeze([
  "kusto_command",
  "kusto_ingest_inline_into_table",
  "eventstream_create",
  "eventstream_update",
  "eventstream_delete",
  "eventstream_start_definition",
  "eventstream_clear_definition",
  "eventstream_add_sample_data_source",
  "eventstream_add_custom_endpoint_source",
  "eventstream_add_derived_stream",
  "eventstream_add_eventhouse_destination",
  "eventstream_add_custom_endpoint_destination",
  "eventstream_create_from_definition",
  "activator_create_trigger",
  "map_create",
  "map_update_definition",
  "map_update",
  "map_delete",
]);

const POWERBI_TOOLS = new Set(POWERBI_TOOL_NAMES);
const POWERBI_REMOTE_TOOLS = new Set(POWERBI_REMOTE_TOOL_NAMES);
const FABRIC_READ_TOOLS = new Set(FABRIC_READ_TOOL_NAMES);
const FABRIC_REVIEW_TOOLS = new Set(FABRIC_REVIEW_TOOL_NAMES);
const FABRIC_REFERENCE_READ_TOOLS = new Set(FABRIC_REFERENCE_READ_TOOL_NAMES);
const FABRIC_REFERENCE_REVIEW_TOOLS = new Set(FABRIC_REFERENCE_REVIEW_TOOL_NAMES);
const FABRIC_CORE_READ_TOOLS = new Set(FABRIC_CORE_READ_TOOL_NAMES);
const FABRIC_CORE_REVIEW_TOOLS = new Set(FABRIC_CORE_REVIEW_TOOL_NAMES);
const FABRIC_RTI_READ_TOOLS = new Set(FABRIC_RTI_READ_TOOL_NAMES);
const FABRIC_RTI_REVIEW_TOOLS = new Set(FABRIC_RTI_REVIEW_TOOL_NAMES);
const SQL_SOURCES = new Set(Object.keys(SQL_SOURCE_DEFINITIONS));
const SQL_SERVERS = new Set(Object.keys(SQL_SERVER_DEFINITIONS));
const POWERBI_SERVER = "powerbi-modeling-mcp";
const POWERBI_REMOTE_SERVER = "powerbi-remote";
const FABRIC_SERVER = "fabric-mcp";
const FABRIC_REFERENCE_SERVER = "fabric-reference";
const FABRIC_CORE_SERVER = "fabric-core";
const FABRIC_RTI_SERVER = "fabric-rti";
const SQL_GATEWAY_SERVER = "sql-gateway";
const SQL_GATEWAY_SCRIPTS = [
  process.env.SQL_GATEWAY_MCP_PATH,
  "D:\\CascadeProjects\\fabric_toolbox\\mcp-servers\\sql-gateway\\server.py",
  "C:\\Users\\snahrup\\CascadeProjects\\fabric_toolbox\\mcp-servers\\sql-gateway\\server.py",
].filter(Boolean);
const FABRIC_RUNTIME_PATH =
  process.env.FABRIC_MCP_PROJECT_PATH || "C:\\MCPServers\\repos\\microsoft_fabric_mcp";
const NPX_CLI_PATH =
  process.env.NPX_CLI_PATH || "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js";
const POWERBI_MCP_PACKAGE = "@microsoft/powerbi-modeling-mcp@0.5.0-beta.12";
const FABRIC_REFERENCE_PACKAGE = "@microsoft/fabric-mcp@1.2.0";
const FABRIC_RTI_PACKAGE = "microsoft-fabric-rti-mcp==0.6.2";
export const SQL_DAB_VERSION = "2.0.9";
export const SQL_DAB_OPERATIONS = Object.freeze([
  "describe_entities",
  "create_record",
  "read_records",
  "update_record",
  "delete_record",
  "execute_entity",
  "aggregate_records",
]);
const MAX_QUERY_LENGTH = 12_000;
const MAX_SQL_ROWS = 200;
const FINANCIAL_QUERY_RE =
  /\b(amount|revenue|sales|cost|margin|price|profit|invoice|balance|ledger|general\s+ledger|gl\w*)\b/i;

let sharedAdapter;

const ENTERPRISE_SERVICE_SPECS = Object.freeze({
  "powerbi-local": {
    label: "Power BI modeling",
    serverName: POWERBI_SERVER,
    readTools: POWERBI_TOOLS,
    reviewTools: POWERBI_TOOLS,
    mixed: true,
  },
  "powerbi-remote": {
    label: "Power BI hosted query service",
    serverName: POWERBI_REMOTE_SERVER,
    readTools: POWERBI_REMOTE_TOOLS,
    reviewTools: new Set(),
  },
  "fabric-live": {
    label: "Fabric live operations",
    serverName: FABRIC_SERVER,
    readTools: FABRIC_READ_TOOLS,
    reviewTools: FABRIC_REVIEW_TOOLS,
  },
  "fabric-reference": {
    label: "Fabric development and OneLake",
    serverName: FABRIC_REFERENCE_SERVER,
    readTools: FABRIC_REFERENCE_READ_TOOLS,
    reviewTools: FABRIC_REFERENCE_REVIEW_TOOLS,
  },
  "fabric-core": {
    label: "Fabric Core hosted service",
    serverName: FABRIC_CORE_SERVER,
    readTools: FABRIC_CORE_READ_TOOLS,
    reviewTools: FABRIC_CORE_REVIEW_TOOLS,
  },
  "fabric-rti": {
    label: "Fabric Real-Time Intelligence",
    serverName: FABRIC_RTI_SERVER,
    readTools: FABRIC_RTI_READ_TOOLS,
    reviewTools: FABRIC_RTI_REVIEW_TOOLS,
  },
});

export const ENTERPRISE_SERVICE_NAMES = Object.freeze(Object.keys(ENTERPRISE_SERVICE_SPECS));

function assertEnterpriseService(service) {
  const value = String(service || "").trim();
  const spec = ENTERPRISE_SERVICE_SPECS[value];
  if (!spec) {
    throw new WorkbenchAgentError(
      400,
      "Enterprise service is not registered.",
      "enterprise_service_denied"
    );
  }
  return { id: value, ...spec };
}

function cleanOperation(value) {
  return String(value || "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function requestOperation(args) {
  return cleanOperation(args?.request?.operation);
}

function hasFileOutput(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasFileOutput);
  return Object.entries(value).some(
    ([key, nested]) => /(?:file|folder)path/i.test(key) && String(nested || "").trim()
  );
}

export function isPowerBiRead(toolName, args = {}) {
  if (!POWERBI_TOOLS.has(String(toolName || "")) || hasFileOutput(args)) return false;
  const operation = requestOperation(args);
  if (!operation) return false;

  if (toolName === "dax_query_operations") {
    return operation === "help" || operation === "execute" || operation === "validate";
  }
  if (toolName === "connection_operations") {
    return new Set([
      "help",
      "list",
      "listlocalinstances",
      "get",
      "getlastusedconnection",
      "connect",
      "connectfabric",
    ]).has(operation);
  }
  if (toolName === "trace_operations") {
    return (
      new Set(["help", "get", "list", "fetch", "report"]).has(operation) &&
      args?.request?.clearAfterFetch !== true
    );
  }
  if (toolName === "transaction_operations") {
    return new Set(["help", "getstatus", "listactive"]).has(operation);
  }

  return (
    operation === "help" ||
    operation === "list" ||
    operation === "get" ||
    operation === "find" ||
    operation === "getschema" ||
    operation === "getcolumns" ||
    operation === "geteffectivepermissions" ||
    operation === "listpermissions" ||
    operation === "getpermission" ||
    operation.startsWith("list") ||
    operation.startsWith("get") ||
    operation === "batchget" ||
    operation.startsWith("batchget")
  );
}

export function validateReadOnlySql(query) {
  const value = String(query || "").trim();
  if (!value) {
    throw new WorkbenchAgentError(400, "A SQL query is required.", "sql_query_required");
  }
  if (value.length > MAX_QUERY_LENGTH) {
    throw new WorkbenchAgentError(400, "The SQL query is too long.", "sql_query_too_long");
  }
  if (/--|\/\*/.test(value)) {
    throw new WorkbenchAgentError(400, "SQL comments are not accepted.", "sql_comments_denied");
  }

  const scrubbed = value
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/\[(?:\]\]|[^\]])*\]/g, "[]")
    .trim();
  const withoutTrailingSemicolon = scrubbed.replace(/;\s*$/, "");
  if (withoutTrailingSemicolon.includes(";")) {
    throw new WorkbenchAgentError(
      400,
      "Only one SQL statement can run at a time.",
      "sql_batch_denied"
    );
  }
  if (!/^(select|with)\b/i.test(withoutTrailingSemicolon)) {
    throw new WorkbenchAgentError(403, "Only SELECT or WITH queries can run.", "sql_write_denied");
  }

  const denied =
    /\b(insert|update|delete|merge|drop|alter|create|truncate|exec|execute|grant|revoke|deny|backup|restore|dbcc|kill|reconfigure|shutdown|bulk)\b/i;
  if (
    denied.test(withoutTrailingSemicolon) ||
    /\bselect\b[\s\S]*\binto\b/i.test(withoutTrailingSemicolon)
  ) {
    throw new WorkbenchAgentError(
      403,
      "The SQL query includes a change operation.",
      "sql_write_denied"
    );
  }

  const topMatches = Array.from(withoutTrailingSemicolon.matchAll(/\btop\s*\(?\s*(\d+)\s*\)?/gi));
  if (topMatches.some((match) => Number(match[1]) > MAX_SQL_ROWS)) {
    throw new WorkbenchAgentError(
      400,
      `SQL reads are limited to ${MAX_SQL_ROWS} rows.`,
      "sql_row_limit"
    );
  }
  const fetchMatches = Array.from(
    withoutTrailingSemicolon.matchAll(/\bfetch\s+next\s+(\d+)\s+rows?\s+only\b/gi)
  );
  if (fetchMatches.some((match) => Number(match[1]) > MAX_SQL_ROWS)) {
    throw new WorkbenchAgentError(
      400,
      `SQL reads are limited to ${MAX_SQL_ROWS} rows.`,
      "sql_row_limit"
    );
  }

  const aggregateWithoutGroups =
    /\b(count|sum|avg|min|max)\s*\(/i.test(withoutTrailingSemicolon) &&
    !/\bgroup\s+by\b/i.test(withoutTrailingSemicolon);
  const singleValue = !/\bfrom\b/i.test(withoutTrailingSemicolon);
  const hasLimit = topMatches.length > 0 || fetchMatches.length > 0;
  if (!aggregateWithoutGroups && !singleValue && !hasLimit) {
    throw new WorkbenchAgentError(
      400,
      `SQL detail reads must include TOP ${MAX_SQL_ROWS} or fewer rows.`,
      "sql_limit_required"
    );
  }
  return value;
}

export function validateFinancialRead(source, query) {
  const sourceId = assertSqlSource(source);
  const value = String(query || "");
  if (/\b(information_schema|sys\.)\b/i.test(value)) return;
  const needsCompany =
    SQL_SOURCE_DEFINITIONS[sourceId]?.companyScoped === true || FINANCIAL_QUERY_RE.test(value);
  if (!needsCompany) return;
  const oneCompanyFilter =
    /\b(?:cono|company(?:_id|_code)?|entity(?:_id|_code)?)\b\s*=\s*(?:\d+|'(?:''|[^'])*'|@[a-z0-9_]+)/i;
  if (!oneCompanyFilter.test(value)) {
    throw new WorkbenchAgentError(
      403,
      "Financial SQL reads require one explicit company equality filter.",
      "sql_company_filter_required"
    );
  }
}

function assertSqlSource(source) {
  const value = String(source || "")
    .trim()
    .toLowerCase();
  if (!SQL_SOURCES.has(value)) {
    throw new WorkbenchAgentError(400, "SQL source is not registered.", "sql_source_denied");
  }
  return value;
}

function assertSqlServer(server) {
  const requested = String(server || "").trim();
  const id = requested.toLowerCase();
  if (SQL_SERVERS.has(id)) return SQL_SERVER_DEFINITIONS[id];
  const match = Object.values(SQL_SERVER_DEFINITIONS).find(
    (entry) => entry.host.toLowerCase() === id
  );
  if (!match) {
    throw new WorkbenchAgentError(400, "SQL server is not registered.", "sql_server_denied");
  }
  return match;
}

function assertPowerBiTool(toolName) {
  const value = String(toolName || "").trim();
  if (!POWERBI_TOOLS.has(value)) {
    throw new WorkbenchAgentError(400, "Power BI tool is not registered.", "powerbi_tool_denied");
  }
  return value;
}

function assertPowerBiRemoteTool(toolName) {
  const value = String(toolName || "").trim();
  if (!POWERBI_REMOTE_TOOLS.has(value)) {
    throw new WorkbenchAgentError(
      400,
      "Remote Power BI tool is not registered.",
      "powerbi_remote_tool_denied"
    );
  }
  return value;
}

function assertFabricReadTool(toolName) {
  const value = String(toolName || "").trim();
  if (!FABRIC_READ_TOOLS.has(value)) {
    throw new WorkbenchAgentError(400, "Fabric read tool is not registered.", "fabric_tool_denied");
  }
  return value;
}

function assertFabricReviewTool(toolName) {
  const value = String(toolName || "").trim();
  if (!FABRIC_REVIEW_TOOLS.has(value)) {
    throw new WorkbenchAgentError(400, "Fabric action is not registered.", "fabric_action_denied");
  }
  return value;
}

function assertListedTool(toolName, allowed, message, code) {
  const value = String(toolName || "").trim();
  if (!allowed.has(value)) throw new WorkbenchAgentError(400, message, code);
  return value;
}

function assertFabricReferenceReadTool(toolName) {
  return assertListedTool(
    toolName,
    FABRIC_REFERENCE_READ_TOOLS,
    "Fabric development read tool is not registered.",
    "fabric_reference_read_denied"
  );
}

function assertFabricReferenceReviewTool(toolName) {
  return assertListedTool(
    toolName,
    FABRIC_REFERENCE_REVIEW_TOOLS,
    "Fabric development action is not registered.",
    "fabric_reference_action_denied"
  );
}

function assertFabricCoreReadTool(toolName) {
  return assertListedTool(
    toolName,
    FABRIC_CORE_READ_TOOLS,
    "Fabric Core read tool is not registered.",
    "fabric_core_read_denied"
  );
}

function assertFabricCoreReviewTool(toolName) {
  return assertListedTool(
    toolName,
    FABRIC_CORE_REVIEW_TOOLS,
    "Fabric Core action is not registered.",
    "fabric_core_action_denied"
  );
}

function assertFabricRtiReadTool(toolName) {
  return assertListedTool(
    toolName,
    FABRIC_RTI_READ_TOOLS,
    "Fabric RTI read tool is not registered.",
    "fabric_rti_read_denied"
  );
}

function assertFabricRtiReviewTool(toolName) {
  return assertListedTool(
    toolName,
    FABRIC_RTI_REVIEW_TOOLS,
    "Fabric RTI action is not registered.",
    "fabric_rti_action_denied"
  );
}

function validateRtiRead(toolName, args = {}) {
  if (
    !new Set([
      "kusto_query",
      "kusto_graph_query",
      "kusto_deeplink_from_query",
      "kusto_show_queryplan",
    ]).has(toolName)
  ) {
    return;
  }
  const query = String(args.query || args.kql || "").trim();
  if (
    /(?:^|[;\r\n])\s*\.(?:alter|append|clear|create|delete|disable|drop|enable|execute|ingest|move|purge|rename|replace|set)\b/i.test(
      query
    )
  ) {
    throw new WorkbenchAgentError(
      403,
      "Kusto changes need a review card.",
      "fabric_rti_review_required"
    );
  }
}

function actionRisk(toolName, args) {
  const text = `${toolName} ${args?.request?.operation || ""}`.toLowerCase();
  if (/delete|deploy|import|security|permission|rollback|clear|remove/.test(text)) return "high";
  return "medium";
}

function reviewPreview(source, toolName, args) {
  return `${source}\nOperation: ${toolName}\nArguments:\n${JSON.stringify(
    sanitizeForClient(args || {}),
    null,
    2
  ).slice(0, 7_500)}`;
}

function selectedTarget(args, keys) {
  const request = args?.request && typeof args.request === "object" ? args.request : {};
  return Object.fromEntries(
    keys
      .map((key) => [key, request[key]])
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
  );
}

async function findConfigPath(candidates = CONFIG_CANDIDATES) {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known local configuration file.
    }
  }
  throw new WorkbenchAgentError(
    503,
    "Fabric Toolbox MCP configuration is unavailable.",
    "enterprise_mcp_config_missing"
  );
}

async function firstExisting(candidates, message, code) {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known local path.
    }
  }
  throw new WorkbenchAgentError(503, message, code);
}

async function executableAvailable(command) {
  if (isAbsolute(command)) {
    try {
      await access(command);
      return true;
    } catch {
      return false;
    }
  }
  const pathEntries = String(process.env.PATH || "").split(delimiter);
  const names =
    process.platform === "win32" ? [command, `${command}.exe`, `${command}.cmd`] : [command];
  for (const entry of pathEntries) {
    for (const name of names) {
      try {
        await access(`${entry}\\${name}`);
        return true;
      } catch {
        // Continue looking through PATH.
      }
    }
  }
  return false;
}

function stringEnvironment(values = {}) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => typeof value === "string" && value.length > 0)
  );
}

function safeMcpFailureMessage(serverName) {
  if (serverName === SQL_GATEWAY_SERVER) {
    return "SQL read failed. Check VPN and source availability.";
  }
  if (serverName === POWERBI_SERVER || serverName === POWERBI_REMOTE_SERVER) {
    return "Power BI request failed. Open the target model and try again.";
  }
  if (
    serverName === FABRIC_SERVER ||
    serverName === FABRIC_REFERENCE_SERVER ||
    serverName === FABRIC_CORE_SERVER ||
    serverName === FABRIC_RTI_SERVER
  ) {
    return "Fabric request failed. Check sign-in and workspace access.";
  }
  return "Enterprise data request failed.";
}

function assertMcpResultOk(serverName, result) {
  const safeResult = sanitizeForClient(result);
  const reportedError =
    safeResult?.isError === true ||
    (Array.isArray(safeResult?.content) &&
      safeResult.content.some(
        (entry) => entry?.type === "text" && /^\s*error\b/i.test(String(entry.text || ""))
      ));
  if (reportedError) {
    throw new WorkbenchAgentError(
      502,
      safeMcpFailureMessage(serverName),
      "enterprise_mcp_call_failed"
    );
  }
  return safeResult;
}

export function createEnterpriseMcpAdapter(options = {}) {
  const clients = new Map();
  const tokenCache = new Map();
  const fetchImpl = options.fetchImpl || fetch;
  let configPromise;

  async function loadConfig() {
    if (options.config) return options.config;
    if (!configPromise) {
      configPromise = (async () => {
        const path = await findConfigPath(options.configCandidates);
        const parsed = JSON.parse(await readFile(path, "utf8"));
        return parsed?.mcpServers || {};
      })();
    }
    return configPromise;
  }

  async function azureAccessToken(scope) {
    const cached = tokenCache.get(scope);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
    const servers = await loadConfig();
    const credentials = servers?.[FABRIC_SERVER]?.env || {};
    if (
      !credentials.AZURE_CLIENT_ID ||
      !credentials.AZURE_TENANT_ID ||
      !credentials.AZURE_CLIENT_SECRET
    ) {
      throw new WorkbenchAgentError(
        503,
        "Microsoft data service credentials are not configured.",
        "microsoft_data_credentials_missing"
      );
    }
    const body = new URLSearchParams({
      client_id: credentials.AZURE_CLIENT_ID,
      client_secret: credentials.AZURE_CLIENT_SECRET,
      grant_type: "client_credentials",
      scope,
    });
    const response = await fetchImpl(
      `https://login.microsoftonline.com/${encodeURIComponent(
        credentials.AZURE_TENANT_ID
      )}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }
    );
    if (!response.ok) {
      throw new WorkbenchAgentError(
        503,
        "Microsoft data service sign-in failed.",
        "microsoft_data_signin_failed"
      );
    }
    const data = await response.json();
    if (!data?.access_token) {
      throw new WorkbenchAgentError(
        503,
        "Microsoft data service sign-in returned no access token.",
        "microsoft_data_token_missing"
      );
    }
    tokenCache.set(scope, {
      value: data.access_token,
      expiresAt: Date.now() + Math.max(300, Number(data.expires_in || 3_600)) * 1_000,
    });
    return data.access_token;
  }

  async function serverConfig(serverName) {
    const servers = await loadConfig();
    if (serverName === SQL_GATEWAY_SERVER) {
      const credentials = servers?.["mssql-powerdata"]?.env || {};
      return {
        command: options.uvCommand || "uv",
        args: [
          "run",
          "--with",
          "mcp==1.24.0",
          "--with",
          "pyodbc>=5.1",
          await firstExisting(
            options.sqlGatewayScripts || SQL_GATEWAY_SCRIPTS,
            "SQL gateway MCP script is unavailable.",
            "sql_gateway_missing"
          ),
        ],
        env: {
          MSSQL_USER: credentials.MSSQL_USER,
          MSSQL_PASSWORD: credentials.MSSQL_PASSWORD,
          SQL_GATEWAY_MAX_ROWS: String(MAX_SQL_ROWS),
        },
      };
    }
    if (serverName === FABRIC_SERVER) {
      const configured = servers?.[FABRIC_SERVER] || {};
      await access(options.fabricProjectPath || FABRIC_RUNTIME_PATH);
      return {
        command: options.uvCommand || "uv",
        args: [
          "run",
          "--project",
          options.fabricProjectPath || FABRIC_RUNTIME_PATH,
          "microsoft-fabric-mcp",
        ],
        env: configured.env || {},
      };
    }
    if (serverName === POWERBI_SERVER) {
      await access(options.npxCliPath || NPX_CLI_PATH);
      return {
        command: process.execPath,
        args: [options.npxCliPath || NPX_CLI_PATH, "-y", POWERBI_MCP_PACKAGE, "--start"],
      };
    }
    if (serverName === POWERBI_REMOTE_SERVER) {
      return {
        url: "https://api.fabric.microsoft.com/v1/mcp/powerbi",
        scope: "https://analysis.windows.net/powerbi/api/.default",
      };
    }
    if (serverName === FABRIC_REFERENCE_SERVER) {
      await access(options.npxCliPath || NPX_CLI_PATH);
      return {
        command: process.execPath,
        args: [
          options.npxCliPath || NPX_CLI_PATH,
          "-y",
          FABRIC_REFERENCE_PACKAGE,
          "server",
          "start",
          "--mode",
          "all",
        ],
      };
    }
    if (serverName === FABRIC_CORE_SERVER) {
      return {
        url: "https://api.fabric.microsoft.com/v1/mcp/core",
        scope: "https://api.fabric.microsoft.com/.default",
      };
    }
    if (serverName === FABRIC_RTI_SERVER) {
      const configured = servers?.[FABRIC_SERVER] || {};
      return {
        command: options.uvCommand || "uv",
        args: ["tool", "run", "--from", FABRIC_RTI_PACKAGE, "microsoft-fabric-rti-mcp"],
        env: {
          ...(configured.env || {}),
          KUSTO_ALLOW_UNKNOWN_SERVICES: "false",
          KUSTO_EAGER_CONNECT: "false",
        },
      };
    }
    const config = servers?.[serverName];
    if (!config?.command || !Array.isArray(config.args)) {
      throw new WorkbenchAgentError(
        503,
        `${serverName} is not configured.`,
        "enterprise_mcp_server_missing"
      );
    }
    return config;
  }

  async function connectedClient(serverName) {
    if (clients.has(serverName)) return clients.get(serverName);
    const promise = (async () => {
      const config = await serverConfig(serverName);
      let transport;
      if (config.url) {
        const accessToken = await azureAccessToken(config.scope);
        transport = new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
        });
      } else {
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          cwd: config.cwd,
          stderr: "pipe",
          env: {
            ...stringEnvironment(process.env),
            ...stringEnvironment(config.env),
          },
        });
        transport.stderr?.resume();
      }
      const client = new Client(
        { name: `ipcorp-workbench-${serverName}`, version: "0.1.0" },
        { capabilities: {} }
      );
      await client.connect(transport);
      const listed = await client.listTools();
      return {
        client,
        tools: new Map((listed.tools || []).map((tool) => [tool.name, tool])),
      };
    })().catch((error) => {
      clients.delete(serverName);
      throw error;
    });
    clients.set(serverName, promise);
    return promise;
  }

  async function callTool(serverName, toolName, args) {
    if (options.callTool) {
      return assertMcpResultOk(serverName, await options.callTool(serverName, toolName, args));
    }
    const connected = await connectedClient(serverName);
    if (!connected.tools.has(toolName)) {
      throw new WorkbenchAgentError(
        502,
        `${toolName} is not available from ${serverName}.`,
        "enterprise_mcp_tool_missing"
      );
    }
    return assertMcpResultOk(
      serverName,
      await connected.client.callTool({ name: toolName, arguments: args || {} })
    );
  }

  async function describeServiceTools(service) {
    const spec = assertEnterpriseService(service);
    const listed = options.listTools
      ? await options.listTools(spec.serverName)
      : Array.from((await connectedClient(spec.serverName)).tools.values());
    return (listed || []).map((definition) => {
      const name = String(definition?.name || "");
      const enabled = spec.readTools.has(name) || spec.reviewTools.has(name);
      const mode = !enabled
        ? "not-enabled"
        : spec.mixed
          ? "read-or-review-by-operation"
          : spec.readTools.has(name)
            ? "read"
            : "review";
      return {
        name,
        description: String(definition?.description || "").slice(0, 1_200),
        inputSchema: sanitizeForClient(definition?.inputSchema || {}),
        mode,
      };
    });
  }

  function reviewServiceAction(service, toolName, args = {}) {
    const spec = assertEnterpriseService(service);
    const safeTool = assertListedTool(
      toolName,
      spec.reviewTools,
      `${spec.label} action is not registered.`,
      "enterprise_service_action_denied"
    );
    const request = args?.request && typeof args.request === "object" ? args.request : {};
    const combined = { ...args, ...request };
    const target = Object.fromEntries(
      [
        "workspace",
        "workspaceId",
        "itemId",
        "itemName",
        "folderId",
        "database",
        "table",
        "eventstreamId",
        "mapId",
      ]
        .map((key) => [key, combined[key]])
        .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    );
    return {
      toolName: `enterprise.${spec.id}.action`,
      actionKind: "external-update",
      args: { toolName: safeTool, args },
      target: { connector: spec.id, operation: safeTool, ...target },
      risk: actionRisk(safeTool, args),
      summary: `Run the displayed ${spec.label} operation after confirmation.`,
      title: `${spec.label}: ${safeTool}`,
      preview: reviewPreview(spec.label, safeTool, args),
    };
  }

  return {
    listServices: () =>
      ENTERPRISE_SERVICE_NAMES.map((id) => ({ id, label: ENTERPRISE_SERVICE_SPECS[id].label })),
    describeTools: ({ service }) => describeServiceTools(service),
    listSqlServers: () =>
      Object.entries(SQL_SERVER_DEFINITIONS).map(([id, server]) => ({ id, ...server })),
    listSources: () =>
      Object.entries(SQL_SOURCE_DEFINITIONS).map(([id, source]) => ({
        id,
        host: source.host,
        database: source.database,
        label: source.label,
        description: source.description,
      })),
    sqlMcpRuntime: () => ({
      implementation: "Microsoft Data API Builder",
      version: SQL_DAB_VERSION,
      operations: SQL_DAB_OPERATIONS,
      mode: "explicit entities",
      profileState: "awaiting VPN schema discovery",
    }),
    listSqlDatabases: async ({ server }) => {
      const selected = assertSqlServer(server);
      return callTool(SQL_GATEWAY_SERVER, "list_databases", { server: selected.host });
    },
    listSqlTables: async ({ source, nameLike }) => {
      const sourceId = assertSqlSource(source);
      const selected = SQL_SOURCE_DEFINITIONS[sourceId];
      return callTool(SQL_GATEWAY_SERVER, "list_tables", {
        server: selected.host,
        database: selected.database,
        ...(String(nameLike || "").trim() ? { name_like: String(nameLike).trim() } : {}),
      });
    },
    querySql: async ({ source, query }) => {
      const sourceId = assertSqlSource(source);
      const safeQuery = validateReadOnlySql(query);
      validateFinancialRead(sourceId, safeQuery);
      const selected = SQL_SOURCE_DEFINITIONS[sourceId];
      return callTool(SQL_GATEWAY_SERVER, "query", {
        server: selected.host,
        database: selected.database,
        sql: safeQuery,
        max_rows: MAX_SQL_ROWS,
      });
    },
    readPowerBi: async ({ toolName, args }) => {
      const safeTool = assertPowerBiTool(toolName);
      if (!isPowerBiRead(safeTool, args)) {
        throw new WorkbenchAgentError(
          403,
          "That Power BI operation needs a review card.",
          "powerbi_review_required"
        );
      }
      return callTool(POWERBI_SERVER, safeTool, args || {});
    },
    readPowerBiRemote: async ({ toolName, args }) =>
      callTool(POWERBI_REMOTE_SERVER, assertPowerBiRemoteTool(toolName), args || {}),
    reviewPowerBiChange: ({ toolName, args }) => {
      const safeTool = assertPowerBiTool(toolName);
      if (isPowerBiRead(safeTool, args)) {
        throw new WorkbenchAgentError(
          400,
          "Use the Power BI read tool for this operation.",
          "powerbi_read_expected"
        );
      }
      return {
        toolName: "powerbi.change",
        actionKind: "powerbi-change",
        args: { toolName: safeTool, args: args || {} },
        target: {
          connector: "powerbi",
          operation: String(args?.request?.operation || safeTool),
          ...selectedTarget(args, [
            "connectionName",
            "databaseName",
            "tableName",
            "measureName",
            "columnName",
            "relationshipName",
            "roleName",
            "perspectiveName",
          ]),
        },
        risk: actionRisk(safeTool, args),
        summary: "Run the displayed Power BI model operation after confirmation.",
        title: `Power BI: ${String(args?.request?.operation || safeTool)}`,
        preview: reviewPreview("Power BI semantic model", safeTool, args),
      };
    },
    readFabric: async ({ toolName, args }) =>
      callTool(FABRIC_SERVER, assertFabricReadTool(toolName), args || {}),
    reviewFabricAction: ({ toolName, args }) => {
      const safeTool = assertFabricReviewTool(toolName);
      return {
        toolName: "fabric.admin",
        actionKind: "fabric-admin",
        args: { toolName: safeTool, args: args || {} },
        target: {
          connector: "fabric",
          operation: safeTool,
          ...Object.fromEntries(
            ["workspace", "lakehouse", "item_name"]
              .map((key) => [key, args?.[key]])
              .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
          ),
        },
        risk: "high",
        summary: "Run the displayed Fabric administration action after confirmation.",
        title:
          safeTool === "clear_fabric_data_cache"
            ? "Refresh Fabric data caches"
            : "Refresh Fabric name lookups",
        preview: reviewPreview("Microsoft Fabric", safeTool, args),
      };
    },
    readFabricReference: async ({ toolName, args }) =>
      callTool(FABRIC_REFERENCE_SERVER, assertFabricReferenceReadTool(toolName), args || {}),
    reviewFabricReferenceAction: ({ toolName, args }) =>
      reviewServiceAction(
        "fabric-reference",
        assertFabricReferenceReviewTool(toolName),
        args || {}
      ),
    readFabricCore: async ({ toolName, args }) =>
      callTool(FABRIC_CORE_SERVER, assertFabricCoreReadTool(toolName), args || {}),
    reviewFabricCoreAction: ({ toolName, args }) =>
      reviewServiceAction("fabric-core", assertFabricCoreReviewTool(toolName), args || {}),
    readFabricRti: async ({ toolName, args }) => {
      const safeTool = assertFabricRtiReadTool(toolName);
      validateRtiRead(safeTool, args || {});
      return callTool(FABRIC_RTI_SERVER, safeTool, args || {});
    },
    reviewFabricRtiAction: ({ toolName, args }) =>
      reviewServiceAction("fabric-rti", assertFabricRtiReviewTool(toolName), args || {}),
    executeAfterReview: async (record) => {
      if (record.toolName === "powerbi.change") {
        const toolName = assertPowerBiTool(record.args?.toolName);
        if (isPowerBiRead(toolName, record.args?.args)) {
          throw new WorkbenchAgentError(
            409,
            "Confirmed Power BI operation no longer matches a change.",
            "powerbi_review_mismatch"
          );
        }
        return callTool(POWERBI_SERVER, toolName, record.args?.args || {});
      }
      if (record.toolName === "fabric.admin") {
        const toolName = assertFabricReviewTool(record.args?.toolName);
        return callTool(FABRIC_SERVER, toolName, record.args?.args || {});
      }
      if (record.toolName === "enterprise.fabric-reference.action") {
        const toolName = assertFabricReferenceReviewTool(record.args?.toolName);
        return callTool(FABRIC_REFERENCE_SERVER, toolName, record.args?.args || {});
      }
      if (record.toolName === "enterprise.fabric-core.action") {
        const toolName = assertFabricCoreReviewTool(record.args?.toolName);
        return callTool(FABRIC_CORE_SERVER, toolName, record.args?.args || {});
      }
      if (record.toolName === "enterprise.fabric-rti.action") {
        const toolName = assertFabricRtiReviewTool(record.args?.toolName);
        return callTool(FABRIC_RTI_SERVER, toolName, record.args?.args || {});
      }
      throw new WorkbenchAgentError(
        400,
        "Enterprise review action is not registered.",
        "enterprise_review_unknown"
      );
    },
    close: async () => {
      const connected = await Promise.allSettled(clients.values());
      await Promise.allSettled(
        connected
          .filter((result) => result.status === "fulfilled")
          .map((result) => result.value.client.close())
      );
      clients.clear();
    },
    status: async () => {
      const servers = await loadConfig();
      const sqlCredentials = servers?.["mssql-powerdata"]?.env || {};
      const sqlCredentialsConfigured = Boolean(
        sqlCredentials.MSSQL_USER && sqlCredentials.MSSQL_PASSWORD
      );
      const microsoftCredentials = servers?.[FABRIC_SERVER]?.env || {};
      const microsoftCredentialsConfigured = Boolean(
        microsoftCredentials.AZURE_CLIENT_ID &&
          microsoftCredentials.AZURE_TENANT_ID &&
          microsoftCredentials.AZURE_CLIENT_SECRET
      );
      const runtimeAvailable = async (serverName) => {
        try {
          const config = await serverConfig(serverName);
          return config.url
            ? microsoftCredentialsConfigured
            : await executableAvailable(config.command);
        } catch {
          return false;
        }
      };
      const [sqlRuntimeConfigured, dabRuntimeReady, powerBiLocal, powerBiRemote, ...fabricStates] =
        await Promise.all([
          runtimeAvailable(SQL_GATEWAY_SERVER),
          executableAvailable(options.dabCommand || "dab"),
          runtimeAvailable(POWERBI_SERVER),
          runtimeAvailable(POWERBI_REMOTE_SERVER),
          runtimeAvailable(FABRIC_SERVER),
          runtimeAvailable(FABRIC_REFERENCE_SERVER),
          runtimeAvailable(FABRIC_CORE_SERVER),
          runtimeAvailable(FABRIC_RTI_SERVER),
        ]);
      const configuredSourceCount = sqlCredentialsConfigured
        ? Object.keys(SQL_SOURCE_DEFINITIONS).length
        : 0;
      const configuredPowerBiServices = [powerBiLocal, powerBiRemote].filter(Boolean).length;
      const configuredFabricServices = fabricStates.filter(Boolean).length;
      return {
        sql: {
          state: sqlRuntimeConfigured && sqlCredentialsConfigured ? "limited" : "unavailable",
          detail:
            sqlRuntimeConfigured && sqlCredentialsConfigured
              ? `${configuredSourceCount} read-only database sources across ${
                  Object.keys(SQL_SERVER_DEFINITIONS).length
                } known servers are configured. VPN access is checked when requested.`
              : "The SQL runtime or read credentials are unavailable.",
          summary: {
            configuredSources: configuredSourceCount,
            knownServers: Object.keys(SQL_SERVER_DEFINITIONS).length,
            mode: "read-only",
            vpnRequired: true,
            dataApiBuilder: {
              runtimeReady: dabRuntimeReady,
              version: SQL_DAB_VERSION,
              operations: SQL_DAB_OPERATIONS,
              profileState: "awaiting VPN schema discovery",
            },
          },
        },
        powerbi: {
          state: configuredPowerBiServices === 2 ? "limited" : "unavailable",
          detail:
            configuredPowerBiServices === 2
              ? "Local semantic modeling and the hosted Power BI query service are configured. Model access is checked when requested."
              : `${configuredPowerBiServices} of 2 Power BI services are configured.`,
          summary: { configuredServices: configuredPowerBiServices, availableServices: 2 },
        },
        fabric: {
          state: configuredFabricServices === 4 ? "limited" : "unavailable",
          detail:
            configuredFabricServices === 4
              ? "Live Fabric operations, hosted Fabric Core, official development tools, and Real-Time Intelligence are configured. Access is checked when requested."
              : `${configuredFabricServices} of 4 Fabric services are configured.`,
          summary: { configuredServices: configuredFabricServices, availableServices: 4 },
        },
      };
    },
  };
}

export function getEnterpriseMcpAdapter(options = {}) {
  if (options.enterprise) return options.enterprise;
  if (!sharedAdapter) sharedAdapter = createEnterpriseMcpAdapter(options.enterpriseOptions || {});
  return sharedAdapter;
}
