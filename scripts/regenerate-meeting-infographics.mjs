import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { generateMeetingInfographicWithCodex } from "../server/codex-infographic-generator.mjs";

const DEFAULT_BRAIN_ROOT =
  "C:\\Users\\snahrup\\OneDrive - IP-Corporation\\ipcorp-architecture-brain";
const TRANSCRIPT_LANES = [
  ["teams-export", 0],
  ["cluely-export", 1],
  ["notion-export", 2],
];
const NOISE = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "meeting",
  "session",
  "weekly",
  "biweekly",
  "standup",
  "call",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeInside(root, ...parts) {
  const base = resolve(root);
  const candidate = resolve(base, ...parts);
  if (candidate !== base && !candidate.startsWith(`${base}${sep}`)) {
    throw new Error(`Path escaped the configured Brain root: ${candidate}`);
  }
  return candidate;
}

function safeFilename(value) {
  return String(value || "meeting")
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function tokens(value) {
  return new Set(
    String(value || "")
      .toLowerCase()
      .replace(/^\d{4}-\d{2}-\d{2}-/, "")
      .replace(/-[0-9a-f]{8}$/, "")
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length > 2 && !NOISE.has(part))
  );
}

function tokenScore(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

export function isLegacyVisualStatus(status) {
  return Boolean(
    status &&
      (status.sourceSpec === "docs/handoff/2026-07-30-chatgpt-infographic-spec.md" ||
        (status.status === "generated_review_pending" && status.sourceHtml))
  );
}

export function extractTranscriptReferences(markdown) {
  const matches = new Set();
  const normalized = String(markdown || "").replaceAll("\\", "/");
  for (const match of normalized.matchAll(
    /(?:core\/meetings\/transcripts\/(?:teams-export|cluely-export|notion-export)\/[^`\n)]+?\.(?:md|html|vtt|txt))/gi
  )) {
    matches.add(match[0].trim());
  }
  return [...matches];
}

export function transcriptPriority(pathValue) {
  const normalized = String(pathValue || "").replaceAll("\\", "/");
  if (normalized.includes("/teams-export/")) return 0;
  if (normalized.includes("/cluely-export/")) return 1;
  if (normalized.includes("/notion-export/")) return 2;
  return 3;
}

export function isTranscriptEvidenceFile(name) {
  const normalized = String(name || "").toUpperCase();
  return (
    [".md", ".txt", ".vtt", ".html"].includes(extname(name).toLowerCase()) &&
    !normalized.startsWith("_") &&
    !normalized.includes("PRE-INGESTION") &&
    !normalized.includes("NO_TRANSCRIPT") &&
    !normalized.includes("RUN_REPORT") &&
    !normalized.includes("RETIRED")
  );
}

async function readJson(pathValue) {
  return JSON.parse(await readFile(pathValue, "utf8"));
}

async function atomicJson(pathValue, value) {
  await mkdir(dirname(pathValue), { recursive: true });
  const temporary = `${pathValue}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, pathValue);
}

async function fileExists(pathValue) {
  try {
    await stat(pathValue);
    return true;
  } catch {
    return false;
  }
}

async function referencedTranscriptFiles(brainRoot, summaryText) {
  const out = [];
  for (const reference of extractTranscriptReferences(summaryText)) {
    const candidate = safeInside(brainRoot, ...reference.split("/"));
    if (await fileExists(candidate)) out.push(candidate);
  }
  return out;
}

async function inferredTranscriptFiles(brainRoot, meeting) {
  const day = meeting.day || String(meeting.date || "").slice(0, 10);
  const out = [];
  for (const [lane] of TRANSCRIPT_LANES) {
    const root = safeInside(brainRoot, "core", "meetings", "transcripts", lane);
    if (!existsSync(root)) continue;
    for (const name of await readdir(root)) {
      if (!name.startsWith(day) || !isTranscriptEvidenceFile(name)) {
        continue;
      }
      if (tokenScore(meeting.id, name) >= 0.5 || tokenScore(meeting.title, name) >= 0.5) {
        out.push(join(root, name));
      }
    }
  }
  return out;
}

async function resolveEvidence(brainRoot, meeting, folder) {
  const summaryCandidates = [
    safeInside(brainRoot, "core", "meetings", "summaries", `${meeting.id}.md`),
    safeInside(brainRoot, "core", "meetings", "summaries", `${folder}.md`),
  ];
  const summaryPath = summaryCandidates.find((candidate) => existsSync(candidate));
  if (!summaryPath) throw new Error(`No exact meeting summary was found for ${meeting.id}.`);
  const summary = await readFile(summaryPath, "utf8");
  const explicit = await referencedTranscriptFiles(brainRoot, summary);
  const inferred = await inferredTranscriptFiles(brainRoot, meeting);
  const transcriptFiles = [...new Set([...explicit, ...inferred])].sort(
    (left, right) =>
      transcriptPriority(left) - transcriptPriority(right) || left.localeCompare(right)
  );
  const transcriptSections = [];
  for (const file of transcriptFiles) {
    transcriptSections.push(
      `## ${relative(brainRoot, file).replaceAll("\\", "/")}\n\n${await readFile(file, "utf8")}`
    );
  }
  return {
    summaryPath,
    summary,
    transcriptFiles,
    transcript:
      transcriptSections.length > 0
        ? `Teams evidence is listed first, then gap-fill sources. Use gap-fill material only where it adds missing context and never let it replace conflicting Teams evidence.\n\n${transcriptSections.join("\n\n")}`
        : "No retained verbatim transcript matched this meeting. Use only the approved meeting summary and do not add specificity beyond it.",
  };
}

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasArgument(name) {
  return process.argv.includes(name);
}

export function requireReviewedWriteScope({ executeReviewedBatch, ids }) {
  if (!executeReviewedBatch) {
    throw new Error(
      "Refusing provider writes. Pass --execute-reviewed-batch after the source review is complete."
    );
  }
  if (!ids?.size) {
    throw new Error(
      "Refusing an unscoped provider run. Pass an explicit comma-separated --ids list."
    );
  }
}

async function remediationPlan({ brainRoot, indexPath, ids }) {
  const index = await readJson(indexPath);
  const meetings = Array.isArray(index.meetings) ? index.meetings : [];
  const byVisualFolder = new Map();
  for (const meeting of meetings) {
    if (meeting.infographic?.id) byVisualFolder.set(meeting.infographic.id, meeting);
  }
  const root = safeInside(brainRoot, "natively", "meeting-infographics");
  const plan = [];
  for (const folder of await readdir(root)) {
    if (ids?.size && !ids.has(folder)) continue;
    const dir = safeInside(root, folder);
    const statusPath = safeInside(dir, "status.json");
    if (!(await fileExists(statusPath))) continue;
    const status = await readJson(statusPath);
    if (!isLegacyVisualStatus(status)) continue;
    const day = folder.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "";
    const sameDay = meetings.filter(
      (meeting) => (meeting.day || String(meeting.date || "").slice(0, 10)) === day
    );
    const semanticMeeting = sameDay
      .map((meeting) => ({
        meeting,
        score: Math.max(tokenScore(meeting.id, folder), tokenScore(meeting.title, folder)),
      }))
      .sort((left, right) => right.score - left.score)[0];
    const meeting =
      byVisualFolder.get(folder) ||
      meetings.find((candidate) => candidate.id === folder) ||
      (semanticMeeting?.score >= 0.5 ? semanticMeeting.meeting : null);
    if (!meeting) {
      plan.push({ folder, blocked: `No meeting record points to ${folder}.` });
      continue;
    }
    try {
      const evidence = await resolveEvidence(brainRoot, meeting, folder);
      plan.push({ folder, dir, statusPath, status, meeting, evidence });
    } catch (error) {
      plan.push({
        folder,
        meeting,
        blocked: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return plan;
}

async function runOne(item, { brainRoot, stateRoot, logPath }) {
  if (item.blocked) return { folder: item.folder, state: "blocked", detail: item.blocked };
  const date = item.meeting.day || String(item.meeting.date).slice(0, 10);
  const outputFile = `${safeFilename(item.meeting.title)} [${date}] - creative.png`;
  const outputPath = safeInside(item.dir, outputFile);
  const previousStatusPath = safeInside(item.dir, "status.legacy-local-renderer.json");
  if (!(await fileExists(previousStatusPath))) await atomicJson(previousStatusPath, item.status);
  const priorPromptPath = safeInside(item.dir, "master-prompt.txt");
  const priorPrompt = (await fileExists(priorPromptPath))
    ? await readFile(priorPromptPath, "utf8")
    : "";
  const attendees = String(item.meeting.attendees || "")
    .split(/,| and /)
    .map((value) => value.trim())
    .filter(Boolean);
  const result = await generateMeetingInfographicWithCodex(
    {
      meetingId: item.meeting.id,
      meeting: {
        title: item.meeting.title,
        start: `${date}T12:00:00-04:00`,
        attendees,
      },
      summary: `${item.evidence.summary}\n\n## Earlier visual brief\n\n${priorPrompt}`,
      transcript: item.evidence.transcript,
      commitments: [],
      themes: [],
      outputPath,
    },
    { stateRoot }
  );
  const status = {
    schemaVersion: 2,
    status: "GENERATED_PENDING_VISUAL_REVIEW",
    provider: result.provider,
    product: result.product,
    agentModel: result.agentModel,
    imageModel: result.imageModel,
    invocation: result.invocation,
    taskId: result.taskId,
    artifactId: result.artifactId,
    meetingId: item.meeting.id,
    title: item.meeting.title,
    date,
    generatedAt: new Date().toISOString(),
    evidence: {
      summaryFile: relative(brainRoot, item.evidence.summaryPath).replaceAll("\\", "/"),
      transcriptFiles: item.evidence.transcriptFiles.map((file) =>
        relative(brainRoot, file).replaceAll("\\", "/")
      ),
      transcriptComparison:
        item.evidence.transcriptFiles.length > 1
          ? "All retained matching transcripts were supplied together with Teams listed first."
          : item.evidence.transcriptFiles.length === 1
            ? "One retained matching transcript was supplied."
            : "No retained matching transcript. The approved meeting summary limited the image.",
      summarySha256: sha256(item.evidence.summary),
      transcriptSha256: sha256(item.evidence.transcript),
      priorVisualBrief: (await fileExists(priorPromptPath)) ? "master-prompt.txt" : null,
    },
    output: {
      file: outputFile,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      sha256: result.sha256,
    },
    visualQualityReview: {
      status: "pending",
      required: true,
      checks: [
        "Original illustrated information design",
        "No report-page or presentation-template appearance",
        "Facts and visible words checked against the saved evidence",
      ],
    },
    supersedes: {
      status: "status.legacy-local-renderer.json",
      file: item.status.outputFile || null,
      reason:
        "The earlier locally rendered report layout did not meet the meeting visual standard.",
    },
    generationReceipt: result,
  };
  await atomicJson(item.statusPath, status);
  const record = {
    at: new Date().toISOString(),
    folder: item.folder,
    state: "generated",
    outputFile,
  };
  await appendFile(logPath, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

async function runPool(items, concurrency, worker) {
  const results = [];
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index]);
      } catch (error) {
        results[index] = {
          folder: items[index].folder,
          state: "failed",
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => next()));
  return results;
}

async function main() {
  const brainRoot = resolve(
    argument("--brain", process.env.COWORK_BRAIN_ROOT || DEFAULT_BRAIN_ROOT)
  );
  const indexPath = resolve(argument("--index", "data/meeting-index.json"));
  const stateRoot = resolve(
    argument(
      "--state-root",
      join(process.env.LOCALAPPDATA || tmpdir(), "IPCorpBrain", "codex-infographics")
    )
  );
  const auditRoot = resolve(
    join(process.env.LOCALAPPDATA || tmpdir(), "IPCorpBrain", "visual-quality-audit")
  );
  await mkdir(auditRoot, { recursive: true });
  const logPath = join(auditRoot, "remediation-log.jsonl");
  const idsValue = argument("--ids", "");
  const ids = idsValue
    ? new Set(
        idsValue
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      )
    : null;
  let plan = await remediationPlan({ brainRoot, indexPath, ids });
  const limit = Number(argument("--limit", "0"));
  if (Number.isFinite(limit) && limit > 0) plan = plan.slice(0, limit);
  const summary = {
    total: plan.length,
    ready: plan.filter((item) => !item.blocked).length,
    blocked: plan
      .filter((item) => item.blocked)
      .map((item) => ({
        folder: item.folder,
        detail: item.blocked,
      })),
    multipleTranscripts: plan
      .filter((item) => (item.evidence?.transcriptFiles.length || 0) > 1)
      .map((item) => ({ folder: item.folder, files: item.evidence.transcriptFiles })),
    noTranscript: plan
      .filter((item) => item.evidence?.transcriptFiles.length === 0)
      .map((item) => item.folder),
  };
  if (hasArgument("--dry-run")) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }
  requireReviewedWriteScope({
    executeReviewedBatch: hasArgument("--execute-reviewed-batch"),
    ids,
  });
  const concurrency = Math.max(1, Number(argument("--concurrency", "3")) || 3);
  const results = await runPool(plan, concurrency, (item) =>
    runOne(item, { brainRoot, stateRoot, logPath })
  );
  process.stdout.write(`${JSON.stringify({ ...summary, results }, null, 2)}\n`);
  if (results.some((item) => item.state === "failed" || item.state === "blocked")) {
    process.exitCode = 1;
  }
}

const ownPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === ownPath) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
