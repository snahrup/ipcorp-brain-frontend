import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { mondayOf, normalizedEffortHours } from "./policy.mjs";

const execFile = promisify(execFileCallback);
const FRONTEND_ROOT = resolve(
  new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
);
const RUN_ROOT = resolve(FRONTEND_ROOT, "workflow-runs", "mdm-jira-rebuild");
const MAX_SESSION_TEXT = 80_000;
const MAX_DOCUMENT_TEXT = 100_000;

const canonicalBrainRoots = [
  "SESSION-JOURNAL.md",
  "CHANGELOG.md",
  "core\\meetings",
  "core\\project-memory",
  "core\\deliverables",
  "core\\execution-package",
  "core\\architecture",
  "cortex",
  "natively",
];
const readableExtensions = new Set([
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
const ignoredDirectories = new Set([".git", "node_modules", ".smart-env", "tmp"]);

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function scrub(value) {
  return String(value || "")
    .replace(/ATATT[0-9A-Za-z_=-]{20,}/g, "[REDACTED_JIRA_TOKEN]")
    .replace(
      /((?:api[_-]?token|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*["']?)[^\s,"'}]+/gi,
      "$1[REDACTED]"
    )
    .replace(/Authorization:\s*(?:Basic|Bearer)\s+[^\s]+/gi, "Authorization: [REDACTED]")
    .replace(/Ku7T@[A-Za-z0-9]+/g, "[REDACTED_SQL_PASSWORD]");
}

function stripAmbient(value) {
  return scrub(value)
    .replace(/<in-app-browser-context[\s\S]*?<\/in-app-browser-context>/gi, "")
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/gi, "")
    .replace(/<permissions instructions>[\s\S]*?<\/permissions instructions>/gi, "")
    .replace(/<apps_instructions>[\s\S]*?<\/apps_instructions>/gi, "")
    .replace(/<skills_instructions>[\s\S]*?<\/skills_instructions>/gi, "")
    .replace(/<recommended_plugins>[\s\S]*?<\/recommended_plugins>/gi, "")
    .trim();
}

function textFromBlocks(content, allowedTypes = new Set(["text", "input_text", "output_text"])) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block && allowedTypes.has(block.type))
    .map((block) => block.text || "")
    .filter(Boolean)
    .join("\n");
}

function safeTimestamp(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function evidenceDateFromDocument(path, text) {
  const match = String(path).match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (match) return safeTimestamp(`${match[1]}T12:00:00-04:00`);
  const explicit = String(text || "")
    .slice(0, 8_000)
    .match(
      /(?:^|\n)(?:date|created|updated|as of|meeting date|session date)\s*[:|]\s*(20\d{2}-\d{2}-\d{2})\b/i
    );
  return explicit ? safeTimestamp(`${explicit[1]}T12:00:00-04:00`) : null;
}

function activeMinutes(timestamps, sidechain = false) {
  if (sidechain) return 0;
  const values = Array.from(
    new Set(timestamps.map((value) => new Date(value).getTime()).filter(Number.isFinite))
  ).sort((a, b) => a - b);
  if (!values.length) return 0;
  let minutes = 10;
  for (let index = 1; index < values.length; index += 1) {
    const gap = (values[index] - values[index - 1]) / 60_000;
    if (gap <= 90) minutes += Math.min(gap, 15);
  }
  return Math.round(Math.min(480, Math.max(10, minutes)));
}

function hasCompletionSignal(text) {
  return /\b(?:completed|implemented|fixed|verified|passed|shipped|built|created|updated|deployed|landed|done)\b/i.test(
    text
  );
}

async function readJsonLines(path, handler) {
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let value;
      try {
        value = JSON.parse(line);
      } catch {
        continue;
      }
      await handler(value);
    }
  } finally {
    lines.close();
    stream.destroy();
  }
}

function pushBounded(target, value, maxItems = 80) {
  const text = stripAmbient(value);
  if (!text || target.length >= maxItems) return;
  target.push(text.slice(0, 12_000));
}

async function collectCodexSession(session) {
  const requests = [];
  const results = [];
  const timestamps = [];
  const toolCounts = {};
  await readJsonLines(session.sourcePath, async (record) => {
    const timestamp = safeTimestamp(record.timestamp || record.payload?.timestamp);
    if (timestamp) timestamps.push(timestamp);
    if (record.type !== "response_item") return;
    const payload = record.payload || {};
    if (payload.type === "message") {
      const text = textFromBlocks(payload.content);
      if (payload.role === "user") pushBounded(requests, text);
      if (payload.role === "assistant" && payload.channel !== "analysis") {
        pushBounded(results, text);
      }
      return;
    }
    if (payload.type === "function_call" || payload.type === "custom_tool_call") {
      const name = payload.name || payload.tool_name || "tool";
      toolCounts[name] = (toolCounts[name] || 0) + 1;
    }
  });

  const startedAt = safeTimestamp(session.startedAt) || timestamps[0] || session.modifiedAt;
  const endedAt = timestamps.at(-1) || session.modifiedAt;
  const visibleText = [...requests, ...results].join("\n\n").slice(0, MAX_SESSION_TEXT);
  return {
    id: `codex:${session.id}`,
    sourceType: "work-session",
    provider: "Codex",
    sourceRef: session.sourcePath,
    sourceHash: hash(`${session.id}:${session.bytes}:${session.modifiedAt}`),
    startedAt,
    endedAt,
    eventAt: endedAt || startedAt,
    weekOf: mondayOf(endedAt || startedAt),
    title: `Work session in ${basename(session.cwd || "unknown workspace")}`,
    workspace: session.cwd,
    requests,
    visibleResults: results,
    visibleText,
    toolCounts,
    sidechain: false,
    baselineMinutes: activeMinutes(timestamps),
    normalizedHoursCandidate: normalizedEffortHours(activeMinutes(timestamps) / 60),
    completionSignal: hasCompletionSignal(results.join("\n")),
    soloByDefault: true,
    collaborationEvidence: false,
    participants: [],
    evidenceConfidence: results.length ? "medium" : "low",
    limitation:
      "Visible user and assistant messages are included. Hidden reasoning and raw tool payloads are excluded.",
  };
}

async function walkFiles(root, extension = null) {
  const files = [];
  const queue = [root];
  while (queue.length) {
    const directory = queue.shift();
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) queue.push(join(directory, entry.name));
      } else if (entry.isFile()) {
        const path = join(directory, entry.name);
        if (!extension || extname(path).toLowerCase() === extension) files.push(path);
      }
    }
  }
  return files;
}

