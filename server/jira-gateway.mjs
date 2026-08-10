import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createActivityReconciliationService } from "./activity-reconciliation/activity-reconciliation.mjs";
import { createActivityReconciliationRouter } from "./activity-reconciliation/activity-router.mjs";
import { collectActivitySources } from "./activity-reconciliation/activity-sources.mjs";
import { createActivityStore } from "./activity-reconciliation/activity-store.mjs";
import { dispatch as dispatchAgent, getRun, listRuns } from "./agent-dispatch.mjs";
import { getDailyMeetingPrep, readDailyMeetingPrepFile } from "./daily-meeting-prep.mjs";
import {
  applyDispositions,
  classifyEvidence,
  loadLedger,
  recordScan,
  saveLedger,
} from "./mdm-reconciliation/scan-ledger.mjs";
import {
  handleMeetingCloseoutRoute,
  inspectStoredMeetingPackage,
  listStoredPackages,
  processMeetingCloseout,
} from "./meeting-closeout.mjs";
import { generateBreakdown, minutesToJiraEstimate } from "./subtask-breakdown.mjs";
import {
  generateWeeklyStatus,
  renderWeeklyStatusHtml,
  saveHistory as saveWeeklyStatusHistory,
  toIsoDate,
  weeklyStatusSubject,
} from "./weekly-status/build-weekly-status.mjs";
import { createWorkbenchAgentRouter } from "./workbench-agent/index.mjs";

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
// The public tunnel proxies /api through the Vite dev server on :5217, but the
// browser's Origin header still reads as the tunnel's own domain, not 127.0.0.1, so
// that domain has to be allowed explicitly or every request from it is rejected here.
const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5217",
  "http://localhost:5217",
  "https://ip-corp-brain.nahrup.ngrok.app",
]);
const ISSUE_KEY_RE = /^MT-\d+$/;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_LIBRARY_PREVIEW_BYTES = 512 * 1024;
const execFile = promisify(execFileCallback);
const M365_ADAPTER_PATH = resolve(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  "m365-reconcile.py"
);
const WEEKLY_STATUS_DRAFT_ADAPTER = resolve(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  "weekly-status",
  "m365-create-draft.py"
);
const WEEKLY_STATUS_DRAFT_TIMEOUT_MS = 15 * 60 * 1000;
const M365_CACHE_MS = 10 * 60 * 1000;
const M365_RECONCILE_TIMEOUT_MS = 15 * 60 * 1000;
let m365EvidenceCache = null;
let m365EvidenceInFlight = null;
let workbenchAgentRouter = null;
let activityReconciliationRouter = null;
// Durable scan memory for Refresh and Reconcile, owned entirely by this gateway.
// It must live OUTSIDE the repo: Tailwind v4's automatic source scan watches every
// non-gitignored file here, so a mid-scan ledger write inside the repo triggered a
// full Vite reload that killed the reconciliation modal during its own scan.
// LocalApplicationData\IPCorpBrain is where the launcher already keeps its logs.
const RECONCILIATION_LEDGER_PATH =
  process.env.IPCORP_RECONCILIATION_LEDGER_PATH ||
  join(
    process.env.LOCALAPPDATA || join(process.env.USERPROFILE || ".", "AppData", "Local"),
    "IPCorpBrain",
    "mdm-reconciliation-ledger.json"
  );
const ACTIVITY_RECONCILIATION_STATE_PATH =
  process.env.IPCORP_ACTIVITY_RECONCILIATION_STATE_PATH ||
  join(
    process.env.LOCALAPPDATA || join(process.env.USERPROFILE || ".", "AppData", "Local"),
    "IPCorpBrain",
    "activity-reconciliation.json"
  );

function getActivityReconciliationRouter() {
  if (!activityReconciliationRouter) {
    const service = createActivityReconciliationService({
      store: createActivityStore(ACTIVITY_RECONCILIATION_STATE_PATH),
      collectSources: (input) =>
        collectActivitySources(input, {
          brainRoot: BRAIN_REPO_PATH,
        }),
      loadJiraIssues: loadActivityJiraIssues,
      inspectMeeting: inspectActivityMeeting,
      processMeeting: processActivityMeeting,
      applyJiraProposal: applyActivityJiraProposal,
      runMdmCheck: runActivityMdmCheck,
    });
    activityReconciliationRouter = createActivityReconciliationRouter(service);
  }
  return activityReconciliationRouter;
}

async function readActivityFixture() {
  const fixturePath = process.env.ACTIVITY_RECONCILIATION_FIXTURE;
  if (!fixturePath) return null;
  return JSON.parse(await readFile(resolve(fixturePath), "utf8"));
}

async function loadActivityJiraIssues() {
  const fixture = await readActivityFixture();
  if (fixture) return Array.isArray(fixture.jiraIssues) ? fixture.jiraIssues : [];
  return searchMdmIssues();
}

// Chained after every activity run so one click covers both workflows. Reuses
// the same preview path the Reconcile MDM modal calls, so opening that review
// afterward picks up this already-generated result.
async function runActivityMdmCheck() {
  const fixture = await readActivityFixture();
  if (fixture) {
    return fixture.mdmCheck || { previewId: "fixture-mdm-preview", proposalCount: 0 };
  }
  const preview = await createReconciliationPreview({});
  return {
    previewId: preview?.id || null,
    proposalCount: Array.isArray(preview?.proposals) ? preview.proposals.length : 0,
  };
}

function getWorkbenchAgentRouter() {
  if (!workbenchAgentRouter) {
    workbenchAgentRouter = createWorkbenchAgentRouter({
      allowedOrigins: ALLOWED_ORIGINS,
      deps: {
        getIssue,
        searchMdmIssues,
        getTeamLibraryManifest,
        getTeamLibraryPreview,
        getMicrosoft365ReconciliationEvidence,
        updateIssue,
      },
    });
  }
  return workbenchAgentRouter;
}

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

/**
 * Local mirror of the Prism credential store, refreshed on every successful
 * primary read. The primary lives on the external My Passport drive, which
 * proved it can vanish mid-session (2026-07-30: the drive disconnected and
 * every Jira route 503d until it was plugged back in). The mirror sits on C:,
 * outside OneDrive, and is only ever read when the primary is unreachable.
 */
const SETTINGS_FALLBACK_PATH =
  process.env.PRISM_JIRA_SETTINGS_FALLBACK || "C:\\Users\\snahrup\\.prism\\prism-settings.json";
let settingsMirrorContent = null;

async function readJiraSettings() {
  try {
    const raw = await readFile(resolve(SETTINGS_PATH), "utf8");
    // Keep the mirror current without ever blocking a request on it.
    if (raw !== settingsMirrorContent) {
      settingsMirrorContent = raw;
      mkdir(resolve(SETTINGS_FALLBACK_PATH, ".."), { recursive: true })
        .then(() => writeFile(resolve(SETTINGS_FALLBACK_PATH), raw, "utf8"))
        .catch(() => {});
    }
    return { settings: JSON.parse(raw), source: "primary" };
  } catch {
    // Primary gone (drive unplugged) — the mirror keeps Jira alive.
  }
  try {
    return {
      settings: JSON.parse(await readFile(resolve(SETTINGS_FALLBACK_PATH), "utf8")),
      source: "fallback",
    };
  } catch {
    throw new GatewayError(
      503,
      "The approved Prism Jira credential store is unavailable, and no local fallback copy exists yet.",
      "credential_store_unavailable"
    );
  }
}

