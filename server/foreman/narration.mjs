// Foreman Briefing narration. Track FB-2.
// Spec: docs/brainstorm/2026-08-17-foreman-briefing-spec.md section 7, and
// spec check 3. A model writes every narrated word from the run's evidence
// through the same headless drafting lane Weekly Status uses. Fail closed:
// any failure leaves the run un-narrated (narrationStatus "failed") and the
// interface renders its mechanical copy. No template prose exists here.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDraft, scrubDashes } from "../weekly-status/build-weekly-status.mjs";
import { foremanStateDir, loadRun, saveRun } from "./ledger.mjs";

const DRAFT_TIMEOUT_MS = 90_000;

// The same absolute rules the weekly status prompt carries. Narration that
// breaks them is rejected outright rather than cleaned up.
const BANNED_WORDS = [
  "gate",
  "gating",
  "contract",
  "chargeback",
  "ratification",
  "topology",
  "system-of-record",
  "augmenting",
  "deterministic",
  "hardening",
  "slate",
  "taxonomy",
  "canonical",
  "boundary",
  "corpus",
  "leverage",
  "robust",
  "streamline",
  "delve",
  "seamless",
  "utilize",
  "holistic",
];

export function buildNarrationPrompt(run) {
  const itemLines = run.items
    .map(
      (item) =>
        `- ${item.id} [${item.kind}] "${item.summary}"` +
        `${item.dueDate ? ` due ${item.dueDate}` : ""}` +
        `${item.priority ? ` ${item.priority}` : ""}` +
        ` (evidence: ${item.sourceRefs.join(", ")})`
    )
    .join("\n");
  const changeLines = run.changes
    .map((change) => `- ${change.key} "${change.summary}" now ${change.status}`)
    .join("\n");
  const sourceLines = Object.entries(run.sources ?? {})
    .map(([id, source]) => `- ${id}: ${source.status}${source.detail ? ` (${source.detail})` : ""}`)
    .join("\n");

  return `You are writing the narration for Steve's morning Workbench briefing. Steve is the
reader. Every sentence must come from the evidence below; if the evidence does not support a
statement, leave that field empty rather than inventing anything.

TODAY: ${run.date}
COUNTS: ${run.counts.upFirst} items need Steve, ${run.counts.waiting ?? "unknown"} waiting on him
on the agent board, ${run.counts.open} open in MT.
YESTERDAY'S CLOSE-OUT: ${run.closeOut.answered} answered, ${run.closeOut.unanswered} left open.

THE ITEMS THAT NEED HIM, ranked:
${itemLines || "None."}

WHAT CHANGED TODAY:
${changeLines || "Nothing material."}

SOURCE HEALTH:
${sourceLines || "No source report."}

PARKED: ${run.parked.length} items with return dates. SUPPRESSED: ${run.suppressed.length} already
answered and unchanged.

How Steve writes:
- Plain, direct, an engineer explaining something to a smart colleague. Confident, never formal.
- Real numbers and real item keys, never filler like "various" or "several".
- NEVER use an em dash or en dash. Commas and periods only.
- Never use these words: ${BANNED_WORDS.join(", ")}.
- Never mention AI, assistants, automation, or the tooling that produced this.
- Write "Patrick" in full, never "Pat".

Return JSON only, no prose around it, exactly this shape:
{
  "arrival": "1 or 2 sentences: what actually matters today, grounded in the counts.",
  "orientation": "2 or 3 sentences resolving the signals: the close-out, the changes, source health.",
  "changes": {"<item key>": "one sentence on why this change matters today"},
  "items": {"<item id>": {"whyNow": "1 or 2 sentences from the evidence: why this is up now"}},
  "clear": "1 or 2 sentences closing the briefing honestly."
}`;
}

function violatesVoice(text) {
  const lower = ` ${String(text).toLowerCase()} `;
  if (/[—–]/.test(text)) return "dash";
  for (const word of BANNED_WORDS) {
    if (new RegExp(`\\b${word.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i").test(lower)) {
      return word;
    }
  }
  return null;
}

function validateNarration(parsed, run) {
  if (!parsed || typeof parsed !== "object") return { error: "not an object" };
  const clean = { changes: {}, items: {} };
  const drops = [];
  for (const field of ["arrival", "orientation", "clear"]) {
    clean[field] = scrubDashes(parsed[field] ?? "");
  }
  const itemIds = new Set(run.items.map((item) => item.id));
  const changeKeys = new Set(run.changes.map((change) => change.key));
  for (const [key, value] of Object.entries(parsed.changes ?? {})) {
    if (!changeKeys.has(key)) {
      drops.push(key);
      continue;
    }
    clean.changes[key] = scrubDashes(value);
  }
  for (const [key, value] of Object.entries(parsed.items ?? {})) {
    if (!itemIds.has(key)) {
      drops.push(key);
      continue;
    }
    clean.items[key] = { whyNow: scrubDashes(value?.whyNow ?? "") };
  }
  const everything = [
    clean.arrival,
    clean.orientation,
    clean.clear,
    ...Object.values(clean.changes),
    ...Object.values(clean.items).map((item) => item.whyNow),
  ].join(" ");
  const violation = violatesVoice(everything);
  if (violation) return { error: `voice rules: ${violation}` };
  const hasAnything =
    clean.arrival || clean.orientation || clean.clear || Object.keys(clean.items).length > 0;
  if (!hasAnything) return { error: "empty narration" };
  return { narration: clean, drops };
}

async function defaultDraft(prompt) {
  const dir = join(foremanStateDir(), "prompts");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `narration.${Date.now()}.md`);
  writeFileSync(file, prompt, "utf8");
  return new Promise((resolve, reject) => {
    // Daily internal narration is drafting work, so the flat-rate drafting
    // model carries it; judgment stays with the reader.
    const child = spawn(
      "claude",
      ["-p", `@${file}`, "--model", "sonnet", "--output-format", "text"],
      {
        shell: true,
        windowsHide: true,
      }
    );
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("The narration draft timed out."));
    }, DRAFT_TIMEOUT_MS);
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
      if (code === 0) resolve(out);
      else reject(new Error(`The narration draft exited ${code}: ${err.slice(-200)}`));
    });
  });
}

export async function narrateRun({ today, draft = defaultDraft }) {
  if (!today) throw new Error("narrateRun requires today (YYYY-MM-DD)");
  const run = loadRun(today);
  if (!run) throw new Error(`No briefing run exists for ${today}`);
  // Single-flight per day: one attempt, whatever its outcome. A failed
  // narration stays failed rather than re-billing on every page open.
  if (run.narrationStatus) return run;

  let outcome;
  try {
    const raw = await draft(buildNarrationPrompt(run));
    const parsed = parseDraft(String(raw ?? ""));
    outcome = parsed ? validateNarration(parsed, run) : { error: "no JSON in the draft" };
  } catch (cause) {
    outcome = { error: cause instanceof Error ? cause.message : String(cause) };
  }

  // Drafting can take a minute while answers keep landing on the same run
  // file, so narration is applied to a FRESH read, never the copy loaded
  // before the draft started. Saving the stale copy would erase answers.
  const fresh = loadRun(today) ?? run;
  if (fresh.narrationStatus) return fresh;
  if (outcome.narration) {
    fresh.narration = outcome.narration;
    fresh.narrationStatus = "ok";
    fresh.narratedAt = new Date().toISOString();
    if (outcome.drops.length > 0) fresh.narrationDrops = outcome.drops;
  } else {
    fresh.narrationStatus = "failed";
    fresh.narrationError = outcome.error;
  }
  saveRun(fresh);
  return fresh;
}