async function collectClaudeSession(project, path) {
  const requests = [];
  const results = [];
  const timestamps = [];
  const toolCounts = {};
  let cwd = "";
  let sessionId = basename(path, ".jsonl");
  let sidechain = /(?:^|[\\/])agent-[^\\/]+\.jsonl$/i.test(path);

  await readJsonLines(path, async (record) => {
    cwd ||= record.cwd || "";
    sessionId = record.sessionId || record.uuid || sessionId;
    sidechain ||= record.isSidechain === true;
    const timestamp = safeTimestamp(record.timestamp || record.message?.timestamp);
    if (timestamp) timestamps.push(timestamp);
    if (record.type !== "user" && record.type !== "assistant") return;
    const message = record.message || {};
    const content = Array.isArray(message.content)
      ? message.content
      : record.content || message.content;
    const text = textFromBlocks(content, new Set(["text"]));
    if (record.type === "user") pushBounded(requests, text);
    if (record.type === "assistant") pushBounded(results, text);
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type !== "tool_use") continue;
        const name = block.name || "tool";
        toolCounts[name] = (toolCounts[name] || 0) + 1;
      }
    }
  });

  const details = await stat(path);
  const startedAt = timestamps[0] || details.birthtime.toISOString();
  const endedAt = timestamps.at(-1) || details.mtime.toISOString();
  const minutes = activeMinutes(timestamps, sidechain);
  return {
    id: `claude:${project.projectDirectory}:${sessionId}:${hash(path).slice(0, 12)}`,
    sourceType: "work-session",
    provider: "Claude Code",
    sourceRef: path,
    sourceHash: hash(`${details.size}:${details.mtime.toISOString()}`),
    startedAt,
    endedAt,
    eventAt: endedAt,
    weekOf: mondayOf(endedAt),
    title: `Work session in ${basename(cwd || project.decodedHint || project.projectDirectory)}`,
    workspace: cwd || project.decodedHint,
    requests,
    visibleResults: results,
    visibleText: [...requests, ...results].join("\n\n").slice(0, MAX_SESSION_TEXT),
    toolCounts,
    sidechain,
    baselineMinutes: minutes,
    normalizedHoursCandidate: normalizedEffortHours(minutes / 60),
    completionSignal: hasCompletionSignal(results.join("\n")),
    soloByDefault: true,
    collaborationEvidence: false,
    participants: [],
    evidenceConfidence: results.length ? "medium" : "low",
    limitation:
      "Visible user and assistant text is included. Thinking blocks and raw tool payloads are excluded. Sidechains contribute evidence but not additive elapsed time.",
  };
}