async function getJiraConfig() {
  const { settings } = await readJiraSettings();

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

export function mapIssue(raw) {
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
      // The seconds Jira computed the strings from. The card metrics derive
      // "remaining" as original - logged rather than trusting Jira's own
      // remaining field, which drifts once worklogs use adjustEstimate=leave.
      originalEstimateSeconds: fields.timetracking?.originalEstimateSeconds ?? null,
      remainingEstimateSeconds: fields.timetracking?.remainingEstimateSeconds ?? null,
      timeSpentSeconds: fields.timetracking?.timeSpentSeconds ?? null,
    },
    attachments: Array.isArray(fields.attachment)
      ? fields.attachment.map((item) => ({
          id: item.id,
          filename: item.filename || "unnamed",
          size: Number(item.size) || 0,
          mimeType: item.mimeType || "application/octet-stream",
          createdAt: item.created || null,
          author: item.author?.displayName || "Unknown",
        }))
      : [],
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
    worklogs: Array.isArray(fields.worklog?.worklogs)
      ? fields.worklog.worklogs.map((worklog) => ({
          id: worklog.id,
          author: worklog.author?.displayName || "Unknown",
          comment: adfToText(worklog.comment),
          timeSpent: worklog.timeSpent || null,
          timeSpentSeconds: worklog.timeSpentSeconds || 0,
          createdAt: worklog.created || "",
        }))
      : [],
    ...lastActivity(fields),
  };
}

/**
 * The most recent thing that actually happened on an issue, and a one-line account of
 * it: who, what, and the narrative text if there is one.
 *
 * Jira's own `updated` field is not trusted alone. It happened to already be the max in
 * a spot check against MT-260, but nothing guarantees a workflow post-function or a
 * silent field sync cannot touch `updated` without a comment or worklog following it, or
 * vice versa. Computing the max explicitly across every real activity source is correct
 * by construction instead of by assumption about how this Jira instance is configured.
 */
// Auto-posted process comments that announce work starting rather than report work
// done. The dispatch pipeline no longer posts this one going forward, but a run started
// before that fix already left it sitting on real issues (MT-260, IPC-2648) as their
// newest comment, which made the Activity view report "no work performed" on tickets
// that were, or had been, actively worked. Matched by stable substring rather than a
// full-string equality so the fix survives if the surrounding sentence is ever reworded.
const PROCESS_NOISE = [/Picked this up to work on it now/i];

function isProcessNoise(text) {
  return PROCESS_NOISE.some((pattern) => pattern.test(text || ""));
}

export function lastActivity(fields) {
  const attributed = [];
  // The instant a filtered noise comment landed. Jira bumps `updated` to that same
  // instant, and filtering the comment's text does nothing to clean that bump back
  // out — verified by a test that failed until this set existed. Without it, a
  // suppressed comment still won the pick anyway, just with a blank summary instead
  // of the noise text, which is barely better than the original problem.
  const noiseTimestamps = new Set();

  for (const worklog of fields.worklog?.worklogs ?? []) {
    attributed.push({
      at: worklog.created || "",
      kind: "worklog",
      who: worklog.author?.displayName || "Someone",
      text: adfToText(worklog.comment),
      timeSpent: worklog.timeSpent || null,
    });
  }
  for (const comment of fields.comment?.comments ?? []) {
    const text = adfToText(comment.body);
    // A process-noise comment is real Jira history and stays on the issue, but it is
    // not eligible to be picked as "the most recent activity" — the next real event
    // underneath it, or the honest field fallback, takes its place instead.
    if (isProcessNoise(text)) {
      if (comment.created) noiseTimestamps.add(comment.created);
      continue;
    }
    attributed.push({
      at: comment.created || "",
      kind: "comment",
      who: comment.author?.displayName || "Someone",
      text,
    });
  }
  attributed.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const bestAttributed = attributed[0] ?? null;

  const fieldAt = fields.updated || "";
  const fieldIsNoise = noiseTimestamps.has(fieldAt);
  // The field fallback wins only when it represents time genuinely not already
  // accounted for: real, newer than anything attributed, and not just the shadow of a
  // comment already excluded above.
  const fieldWins = fieldAt && !fieldIsNoise && (!bestAttributed || fieldAt > bestAttributed.at);

  const latest = fieldWins
    ? { at: fieldAt, kind: "field", who: null, text: null }
    : (bestAttributed ?? { at: fieldAt, kind: "field", who: null, text: null });

  const snippet = (text, max = 110) => {
    const clean = (text || "").replace(/\s+/g, " ").trim();
    if (!clean) return "";
    return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
  };

  let summary;
  if (latest.kind === "worklog") {
    const time = latest.timeSpent ? ` — logged ${latest.timeSpent}` : "";
    const text = snippet(latest.text);
    summary = `${latest.who}${time}${text ? `: "${text}"` : ""}`;
  } else if (latest.kind === "comment") {
    const text = snippet(latest.text);
    summary = `${latest.who} commented${text ? `: "${text}"` : ""}`;
  } else {
    // A field changed (status, assignee, due date, a manual edit) with no comment or
    // worklog attached. There is no author on this field in a bulk search response, so
    // the honest line says what is known rather than guessing who.
    summary = "Updated — no comment or worklog logged";
  }

  return { lastActivityAt: latest.at || fields.updated || "", lastActivitySummary: summary };
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
  // Comment and worklog embed their full history in a bulk search response (verified:
  // an issue with 6 comments and 2 worklogs returned all 8, not a truncated page), so
  // the Activity view gets real last-activity data across every issue in one request
  // instead of one detail call per issue.
  "comment",
  "worklog",
].join(",");

const DETAIL_FIELDS = [
  BOARD_FIELDS,
  "description",
  "subtasks",
  "issuelinks",
  "comment",
  "attachment",
].join(",");

const JIRA_AGENT_SEARCH_FIELDS = Object.freeze([
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
  "issuelinks",
  "description",
]);
const JIRA_SEARCH_FIELD_ALLOWLIST = new Set([
  ...JIRA_AGENT_SEARCH_FIELDS,
  ...BOARD_FIELDS.split(","),
]);

export function assertMdmJql(jql) {
  const value = String(jql || "").trim();
  if (!value || value.length > 2_000) {
    throw new GatewayError(
      400,
      "Jira search needs a JQL query under 2,000 characters.",
      "invalid_jql"
    );
  }
  if (!/^project\s*=\s*(?:MT\b|"MT")/i.test(value)) {
    throw new GatewayError(
      400,
      "Agent Jira searches must start with project = MT.",
      "outside_mdm_scope"
    );
  }
  if (
    (value.match(/\bproject\b/gi) || []).length !== 1 ||
    /\b(?:OR|filter|issueFunction)\b/i.test(value)
  ) {
    throw new GatewayError(
      400,
      "Agent Jira searches must remain inside the MT initiative.",
      "outside_mdm_scope"
    );
  }
  const referencedKeys = value.match(/\b[A-Z][A-Z0-9_]+-\d+\b/g) || [];
  if (referencedKeys.some((key) => !ISSUE_KEY_RE.test(key))) {
    throw new GatewayError(
      400,
      "Agent Jira searches cannot reference issues outside the MT initiative.",
      "outside_mdm_scope"
    );
  }
  return value;
}

function normalizeJiraSearchFields(fields) {
  const requested = Array.isArray(fields) && fields.length ? fields : JIRA_AGENT_SEARCH_FIELDS;
  const values = [...new Set(requested.map((field) => String(field || "").trim()).filter(Boolean))];
  if (!values.length || values.some((field) => !JIRA_SEARCH_FIELD_ALLOWLIST.has(field))) {
    throw new GatewayError(
      400,
      "Jira search requested an unsupported field.",
      "invalid_jira_field"
    );
  }
  return values;
}

