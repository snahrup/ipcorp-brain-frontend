import { execFile as execFileCallback } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { dispatch as dispatchAgent, getRun, listRuns } from "./agent-dispatch.mjs";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.IPCORP_JIRA_GATEWAY_PORT || "8817", 10);
const INITIATIVE_KEY = "MT";
const SETTINGS_PATH =
  process.env.PRISM_JIRA_SETTINGS_PATH ||
  "D:\\CascadeProjects\\Prism\\.prism-data\\prism-settings.json";
const TEAM_LIBRARY_PATH =
  process.env.IPCORP_TEAM_LIBRARY_PATH ||
  "C:\\Users\\snahrup\\OneDrive - IP-Corporation\\IT Internal - MDM - Master Data Management\\Team Library";
const BRAIN_REPO_PATH =
  process.env.IPCORP_BRAIN_PATH ||
  "C:\\Users\\snahrup\\OneDrive - IP-Corporation\\ipcorp-architecture-brain";
const MEETING_INFOGRAPHICS_PATH =
  process.env.IPCORP_MEETING_INFOGRAPHICS_PATH ||
  "C:\\Users\\snahrup\\OneDrive - IP-Corporation\\ipcorp-architecture-brain\\natively\\meeting-infographics";
const ALLOWED_ORIGINS = new Set(["http://127.0.0.1:5217", "http://localhost:5217"]);
const ISSUE_KEY_RE = /^MT-\d+$/;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_LIBRARY_PREVIEW_BYTES = 512 * 1024;
const execFile = promisify(execFileCallback);
const M365_ADAPTER_PATH = resolve(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  "m365-reconcile.py"
);
const M365_CACHE_MS = 10 * 60 * 1000;
const M365_RECONCILE_TIMEOUT_MS = 15 * 60 * 1000;
let m365EvidenceCache = null;
let m365EvidenceInFlight = null;

const teamLibrarySections = [
  {
    id: "00 - Adoption and Rollout Toolkit",
    index: "00",
    title: "Adoption and rollout toolkit",
    summary:
      "Playbook, launch deck, Purview readiness, domain and Power BI review, operations, migration, and the source-supported change ledger.",
  },
  {
    id: "01 - Engagement Overview",
    index: "01",
    title: "Engagement overview",
    summary:
      "Company and system context, data flows, glossary, source-system overviews, Purview strategy, and architecture decisions.",
  },
  {
    id: "02 - Architecture Reference",
    index: "02",
    title: "Architecture reference",
    summary:
      "Fabric, Purview, integration, medallion, security, and infrastructure guidance for design and implementation reviews.",
  },
  {
    id: "03 - Engagement Updates",
    index: "03",
    title: "Engagement updates",
    summary:
      "Privacy-screened historical meeting intelligence organized by year and month for traceable engagement context.",
  },
  {
    id: "04 - Power BI Strategy and Analysis",
    index: "04",
    title: "Power BI strategy and analysis",
    summary:
      "Cross-model overlap, DAX patterns, ETL architecture, and source-query analysis for consolidation and semantic governance.",
  },
  {
    id: "05 - Diagram Sources",
    index: "05",
    title: "Diagram sources",
    summary:
      "Mermaid sources for medallion, product, plant-floor, and Salesforce-to-M3 architecture flows.",
  },
];

const teamLibraryGuides = [
  {
    id: "brief-team",
    title: "Brief the team",
    summary: "Open the Fabric and Purview launch conversation with prepared decisions.",
    paths: [
      "00 - Adoption and Rollout Toolkit/02 - IP Corp Fabric And Purview Launch Workshop Deck.pptx",
      "00 - Adoption and Rollout Toolkit/02 - IP Corp Fabric And Purview Launch Workshop Deck.pdf",
    ],
  },
  {
    id: "purview-launch",
    title: "Prepare the Purview launch",
    summary:
      "Review prerequisites, catalog objects, domains, quality, lineage, access, and owners.",
    paths: [
      "00 - Adoption and Rollout Toolkit/03 - IP Corp Purview Launch Readiness Workbook.xlsx",
    ],
  },
  {
    id: "domain-review",
    title: "Run a domain and model review",
    summary:
      "Work from the loaded systems, semantic models, DAX, relationships, overlap, and decisions.",
    paths: [
      "00 - Adoption and Rollout Toolkit/04 - IP Corp Domain Model And Power BI Review Workbook.xlsx",
    ],
  },
  {
    id: "operations",
    title: "Plan operations or migration",
    summary:
      "Review capacity, workspaces, monitoring, gateways, refresh, continuity, CI/CD, and release controls.",
    paths: [
      "00 - Adoption and Rollout Toolkit/05 - IP Corp Fabric Operations Migration And Recovery Workbook.xlsx",
    ],
  },
  {
    id: "rollout",
    title: "Understand the rollout",
    summary:
      "Use the evidence-first operating model, gates, roles, adoption measures, and checklists.",
    paths: [
      "00 - Adoption and Rollout Toolkit/01 - IP Corp Fabric Adoption And Rollout Playbook.pdf",
      "00 - Adoption and Rollout Toolkit/01 - IP Corp Fabric Adoption And Rollout Playbook.docx",
    ],
  },
  {
    id: "change-ledger",
    title: "See what changed",
    summary:
      "Trace additions, exclusions, redactions, restructuring decisions, and build limitations.",
    paths: ["00 - Adoption and Rollout Toolkit/06 - Microsoft Guidance And Change Ledger.md"],
  },
];

const libraryGroupByExtension = new Map([
  [".csv", "Data"],
  [".docx", "Word"],
  [".md", "Reference"],
  [".mmd", "Diagram"],
  [".pdf", "PDF"],
  [".pptx", "PowerPoint"],
  [".txt", "Reference"],
  [".xlsx", "Excel"],
]);