async function readText(path) {
  const buffer = await readFile(path);
  for (const encoding of ["utf8", "latin1"]) {
    try {
      return new TextDecoder(encoding, { fatal: encoding === "utf8" }).decode(buffer);
    } catch {
      // Try the next bounded decoder.
    }
  }
  return buffer.toString("utf8");
}

async function collectBrainDocuments(brainRoot) {
  const records = [];
  for (const relativeRoot of canonicalBrainRoots) {
    const root = join(brainRoot, relativeRoot);
    let details;
    try {
      details = await stat(root);
    } catch {
      continue;
    }
    const files = details.isFile() ? [root] : await walkFiles(root);
    for (const path of files) {
      if (!readableExtensions.has(extname(path).toLowerCase())) continue;
      const fileDetails = await stat(path);
      const text = scrub((await readText(path)).slice(0, MAX_DOCUMENT_TEXT));
      if (!text.trim()) continue;
      const sourceRef = relative(brainRoot, path).replaceAll("\\", "/");
      const meetingEvidence = sourceRef.startsWith("core/meetings/");
      const eventAt = evidenceDateFromDocument(sourceRef, text);
      records.push({
        id: `brain:${sourceRef}`,
        sourceType: meetingEvidence ? "meeting-record" : "brain-document",
        provider: "Architecture Brain",
        sourceRef,
        sourcePath: path,
        sourceHash: hash(text),
        eventAt,
        weekOf: mondayOf(eventAt),
        title: basename(path, extname(path)),
        text,
        completionSignal:
          hasCompletionSignal(text) ||
          /(?:decision|outcome|verification|delivered|implemented|resolved)/i.test(text),
        soloByDefault: !meetingEvidence,
        collaborationEvidence: meetingEvidence,
        participants: [],
        baselineMinutes: 0,
        normalizedHoursCandidate: 0,
        evidenceConfidence: meetingEvidence ? "high" : "medium",
        documentModifiedAt: fileDetails.mtime.toISOString(),
        limitation: meetingEvidence
          ? "The canonical meeting record proves a meeting artifact exists. Participant names still require extraction from the record itself."
          : eventAt
            ? "The activity date is explicit in the path or document header."
            : "No explicit activity date was found. Modified time is retained as metadata but is not used for historical worklog dating.",
      });
    }
  }
  return records;
}

