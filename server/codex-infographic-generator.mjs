import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { inspectPng } from "./meeting-infographic-renderer.mjs";

const CODEX_IMAGE_MODEL = "gpt-image-2";
const CODEX_AGENT_MODEL = "gpt-5.6-sol";
const DEFAULT_TIMEOUT_MS = 15 * 60_000;
const MAX_LOG_BYTES = 400_000;

function digest(value) {
  return createHash("sha256")
    .update(String(value || ""), "utf8")
    .digest("hex");
}

function stateRoot() {
  return resolve(
    process.env.MEETING_CLOSEOUT_CODEX_STATE_DIR ||
      join(process.env.LOCALAPPDATA || tmpdir(), "IPCorpBrain", "codex-infographics")
  );
}

function buildSource({ meeting, summary, transcript, commitments, themes }) {
  return `# Source material for ${meeting.title}

Date: ${meeting.start.slice(0, 10)}
Attendees: ${meeting.attendees.join(", ") || "Not confirmed"}

## Meeting readout

${summary}

## Commitments

${commitments.length ? commitments.map((item) => `- ${item.text}`).join("\n") : "- None identified."}

## Themes

${themes.length ? themes.map((item) => `- ${item}`).join("\n") : "- None identified."}

## Reconciled meeting context

${transcript}
`;
}

export function buildCodexInfographicPrompt({ meeting, sourceText, outputPath }) {
  return `Use $imagegen in built-in mode to create the final meeting infographic described below.

Use case: infographic-diagram
Asset type: IP Corporation meeting intelligence artifact
Primary request: Turn the meeting's real story, decisions, dependencies, risks, and next moves into one polished visual. The source material below is the only factual source.
Composition: Landscape editorial information artwork with one strong visual story. Choose a scene-specific process, map, pathway, system cutaway, journey, or relationship composition that fits this meeting. The image must make sense at thumbnail size before anyone reads the labels.
Style: Original illustrated information design with purposeful objects, icons, spatial relationships, depth, shadows, and restrained texture. Use IP Corporation white, cool gray, structural navy, and corporate blue, with semantic accent colors only where they carry meaning. Use any supplied IP Corporation mark only as a restrained brand reference.
Text: Include the exact title "${meeting.title}" and date "${meeting.start.slice(0, 10)}". Keep every other label short. Prefer five to eight meaningful labels over paragraphs.
Constraints: This must look like commissioned information art, not a PowerPoint slide, report page, HTML layout, PDF page, or product dashboard. No slide frame, presentation footer, oversized title bar, KPI-card row, generic dashboard, repeated white card grid, four-box template, text-first document, speaker headshots, invented numbers, invented quotes, watermark, or unsupported claims. Do not fill the canvas with boxes of paragraph text. The visual metaphor and illustrated structure must carry the story.
Quality check: Inspect the generated image. Compare every visible word and factual claim with the source. Fix one time if text is misspelled, garbled, duplicated, or unsupported. Keep only the reviewed final image as the last image you generate.
File rule: Do not edit source material or project files. The server will retrieve the reviewed image directly from this Codex task's generated-image folder. Do not build an HTML, SVG, slide, or screenshot substitute. The requested destination is ${outputPath}.

Source material:

${sourceText}
`;
}

function codexImageRoot() {
  return resolve(process.env.CODEX_HOME || join(homedir(), ".codex"), "generated_images");
}

function threadIdFromJsonl(stdout) {
  for (const line of String(stdout || "").split(/\r?\n/)) {
    if (!line.trim().startsWith("{")) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "thread.started" && event.thread_id) return String(event.thread_id);
    } catch {
      // Codex may interleave human-readable warnings with JSON events.
    }
  }
  return "";
}

async function newestGeneratedPng({ threadId, stdout, generatedImageRoot }) {
  threadId ||= threadIdFromJsonl(stdout);
  if (!threadId) return null;
  const directory = join(generatedImageRoot || codexImageRoot(), threadId);
  let names;
  try {
    names = await readdir(directory);
  } catch {
    return null;
  }
  const candidates = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".png")) continue;
    const path = join(directory, name);
    candidates.push({ path, modified: (await stat(path)).mtimeMs });
  }
  candidates.sort((left, right) => right.modified - left.modified);
  return candidates[0]?.path || null;
}