const libraryMimeByExtension = new Map([
  [".csv", "text/csv; charset=utf-8"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".md", "text/markdown; charset=utf-8"],
  [".mmd", "text/plain; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  [".txt", "text/plain; charset=utf-8"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
]);

const previewableLibraryExtensions = new Set([".csv", ".md", ".mmd", ".txt"]);

const allowedUpdateFields = new Set([
  "summary",
  "description",
  "labels",
  "priority",
  "assignee",
  "duedate",
  "startDate",
  "timetracking",
]);

class GatewayError extends Error {
  constructor(status, message, code = "gateway_error", details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function sendJson(response, status, payload, origin) {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.writeHead(status);
  response.end(JSON.stringify(payload));
}

function setAllowedOrigin(response, origin) {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
}

function normalizeLibraryRelativePath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");
}

function resolveTeamLibraryFile(relativePath) {
  const normalized = normalizeLibraryRelativePath(relativePath);
  const root = resolve(TEAM_LIBRARY_PATH);
  const filePath = resolve(root, normalized.replaceAll("/", sep));
  if (!normalized || filePath === root || !filePath.startsWith(`${root}${sep}`)) {
    throw new GatewayError(400, "Invalid Team Library path.", "invalid_library_path");
  }
  return { filePath, normalized };
}

async function walkTeamLibrary(directory, relativeDirectory = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true })
  )) {
    const relativePath = normalizeLibraryRelativePath(
      relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
    );
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkTeamLibrary(absolutePath, relativePath)));
      continue;
    }
    if (
      !entry.isFile() ||
      entry.name.toLowerCase() === "index.html" ||
      entry.name.startsWith("~$")
    ) {
      continue;
    }
    const details = await stat(absolutePath);
    const extension = extname(entry.name).toLowerCase();
    const firstSegment = relativePath.split("/")[0];
    const section = teamLibrarySections.find((candidate) => candidate.id === firstSegment);
    files.push({
      name: entry.name,
      path: relativePath,
      sectionId: section?.id || "library-controls",
      extension: extension.replace(/^\./, ""),
      group: libraryGroupByExtension.get(extension) || "File",
      bytes: details.size,
      modifiedAt: details.mtime.toISOString(),
      previewable: previewableLibraryExtensions.has(extension),
    });
  }
  return files;
}

function parsePublicationStatus(markdown) {
  const values = {};
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
    if (match && match[1] !== "Attribute" && !match[1].startsWith("---")) {
      values[match[1].trim()] = match[2].trim();
    }
  }
  return {
    publishedAt: values["Published at"] || null,
    sourceRevision: values["Canonical source revision"] || null,
  };
}

async function getTeamLibraryManifest() {
  const root = resolve(TEAM_LIBRARY_PATH);
  let rootDetails;
  try {
    rootDetails = await stat(root);
  } catch {
    throw new GatewayError(
      503,
      "The synced Team Library folder is unavailable on this computer.",
      "team_library_unavailable"
    );
  }
  if (!rootDetails.isDirectory()) {
    throw new GatewayError(
      503,
      "The configured Team Library path is not a folder.",
      "team_library_unavailable"
    );
  }

  const files = await walkTeamLibrary(root);
  let publication = { publishedAt: null, sourceRevision: null };
  try {
    publication = parsePublicationStatus(
      await readFile(resolve(root, "Publication Status.md"), "utf8")
    );
  } catch {
    // The file inventory remains usable, but provenance is explicitly incomplete.
  }

  const sectionCounts = new Map();
  for (const file of files) {
    sectionCounts.set(file.sectionId, (sectionCounts.get(file.sectionId) || 0) + 1);
  }
  const sections = teamLibrarySections.map((section) => ({
    ...section,
    fileCount: sectionCounts.get(section.id) || 0,
    available: sectionCounts.has(section.id),
  }));
  const guides = teamLibraryGuides.map((guide) => ({
    ...guide,
    files: guide.paths.map((path) => files.find((file) => file.path === path)).filter(Boolean),
  }));
  const missingSections = sections
    .filter((section) => !section.available)
    .map((section) => section.id);
  const newestLocalModifiedAt =
    files
      .map((file) => file.modifiedAt)
      .sort()
      .at(-1) || rootDetails.mtime.toISOString();

  return {
    source: "SharePoint-ready Team Library via the local OneDrive sync folder",
    state: missingSections.length ? "partial" : "local-sync",
    limitation:
      "The local OneDrive copy is readable. SharePoint freshness cannot be verified until the team Microsoft 365 connector is configured.",
    refreshedAt: new Date().toISOString(),
    newestLocalModifiedAt,
    publication,
    sections,
    guides,
    files,
    missingSections,
    totalFiles: files.length,
    contentBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  };
}

async function sendTeamLibraryFile(response, relativePath, origin) {
  const { filePath, normalized } = resolveTeamLibraryFile(relativePath);
  let details;
  try {
    details = await stat(filePath);
  } catch {
    throw new GatewayError(404, "Team Library file not found.", "library_file_not_found");
  }
  if (!details.isFile()) {
    throw new GatewayError(404, "Team Library file not found.", "library_file_not_found");
  }
  const extension = extname(filePath).toLowerCase();
  const data = await readFile(filePath);
  setAllowedOrigin(response, origin);
  response.setHeader(
    "Content-Type",
    libraryMimeByExtension.get(extension) || "application/octet-stream"
  );
  response.setHeader("Cache-Control", "private, no-cache");
  response.setHeader("X-Content-Type-Options", "nosniff");
  const disposition =
    extension === ".pdf" || previewableLibraryExtensions.has(extension) ? "inline" : "attachment";
  const safeName = normalized.split("/").at(-1).replaceAll('"', "");
  response.setHeader("Content-Disposition", `${disposition}; filename="${safeName}"`);
  response.writeHead(200);
  response.end(data);
}

/**
 * Serve a meeting infographic PNG.
 *
 * Both segments are matched against the real directory listing rather than joined from
 * user input, so a crafted id or filename cannot walk outside the infographics folder.
 */
async function sendMeetingInfographic(response, id, file, origin) {
  if (!id || !file) {
    throw new GatewayError(400, "A meeting and a file are required.", "infographic_bad_request");
  }
  let folders;
  try {
    folders = await readdir(MEETING_INFOGRAPHICS_PATH);
  } catch {
    throw new GatewayError(
      404,
      "No meeting infographics are available.",
      "infographic_root_missing"
    );
  }
  const folder = folders.find((name) => name === id);
  if (!folder) {
    throw new GatewayError(404, "That meeting has no infographic.", "infographic_not_found");
  }
  const dir = join(MEETING_INFOGRAPHICS_PATH, folder);
  const entries = await readdir(dir);
  const match = entries.find((name) => name === file && name.toLowerCase().endsWith(".png"));
  if (!match) {
    throw new GatewayError(
      404,
      "That infographic image is not available.",
      "infographic_not_found"
    );
  }
  const data = await readFile(join(dir, match));
  setAllowedOrigin(response, origin);
  response.setHeader("Content-Type", "image/png");
  response.setHeader("Cache-Control", "private, max-age=300");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Disposition", `inline; filename="${match.replaceAll('"', "")}"`);
  response.writeHead(200);
  response.end(data);
}

async function getTeamLibraryPreview(relativePath) {
  const { filePath, normalized } = resolveTeamLibraryFile(relativePath);
  const extension = extname(filePath).toLowerCase();
  if (!previewableLibraryExtensions.has(extension)) {
    throw new GatewayError(
      415,
      "This file type opens in its native viewer and does not have an in-app text preview.",
      "library_preview_unsupported"
    );
  }
  let details;
  try {
    details = await stat(filePath);
  } catch {
    throw new GatewayError(404, "Team Library file not found.", "library_file_not_found");
  }
  if (!details.isFile()) {
    throw new GatewayError(404, "Team Library file not found.", "library_file_not_found");
  }
  if (details.size > MAX_LIBRARY_PREVIEW_BYTES) {
    throw new GatewayError(
      413,
      "This Team Library file is too large for the in-app preview.",
      "library_preview_too_large"
    );
  }
  return {
    path: normalized,
    extension: extension.replace(/^\./, ""),
    content: await readFile(filePath, "utf8"),
    modifiedAt: details.mtime.toISOString(),
  };
}