async function collectTeamLibrary(path) {
  const records = [];
  await readJsonLines(path, async (item) => {
    records.push({
      id: `team-library:${item.path}`,
      sourceType: "team-library-artifact",
      provider: "Team Library",
      sourceRef: item.path,
      sourceHash: item.sha256,
      eventAt: safeTimestamp(Number(item.modifiedAt) * 1000),
      weekOf: mondayOf(Number(item.modifiedAt) * 1000),
      title: basename(item.path, extname(item.path)),
      text: scrub(item.content || ""),
      extractionState: item.state,
      extractionError: item.error || null,
      completionSignal: false,
      soloByDefault: true,
      collaborationEvidence: false,
      participants: [],
      baselineMinutes: 0,
      normalizedHoursCandidate: 0,
      evidenceConfidence: item.state === "extracted" ? "high" : "metadata-only",
      limitation:
        item.state === "extracted"
          ? "Published Team Library content was extracted from the synchronized local artifact."
          : "The artifact is represented by metadata because readable text was unavailable.",
    });
  });
  return records;
}

async function collectGitCommits(gitSources, sinceDate) {
  const records = [];
  for (const source of gitSources) {
    if (!source.available || source.evidenceEligible === false) continue;
    let stdout;
    try {
      ({ stdout } = await execFile(
        "git",
        [
          "-C",
          source.repoPath,
          "log",
          `--since=${sinceDate}`,
          "--format=%H%x09%cI%x09%an%x09%s",
          "--all",
        ],
        { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }
      ));
    } catch {
      continue;
    }
    for (const line of stdout.split(/\r?\n/).filter(Boolean)) {
      const [commit, committedAt, author, ...summaryParts] = line.split("\t");
      const summary = scrub(summaryParts.join("\t"));
      records.push({
        id: `git:${hash(source.repoPath).slice(0, 12)}:${commit}`,
        sourceType: "repository-commit",
        provider: "Git",
        sourceRef: `${source.repoPath}@${commit}`,
        sourceHash: commit,
        eventAt: safeTimestamp(committedAt),
        weekOf: mondayOf(committedAt),
        title: summary,
        text: `${author}: ${summary}`,
        completionSignal: true,
        soloByDefault: true,
        collaborationEvidence: false,
        participants: [],
        baselineMinutes: 0,
        normalizedHoursCandidate: 0,
        evidenceConfidence: "high",
        limitation:
          "A commit proves a repository change. It does not by itself prove stakeholder participation or a Jira disposition.",
      });
    }
  }
  return records;
}

