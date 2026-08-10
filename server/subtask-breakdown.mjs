import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * AI breakdown of one Jira issue into subtasks whose estimates roll up exactly.
 *
 * Two-step contract, mirroring the reconciliation flow: `generateBreakdown`
 * produces a proposal and writes nothing; the gateway's apply route creates the
 * subtasks only after Steve confirms the preview. The model proposes the split;
 * this module owns the arithmetic — whatever comes back is rescaled and
 * remainder-corrected so the subtask estimates sum to the parent's original
 * estimate to the minute, because the board's rollup is only trustworthy if the
 * server enforces it rather than trusting a language model to add.
 *
 * The runner follows agent-dispatch.mjs: headless `claude` on sonnet (bounded
 * single-shot work where speed matters), a marker-delimited output contract,
 * and Steve's writing rules applied to every string that will reach Jira.
 */

const RUNS_DIR = join(process.cwd(), ".agent-runs");
const BREAKDOWN_TIMEOUT_MS = 4 * 60 * 1000;
const MIN_SUBTASKS = 3;
const MAX_SUBTASKS = 7;
/** Estimates land on person-real 15-minute steps unless the parent itself is odd. */
const GRAIN_MINUTES = 15;
const MIN_SUBTASK_MINUTES = 15;

function buildBreakdownPrompt(issue, parentMinutes) {
  const subtasks = (issue.subtasks ?? [])
    .map((s) => `  - ${s.key} [${s.status}] ${s.summary}`)
    .join("\n");

  return `Break one Jira task into subtasks for Steve Nahrup on the IP Corporation
Fabric and MDM engagement. Planning only: read the issue, decide the pieces, and
return the breakdown. Do not touch any files.

JIRA ISSUE ${issue.key}
Summary : ${issue.summary}
Estimate: ${parentMinutes} minutes total
Labels  : ${(issue.labels ?? []).join(", ") || "none"}

DESCRIPTION
${issue.description || "(no description)"}
${subtasks ? `\nEXISTING SUBTASKS (do not duplicate these)\n${subtasks}` : ""}

WHAT TO RETURN
Between ${MIN_SUBTASKS} and ${MAX_SUBTASKS} subtasks that together deliver this issue.
- Each subtask is one sitting of real work with a clear finish line.
- estimateMinutes are your honest relative weights; they should total roughly
  ${parentMinutes}, and they will be scaled to total it exactly.
- Order them the way the work would actually be done.
- summary: imperative, specific, under 90 characters.
- description: 2-4 plain sentences on what the subtask covers and what done looks
  like. First person is fine.

WRITING RULES
Summaries and descriptions are published to Jira under Steve's name and may be read
by his manager and CIO.
- Never mention Claude, AI, assistants, automation, or generation.
- Never use these words in any inflection: gate, contract, chargeback, ratification,
  topology, system-of-record, augmenting, deterministic, hardening, slate, taxonomy,
  canonical. Use boundary very sparingly.
- No em dashes or en dashes. No markdown anywhere.
- Patrick Stiller is never "Pat".

FINISH BY PRINTING EXACTLY THIS, AND NOTHING AFTER IT

SUBTASKS:
[{"summary":"...","description":"...","estimateMinutes":120}, ...]
END SUBTASKS`;
}

/** Mechanical cleanup for strings that reach Jira, same rules as agent-dispatch. */
function scrubForJira(text) {
  return String(text || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/—/g, ". ")
    .replace(/–/g, "-")
    .replace(/^\[[\w-]+\]\s*/gm, "")
    .replace(/[^\S\n]{2,}/g, " ")
    .trim();
}

export function extractSubtasksBlock(output) {
  const match = /SUBTASKS:[ \t]*\r?\n([\s\S]*?)END SUBTASKS/m.exec(String(output || ""));
  return match ? match[1].trim() : null;
}

/**
 * Parse the model's JSON. Strict parse first; on failure, salvage the outermost
 * array so a stray trailing sentence cannot sink an otherwise good breakdown.
 */
export function parseSubtasks(block) {
  if (!block) return null;
  const candidates = [block];
  const start = block.indexOf("[");
  const end = block.lastIndexOf("]");
  if (start !== -1 && end > start) candidates.push(block.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (Array.isArray(value)) return value;
    } catch {
      // Try the next salvage candidate.
    }
  }
  return null;
}