function parseLastJsonObject(value) {
  const lines = String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();
  for (const line of lines) {
    try {
      return JSON.parse(line);
    } catch {
      // Keep looking for the adapter's final structured line.
    }
  }
  return null;
}

async function runMicrosoft365ReconciliationEvidence() {
  let stdout = "";
  try {
    const result = await execFile("python", [M365_ADAPTER_PATH], {
      timeout: M365_RECONCILE_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
      env: process.env,
    });
    stdout = result.stdout;
  } catch (error) {
    stdout = error?.stdout || "";
    const structuredFailure = parseLastJsonObject(stdout);
    const value = {
      available: false,
      cached: false,
      code: structuredFailure?.code || (error?.killed ? "m365_timeout" : "m365_adapter_error"),
      detail:
        structuredFailure?.error ||
        (error?.killed
          ? "Copilot Cowork did not complete the single MDM collection request within the 15-minute maximum. No second request was sent."
          : "The local Copilot Cowork evidence adapter could not complete."),
      retryable: structuredFailure?.retryable ?? false,
      authRequired: structuredFailure?.authRequired ?? false,
      items: [],
      limitations: [],
    };
    m365EvidenceCache = { cachedAt: Date.now(), value };
    return value;
  }

  const parsed = parseLastJsonObject(stdout);
  const value =
    parsed?.ok && parsed.data
      ? {
          available: true,
          cached: false,
          code: null,
          detail: `${parsed.data.items?.length || 0} bounded Outlook and Teams evidence items returned.`,
          retryable: false,
          authRequired: false,
          asOf: parsed.data.asOf || null,
          items: Array.isArray(parsed.data.items) ? parsed.data.items : [],
          limitations: Array.isArray(parsed.data.limitations) ? parsed.data.limitations : [],
        }
      : {
          available: false,
          cached: false,
          code: parsed?.code || "m365_adapter_error",
          detail: parsed?.error || "Microsoft 365 evidence could not be safely structured.",
          retryable: parsed?.retryable ?? false,
          authRequired: parsed?.authRequired ?? false,
          items: [],
          limitations: [],
        };
  m365EvidenceCache = { cachedAt: Date.now(), value };
  return value;
}

async function getMicrosoft365ReconciliationEvidence(force = false) {
  if (!force && m365EvidenceCache && Date.now() - m365EvidenceCache.cachedAt < M365_CACHE_MS) {
    return { ...m365EvidenceCache.value, cached: true };
  }

  // Single-flight guard: every caller joins the one request already running.
  // `force` may bypass the completed cache, but it never starts a second job.
  if (m365EvidenceInFlight) return m365EvidenceInFlight;
  m365EvidenceInFlight = runMicrosoft365ReconciliationEvidence();
  try {
    return await m365EvidenceInFlight;
  } finally {
    m365EvidenceInFlight = null;
  }
}

async function readJsonBody(request) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      throw new GatewayError(413, "Request body is too large.", "body_too_large");
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new GatewayError(400, "Request body must be valid JSON.", "invalid_json");
  }
}

async function getJiraConfig() {
  let settings;
  try {
    settings = JSON.parse(await readFile(resolve(SETTINGS_PATH), "utf8"));
  } catch {
    throw new GatewayError(
      503,
      "The approved Prism Jira credential store is unavailable.",
      "credential_store_unavailable"
    );
  }

  const baseUrl = String(settings.jiraBaseUrl || "").replace(/\/+$/, "");
  const email = String(settings.jiraEmail || "");
  const apiToken = String(settings.jiraApiToken || "");
  if (!baseUrl || !email || !apiToken) {
    throw new GatewayError(
      503,
      "Jira is not configured in the approved Prism credential store.",
      "jira_not_configured"
    );
  }

  return {
    baseUrl,
    auth: `Basic ${Buffer.from(`${email}:${apiToken}`, "utf8").toString("base64")}`,
  };
}

async function jiraRequest(pathname, init = {}) {
  const config = await getJiraConfig();
  let response;
  try {
    response = await fetch(`${config.baseUrl}${pathname}`, {
      ...init,
      headers: {
        Authorization: config.auth,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new GatewayError(503, "Jira could not be reached.", "jira_unreachable");
  }

  if (response.status === 204) return {};
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }
  if (!response.ok) {
    const message =
      response.status === 401
        ? "Jira rejected the configured credentials."
        : response.status === 403
          ? "The Jira account does not have permission for this MDM action."
          : response.status === 404
            ? "The requested MDM Jira issue was not found."
            : response.status === 409
              ? "Jira reported a conflicting update."
              : `Jira returned HTTP ${response.status}.`;
    throw new GatewayError(response.status, message, "jira_api_error");
  }
  return data;
}

function adfToText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text || "";
  if (!Array.isArray(node.content)) return "";
  const separator =
    node.type === "doc" || node.type === "paragraph" || node.type === "heading" ? "\n" : "";
  return node.content.map(adfToText).filter(Boolean).join(separator).trim();
}

function textToAdf(text) {
  const paragraphs = String(text || "")
    .split(/\n{2,}/)
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    version: 1,
    type: "doc",
    content: (paragraphs.length ? paragraphs : [""]).map((paragraph) => ({
      type: "paragraph",
      content: paragraph ? [{ type: "text", text: paragraph }] : [],
    })),
  };
}

function mapIssue(raw) {
  const fields = raw.fields || {};
  return {
    key: raw.key,
    version: Number.isInteger(Number(raw.version)) ? Number(raw.version) : null,
    summary: fields.summary || "",
    description: adfToText(fields.description),
    descriptionAdf: fields.description || null,
    status: {
      id: fields.status?.id || "",
      name: fields.status?.name || "Unknown",
      category: fields.status?.statusCategory?.key || "undefined",
    },
    priority: {
      id: fields.priority?.id || "",
      name: fields.priority?.name || "Not set",
    },
    assignee: fields.assignee
      ? {
          accountId: fields.assignee.accountId || "",
          displayName: fields.assignee.displayName || "Unknown",
        }
      : null,
    issueType: fields.issuetype?.name || "Task",
    parentKey: fields.parent?.key || null,
    labels: Array.isArray(fields.labels) ? fields.labels : [],
    dueDate: fields.duedate || null,
    startDate: fields.customfield_11915 || fields.customfield_12001 || null,
    updatedAt: fields.updated || "",
    createdAt: fields.created || "",
    timeTracking: {
      originalEstimate: fields.timetracking?.originalEstimate || null,
      remainingEstimate: fields.timetracking?.remainingEstimate || null,
      timeSpent: fields.timetracking?.timeSpent || null,
    },
    subtasks: Array.isArray(fields.subtasks)
      ? fields.subtasks.map((item) => ({
          key: item.key,
          summary: item.fields?.summary || "",
          status: item.fields?.status?.name || "Unknown",
        }))
      : [],
    links: Array.isArray(fields.issuelinks)
      ? fields.issuelinks.map((link) => ({
          id: link.id,
          type: link.type?.name || "Related",
          direction: link.outwardIssue ? "outward" : "inward",
          key: link.outwardIssue?.key || link.inwardIssue?.key || "",
          summary: link.outwardIssue?.fields?.summary || link.inwardIssue?.fields?.summary || "",
        }))
      : [],
    comments: Array.isArray(fields.comment?.comments)
      ? fields.comment.comments.map((comment) => ({
          id: comment.id,
          author: comment.author?.displayName || "Unknown",
          body: adfToText(comment.body),
          createdAt: comment.created || "",
          updatedAt: comment.updated || "",
        }))
      : [],
  };
}