async function collectJiraEvidence(path) {
  const payload = JSON.parse(await readFile(path, "utf8"));
  const issues = payload.data?.issues || [];
  const records = [];
  for (const issue of issues) {
    const issueRef = `Jira ${issue.key}`;
    records.push({
      id: `jira:issue:${issue.key}`,
      sourceType: "jira-issue",
      provider: "Jira",
      sourceRef: issueRef,
      sourceHash: hash(
        JSON.stringify({
          key: issue.key,
          updatedAt: issue.updatedAt,
          summary: issue.summary,
          status: issue.status?.name,
        })
      ),
      eventAt: safeTimestamp(issue.updatedAt),
      weekOf: mondayOf(issue.updatedAt),
      title: `${issue.key}: ${issue.summary}`,
      text: scrub(
        [
          issue.description,
          `Status: ${issue.status?.name || "Unknown"}`,
          `Parent: ${issue.parentKey || "none"}`,
          `Labels: ${(issue.labels || []).join(", ")}`,
        ].join("\n")
      ),
      jiraKey: issue.key,
      issueType: issue.issueType,
      status: issue.status?.name,
      parentKey: issue.parentKey,
      links: issue.links || [],
      subtasks: issue.subtasks || [],
      completionSignal: issue.status?.name === "Done",
      soloByDefault: true,
      collaborationEvidence: false,
      participants: [],
      baselineMinutes: 0,
      normalizedHoursCandidate: 0,
      evidenceConfidence: "high",
      limitation:
        "The Jira issue proves recorded portfolio state. It does not independently prove that every historical narrative claim is accurate.",
    });

    for (const comment of issue.comments || []) {
      records.push({
        id: `jira:comment:${issue.key}:${comment.id}`,
        sourceType: "jira-comment",
        provider: "Jira",
        sourceRef: `${issueRef} comment ${comment.id}`,
        sourceHash: hash(comment.body),
        eventAt: safeTimestamp(comment.createdAt),
        weekOf: mondayOf(comment.createdAt),
        title: `${issue.key} comment`,
        text: scrub(comment.body),
        jiraKey: issue.key,
        author: comment.author,
        authorAccountId: comment.authorAccountId,
        completionSignal: hasCompletionSignal(comment.body),
        soloByDefault: true,
        collaborationEvidence: false,
        participants: [],
        baselineMinutes: 0,
        normalizedHoursCandidate: 0,
        evidenceConfidence: "high",
        limitation:
          "Jira records the comment creation time. Historical dates described inside the comment remain narrative evidence.",
      });
    }

    for (const worklog of issue.worklogs || []) {
      const hours = Number(worklog.timeSpentSeconds || 0) / 3600;
      records.push({
        id: `jira:worklog:${issue.key}:${worklog.id}`,
        sourceType: "jira-worklog",
        provider: "Jira",
        sourceRef: `${issueRef} worklog ${worklog.id}`,
        sourceHash: hash(`${worklog.startedAt}:${worklog.timeSpentSeconds}:${worklog.comment}`),
        eventAt: safeTimestamp(worklog.startedAt),
        weekOf: mondayOf(worklog.startedAt),
        title: `${issue.key} worklog`,
        text: scrub(worklog.comment),
        jiraKey: issue.key,
        author: worklog.author,
        authorAccountId: worklog.authorAccountId,
        recordedHours: hours,
        completionSignal: true,
        soloByDefault: true,
        collaborationEvidence: false,
        participants: [],
        baselineMinutes: 0,
        normalizedHoursCandidate: 0,
        evidenceConfidence: "recorded",
        limitation:
          "This is an existing normalized Jira effort record, not a literal stopwatch measurement.",
      });
    }

    for (const history of issue.changelog || []) {
      records.push({
        id: `jira:change:${issue.key}:${history.id}`,
        sourceType: "jira-change",
        provider: "Jira",
        sourceRef: `${issueRef} changelog ${history.id}`,
        sourceHash: hash(JSON.stringify(history.items || [])),
        eventAt: safeTimestamp(history.createdAt),
        weekOf: mondayOf(history.createdAt),
        title: `${issue.key} change`,
        text: scrub(
          (history.items || [])
            .map((item) => `${item.field}: ${item.from ?? "(none)"} -> ${item.to ?? "(none)"}`)
            .join("\n")
        ),
        jiraKey: issue.key,
        author: history.author,
        authorAccountId: history.authorAccountId,
        completionSignal: (history.items || []).some(
          (item) => item.field === "status" && item.to === "Done"
        ),
        soloByDefault: true,
        collaborationEvidence: false,
        participants: [],
        baselineMinutes: 0,
        normalizedHoursCandidate: 0,
        evidenceConfidence: "high",
        limitation: "The Jira changelog is authoritative for recorded field and workflow changes.",
      });
    }
  }
  return records;
}

async function collectMicrosoft365Evidence(path) {
  let payload;
  try {
    payload = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return [];
  }
  if (!payload?.ok || !Array.isArray(payload.data?.items)) return [];
  return payload.data.items.map((item, index) => {
    const source = String(item.source || "Microsoft 365");
    const eventAt = safeTimestamp(item.date);
    return {
      id: `m365:${hash(`${source}:${item.date || ""}:${item.sourceReference || ""}:${index}`).slice(
        0,
        24
      )}`,
      sourceType: /teams/i.test(source)
        ? "m365-teams"
        : /calendar|meeting/i.test(source)
          ? "m365-calendar"
          : "m365-email",
      provider: "Microsoft 365",
      sourceRef: item.sourceReference || `${source} evidence ${index + 1}`,
      sourceHash: hash(JSON.stringify(item)),
      eventAt,
      weekOf: mondayOf(eventAt),
      title: item.title || source,
      text: scrub(item.summary || ""),
      status: item.status || "unclear",
      jiraKey: item.jiraKey || null,
      owner: item.owner || null,
      completionSignal: String(item.status || "").toLowerCase() === "completed",
      soloByDefault: false,
      collaborationEvidence: true,
      participants: [],
      baselineMinutes: 0,
      normalizedHoursCandidate: 0,
      evidenceConfidence: "bounded-source-summary",
      limitation:
        "This bounded Copilot Cowork result proves that relevant Microsoft 365 evidence was found. Participant wording must still be supported by the source summary.",
    };
  });
}