export async function searchJiraIssues(options = {}, requestFn = jiraRequest) {
  const jql = assertMdmJql(
    options.jql || `project = ${INITIATIVE_KEY} ORDER BY rank ASC, updated DESC`
  );
  const fields = normalizeJiraSearchFields(options.fields);
  const limit = Math.min(1_000, Math.max(1, Number(options.limit) || 100));
  const reconcileIssues = Array.isArray(options.reconcileIssues)
    ? [...new Set(options.reconcileIssues.map(Number).filter(Number.isInteger))].slice(0, 50)
    : [];
  const issues = [];
  let nextPageToken;
  do {
    const data = await requestFn("/rest/api/3/search/jql", {
      method: "POST",
      body: JSON.stringify({
        jql,
        maxResults: Math.min(100, limit - issues.length),
        fields,
        ...(nextPageToken ? { nextPageToken } : {}),
        ...(reconcileIssues.length ? { reconcileIssues } : {}),
      }),
    });
    const page = Array.isArray(data.issues) ? data.issues : [];
    issues.push(...page);
    nextPageToken = data.nextPageToken;
    if (!page.length) break;
  } while (nextPageToken && issues.length < limit);

  return {
    issues: issues.slice(0, limit).map(mapIssue),
    jql,
    fetchedAt: new Date().toISOString(),
    truncated: Boolean(nextPageToken && issues.length >= limit),
  };
}

export async function countJiraIssues(options = {}, requestFn = jiraRequest) {
  const jql = assertMdmJql(options.jql || `project = ${INITIATIVE_KEY}`);
  const data = await requestFn("/rest/api/3/search/approximate-count", {
    method: "POST",
    body: JSON.stringify({ jql }),
  });
  return {
    count: Math.max(0, Number(data.count) || 0),
    jql,
    approximate: true,
    fetchedAt: new Date().toISOString(),
  };
}