const BOARD_FIELDS = [
  "summary",
  "status",
  "priority",
  "assignee",
  "issuetype",
  "parent",
  "labels",
  "duedate",
  "customfield_11915",
  "customfield_12001",
  "timetracking",
  "created",
  "updated",
  // The board query feeds the timeline, Gantt and dependency views, all of which need
  // the blocking relationships. Without this the dependency map renders empty.
  "issuelinks",
].join(",");

const DETAIL_FIELDS = [BOARD_FIELDS, "description", "subtasks", "issuelinks", "comment"].join(",");

async function searchMdmIssues() {
  const issues = [];
  let nextPageToken;
  do {
    const data = await jiraRequest("/rest/api/3/search/jql", {
      method: "POST",
      body: JSON.stringify({
        jql: `project = ${INITIATIVE_KEY} ORDER BY rank ASC, updated DESC`,
        maxResults: 100,
        fields: BOARD_FIELDS.split(","),
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
    });
    issues.push(...(data.issues || []));
    nextPageToken = data.nextPageToken;
  } while (nextPageToken && issues.length < 1_000);
  return issues.map(mapIssue);
}

async function getIssue(key) {
  if (!ISSUE_KEY_RE.test(key)) {
    throw new GatewayError(400, "Only MT initiative issues are allowed.", "outside_mdm_scope");
  }
  const raw = await jiraRequest(
    `/rest/api/3/issue/${encodeURIComponent(key)}?fields=${encodeURIComponent(DETAIL_FIELDS)}`
  );
  return mapIssue(raw);
}

async function getAllIssueComments(key) {
  const comments = [];
  let startAt = 0;
  let total = Number.POSITIVE_INFINITY;
  while (startAt < total) {
    const data = await jiraRequest(
      `/rest/api/3/issue/${encodeURIComponent(key)}/comment?startAt=${startAt}&maxResults=100&orderBy=created`
    );
    const page = Array.isArray(data.comments) ? data.comments : [];
    comments.push(
      ...page.map((comment) => ({
        id: comment.id,
        author: comment.author?.displayName || "Unknown",
        authorAccountId: comment.author?.accountId || null,
        body: adfToText(comment.body),
        createdAt: comment.created || null,
        updatedAt: comment.updated || null,
      }))
    );
    total = Number(data.total || comments.length);
    if (!page.length) break;
    startAt += page.length;
  }
  return comments;
}

async function getAllIssueWorklogs(key) {
  const data = await jiraRequest(
    `/rest/api/3/issue/${encodeURIComponent(key)}/worklog?startAt=0&maxResults=5000`
  );
  return (Array.isArray(data.worklogs) ? data.worklogs : []).map((worklog) => ({
    id: worklog.id,
    author: worklog.author?.displayName || "Unknown",
    authorAccountId: worklog.author?.accountId || null,
    startedAt: worklog.started || null,
    createdAt: worklog.created || null,
    updatedAt: worklog.updated || null,
    timeSpent: worklog.timeSpent || null,
    timeSpentSeconds: worklog.timeSpentSeconds || 0,
    comment: adfToText(worklog.comment),
  }));
}

async function getAllIssueChangelog(key) {
  const histories = [];
  let startAt = 0;
  let total = Number.POSITIVE_INFINITY;
  while (startAt < total) {
    const data = await jiraRequest(
      `/rest/api/3/issue/${encodeURIComponent(key)}/changelog?startAt=${startAt}&maxResults=100`
    );
    const page = Array.isArray(data.values) ? data.values : [];
    histories.push(
      ...page.map((history) => ({
        id: history.id,
        author: history.author?.displayName || "Unknown",
        authorAccountId: history.author?.accountId || null,
        createdAt: history.created || null,
        items: (history.items || []).map((item) => ({
          field: item.field || "",
          fieldId: item.fieldId || null,
          from: item.fromString ?? item.from ?? null,
          to: item.toString ?? item.to ?? null,
        })),
      }))
    );
    total = Number(data.total || histories.length);
    if (!page.length) break;
    startAt += page.length;
  }
  return histories;
}

async function getIssueEvidence(key) {
  const [issue, comments, worklogs, changelog] = await Promise.all([
    getIssue(key),
    getAllIssueComments(key),
    getAllIssueWorklogs(key),
    getAllIssueChangelog(key),
  ]);
  return {
    ...issue,
    comments,
    worklogs,
    changelog,
  };
}

async function getMdmEvidenceExport() {
  const issues = await searchMdmIssues();
  const results = new Array(issues.length);
  let cursor = 0;
  const workerCount = Math.min(6, Math.max(1, issues.length));
  async function worker() {
    while (cursor < issues.length) {
      const index = cursor;
      cursor += 1;
      const summary = issues[index];
      try {
        results[index] = await getIssueEvidence(summary.key);
      } catch (error) {
        results[index] = {
          ...summary,
          exportError: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  for (let index = 0; index < results.length; index += 1) {
    if (!results[index]?.exportError) continue;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    try {
      results[index] = await getIssueEvidence(issues[index].key);
    } catch (error) {
      results[index] = {
        ...issues[index],
        exportError: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return {
    projectKey: INITIATIVE_KEY,
    fetchedAt: new Date().toISOString(),
    issues: results,
    completeIssues: results.filter((issue) => !issue.exportError).length,
    failedIssues: results
      .filter((issue) => issue.exportError)
      .map((issue) => ({ key: issue.key, error: issue.exportError })),
  };
}

async function getProjectStatuses() {
  const data = await jiraRequest(`/rest/api/3/project/${INITIATIVE_KEY}/statuses`);
  const seen = new Set();
  const statuses = [];
  for (const issueType of Array.isArray(data) ? data : []) {
    for (const status of issueType.statuses || []) {
      if (seen.has(status.id)) continue;
      seen.add(status.id);
      statuses.push({
        id: status.id,
        name: status.name,
        category: status.statusCategory?.key || "undefined",
      });
    }
  }
  return statuses;
}

async function getAssignableUsers() {
  const data = await jiraRequest(
    `/rest/api/3/user/assignable/search?project=${INITIATIVE_KEY}&maxResults=100`
  );
  return (Array.isArray(data) ? data : []).map((user) => ({
    accountId: user.accountId,
    displayName: user.displayName || "Unknown",
  }));
}

async function getPriorities() {
  const data = await jiraRequest("/rest/api/3/priority");
  return (Array.isArray(data) ? data : []).map((priority) => ({
    id: priority.id,
    name: priority.name,
  }));
}

/** Move an issue to a status by name, using whatever transition reaches it. */
async function transitionIssueTo(key, statusName) {
  const transitions = await getTransitions(key);
  const wanted = String(statusName).toLowerCase();
  const match =
    transitions.find((t) => t.to.toLowerCase() === wanted) ||
    transitions.find((t) => t.name.toLowerCase() === wanted);
  if (!match) {
    throw new GatewayError(
      409,
      `${key} cannot move to ${statusName} from its current status.`,
      "transition_unavailable",
      { available: transitions.map((t) => t.to) }
    );
  }
  await jiraRequest(`/rest/api/3/issue/${key}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: match.id } }),
  });
}

async function addIssueComment(key, text) {
  await jiraRequest(`/rest/api/3/issue/${key}/comment`, {
    method: "POST",
    body: JSON.stringify({ body: textToAdf(String(text)) }),
  });
}

async function logIssueWork(key, seconds, text) {
  await jiraRequest(`/rest/api/3/issue/${key}/worklog?adjustEstimate=leave`, {
    method: "POST",
    body: JSON.stringify({
      timeSpentSeconds: Math.max(60, Math.round(seconds)),
      comment: textToAdf(String(text)),
    }),
  });
}

async function getTransitions(key) {
  const data = await jiraRequest(`/rest/api/3/issue/${key}/transitions`);
  return (data.transitions || []).map((transition) => ({
    id: transition.id,
    name: transition.name,
    to: transition.to?.name || "",
  }));
}

async function updateIssue(key, body) {
  if (!ISSUE_KEY_RE.test(key)) {
    throw new GatewayError(400, "Only MT initiative issues are allowed.", "outside_mdm_scope");
  }
  const current = await getIssue(key);
  if (!body.expectedUpdated || current.updatedAt !== body.expectedUpdated) {
    throw new GatewayError(
      409,
      `${key} changed in Jira after it was opened. Reload before saving.`,
      "edit_conflict",
      { currentUpdatedAt: current.updatedAt }
    );
  }

  const effects = [];
  const errors = [];
  const requestedTransition =
    body.transitionTo && body.transitionTo !== current.status.name
      ? String(body.transitionTo)
      : null;
  const closingAsDone = requestedTransition?.toLowerCase() === "done";
  let transitionMatch = null;

  if (requestedTransition) {
    const transitions = await getTransitions(key);
    transitionMatch = transitions.find(
      (transition) =>
        transition.to.toLowerCase() === requestedTransition.toLowerCase() ||
        transition.name.toLowerCase() === requestedTransition.toLowerCase()
    );
    if (!transitionMatch) {
      throw new GatewayError(400, `No Jira transition to ${requestedTransition} is available.`);
    }
  }

  if (closingAsDone) {
    const timeSpent = String(body.worklog?.timeSpent || "").trim();
    const worklogComment = String(body.worklog?.comment || "").trim();
    if (!timeSpent || !worklogComment) {
      throw new GatewayError(
        400,
        "Done requires a normalized-effort worklog and a narrative worklog comment.",
        "done_worklog_required"
      );
    }
  }

  const fields = {};
  for (const [name, value] of Object.entries(body.fields || {})) {
    if (!allowedUpdateFields.has(name)) continue;
    if (name === "description") fields.description = textToAdf(value);
    else if (name === "priority") fields.priority = value ? { name: String(value) } : null;
    else if (name === "startDate") fields.customfield_11915 = value || null;
    else fields[name] = value;
  }

  if (Object.keys(fields).length) {
    try {
      await jiraRequest(`/rest/api/3/issue/${key}`, {
        method: "PUT",
        body: JSON.stringify({ fields }),
      });
      effects.push("fields");
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (requestedTransition && transitionMatch) {
    try {
      if (closingAsDone) {
        const timeSpent = String(body.worklog?.timeSpent || "").trim();
        const worklogComment = String(body.worklog?.comment || "").trim();
        await jiraRequest(`/rest/api/3/issue/${key}`, {
          method: "PUT",
          body: JSON.stringify({
            fields: { timetracking: { remainingEstimate: "0h" } },
          }),
        });
        await jiraRequest(`/rest/api/3/issue/${key}/worklog`, {
          method: "POST",
          body: JSON.stringify({
            timeSpent,
            comment: textToAdf(worklogComment),
            started:
              body.worklog?.started || new Date().toISOString().replace(/\.\d{3}Z$/, ".000+0000"),
          }),
        });
        const me = await jiraRequest("/rest/api/3/myself");
        if (me.accountId) {
          await jiraRequest(`/rest/api/3/issue/${key}/watchers`, {
            method: "POST",
            body: JSON.stringify(me.accountId),
          });
        }
        effects.push("remaining-estimate", "worklog", "watcher");
      }
      await jiraRequest(`/rest/api/3/issue/${key}/transitions`, {
        method: "POST",
        body: JSON.stringify({ transition: { id: transitionMatch.id } }),
      });
      effects.push("status");
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (String(body.comment || "").trim()) {
    try {
      await jiraRequest(`/rest/api/3/issue/${key}/comment`, {
        method: "POST",
        body: JSON.stringify({ body: textToAdf(String(body.comment).trim()) }),
      });
      effects.push("comment");
    } catch (error) {
      errors.push(error.message);
    }
  }

  const verified = await getIssue(key);
  return { issue: verified, effects, errors, partial: errors.length > 0 };
}

async function readBrainEvidence() {
  const sources = [
    {
      label: "action proposals",
      relativePath: "data/action-proposals.json",
      map: (item) => ({
        id: item.id,
        kind: "Brain action proposal",
        title: item.title,
        text: [
          item.proposal?.suggestedAction,
          item.proposal?.whyNow,
          item.outcome?.note,
          ...(item.tags || []),
        ]
          .filter(Boolean)
          .join(" "),
        status: item.status || "unknown",
        updatedAt: item.updatedAt || item.createdAt || null,
        reference: `Brain action proposal ${item.id}`,
      }),
    },
    {
      label: "open questions",
      relativePath: "data/open-questions.json",
      map: (item) => ({
        id: item.id,
        kind: "Brain open question",
        title: item.question,
        text: [item.priority, item.answerOwner, item.target, item.status].filter(Boolean).join(" "),
        status: item.status || "unknown",
        updatedAt: null,
        reference: `Brain open question ${item.id}`,
      }),
    },
    {
      label: "risks",
      relativePath: "data/risks.json",
      map: (item) => ({
        id: item.id,
        kind: "Brain risk",
        title: item.risk,
        text: [item.severity, item.exposed, item.mitigation, item.owner].filter(Boolean).join(" "),
        status: item.likelihood || "unknown",
        updatedAt: item.lastReviewed || null,
        reference: `Brain risk ${item.id}`,
      }),
    },
  ];
  let recordCount = 0;
  const available = [];
  const records = [];
  for (const source of sources) {
    try {
      const value = JSON.parse(await readFile(resolve(process.cwd(), source.relativePath), "utf8"));
      const items = Array.isArray(value) ? value : Array.isArray(value.items) ? value.items : [];
      recordCount += items.length;
      records.push(...items.map(source.map).filter((item) => item.id && item.title));
      available.push(source.label);
    } catch {
      // Each source reports independently in the preview.
    }
  }
  return { recordCount, available, records };
}

const reconciliationStopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "this",
  "to",
  "with",
  "ip",
  "corp",
  "mdm",
  "fabric",
  "data",
]);

function reconciliationTokens(value) {
  return new Set(
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !reconciliationStopWords.has(token))
  );
}

function evidenceSimilarity(evidence, issue) {
  const evidenceTokens = reconciliationTokens(`${evidence.title} ${evidence.text || ""}`);
  const issueTokens = reconciliationTokens(
    `${issue.summary} ${issue.description || ""} ${(issue.labels || []).join(" ")}`
  );
  if (!evidenceTokens.size || !issueTokens.size) return 0;
  let overlap = 0;
  for (const token of evidenceTokens) {
    if (issueTokens.has(token)) overlap += 1;
  }
  return overlap / Math.min(evidenceTokens.size, issueTokens.size);
}

function jiraKeysInEvidence(evidence) {
  const matches = `${evidence.title || ""} ${evidence.text || ""}`.match(/\bMT-\d+\b/gi) || [];
  return Array.from(new Set(matches.map((key) => key.toUpperCase())));
}

function makePortfolioProposals(issues, evidenceRecords) {
  const proposals = [];
  const now = Date.now();
  const issueByKey = new Map(issues.map((issue) => [issue.key, issue]));
  const openIssues = issues.filter((issue) => issue.status.category !== "done");
  const staleOpenIssues = openIssues.filter((issue) => {
    const updated = new Date(issue.updatedAt).getTime();
    return Number.isFinite(updated) && now - updated > 45 * 24 * 60 * 60 * 1000;
  });

  for (const issue of staleOpenIssues) {
    const candidates = evidenceRecords
      .map((evidence) => ({ evidence, score: evidenceSimilarity(evidence, issue) }))
      .filter((candidate) => candidate.score >= 0.28)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    const best = candidates[0];
    proposals.push({
      id: `stale-${issue.key}`,
      issueKey: issue.key,
      category: best ? "review-current-relevance" : "candidate-cancel-or-supersede",
      title: best ? "Reconcile against newer evidence" : "Review stale open Jira work",
      effect: {
        expectedUpdated: issue.updatedAt,
        fields: {},
        transitionTo: "Cancelled",
        comment: `I reviewed this against the current MDM evidence set. The ticket has not been updated since ${issue.updatedAt}, and I could not verify it as current work. Closing it as Cancelled keeps the board aligned to the active plan without rewriting the historical record. If new evidence revives the work, it should return as a newly scoped item with current ownership and dates.`,
      },
      exactJiraEffect:
        "Candidate effect after review: append a reconciliation comment, then transition this stale open issue to Cancelled. No change will be made while relevance is unresolved.",
      sourceReferences: [
        {
          label: "Jira",
          reference: `${issue.key} last updated ${issue.updatedAt}`,
        },
        ...candidates.map(({ evidence, score }) => ({
          label: evidence.kind,
          reference: `${evidence.reference} (${Math.round(score * 100)}% topic overlap)`,
        })),
      ],
      uncertainty: best
        ? "Newer evidence is topically related, but it does not explicitly identify this Jira issue."
        : "No current evidence explicitly confirms whether this issue is obsolete, duplicated, or still required.",
    });
  }

  for (const evidence of evidenceRecords) {
    const explicitKeys = jiraKeysInEvidence(evidence).filter((key) => issueByKey.has(key));
    for (const key of explicitKeys) {
      const issue = issueByKey.get(key);
      proposals.push({
        id: `explicit-${evidence.kind}-${evidence.id}-${key}`.replaceAll(" ", "-"),
        issueKey: key,
        category: "explicit-source-crosswalk",
        title: `Review ${evidence.kind.toLowerCase()} against ${key}`,
        effect: {
          expectedUpdated: issue.updatedAt,
          fields: {},
          comment: `${evidence.title}\n\nSource: ${evidence.reference}`,
        },
        exactJiraEffect: `Append a source-linked reconciliation comment to ${key}.`,
        sourceReferences: [{ label: evidence.kind, reference: evidence.reference }],
        uncertainty:
          "The issue key is explicit, but the comment wording and current relevance still require review.",
      });
    }
    if (explicitKeys.length) continue;

    const matches = issues
      .map((issue) => ({ issue, score: evidenceSimilarity(evidence, issue) }))
      .filter((candidate) => candidate.score >= 0.34)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (
      !matches.length &&
      !["executed", "done", "closed"].includes(String(evidence.status).toLowerCase())
    ) {
      proposals.push({
        id: `missing-${evidence.kind}-${evidence.id}`.replaceAll(" ", "-"),
        issueKey: "NEW",
        category: "candidate-new-work",
        title: evidence.title,
        effect: {
          create: {
            summary: evidence.title,
            description: `${evidence.text || evidence.title}\n\nSource: ${evidence.reference}`,
            labels: ["mdm-reconciliation", evidence.kind.toLowerCase().replaceAll(" ", "-")],
          },
        },
        exactJiraEffect:
          "Candidate effect after review: create a new MT task with a full Jira description, owner, dates, estimates, labels, and dependency links.",
        sourceReferences: [{ label: evidence.kind, reference: evidence.reference }],
        uncertainty:
          "No explicit Jira key or sufficiently strong existing-issue match was found. The target, ownership, and whether this belongs in Jira require review.",
      });
    }
  }

  return {
    proposals: proposals.slice(0, 250),
    staleOpenCount: staleOpenIssues.length,
    openCount: openIssues.length,
    doneCount: issues.length - openIssues.length,
    newestJiraUpdate:
      issues
        .map((issue) => issue.updatedAt)
        .filter(Boolean)
        .sort()
        .at(-1) || null,
  };
}

async function createReconciliationPreview(options = {}) {
  const sourceStates = [
    {
      id: "jira",
      label: "Jira issues, comments, links, and subtasks",
      state: "loading",
      detail: "Checking the live MT initiative.",
    },
    {
      id: "brain",
      label: "Architecture Brain records",
      state: "loading",
      detail: "Checking the prepared local Brain export.",
    },
    {
      id: "microsoft365",
      label: "Copilot Cowork · Email and Teams",
      state: "loading",
      detail: "Checking the approved local Cowork connector in read-only mode.",
    },
    {
      id: "team-library",
      label: "SharePoint / OneDrive Team Library",
      state: "loading",
      detail: "Checking the six-folder local publication.",
    },
  ];

  let issues = [];
  const evidenceRecords = [];
  try {
    issues = await searchMdmIssues();
    const newestUpdate = issues
      .map((issue) => issue.updatedAt)
      .filter(Boolean)
      .sort()
      .at(-1);
    const daysSinceNewest = newestUpdate
      ? Math.floor((Date.now() - new Date(newestUpdate).getTime()) / (24 * 60 * 60 * 1000))
      : null;
    sourceStates[0] = {
      ...sourceStates[0],
      state: daysSinceNewest !== null && daysSinceNewest > 45 ? "partial" : "current",
      detail: `${issues.length} live MT issues reviewed. Newest Jira update: ${
        newestUpdate || "unknown"
      }${daysSinceNewest !== null ? ` (${daysSinceNewest} days ago)` : ""}.`,
    };
  } catch (error) {
    sourceStates[0] = {
      ...sourceStates[0],
      state: "error",
      detail: error instanceof Error ? error.message : "Jira could not be reviewed.",
    };
  }

  const brain = await readBrainEvidence();
  evidenceRecords.push(...brain.records);
  sourceStates[1] = {
    ...sourceStates[1],
    state: brain.available.length ? "prepared" : "unavailable",
    detail: brain.available.length
      ? `${brain.recordCount} prepared records across ${brain.available.join(", ")}.`
      : "The prepared Brain evidence files were not available.",
  };

  let library = null;
  try {
    library = await getTeamLibraryManifest();
    evidenceRecords.push(
      ...library.files.map((file) => {
        const section = library.sections.find((item) => item.id === file.sectionId);
        return {
          id: file.path,
          kind: "Team Library artifact",
          title: file.name.replace(/\.[^.]+$/, ""),
          text: `${section?.title || "Library controls"} ${section?.summary || ""}`,
          status: "published",
          updatedAt: file.modifiedAt,
          reference: file.path,
        };
      })
    );
    sourceStates[3] = {
      ...sourceStates[3],
      state: library.missingSections.length ? "partial" : "prepared",
      detail: `${library.totalFiles} readable artifacts across ${
        library.sections.filter((section) => section.available).length
      } of 6 folders. SharePoint freshness is not verified.`,
    };
  } catch (error) {
    sourceStates[3] = {
      ...sourceStates[3],
      state: "unavailable",
      detail: error instanceof Error ? error.message : "The Team Library is unavailable.",
    };
  }

  const includeMicrosoft365 = Boolean(options.forceMicrosoft365);
  const freshMicrosoft365Cache =
    m365EvidenceCache && Date.now() - m365EvidenceCache.cachedAt < M365_CACHE_MS
      ? { ...m365EvidenceCache.value, cached: true }
      : null;
  const microsoft365 = includeMicrosoft365
    ? await getMicrosoft365ReconciliationEvidence(true)
    : freshMicrosoft365Cache || {
        available: false,
        cached: false,
        code: "not_requested",
        detail:
          "Microsoft 365 was not checked automatically. Opening reconciliation never starts a Cowork request; an explicit source refresh is required.",
        retryable: false,
        authRequired: false,
        items: [],
        limitations: [],
      };
  if (microsoft365.available) {
    evidenceRecords.push(
      ...microsoft365.items.map((item, index) => ({
        id: item.jiraKey || `${item.source}-${item.date}-${index}`,
        kind: item.source || "Microsoft 365 evidence",
        title: item.title,
        text: `${item.summary || ""} ${item.owner || ""} ${item.status || ""} ${
          item.jiraKey || ""
        }`,
        status: item.status || "unclear",
        updatedAt: item.date || microsoft365.asOf || null,
        reference: item.sourceReference || `${item.source || "Microsoft 365"} evidence`,
      }))
    );
  }
  sourceStates[2] = {
    ...sourceStates[2],
    state: microsoft365.available ? "current" : "unavailable",
    detail: microsoft365.available
      ? `${microsoft365.detail}${microsoft365.cached ? " Cached within the last 10 minutes." : ""}`
      : `${microsoft365.detail}${
          microsoft365.authRequired
            ? " Interactive sign-in is required."
            : " No restart or sign-in is implied."
        }`,
  };

  const portfolio = makePortfolioProposals(issues, evidenceRecords);
  const conflicts = [];
  if (portfolio.staleOpenCount) {
    conflicts.push({
      id: "stale-open-portfolio",
      title: `${portfolio.staleOpenCount} open Jira issues are more than 45 days stale`,
      detail:
        "Each stale issue is shown as a cancellation, supersession, or relevance-review candidate. None is auto-selected.",
      blocking: true,
    });
  }
  if (!evidenceRecords.some((evidence) => jiraKeysInEvidence(evidence).length)) {
    conflicts.push({
      id: "missing-crosswalk",
      title: "Available evidence has no explicit MT issue-key crosswalk",
      detail:
        "Topic overlap can suggest candidates, but it cannot safely choose a Jira target or create a transition without review.",
      blocking: true,
    });
  }
  if (!microsoft365.available) {
    conflicts.push({
      id: "m365-coverage-incomplete",
      title: "Copilot Cowork Email and Teams coverage is incomplete",
      detail: microsoft365.detail,
      blocking: false,
    });
  }

  return {
    id: `mdm-preview-${Date.now()}`,
    scope: {
      projectKey: INITIATIVE_KEY,
      label: "MDM Team / Fabric Data Migration",
      guarded: true,
    },
    generatedAt: new Date().toISOString(),
    sourceStates,
    proposals: portfolio.proposals,
    conflicts,
    portfolioSummary: {
      totalIssues: issues.length,
      openIssues: portfolio.openCount,
      doneIssues: portfolio.doneCount,
      staleOpenIssues: portfolio.staleOpenCount,
      newestJiraUpdate: portfolio.newestJiraUpdate,
      evidenceRecords: evidenceRecords.length,
      candidateChanges: portfolio.proposals.length,
      safeToAutoApply: portfolio.proposals.filter((proposal) => !proposal.uncertainty).length,
      teamLibraryFiles: library?.totalFiles || 0,
      microsoft365Items: microsoft365.items.length,
    },
    summary: portfolio.proposals.length
      ? `${portfolio.proposals.length} review candidates were generated. None will be applied while its target or effect remains uncertain.`
      : "No current evidence produced a safe or reviewable Jira change.",
  };
}

async function applyReconciliationBatch(body) {
  if (body.confirmation !== "APPLY REVIEWED MDM CHANGES") {
    throw new GatewayError(
      400,
      "The deliberate MDM batch confirmation phrase is required.",
      "confirmation_required"
    );
  }
  const proposals = Array.isArray(body.proposals) ? body.proposals : [];
  if (!proposals.length) {
    throw new GatewayError(400, "There are no reviewed changes to apply.", "empty_batch");
  }
  if (
    proposals.some(
      (proposal) =>
        !ISSUE_KEY_RE.test(proposal.issueKey || "") ||
        proposal.uncertainty ||
        !proposal.sourceReferences?.length
    )
  ) {
    throw new GatewayError(
      400,
      "Every batch change must target an MT issue, include provenance, and be free of unresolved uncertainty.",
      "unsafe_batch"
    );
  }

  const results = [];
  for (const proposal of proposals) {
    try {
      const result = await updateIssue(proposal.issueKey, proposal.effect);
      results.push({ issueKey: proposal.issueKey, ok: !result.partial, ...result });
    } catch (error) {
      results.push({ issueKey: proposal.issueKey, ok: false, error: error.message });
    }
  }
  return { scope: INITIATIVE_KEY, results };
}

async function route(request, response) {
  const origin = request.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return sendJson(response, 403, { ok: false, error: "Origin is not allowed." });
  }
  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return sendJson(response, 204, {}, origin);
  }

  const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);
  try {
    if (request.method === "GET" && url.pathname === "/healthz") {
      return sendJson(
        response,
        200,
        {
          ok: true,
          service: "ipcorp-workbench-data-gateway",
          host: HOST,
          port: PORT,
        },
        origin
      );
    }

    if (request.method === "GET" && url.pathname === "/api/jira/status") {
      const me = await jiraRequest("/rest/api/3/myself");
      return sendJson(
        response,
        200,
        {
          ok: true,
          data: {
            connected: true,
            initiativeKey: INITIATIVE_KEY,
            user: me.displayName || "Authenticated Jira user",
            credentialSource: "Approved Prism runtime storage",
          },
        },
        origin
      );
    }

    if (request.method === "GET" && url.pathname === "/api/jira/initiative") {
      const [issues, statuses, assignees, priorities] = await Promise.all([
        searchMdmIssues(),
        getProjectStatuses(),
        getAssignableUsers(),
        getPriorities(),
      ]);
      return sendJson(
        response,
        200,
        {
          ok: true,
          data: {
            projectKey: INITIATIVE_KEY,
            name: "MDM Team / Fabric Data Migration",
            issues,
            statuses,
            assignees,
            priorities,
            fetchedAt: new Date().toISOString(),
          },
        },
        origin
      );
    }

    if (request.method === "GET" && url.pathname === "/api/team-library/manifest") {
      return sendJson(response, 200, { ok: true, data: await getTeamLibraryManifest() }, origin);
    }
    if (request.method === "GET" && url.pathname === "/api/team-library/preview") {
      return sendJson(
        response,
        200,
        {
          ok: true,
          data: await getTeamLibraryPreview(url.searchParams.get("path")),
        },
        origin
      );
    }
    if (request.method === "GET" && url.pathname === "/api/team-library/file") {
      return await sendTeamLibraryFile(response, url.searchParams.get("path"), origin);
    }
    if (request.method === "POST" && url.pathname === "/api/agents/dispatch") {
      const body = await readJsonBody(request);
      const key = String(body.issueKey || "");
      if (!ISSUE_KEY_RE.test(key)) {
        throw new GatewayError(400, "A valid MT issue key is required.", "invalid_issue_key");
      }
      const run = await dispatchAgent({
        issueKey: key,
        agent: String(body.agent || "claude"),
        context: String(body.context || ""),
        cwd: BRAIN_REPO_PATH,
        deps: {
          getIssue,
          transition: transitionIssueTo,
          comment: addIssueComment,
          logWork: logIssueWork,
        },
      });
      return sendJson(response, 202, { ok: true, data: run }, origin);
    }
    if (request.method === "GET" && url.pathname === "/api/agents/run") {
      const key = url.searchParams.get("issueKey") || "";
      return sendJson(response, 200, { ok: true, data: getRun(key) }, origin);
    }
    if (request.method === "GET" && url.pathname === "/api/agents/runs") {
      return sendJson(response, 200, { ok: true, data: listRuns() }, origin);
    }
    if (request.method === "GET" && url.pathname === "/api/meetings/infographic") {
      return await sendMeetingInfographic(
        response,
        url.searchParams.get("id"),
        url.searchParams.get("file"),
        origin
      );
    }
    if (request.method === "GET" && url.pathname === "/api/m365/reconcile-evidence") {
      const force = url.searchParams.get("force") === "true";
      return sendJson(
        response,
        200,
        { ok: true, data: await getMicrosoft365ReconciliationEvidence(force) },
        origin
      );
    }

    const issueMatch = url.pathname.match(/^\/api\/jira\/issues\/(MT-\d+)$/);
    if (issueMatch && request.method === "GET") {
      const issue = await getIssue(issueMatch[1]);
      const transitions = await getTransitions(issueMatch[1]);
      return sendJson(response, 200, { ok: true, data: { issue, transitions } }, origin);
    }
    if (issueMatch && request.method === "PUT") {
      const result = await updateIssue(issueMatch[1], await readJsonBody(request));
      return sendJson(response, 200, { ok: true, data: result }, origin);
    }

    if (request.method === "POST" && url.pathname === "/api/jira/reconcile/preview") {
      const options = await readJsonBody(request);
      return sendJson(
        response,
        200,
        { ok: true, data: await createReconciliationPreview(options) },
        origin
      );
    }
    if (request.method === "GET" && url.pathname === "/api/jira/reconcile/export") {
      return sendJson(response, 200, { ok: true, data: await getMdmEvidenceExport() }, origin);
    }
    if (request.method === "POST" && url.pathname === "/api/jira/reconcile/apply") {
      return sendJson(
        response,
        200,
        { ok: true, data: await applyReconciliationBatch(await readJsonBody(request)) },
        origin
      );
    }

    return sendJson(response, 404, { ok: false, error: "Route not found." }, origin);
  } catch (error) {
    const status = error instanceof GatewayError ? error.status : 500;
    return sendJson(
      response,
      status,
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected gateway error.",
        code: error.code || "unexpected_error",
        details: error.details,
      },
      origin
    );
  }
}

createServer(route).listen(PORT, HOST, () => {
  console.log(`IP Corp Workbench data gateway ready at http://${HOST}:${PORT}`);
  console.log(`Scope locked to Jira project ${INITIATIVE_KEY}.`);
  console.log("Team Library access is read-only.");
});