/**
 * Force the proposed estimates to sum to the parent's minutes exactly.
 *
 * Proportional rescale onto a grain, then push the rounding remainder onto the
 * largest subtasks a grain-step at a time. Every subtask keeps a workable
 * minimum, and the invariant Σ = parentMinutes holds by construction.
 */
export function reconcileEstimates(rawMinutes, parentMinutes) {
  const grain = parentMinutes % GRAIN_MINUTES === 0 ? GRAIN_MINUTES : 5;
  const floorMinutes = Math.min(MIN_SUBTASK_MINUTES, parentMinutes);
  const weights = rawMinutes.map((value) => (Number.isFinite(value) && value > 0 ? value : 1));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);

  const minutes = weights.map((weight) =>
    Math.max(floorMinutes, Math.round(((weight / totalWeight) * parentMinutes) / grain) * grain)
  );

  let drift = parentMinutes - minutes.reduce((sum, value) => sum + value, 0);
  // Largest first for trimming, so a floor-sized subtask is never pushed below it.
  const byLargest = minutes.map((_, index) => index).sort((a, b) => minutes[b] - minutes[a]);
  let guard = 10_000;
  while (drift !== 0 && guard-- > 0) {
    const step = Math.sign(drift) * Math.min(Math.abs(drift), grain);
    for (const index of byLargest) {
      if (step < 0 && minutes[index] + step < floorMinutes) continue;
      minutes[index] += step;
      drift -= step;
      break;
    }
  }

  return minutes;
}

export function minutesToJiraEstimate(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}h ${rest}m`;
  if (hours) return `${hours}h`;
  return `${rest}m`;
}

function runClaude(promptFile) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      "claude",
      ["-p", `@${promptFile}`, "--model", "sonnet", "--output-format", "text"],
      { shell: true, windowsHide: true }
    );
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("The breakdown run timed out."));
    }, BREAKDOWN_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      err += chunk.toString();
    });
    child.on("error", (cause) => {
      clearTimeout(timer);
      reject(cause);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise(out);
      else reject(new Error(`The breakdown run exited ${code}: ${err.slice(-200)}`));
    });
  });
}

/**
 * Produce the subtask proposal for one issue. Read-only: nothing is written to
 * Jira here.
 *
 * @param issue mapped issue detail (needs timeTracking.originalEstimateSeconds)
 * @param exec  test seam; defaults to the headless claude run
 */
export async function generateBreakdown(issue, exec = runClaude) {
  const parentSeconds = issue.timeTracking?.originalEstimateSeconds;
  if (!parentSeconds || parentSeconds < 60) {
    const error = new Error(
      `${issue.key} has no original estimate, so subtask estimates have nothing to roll up to. Set the estimate first.`
    );
    error.code = "no_parent_estimate";
    error.status = 409;
    throw error;
  }
  const parentMinutes = Math.round(parentSeconds / 60);

  await mkdir(RUNS_DIR, { recursive: true });
  const promptFile = join(RUNS_DIR, `${issue.key}.breakdown.prompt.md`);
  await writeFile(promptFile, buildBreakdownPrompt(issue, parentMinutes), "utf8");

  const output = await exec(promptFile);
  const parsed = parseSubtasks(extractSubtasksBlock(output));
  if (!parsed) {
    const error = new Error("The breakdown did not return a readable subtask list. Try again.");
    error.code = "breakdown_unreadable";
    error.status = 502;
    throw error;
  }

  const cleaned = parsed
    .map((item) => ({
      summary: scrubForJira(item?.summary).slice(0, 120),
      description: scrubForJira(item?.description),
      rawMinutes: Number(item?.estimateMinutes),
    }))
    .filter((item) => item.summary);
  if (cleaned.length < 2) {
    const error = new Error("The breakdown produced fewer than two usable subtasks. Try again.");
    error.code = "breakdown_too_small";
    error.status = 502;
    throw error;
  }

  const minutes = reconcileEstimates(
    cleaned.slice(0, MAX_SUBTASKS).map((item) => item.rawMinutes),
    parentMinutes
  );

  const subtasks = cleaned.slice(0, MAX_SUBTASKS).map((item, index) => ({
    summary: item.summary,
    description: item.description,
    estimateMinutes: minutes[index],
    estimate: minutesToJiraEstimate(minutes[index]),
  }));

  return {
    issueKey: issue.key,
    parentEstimate: issue.timeTracking.originalEstimate,
    parentMinutes,
    totalMinutes: subtasks.reduce((sum, item) => sum + item.estimateMinutes, 0),
    subtasks,
    generatedAt: new Date().toISOString(),
  };
}