function runCodex({ cwd, prompt, logoPath, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolvePromise, reject) => {
    const args = [
      "exec",
      "--ephemeral",
      "--json",
      "--sandbox",
      "workspace-write",
      "--skip-git-repo-check",
      "--model",
      CODEX_AGENT_MODEL,
      "-c",
      "model_provider=openai",
      "-c",
      "model_reasoning_effort=high",
      "-c",
      'approval_policy="never"',
      "-C",
      cwd,
    ];
    if (logoPath) args.push("-i", logoPath);
    args.push("-");

    const child = spawn("codex", args, {
      cwd,
      shell: true,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let threadId = "";
    const append = (current, chunk) => `${current}${chunk}`.slice(-MAX_LOG_BYTES);
    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk.toString());
      threadId ||= threadIdFromJsonl(stdout);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk.toString());
    });
    child.on("error", reject);
    const timer = setTimeout(() => {
      child.kill();
      const error = new Error("Codex image generation exceeded fifteen minutes.");
      error.code = "codex_infographic_timeout";
      reject(error);
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise({ stdout, stderr, threadId });
      else {
        const error = new Error(
          `Codex image generation exited ${code}: ${stderr.slice(-500) || stdout.slice(-500)}`
        );
        error.code = "codex_infographic_failed";
        reject(error);
      }
    });
    child.stdin.end(prompt);
  });
}

async function atomicBytes(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

/**
 * Generate the real meeting infographic through the subscription-authenticated
 * Codex built-in image tool. Codex works only inside a LocalAppData job folder;
 * this function alone validates and moves the selected PNG into the Brain.
 */
export async function generateMeetingInfographicWithCodex(input, options = {}) {
  const jobId = `${input.meetingId}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const jobDirectory = resolve(options.stateRoot || stateRoot(), jobId);
  const sourcePath = join(jobDirectory, "source.md");
  const stagedOutputPath = join(jobDirectory, "result.png");
  const promptPath = join(jobDirectory, "prompt.md");
  const source = buildSource(input);
  const prompt = buildCodexInfographicPrompt({
    meeting: input.meeting,
    sourceText: source,
    outputPath: stagedOutputPath,
  });
  await mkdir(jobDirectory, { recursive: true });
  await Promise.all([writeFile(sourcePath, source, "utf8"), writeFile(promptPath, prompt, "utf8")]);

  const fixtureImage = options.fixtureImagePath || process.env.MEETING_CLOSEOUT_CODEX_FIXTURE_IMAGE;
  let run = { stdout: "", stderr: "", threadId: "" };
  if (fixtureImage) {
    await writeFile(stagedOutputPath, await readFile(resolve(fixtureImage)));
  } else {
    const execute = options.runCodex || runCodex;
    run = await execute({
      cwd: jobDirectory,
      prompt,
      logoPath: options.logoPath,
      timeoutMs: options.timeoutMs,
    });
    await writeFile(
      join(jobDirectory, "codex.jsonl"),
      `${run.stdout || ""}${run.stderr || ""}`,
      "utf8"
    );
    const generatedPath = await newestGeneratedPng({
      threadId: run.threadId,
      stdout: run.stdout,
      generatedImageRoot: options.generatedImageRoot,
    });
    if (generatedPath) await writeFile(stagedOutputPath, await readFile(generatedPath));
  }

  let bytes;
  try {
    bytes = await readFile(stagedOutputPath);
  } catch (cause) {
    const error = new Error("Codex finished without producing a retrievable reviewed PNG.");
    error.code = "codex_infographic_missing";
    error.cause = cause;
    throw error;
  }
  const image = inspectPng(bytes);
  await atomicBytes(input.outputPath, bytes);
  if (fixtureImage) {
    await writeFile(
      join(jobDirectory, "codex.jsonl"),
      `${run.stdout || ""}${run.stderr || ""}`,
      "utf8"
    );
  }

  return {
    jobId,
    artifactId: `codex-imagegen:${jobId}`,
    provider: "codex",
    product: "OpenAI Codex",
    agentModel: CODEX_AGENT_MODEL,
    imageModel: CODEX_IMAGE_MODEL,
    invocation: "$imagegen",
    taskId: run.threadId || threadIdFromJsonl(run.stdout),
    file: basename(input.outputPath),
    outputPath: input.outputPath,
    sourceIds: [`sha256:${digest(input.transcript)}`, `sha256:${digest(input.summary)}`],
    sourceHashes: {
      transcript: digest(input.transcript),
      summary: digest(input.summary),
      prompt: digest(prompt),
    },
    ...image,
  };
}

export const CODEX_INFOGRAPHIC_MODELS = {
  agent: CODEX_AGENT_MODEL,
  image: CODEX_IMAGE_MODEL,
};