async function searchMdmIssues() {
  const result = await searchJiraIssues({ fields: BOARD_FIELDS.split(","), limit: 1_000 });
  return result.issues;
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

export async function getAllIssueWorklogs(key, requestFn = jiraRequest) {
  if (!ISSUE_KEY_RE.test(String(key || ""))) {
    throw new GatewayError(400, "A valid MT issue key is required.", "invalid_issue_key");
  }
  const worklogs = [];
  let startAt = 0;
  let total = Number.POSITIVE_INFINITY;
  while (startAt < total) {
    const data = await requestFn(
      `/rest/api/3/issue/${encodeURIComponent(key)}/worklog?startAt=${startAt}&maxResults=1000`
    );
    const page = Array.isArray(data.worklogs) ? data.worklogs : [];
    worklogs.push(
      ...page.map((worklog) => ({
        id: worklog.id,
        author: worklog.author?.displayName || "Unknown",
        authorAccountId: worklog.author?.accountId || null,
        startedAt: worklog.started || null,
        createdAt: worklog.created || null,
        updatedAt: worklog.updated || null,
        timeSpent: worklog.timeSpent || null,
        timeSpentSeconds: worklog.timeSpentSeconds || 0,
        comment: adfToText(worklog.comment),
      }))
    );
    total = Number(data.total || worklogs.length);
    if (!page.length) break;
    startAt += page.length;
  }
  return worklogs;
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

export async function getIssueWatchers(key, requestFn = jiraRequest) {
  if (!ISSUE_KEY_RE.test(String(key || ""))) {
    throw new GatewayError(400, "A valid MT issue key is required.", "invalid_issue_key");
  }
  const data = await requestFn(`/rest/api/3/issue/${encodeURIComponent(key)}/watchers`);
  return {
    isWatching: Boolean(data.isWatching),
    watchCount: Number(data.watchCount || 0),
    watchers: (Array.isArray(data.watchers) ? data.watchers : []).map((watcher) => ({
      accountId: watcher.accountId || null,
      active: watcher.active !== false,
      displayName: watcher.displayName || "Unknown",
    })),
  };
}

async function optionalJiraEvidence(read) {
  try {
    return { available: true, data: await read() };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : "Jira evidence is unavailable.",
    };
  }
}

async function getIssueEvidence(key) {
  const [issue, comments, worklogs, changelog, transitions, watchers] = await Promise.all([
    getIssue(key),
    getAllIssueComments(key),
    getAllIssueWorklogs(key),
    getAllIssueChangelog(key),
    optionalJiraEvidence(() => getTransitions(key)),
    optionalJiraEvidence(() => getIssueWatchers(key)),
  ]);
  return {
    ...issue,
    comments,
    worklogs,
    changelog,
    transitions,
    watchers,
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

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Read a raw request body (attachment uploads), bounded well above the JSON cap. */
async function readRawBody(request, maxBytes = MAX_ATTACHMENT_BYTES) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) {
      throw new GatewayError(
        413,
        `Attachments are limited to ${Math.round(maxBytes / 1024 / 1024)} MB.`,
        "attachment_too_large"
      );
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Upload one attachment to a Jira issue.
 *
 * The browser sends raw bytes with the filename in a header rather than
 * multipart — the gateway has no multipart parser and does not need one, since
 * Node's own FormData builds the multipart Jira requires on the way out.
 */
async function uploadAttachment(key, filename, contentType, data) {
  if (!filename) {
    throw new GatewayError(400, "An attachment needs a filename.", "attachment_no_name");
  }
  if (!data.length) {
    throw new GatewayError(400, "The attachment was empty.", "attachment_empty");
  }
  const config = await getJiraConfig();
  const form = new FormData();
  form.append(
    "file",
    new Blob([data], { type: contentType || "application/octet-stream" }),
    filename
  );
  let response;
  try {
    response = await fetch(
      `${config.baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}/attachments`,
      {
        method: "POST",
        headers: {
          Authorization: config.auth,
          Accept: "application/json",
          // Jira rejects attachment posts without this CSRF opt-out.
          "X-Atlassian-Token": "no-check",
          // Content-Type is deliberately absent: fetch writes the multipart
          // boundary itself, and overriding it breaks the parse on Jira's side.
        },
        body: form,
        signal: AbortSignal.timeout(120_000),
      }
    );
  } catch {
    throw new GatewayError(503, "Jira could not be reached for the upload.", "jira_unreachable");
  }
  if (!response.ok) {
    throw new GatewayError(
      response.status,
      `Jira rejected the attachment (HTTP ${response.status}).`,
      "attachment_rejected"
    );
  }
  const created = await response.json().catch(() => []);
  const first = Array.isArray(created) ? created[0] : null;
  return {
    id: first?.id || null,
    filename: first?.filename || filename,
    size: Number(first?.size) || data.length,
    mimeType: first?.mimeType || contentType || "application/octet-stream",
    createdAt: first?.created || new Date().toISOString(),
    author: first?.author?.displayName || "Unknown",
  };
}

/**
 * Stream an attachment's bytes back to the browser. Jira answers the content
 * endpoint with a redirect to a signed URL; fetch follows it, and the signed
 * host needs no Authorization header.
 */
async function sendAttachmentContent(response, id, download, origin) {
  if (!/^\d+$/.test(String(id || ""))) {
    throw new GatewayError(400, "A numeric attachment id is required.", "invalid_attachment_id");
  }
  const config = await getJiraConfig();
  let upstream;
  try {
    upstream = await fetch(`${config.baseUrl}/rest/api/3/attachment/content/${id}`, {
      headers: { Authorization: config.auth },
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new GatewayError(503, "Jira could not be reached.", "jira_unreachable");
  }
  if (!upstream.ok) {
    throw new GatewayError(
      upstream.status === 404 ? 404 : upstream.status,
      "The attachment could not be read from Jira.",
      "attachment_unavailable"
    );
  }
  const data = Buffer.from(await upstream.arrayBuffer());
  setAllowedOrigin(response, origin);
  response.setHeader(
    "Content-Type",
    upstream.headers.get("content-type") || "application/octet-stream"
  );
  response.setHeader("Cache-Control", "private, no-cache");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Disposition", download ? "attachment" : "inline");
  response.writeHead(200);
  response.end(data);
}

async function deleteAttachment(id) {
  if (!/^\d+$/.test(String(id || ""))) {
    throw new GatewayError(400, "A numeric attachment id is required.", "invalid_attachment_id");
  }
  await jiraRequest(`/rest/api/3/attachment/${id}`, { method: "DELETE" });
  return { deleted: id };
}

/** The MT project's Sub-task issue type id, resolved once per process. */
let subtaskTypeIdCache = null;
export async function getSubtaskTypeId(requestFn = jiraRequest) {
  if (subtaskTypeIdCache) return subtaskTypeIdCache;
  const data = await requestFn(
    `/rest/api/3/issue/createmeta/${INITIATIVE_KEY}/issuetypes?startAt=0&maxResults=100`
  );
  const types = Array.isArray(data.issueTypes) ? data.issueTypes : [];
  const subtaskType = types.find((type) => type.subtask === true);
  if (!subtaskType?.id) {
    throw new GatewayError(
      409,
      "The MT project has no sub-task issue type available.",
      "no_subtask_type"
    );
  }
  subtaskTypeIdCache = subtaskType.id;
  return subtaskTypeIdCache;
}

/**
 * Create the confirmed subtasks under a parent issue.
 *
 * The estimates were already reconciled at generate time, but the sum is
 * re-checked here against the parent's CURRENT original estimate: the preview
 * may have sat open while the parent changed, and a stale confirm must not
 * write a breakdown that no longer rolls up.
 */
async function createSubtasks(parentKey, body) {
  const parent = await getIssue(parentKey);
  if (!body.expectedUpdated || parent.updatedAt !== body.expectedUpdated) {
    throw new GatewayError(
      409,
      `${parentKey} changed in Jira after the breakdown was generated. Reload before creating subtasks.`,
      "edit_conflict",
      { currentUpdatedAt: parent.updatedAt }
    );
  }

  const subtasks = Array.isArray(body.subtasks) ? body.subtasks : [];
  if (subtasks.length < 2 || subtasks.length > 12) {
    throw new GatewayError(400, "A breakdown needs 2 to 12 subtasks.", "invalid_breakdown");
  }
  for (const subtask of subtasks) {
    if (!String(subtask.summary || "").trim() || !Number.isInteger(subtask.estimateMinutes)) {
      throw new GatewayError(
        400,
        "Every subtask needs a summary and a whole-minute estimate.",
        "invalid_breakdown"
      );
    }
  }

  const parentSeconds = parent.timeTracking?.originalEstimateSeconds || 0;
  const totalMinutes = subtasks.reduce((sum, item) => sum + item.estimateMinutes, 0);
  if (!parentSeconds || totalMinutes !== Math.round(parentSeconds / 60)) {
    throw new GatewayError(
      409,
      `The subtask estimates total ${totalMinutes}m but ${parentKey}'s original estimate is ${
        parentSeconds ? `${Math.round(parentSeconds / 60)}m` : "not set"
      }. Regenerate the breakdown so the rollup stays exact.`,
      "rollup_mismatch"
    );
  }

  const issueTypeId = await getSubtaskTypeId();
  const created = [];
  const errors = [];
  for (const subtask of subtasks) {
    try {
      const fields = {
        project: { key: INITIATIVE_KEY },
        parent: { key: parentKey },
        issuetype: { id: issueTypeId },
        summary: String(subtask.summary).trim(),
        description: textToAdf(String(subtask.description || subtask.summary)),
        labels: parent.labels,
        timetracking: {
          originalEstimate: minutesToJiraEstimate(subtask.estimateMinutes),
          remainingEstimate: minutesToJiraEstimate(subtask.estimateMinutes),
        },
        ...(parent.assignee?.accountId
          ? { assignee: { accountId: parent.assignee.accountId } }
          : {}),
      };
      const result = await jiraRequest("/rest/api/3/issue", {
        method: "POST",
        body: JSON.stringify({ fields }),
      });
      created.push({ key: result.key, summary: fields.summary });
    } catch (error) {
      errors.push(`${subtask.summary}: ${error.message}`);
    }
  }

  const refreshed = await getIssue(parentKey);
  return { parent: refreshed, created, errors, partial: errors.length > 0 };
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

export async function getPriorities(requestFn = jiraRequest) {
  const data = await requestFn("/rest/api/3/priority/search?startAt=0&maxResults=100");
  return (Array.isArray(data.values) ? data.values : []).map((priority) => ({
    id: priority.id,
    name: priority.name,
  }));
}

export async function searchJiraProjects(options = {}, requestFn = jiraRequest) {
  const query = String(options.query || "")
    .trim()
    .slice(0, 200);
  const limit = Math.min(200, Math.max(1, Number(options.limit) || 50));
  const projects = [];
  let startAt = 0;
  let total = Number.POSITIVE_INFINITY;
  while (startAt < total && projects.length < limit) {
    const params = new URLSearchParams({
      startAt: String(startAt),
      maxResults: String(Math.min(50, limit - projects.length)),
      orderBy: "name",
    });
    if (query) params.set("query", query);
    const data = await requestFn(`/rest/api/3/project/search?${params}`);
    const page = Array.isArray(data.values) ? data.values : [];
    projects.push(
      ...page.map((project) => ({
        id: String(project.id || ""),
        key: project.key || "",
        name: project.name || "",
        projectTypeKey: project.projectTypeKey || null,
        simplified: Boolean(project.simplified),
        style: project.style || null,
        archived: Boolean(project.archived),
        category: project.projectCategory?.name || null,
      }))
    );
    total = Number(data.total || projects.length);
    if (!page.length) break;
    startAt += page.length;
  }
  return {
    projects: projects.slice(0, limit),
    total: Number.isFinite(total) ? total : projects.length,
  };
}

export async function searchJiraFields(options = {}, requestFn = jiraRequest) {
  const query = String(options.query || "")
    .trim()
    .slice(0, 200);
  const type = String(options.type || "").trim();
  if (type && type !== "custom") {
    throw new GatewayError(
      400,
      "Jira field type must be custom when supplied.",
      "invalid_field_type"
    );
  }
  const limit = Math.min(500, Math.max(1, Number(options.limit) || 100));
  const fields = [];
  let startAt = 0;
  let total = Number.POSITIVE_INFINITY;
  while (startAt < total && fields.length < limit) {
    const params = new URLSearchParams({
      startAt: String(startAt),
      maxResults: String(Math.min(100, limit - fields.length)),
      orderBy: "name",
    });
    if (query) params.set("query", query);
    if (type) params.set("type", type);
    const data = await requestFn(`/rest/api/3/field/search?${params}`);
    const page = Array.isArray(data.values) ? data.values : [];
    fields.push(
      ...page.map((field) => ({
        id: field.id || "",
        key: field.key || field.id || "",
        name: field.name || "",
        description: field.description || "",
        custom: String(field.id || "").startsWith("customfield_"),
        locked: Boolean(field.isLocked),
        searchable: field.searchable !== false,
        schema: field.schema || null,
      }))
    );
    total = Number(data.total || fields.length);
    if (!page.length) break;
    startAt += page.length;
  }
  return { fields: fields.slice(0, limit), total: Number.isFinite(total) ? total : fields.length };
}

export async function getJiraIssueLinkTypes(requestFn = jiraRequest) {
  const data = await requestFn("/rest/api/3/issueLinkType");
  return (Array.isArray(data.issueLinkTypes) ? data.issueLinkTypes : []).map((type) => ({
    id: String(type.id || ""),
    name: type.name || "",
    inward: type.inward || "",
    outward: type.outward || "",
  }));
}

const JIRA_AGENT_PERMISSION_KEYS = [
  "BROWSE_PROJECTS",
  "CREATE_ISSUES",
  "EDIT_ISSUES",
  "TRANSITION_ISSUES",
  "ADD_COMMENTS",
  "WORK_ON_ISSUES",
  "MANAGE_WATCHERS",
  "VIEW_VOTERS_AND_WATCHERS",
];

export async function getJiraPermissions(issueKey, requestFn = jiraRequest) {
  const key = String(issueKey || "").trim();
  if (key && !ISSUE_KEY_RE.test(key)) {
    throw new GatewayError(400, "A valid MT issue key is required.", "invalid_issue_key");
  }
  const params = new URLSearchParams({
    permissions: JIRA_AGENT_PERMISSION_KEYS.join(","),
    ...(key ? { issueKey: key } : { projectKey: INITIATIVE_KEY }),
  });
  const data = await requestFn(`/rest/api/3/mypermissions?${params}`);
  return Object.fromEntries(
    JIRA_AGENT_PERMISSION_KEYS.map((permission) => [
      permission,
      Boolean(data.permissions?.[permission]?.havePermission),
    ])
  );
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

/**
 * The activity window. Evidence older than this is counted and disclosed, never
 * turned into a candidate.
 *
 * Steve, 2026-08-06: "I shouldn't see anything that's prior to this week at this
 * point." Before this, every scan re-proposed the entire exported backlog - 2025
 * meeting summaries, undated open questions, risks written months ago - which
 * buried the handful of records that had actually moved and made the batch
 * unusable.
 *
 * windowDays: "all" removes the window, a positive number is a rolling day count,
 * anything else means the current week starting Monday.
 */
export function startOfReconciliationWindow(windowDays, now = new Date()) {
  if (windowDays === "all") return null;
  if (Number.isFinite(windowDays) && windowDays > 0) {
    return new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  }
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  // Monday-start week: Sunday (0) counts back six days, Monday (1) counts back none.
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

const DATED_REFERENCE = /(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])/;

/**
 * When a record names its own date, that date wins over its file timestamp. A Team
 * Library resync rewrites every local mtime to today while the file still describes
 * a meeting from last October, so trusting mtime alone drags the whole 2025 backlog
 * into this week. Returns null when no date can be established at all.
 */
export function evidenceActivityAt(record) {
  const named = DATED_REFERENCE.exec(`${record.reference || ""} ${record.title || ""}`);
  if (named) {
    const parsed = new Date(`${named[0]}T12:00:00`).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  const updated = record.updatedAt ? new Date(record.updatedAt).getTime() : Number.NaN;
  return Number.isFinite(updated) ? updated : null;
}

/**
 * Split evidence into what the window covers and what it does not. Undated records
 * are held back too: a record that cannot show a date cannot show it belongs to
 * this week.
 */
export function partitionByActivityWindow(records, windowStart) {
  if (!windowStart) return { inWindow: records, olderThanWindow: [], undated: [] };
  const from = windowStart.getTime();
  const inWindow = [];
  const olderThanWindow = [];
  const undated = [];
  for (const record of records) {
    const activityAt = evidenceActivityAt(record);
    if (activityAt === null) undated.push(record);
    else if (activityAt < from) olderThanWindow.push(record);
    else inWindow.push(record);
  }
  return { inWindow, olderThanWindow, undated };
}

export function makePortfolioProposals(issues, evidenceRecords) {
  const proposals = [];
  const now = Date.now();
  const issueByKey = new Map(issues.map((issue) => [issue.key, issue]));
  const openIssues = issues.filter((issue) => issue.status.category !== "done");
  // Counted and shown, but never turned into proposals: a stale ticket with no
  // associated evidence is exactly the ticket this workflow must leave alone.
  // Commenting or cancelling it just because nothing touched it clogs the activity
  // feed with non-work, so proposals only ever come from evidence.
  const staleOpenIssues = openIssues.filter((issue) => {
    const updated = new Date(issue.updatedAt).getTime();
    return Number.isFinite(updated) && now - updated > 45 * 24 * 60 * 60 * 1000;
  });

  for (const evidence of evidenceRecords) {
    const explicitKeys = jiraKeysInEvidence(evidence).filter((key) => issueByKey.has(key));
    for (const key of explicitKeys) {
      const issue = issueByKey.get(key);
      proposals.push({
        id: `explicit-${evidence.kind}-${evidence.id}-${key}`.replaceAll(" ", "-"),
        issueKey: key,
        category: "explicit-source-crosswalk",
        title: `Review ${evidence.kind.toLowerCase()} against ${key}`,
        freshness: evidence.freshness || "new",
        fingerprint: evidence.fingerprint || null,
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
        freshness: evidence.freshness || "new",
        fingerprint: evidence.fingerprint || null,
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

  // New activity leads, changed activity follows, quiet carried debt sits last.
  const freshnessRank = { new: 0, changed: 1, carried: 2 };
  proposals.sort((a, b) => (freshnessRank[a.freshness] ?? 3) - (freshnessRank[b.freshness] ?? 3));

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
  const scanStartedAt = new Date().toISOString();
  const ledger = await loadLedger(RECONCILIATION_LEDGER_PATH);
  const windowFrom = ledger.lastScanAt;
  const requestedWindow = options.windowDays === "all" ? "all" : Number(options.windowDays) || null;
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

  // The ledger decides what deserves attention: records already reviewed, applied,
  // or dismissed with unchanged substance are excluded before any proposal exists.
  const classified = classifyEvidence(evidenceRecords, ledger);
  const activeEvidence = classified.records;
  const evidenceCounts = classified.counts;

  // Then the activity window decides what is current enough to propose at all.
  const windowStart = startOfReconciliationWindow(requestedWindow);
  const windowed = partitionByActivityWindow(activeEvidence, windowStart);
  const heldBack = windowed.olderThanWindow.length + windowed.undated.length;

  const portfolio = makePortfolioProposals(issues, windowed.inWindow);
  const conflicts = [];
  if (
    windowed.inWindow.length &&
    !windowed.inWindow.some((evidence) => jiraKeysInEvidence(evidence).length)
  ) {
    conflicts.push({
      id: "missing-crosswalk",
      title: "Active evidence has no explicit MT issue-key crosswalk",
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

  const generatedAt = new Date().toISOString();
  const nextLedger = recordScan(
    ledger,
    {
      startedAt: scanStartedAt,
      finishedAt: generatedAt,
      window: { from: windowFrom, to: generatedAt },
      sources: sourceStates.map((source) => ({ id: source.id, state: source.state })),
      counts: evidenceCounts,
      proposalCount: portfolio.proposals.length,
    },
    activeEvidence
  );
  await saveLedger(RECONCILIATION_LEDGER_PATH, nextLedger);

  const activityWindowLabel = !windowStart
    ? "everything on record"
    : requestedWindow === null
      ? "this week"
      : `the last ${requestedWindow} days`;
  const windowLabel = `${activityWindowLabel}${
    windowStart ? ` (from ${windowStart.toLocaleDateString()})` : ""
  }`;
  const activeProposals = portfolio.proposals.filter(
    (proposal) => proposal.freshness !== "carried"
  ).length;
  const carriedProposals = portfolio.proposals.length - activeProposals;
  const handledPhrase =
    evidenceCounts.resolvedCount === 1
      ? "1 already handled record was left alone"
      : `${evidenceCounts.resolvedCount} already handled records were left alone`;
  // Never silently truncate: say exactly how much the window held back.
  const heldBackPhrase = heldBack
    ? ` ${windowed.olderThanWindow.length} older and ${windowed.undated.length} undated records were counted and left out of the candidate list.`
    : "";
  return {
    id: `mdm-preview-${Date.now()}`,
    scope: {
      projectKey: INITIATIVE_KEY,
      label: "MDM Team / Fabric Data Migration",
      guarded: true,
    },
    generatedAt,
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
      sinceLastScan: windowFrom,
      scanCount: nextLedger.scans.length,
      newEvidence: evidenceCounts.newCount,
      changedEvidence: evidenceCounts.changedCount,
      carriedEvidence: evidenceCounts.carriedCount,
      resolvedEvidence: evidenceCounts.resolvedCount,
      activityWindowFrom: windowStart ? windowStart.toISOString() : null,
      activityWindowLabel,
      olderThanWindow: windowed.olderThanWindow.length,
      undatedEvidence: windowed.undated.length,
    },
    summary: portfolio.proposals.length
      ? `Scanned ${windowLabel}: ${activeProposals} candidates come from new or changed evidence and ${carriedProposals} are carried from earlier scans.${heldBackPhrase} ${handledPhrase}.`
      : `Scanned ${windowLabel}: nothing in the window needed review.${heldBackPhrase} ${handledPhrase}.`,
  };
}

/**
 * Draft this week's status update from live Jira movement. Read-only against Jira
 * and against Microsoft 365: nothing is written until the separate draft route runs,
 * and even that only creates an Outlook draft.
 */
async function createWeeklyStatusDraft(body = {}) {
  const reportDate =
    typeof body.reportDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.reportDate)
      ? body.reportDate
      : toIsoDate(new Date());
  const guidance =
    typeof body.guidance === "string" && body.guidance.trim()
      ? body.guidance.trim().slice(0, 2_000)
      : "";
  const issues = await searchMdmIssues();
  const draft = await generateWeeklyStatus({ reportDate, issues, guidance });
  return {
    ...draft,
    subject: weeklyStatusSubject(reportDate),
    html: renderWeeklyStatusHtml({ reportDate: draft.reportDate, fields: draft.fields }),
  };
}

/** Re-render after Steve edits a field. No model call, no Jira read. */
function renderWeeklyStatus(body = {}) {
  const reportDate =
    typeof body.reportDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.reportDate)
      ? body.reportDate
      : toIsoDate(new Date());
  if (!body.fields || typeof body.fields !== "object") {
    throw new GatewayError(400, "There are no status fields to render.", "empty_status_fields");
  }
  return {
    reportDate,
    subject: weeklyStatusSubject(reportDate),
    html: renderWeeklyStatusHtml({ reportDate, fields: body.fields }),
  };
}

/**
 * Hand the approved HTML to Outlook as a draft. Steve sends it himself from Outlook;
 * this route has no path that sends mail.
 */
async function createWeeklyStatusOutlookDraft(body = {}) {
  const to = Array.isArray(body.to) ? body.to : [];
  const cc = Array.isArray(body.cc) ? body.cc : [];
  const subject = String(body.subject || "").trim();
  const html = String(body.html || "").trim();
  if (!to.length || !subject || !html) {
    throw new GatewayError(
      400,
      "A draft needs at least one recipient address, a subject, and the rendered email.",
      "incomplete_draft"
    );
  }
  const inputPath = join(
    process.env.LOCALAPPDATA || join(process.env.USERPROFILE || ".", "AppData", "Local"),
    "IPCorpBrain",
    "weekly-status",
    `draft-request.${Date.now()}.json`
  );
  await mkdir(join(inputPath, ".."), { recursive: true });
  await writeFile(inputPath, JSON.stringify({ to, cc, subject, body: html }), "utf8");

  let stdout = "";
  try {
    const result = await execFile("python", [WEEKLY_STATUS_DRAFT_ADAPTER], {
      timeout: WEEKLY_STATUS_DRAFT_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, WEEKLY_STATUS_DRAFT_INPUT: inputPath },
    });
    stdout = result.stdout;
  } catch (error) {
    stdout = error?.stdout || "";
    const failure = parseLastJsonObject(stdout);
    throw new GatewayError(
      502,
      failure?.error ||
        (error?.killed
          ? "Outlook did not finish the draft within the bounded wait. It was not restarted."
          : "The Outlook draft could not be created."),
      failure?.code || "draft_adapter_error"
    );
  }
  const payload = parseLastJsonObject(stdout);
  if (!payload?.ok) {
    throw new GatewayError(
      502,
      payload?.error || "The Outlook draft could not be created.",
      payload?.code || "draft_failed"
    );
  }
  if (body.reportDate && body.fields) {
    // History exists so next week's draft does not repeat this week's bullets.
    await saveWeeklyStatusHistory(body.reportDate, body.fields);
  }
  return payload.data;
}

async function dismissReconciliationEvidence(body) {
  const fingerprints = Array.isArray(body.fingerprints)
    ? body.fingerprints.filter((item) => typeof item === "string" && item.includes("::"))
    : [];
  if (!fingerprints.length) {
    throw new GatewayError(400, "There are no evidence fingerprints to resolve.", "empty_dismiss");
  }
  const ledger = await loadLedger(RECONCILIATION_LEDGER_PATH);
  const next = applyDispositions(
    ledger,
    fingerprints,
    "dismissed",
    new Date().toISOString(),
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim()
      : "Reviewed, no Jira change"
  );
  await saveLedger(RECONCILIATION_LEDGER_PATH, next);
  const dismissed = fingerprints.filter(
    (fingerprint) => next.evidence[fingerprint]?.disposition === "dismissed"
  ).length;
  return { dismissed, requested: fingerprints.length };
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
      results.push({
        issueKey: proposal.issueKey,
        fingerprint: proposal.fingerprint || null,
        ok: !result.partial,
        ...result,
      });
    } catch (error) {
      results.push({
        issueKey: proposal.issueKey,
        fingerprint: proposal.fingerprint || null,
        ok: false,
        error: error.message,
      });
    }
  }

  // Applied evidence is settled evidence: record it so the next scan leaves it alone
  // unless its source actually changes again.
  const appliedFingerprints = results
    .filter((result) => result.ok && result.fingerprint)
    .map((result) => result.fingerprint);
  if (appliedFingerprints.length) {
    const ledger = await loadLedger(RECONCILIATION_LEDGER_PATH);
    await saveLedger(
      RECONCILIATION_LEDGER_PATH,
      applyDispositions(ledger, appliedFingerprints, "applied", new Date().toISOString())
    );
  }
  return { scope: INITIATIVE_KEY, results, dispositionsRecorded: appliedFingerprints.length };
}

async function processActivityMeeting({ evidence }) {
  const fixture = await readActivityFixture();
  if (fixture) {
    const saved = fixture.meetingResults?.[evidence.meeting?.id || evidence.stableId];
    return (
      saved || {
        ok: false,
        id: evidence.meeting?.id || evidence.stableId,
        detail: "The fixture has no saved result for this meeting.",
      }
    );
  }
  const result = await processMeetingCloseout({
    meeting: evidence.rawMeeting || evidence.meeting,
    transcript: evidence.transcript,
    contextNotes: "Collected by the user-started Workbench activity reconciliation run.",
  });
  if (!result.ok) {
    return {
      ok: false,
      id: evidence.meeting?.id || evidence.stableId,
      detail: result.detail || result.error || "Meeting processing is incomplete.",
    };
  }
  const saved = result.package?.infographic?.saved;
  const links = saved
    ? [
        {
          label: "Open meeting infographic",
          href: `/api/meetings/infographic?id=${encodeURIComponent(saved.id)}&file=${encodeURIComponent(saved.file)}`,
        },
      ]
    : [];
  return {
    ok: true,
    id: result.package.id,
    detail: "Meeting summary, actions, Brain files, and infographic are complete.",
    reviewComplete: true,
    reviewItems: [
      ...(result.package.jiraProposals || []).map((proposal, index) => ({
        providerItemId: `${result.package.id}:jira:${index}`,
        eventAt: result.package.meeting?.start || result.package.createdAt,
        title: proposal.title,
        summary: proposal.evidence || proposal.rationale,
        status: "review",
        jiraKey: proposal.jiraKey,
        jiraReferenceKind: proposal.jiraKey ? "direct" : "unknown",
        jiraContextSignals: [
          `Meeting action from ${result.package.meeting?.title || result.package.id}`,
        ],
        sourceReference: result.package.files?.summary || null,
        actionable: true,
      })),
      ...(result.package.emailDrafts || []).map((draft, index) => ({
        providerItemId: `${result.package.id}:email:${index}`,
        eventAt: result.package.meeting?.start || result.package.createdAt,
        title: draft.subject,
        summary: draft.evidence || `Follow-up from ${result.package.meeting?.title}`,
        status: "draft",
        sourceReference: result.package.files?.summary || null,
        actionable: false,
        suggestedEmail: {
          to: draft.to,
          subject: draft.subject,
          body: draft.body,
        },
      })),
    ],
    receipt: {
      packageId: result.package.id,
      files: result.package.files,
      infographic: saved || null,
      inspection: result.inspection,
    },
    links,
  };
}

async function inspectActivityMeeting({ evidence }) {
  const fixture = await readActivityFixture();
  if (fixture) {
    const saved = fixture.meetingResults?.[evidence.meeting?.id || evidence.stableId];
    return { complete: Boolean(saved?.ok), fixture: true };
  }
  const meeting = evidence.rawMeeting || evidence.meeting || {};
  const packages = await listStoredPackages({ brainRoot: BRAIN_REPO_PATH });
  const stored = packages.find(
    (item) =>
      (meeting.id && item?.meeting?.id === meeting.id) ||
      (item?.meeting?.title === meeting.title && item?.meeting?.start === meeting.start)
  );
  return stored
    ? inspectStoredMeetingPackage(stored, { brainRoot: BRAIN_REPO_PATH })
    : { complete: false, missing: ["meetingPackage"] };
}

function sameActivityText(left, right) {
  const normalize = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  return normalize(left) === normalize(right);
}

async function createActivityJiraIssue(change) {
  const me = await jiraRequest("/rest/api/3/myself");
  const fields = {
    ...(change.fields || {}),
    project: { key: INITIATIVE_KEY },
    summary: String(change.summary || "").slice(0, 240),
    issuetype: { name: change.issueType || "Task" },
    description: activityIssueDescription(change),
    ...(me.accountId ? { assignee: { accountId: me.accountId } } : {}),
  };
  let created;
  try {
    created = await jiraRequest("/rest/api/3/issue", {
      method: "POST",
      body: JSON.stringify({ fields }),
    });
  } catch (error) {
    const wrapped = new GatewayError(
      409,
      "Jira creation did not produce a verified receipt. Review Jira before trying again.",
      "jira_create_recovery_required"
    );
    wrapped.cause = error;
    throw wrapped;
  }
  if (!ISSUE_KEY_RE.test(created?.key || "")) {
    throw new GatewayError(
      409,
      "Jira did not return a verified MT issue key. Review Jira before trying again.",
      "jira_create_recovery_required"
    );
  }
  return getIssue(created.key);
}

function activityIssueDescription(change) {
  const text = (value) => ({ type: "text", text: String(value || "") });
  const paragraph = (value) => ({ type: "paragraph", content: [text(value)] });
  const heading = (value) => ({ type: "heading", attrs: { level: 2 }, content: [text(value)] });
  const bulletList = (items) => ({
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [paragraph(item)],
    })),
  });
  return {
    version: 1,
    type: "doc",
    content: [
      heading("Objective"),
      paragraph(`Track and complete ${change.summary}.`),
      heading("Context"),
      paragraph(change.description || "A reviewed Workbench activity item supports this work."),
      heading("Approach and activities"),
      bulletList([
        "Review the supporting source and confirm the current owner.",
        "Complete the described work and record any decision that changes the delivery plan.",
        "Keep progress, time, and status current as the work moves forward.",
      ]),
      heading("Decision and outcome"),
      paragraph("The reviewed activity supports creating this work item in the MT initiative."),
      heading("Acceptance criteria"),
      bulletList([
        "The supporting source is linked or cited in the work item.",
        "The stated work is complete and its outcome is recorded.",
        "Time and status match the work that was actually completed.",
      ]),
    ],
  };
}

async function applyActivityJiraProposal({ proposal }) {
  const fixture = await readActivityFixture();
  if (fixture) {
    return {
      receipt: {
        fixture: true,
        issueKey: proposal.issueKey || "MT-FIXTURE",
        checkedAt: new Date().toISOString(),
        changes: (proposal.changes || []).map((change) => change.kind),
      },
      links: [],
    };
  }
  let issueKey = proposal.issueKey;
  if (issueKey) {
    const current = await getIssue(issueKey);
    if (!proposal.expectedUpdated || current.updatedAt !== proposal.expectedUpdated) {
      throw new GatewayError(
        409,
        `${issueKey} changed after this proposal was prepared. Refresh before applying it.`,
        "edit_conflict",
        { expectedUpdated: proposal.expectedUpdated, currentUpdated: current.updatedAt }
      );
    }
  }

  for (const change of proposal.changes || []) {
    if (change.kind === "create_issue") {
      const created = await createActivityJiraIssue(change);
      issueKey = created.key;
    } else if (change.kind === "comment") {
      await addIssueComment(issueKey, change.body);
    } else if (change.kind === "worklog") {
      await logIssueWork(issueKey, Number(change.minutes || 0) * 60, change.comment);
    } else if (change.kind === "transition") {
      await transitionIssueTo(issueKey, change.toStatus);
    } else {
      throw new GatewayError(400, "The approved proposal contains an unsupported Jira change.");
    }
  }

  const readback = await getIssue(issueKey);
  for (const change of proposal.changes || []) {
    if (change.kind === "create_issue" && !sameActivityText(readback.summary, change.summary)) {
      throw new GatewayError(409, "Jira issue readback did not match the approved proposal.");
    }
    if (
      change.kind === "comment" &&
      !(readback.comments || []).some((comment) => sameActivityText(comment.body, change.body))
    ) {
      throw new GatewayError(409, "Jira comment readback did not match the approved proposal.");
    }
    if (
      change.kind === "worklog" &&
      !(readback.worklogs || []).some(
        (worklog) =>
          worklog.timeSpentSeconds === Math.round(Number(change.minutes || 0) * 60) &&
          sameActivityText(worklog.comment, change.comment)
      )
    ) {
      throw new GatewayError(409, "Jira worklog readback did not match the approved proposal.");
    }
    if (
      change.kind === "transition" &&
      readback.status.name.toLowerCase() !== String(change.toStatus).toLowerCase()
    ) {
      throw new GatewayError(409, "Jira status readback did not match the approved proposal.");
    }
  }
  const config = await getJiraConfig();
  return {
    receipt: {
      issueKey,
      updatedAt: readback.updatedAt,
      checkedAt: new Date().toISOString(),
      changes: (proposal.changes || []).map((change) => change.kind),
    },
    links: [{ label: issueKey, href: `${config.baseUrl}/browse/${issueKey}` }],
  };
}

async function route(request, response) {
  const origin = request.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return sendJson(response, 403, { ok: false, error: "Origin is not allowed." });
  }
  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Filename, X-Workbench-Agent-Request"
    );
    response.setHeader("Access-Control-Allow-Credentials", "true");
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

    if (url.pathname.startsWith("/api/work/activity-reconciliation")) {
      const activityReconciliation = await getActivityReconciliationRouter().handle(request, url);
      if (activityReconciliation) {
        return sendJson(
          response,
          activityReconciliation.status,
          activityReconciliation.body,
          origin
        );
      }
    }

    const meetingCloseout = await handleMeetingCloseoutRoute(request, url);
    if (meetingCloseout) {
      return sendJson(response, meetingCloseout.status, meetingCloseout.body, origin);
    }

    const workbenchAgent = await getWorkbenchAgentRouter().handle(request, response, url);
    if (workbenchAgent) return;

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

    if (request.method === "GET" && url.pathname === "/api/jira/agent/search") {
      const fields = String(url.searchParams.get("fields") || "")
        .split(",")
        .map((field) => field.trim())
        .filter(Boolean);
      const reconcileIssues = String(url.searchParams.get("reconcileIssues") || "")
        .split(",")
        .map(Number)
        .filter(Number.isInteger);
      const data = await searchJiraIssues({
        jql: url.searchParams.get("jql") || undefined,
        fields: fields.length ? fields : undefined,
        limit: url.searchParams.get("limit") || undefined,
        reconcileIssues,
      });
      return sendJson(response, 200, { ok: true, data }, origin);
    }
    if (request.method === "GET" && url.pathname === "/api/jira/agent/count") {
      const data = await countJiraIssues({
        jql: url.searchParams.get("jql") || undefined,
      });
      return sendJson(response, 200, { ok: true, data }, origin);
    }
    if (request.method === "GET" && url.pathname === "/api/jira/agent/projects") {
      const data = await searchJiraProjects({
        query: url.searchParams.get("query") || "",
        limit: url.searchParams.get("limit") || undefined,
      });
      return sendJson(response, 200, { ok: true, data }, origin);
    }
    if (request.method === "GET" && url.pathname === "/api/jira/agent/fields") {
      const data = await searchJiraFields({
        query: url.searchParams.get("query") || "",
        type: url.searchParams.get("type") || "",
        limit: url.searchParams.get("limit") || undefined,
      });
      return sendJson(response, 200, { ok: true, data }, origin);
    }
    if (request.method === "GET" && url.pathname === "/api/jira/agent/link-types") {
      return sendJson(response, 200, { ok: true, data: await getJiraIssueLinkTypes() }, origin);
    }
    if (request.method === "GET" && url.pathname === "/api/jira/agent/permissions") {
      return sendJson(
        response,
        200,
        { ok: true, data: await getJiraPermissions(url.searchParams.get("issueKey") || "") },
        origin
      );
    }
    const agentIssueEvidenceMatch = url.pathname.match(
      /^\/api\/jira\/agent\/issues\/(MT-\d+)\/evidence$/
    );
    if (agentIssueEvidenceMatch && request.method === "GET") {
      return sendJson(
        response,
        200,
        { ok: true, data: await getIssueEvidence(agentIssueEvidenceMatch[1]) },
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
    if (request.method === "GET" && url.pathname === "/api/meeting-prep/daily") {
      const data = await getDailyMeetingPrep(url.searchParams.get("date") || "");
      return sendJson(response, 200, { ok: true, data }, origin);
    }
    if (request.method === "GET" && url.pathname === "/api/meeting-prep/file") {
      const file = await readDailyMeetingPrepFile({
        date: url.searchParams.get("date") || "",
        packageId: url.searchParams.get("package") || "",
        fileName: url.searchParams.get("file") || "",
        print: url.searchParams.get("print") === "true",
      });
      const download = url.searchParams.get("download") === "true";
      setAllowedOrigin(response, origin);
      response.writeHead(200, {
        "Content-Type": file.contentType,
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file.fileName}"`,
        "Cache-Control": "no-store",
      });
      response.end(file.data);
      return;
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

    const attachmentUploadMatch = url.pathname.match(
      /^\/api\/jira\/issues\/(MT-\d+)\/attachments$/
    );
    if (attachmentUploadMatch && request.method === "POST") {
      const key = attachmentUploadMatch[1];
      // Filenames arrive URI-encoded so non-ASCII survives the header.
      const filename = decodeURIComponent(String(request.headers["x-filename"] || "")).trim();
      const data = await readRawBody(request);
      const attachment = await uploadAttachment(
        key,
        filename,
        request.headers["content-type"],
        data
      );
      return sendJson(response, 201, { ok: true, data: attachment }, origin);
    }

    const attachmentMatch = url.pathname.match(/^\/api\/jira\/attachments\/(\d+)(\/content)?$/);
    if (attachmentMatch?.[2] && request.method === "GET") {
      return await sendAttachmentContent(
        response,
        attachmentMatch[1],
        url.searchParams.get("download") === "true",
        origin
      );
    }
    if (attachmentMatch && !attachmentMatch[2] && request.method === "DELETE") {
      return sendJson(
        response,
        200,
        { ok: true, data: await deleteAttachment(attachmentMatch[1]) },
        origin
      );
    }

    const subtaskMatch = url.pathname.match(
      /^\/api\/jira\/issues\/(MT-\d+)\/subtasks\/(generate|apply)$/
    );
    if (subtaskMatch && request.method === "POST") {
      const [, key, action] = subtaskMatch;
      if (action === "generate") {
        const issue = await getIssue(key);
        return sendJson(response, 200, { ok: true, data: await generateBreakdown(issue) }, origin);
      }
      const result = await createSubtasks(key, await readJsonBody(request));
      return sendJson(response, 200, { ok: true, data: result }, origin);
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
    if (request.method === "POST" && url.pathname === "/api/weekly-status/generate") {
      return sendJson(
        response,
        200,
        { ok: true, data: await createWeeklyStatusDraft(await readJsonBody(request)) },
        origin
      );
    }
    if (request.method === "POST" && url.pathname === "/api/weekly-status/render") {
      return sendJson(
        response,
        200,
        { ok: true, data: renderWeeklyStatus(await readJsonBody(request)) },
        origin
      );
    }
    if (request.method === "POST" && url.pathname === "/api/weekly-status/outlook-draft") {
      return sendJson(
        response,
        200,
        { ok: true, data: await createWeeklyStatusOutlookDraft(await readJsonBody(request)) },
        origin
      );
    }
    if (request.method === "POST" && url.pathname === "/api/jira/reconcile/dismiss") {
      return sendJson(
        response,
        200,
        { ok: true, data: await dismissReconciliationEvidence(await readJsonBody(request)) },
        origin
      );
    }

    return sendJson(response, 404, { ok: false, error: "Route not found." }, origin);
  } catch (error) {
    const status =
      error instanceof GatewayError
        ? error.status
        : Number.isInteger(error?.status)
          ? error.status
          : 500;
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

// Only binds the port when run directly (`node server/jira-gateway.mjs`), never when a
// test imports mapIssue/lastActivity — otherwise a test run would fight the real gateway
// for :8817. Comparing resolved filesystem paths rather than raw URL strings so Windows
// drive-letter casing and slash direction cannot produce a false mismatch.
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMainModule) {
  createServer(route).listen(PORT, HOST, () => {
    console.log(`IP Corp Workbench data gateway ready at http://${HOST}:${PORT}`);
    console.log(`Scope locked to Jira project ${INITIATIVE_KEY}.`);
    console.log("Team Library access is read-only.");
  });
}