function summarizeCoverage(records) {
  const byType = {};
  const byProvider = {};
  const byWeek = {};
  for (const record of records) {
    byType[record.sourceType] = (byType[record.sourceType] || 0) + 1;
    byProvider[record.provider] = (byProvider[record.provider] || 0) + 1;
    if (!record.weekOf) continue;
    const week = byWeek[record.weekOf] || {
      records: 0,
      workSessions: 0,
      baselineMinutes: 0,
      normalizedHoursCandidate: 0,
      completionSignals: 0,
      collaborationRecords: 0,
    };
    week.records += 1;
    if (record.sourceType === "work-session") week.workSessions += 1;
    week.baselineMinutes += Number(record.baselineMinutes || 0);
    week.normalizedHoursCandidate += Number(record.normalizedHoursCandidate || 0);
    if (record.completionSignal) week.completionSignals += 1;
    if (record.collaborationEvidence) week.collaborationRecords += 1;
    byWeek[record.weekOf] = week;
  }
  for (const week of Object.values(byWeek)) {
    week.normalizedHoursCandidate = Math.round(week.normalizedHoursCandidate * 2) / 2;
  }
  return { records: records.length, byType, byProvider, byWeek };
}

async function main() {
  const latest = JSON.parse(await readFile(join(RUN_ROOT, "latest.json"), "utf8"));
  const inventory = JSON.parse(await readFile(latest.inventoryPath, "utf8"));
  const runDirectory = latest.runDirectory;
  const records = [];

  for (const session of inventory.sources.codex.selectedSessions) {
    if (session.evidenceEligible === false || session.relevance !== "strong") continue;
    records.push(await collectCodexSession(session));
  }

  for (const project of inventory.sources.claude.selectedProjects) {
    if (project.evidenceEligible === false || project.relevance !== "strong") continue;
    const files = await walkFiles(project.sourceRoot, ".jsonl");
    for (const path of files) {
      records.push(await collectClaudeSession(project, path));
    }
  }

  records.push(...(await collectBrainDocuments(inventory.sources.brain.root)));
  records.push(...(await collectTeamLibrary(join(runDirectory, "team-library-content.jsonl"))));
  records.push(...(await collectGitCommits(inventory.sources.git, inventory.sinceDate)));
  records.push(...(await collectJiraEvidence(join(runDirectory, "jira-export-response.json"))));
  records.push(...(await collectMicrosoft365Evidence(join(runDirectory, "m365-evidence.json"))));

  records.sort((left, right) =>
    String(left.eventAt || "").localeCompare(String(right.eventAt || ""))
  );

  const evidencePath = join(runDirectory, "evidence.jsonl");
  await writeFile(
    evidencePath,
    records.map((record) => JSON.stringify(record)).join("\n") + "\n",
    "utf8"
  );
  const coverage = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runId: latest.runId,
    sinceDate: inventory.sinceDate,
    sourceInventoryHash: hash(JSON.stringify(inventory.sources)),
    evidencePath,
    ...summarizeCoverage(records),
  };
  await writeFile(join(runDirectory, "coverage.json"), JSON.stringify(coverage, null, 2), "utf8");
  await writeFile(
    join(runDirectory, "evidence.sha256"),
    `${hash(await readFile(evidencePath))}  evidence.jsonl\n`,
    "utf8"
  );
  console.log(JSON.stringify({ ok: true, runDirectory, coverage }));
}

main().catch((error) => {
  console.error(
    JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })
  );
  process.exitCode = 1;
});
