import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const FRONTEND_ROOT = resolve(
  new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
);
const BRAIN_ROOT =
  process.env.IPCORP_BRAIN_ROOT ||
  "C:\\Users\\snahrup\\OneDrive - IP-Corporation\\ipcorp-architecture-brain";
const TEAM_LIBRARY_ROOT =
  process.env.IPCORP_TEAM_LIBRARY_PATH ||
  "C:\\Users\\snahrup\\OneDrive - IP-Corporation\\IT Internal - MDM - Master Data Management\\Team Library";
const CODEX_SESSIONS_ROOT =
  process.env.CODEX_SESSIONS_ROOT || "C:\\Users\\snahrup\\.codex\\sessions";
const CLAUDE_PROJECTS_ROOT =
  process.env.CLAUDE_PROJECTS_ROOT || "C:\\Users\\snahrup\\.claude\\projects";
const RUN_ROOT = resolve(FRONTEND_ROOT, "workflow-runs", "mdm-jira-rebuild");
const SINCE_DATE = process.env.MDM_RECONCILE_SINCE || "2026-01-01";

const textExtensions = new Set([
  ".csv",
  ".html",
  ".js",
  ".json",
  ".jsonl",
  ".md",
  ".mjs",
  ".mmd",
  ".ps1",
  ".py",
  ".sql",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);
const extractableExtensions = new Set([".docx", ".pdf", ".pptx", ".xlsx"]);
const ignoredDirectoryNames = new Set([
  ".git",
  ".next",
  ".venv",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

const strongPathSignals = [
  /ipcorp[-_ ]architecture[-_ ]brain/i,
  /ipcorp[-_ ]brain[-_ ]frontend/i,
  /ipcorp[-_ ]knowledge[-_ ]platform/i,
  /ipcorp[-_ ]team[-_ ]hub/i,
  /copilot[-_ ]cowork[-_ ]mcp/i,
  /live[-_ ]brain[-_ ]assist/i,
  /mdm[-_ ]weekly[-_ ]status[-_ ]email/i,
  /fmd[-_ ]framework/i,
  /elt[-_ ]slide[-_ ]deck/i,
  /pbi[-_ ]model[-_ ]analyses/i,
  /fabric[-_ ]console/i,
  /fabric[-_ ]toolbox/i,
];

const contextualPathSignals = [/\\Prism(?:\\|$)/i, /\\prism-v2(?:\\|$)/i];

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

async function pathState(path) {
  try {
    const details = await stat(path);
    return {
      path,
      available: true,
      type: details.isDirectory() ? "directory" : details.isFile() ? "file" : "other",
      modifiedAt: details.mtime.toISOString(),
    };
  } catch (error) {
    return {
      path,
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function walkFiles(root, options = {}) {
  const files = [];
  const queue = [root];
  const maxFiles = options.maxFiles || 250_000;
  while (queue.length && files.length < maxFiles) {
    const directory = queue.shift();
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirectoryNames.has(entry.name)) queue.push(join(directory, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const path = join(directory, entry.name);
      if (options.extension && extname(entry.name).toLowerCase() !== options.extension) continue;
      files.push(path);
      if (files.length >= maxFiles) break;
    }
  }
  return files;
}

async function firstJsonLine(path, limit = 40) {
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
  try {
    let count = 0;
    for await (const line of lines) {
      count += 1;
      if (!line.trim()) continue;
      try {
        return JSON.parse(line);
      } catch {
        if (count >= limit) return null;
      }
      if (count >= limit) return null;
    }
  } finally {
    lines.close();
    stream.destroy();
  }
  return null;
}

function normalizedPath(value) {
  return String(value || "").replaceAll("/", "\\");
}

function classifyProjectPath(value) {
  const path = normalizedPath(value);
  if (strongPathSignals.some((pattern) => pattern.test(path))) return "strong";
  if (contextualPathSignals.some((pattern) => pattern.test(path))) return "contextual";
  return "unrelated";
}

async function inventoryCodexSessions() {
  const files = await walkFiles(CODEX_SESSIONS_ROOT, { extension: ".jsonl", maxFiles: 10_000 });
  const sessions = [];
  for (const path of files) {
    const first = await firstJsonLine(path);
    const payload = first?.type === "session_meta" ? first.payload || {} : {};
    const cwd = payload.cwd || "";
    const relevance = classifyProjectPath(cwd);
    if (relevance === "unrelated") continue;
    const details = await stat(path);
    sessions.push({
      provider: "Codex",
      id: payload.id || payload.session_id || basename(path, ".jsonl"),
      cwd,
      relevance,
      evidenceEligible: relevance === "strong",
      startedAt: payload.timestamp || first?.timestamp || null,
      modifiedAt: details.mtime.toISOString(),
      bytes: details.size,
      sourcePath: path,
    });
  }
  return { totalFiles: files.length, selectedSessions: sessions };
}

function claudeProjectNameToPath(name) {
  return name
    .replace(/^([A-Za-z])--/, "$1:\\\\")
    .replaceAll("---", "\\")
    .replaceAll("--", "\\")
    .replaceAll("-", " ");
}

async function inventoryClaudeSessions() {
  let directories = [];
  try {
    directories = (await readdir(CLAUDE_PROJECTS_ROOT, { withFileTypes: true })).filter((entry) =>
      entry.isDirectory()
    );
  } catch {
    return { totalProjectDirectories: 0, totalFiles: 0, selectedProjects: [] };
  }

  const selectedProjects = [];
  let totalFiles = 0;
  for (const directory of directories) {
    const root = join(CLAUDE_PROJECTS_ROOT, directory.name);
    const files = await walkFiles(root, { extension: ".jsonl", maxFiles: 50_000 });
    totalFiles += files.length;
    const decodedHint = claudeProjectNameToPath(directory.name);
    const relevance = classifyProjectPath(decodedHint);
    if (relevance === "unrelated") continue;
    let bytes = 0;
    let newest = null;
    for (const path of files) {
      const details = await stat(path);
      bytes += details.size;
      const modifiedAt = details.mtime.toISOString();
      if (!newest || modifiedAt > newest) newest = modifiedAt;
    }
    selectedProjects.push({
      provider: "Claude Code",
      projectDirectory: directory.name,
      decodedHint,
      relevance,
      evidenceEligible: relevance === "strong",
      files: files.length,
      bytes,
      newestModifiedAt: newest,
      sourceRoot: root,
    });
  }
  return {
    totalProjectDirectories: directories.length,
    totalFiles,
    selectedProjects,
  };
}

async function inventoryContentRoot(root, label) {
  const files = await walkFiles(root);
  const extensions = {};
  const topFolders = {};
  let bytes = 0;
  let newest = null;
  for (const path of files) {
    const details = await stat(path);
    const extension = extname(path).toLowerCase() || "(none)";
    extensions[extension] = (extensions[extension] || 0) + 1;
    const topFolder = relative(root, path).split(/[\\/]/)[0] || "(root)";
    topFolders[topFolder] = (topFolders[topFolder] || 0) + 1;
    bytes += details.size;
    const modifiedAt = details.mtime.toISOString();
    if (!newest || modifiedAt > newest) newest = modifiedAt;
  }
  return {
    label,
    root,
    files: files.length,
    textFiles: files.filter((path) => textExtensions.has(extname(path).toLowerCase())).length,
    extractableFiles: files.filter((path) => extractableExtensions.has(extname(path).toLowerCase()))
      .length,
    bytes,
    newestModifiedAt: newest,
    extensions,
    topFolders,
  };
}

async function gitInventory(repoPath) {
  const state = await pathState(join(repoPath, ".git"));
  if (!state.available) return { repoPath, available: false };
  try {
    const { stdout } = await execFile(
      "git",
      ["-C", repoPath, "log", `--since=${SINCE_DATE}`, "--format=%H%x09%cI%x09%an%x09%s", "--all"],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }
    );
    const commits = stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [hash, committedAt, author, ...summary] = line.split("\t");
        return { hash, committedAt, author, summary: summary.join("\t") };
      });
    return {
      repoPath,
      available: true,
      evidenceEligible: !/\\(?:Prism|prism-v2)(?:\\|$)/i.test(repoPath),
      role: /\\(?:Prism|prism-v2)(?:\\|$)/i.test(repoPath)
        ? "implementation-reference-only"
        : "engagement-evidence",
      commitCount: commits.length,
      newestCommitAt: commits[0]?.committedAt || null,
      oldestCommitAt: commits.at(-1)?.committedAt || null,
      sample: commits.slice(0, 20),
    };
  } catch (error) {
    return {
      repoPath,
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function gatewayInventory() {
  try {
    const response = await fetch("http://127.0.0.1:8817/api/jira/initiative", {
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    const issues = payload.data?.issues || [];
    return {
      available: true,
      fetchedAt: payload.data?.fetchedAt || new Date().toISOString(),
      issueCount: issues.length,
      byStatus: issues.reduce((result, issue) => {
        const status = issue.status?.name || "Unknown";
        result[status] = (result[status] || 0) + 1;
        return result;
      }, {}),
      newestUpdatedAt:
        issues
          .map((issue) => issue.updatedAt)
          .filter(Boolean)
          .sort()
          .at(-1) || null,
      source: "Live Jira through the approved Workbench gateway",
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
      source: "Workbench Jira gateway",
    };
  }
}

async function main() {
  const runId = timestampSlug();
  const runDirectory = join(RUN_ROOT, runId);
  await mkdir(runDirectory, { recursive: true });

  const sourceStates = await Promise.all(
    [BRAIN_ROOT, TEAM_LIBRARY_ROOT, CODEX_SESSIONS_ROOT, CLAUDE_PROJECTS_ROOT, FRONTEND_ROOT].map(
      pathState
    )
  );
  const [codex, claude, brain, teamLibrary, jira] = await Promise.all([
    inventoryCodexSessions(),
    inventoryClaudeSessions(),
    inventoryContentRoot(BRAIN_ROOT, "Architecture Brain"),
    inventoryContentRoot(TEAM_LIBRARY_ROOT, "Team Library"),
    gatewayInventory(),
  ]);

  const repoCandidates = [
    BRAIN_ROOT,
    FRONTEND_ROOT,
    "C:\\Users\\snahrup\\CascadeProjects\\copilot_cowork_mcp",
    "C:\\Users\\snahrup\\CascadeProjects\\ipcorp-knowledge-platform",
    "C:\\Users\\snahrup\\CascadeProjects\\fabric_toolbox",
    "C:\\Users\\snahrup\\CascadeProjects\\fabric-console",
    "D:\\CascadeProjects\\Prism",
    "D:\\CascadeProjects\\prism-v2",
  ];
  const git = await Promise.all(repoCandidates.map(gitInventory));

  const inventory = {
    schemaVersion: 1,
    runId,
    generatedAt: new Date().toISOString(),
    sinceDate: SINCE_DATE,
    policy: {
      scope: "MDM initiative only",
      hiddenReasoningExcluded: true,
      participantClaimsRequireCollaborationEvidence: true,
      unsupportedHistoricalActivityForbidden: true,
    },
    sourceStates,
    sources: {
      jira,
      codex,
      claude,
      brain,
      teamLibrary,
      git,
    },
  };

  const canonical = JSON.stringify(inventory, null, 2);
  await writeFile(join(runDirectory, "inventory.json"), canonical, "utf8");
  await writeFile(
    join(runDirectory, "inventory.sha256"),
    `${sha256(canonical)}  inventory.json\n`,
    "utf8"
  );
  await writeFile(
    join(RUN_ROOT, "latest.json"),
    JSON.stringify(
      {
        runId,
        generatedAt: inventory.generatedAt,
        runDirectory,
        inventoryPath: join(runDirectory, "inventory.json"),
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(
    JSON.stringify({
      ok: true,
      runId,
      runDirectory,
      counts: {
        jiraIssues: jira.issueCount || 0,
        codexSessions: codex.selectedSessions.length,
        claudeProjects: claude.selectedProjects.length,
        claudeSessionFiles: claude.selectedProjects.reduce((sum, item) => sum + item.files, 0),
        brainFiles: brain.files,
        teamLibraryFiles: teamLibrary.files,
        gitCommits: git.reduce((sum, item) => sum + (item.commitCount || 0), 0),
      },
    })
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  );
  process.exitCode = 1;
});
