import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Every word posted to Jira as Steve is written by a model reading the actual
 * evidence, never assembled from a template. Matching and safety stay in code;
 * prose comes from here. There is no fallback: a proposal whose wording cannot
 * be produced is withheld, because a templated sentence in Steve's voice is
 * worse than no sentence.
 */

const VOICE_TIMEOUT_MS = 6 * 60_000;

const BANNED_FRAGMENTS = [
  "—",
  "–",
  " gate",
  "gating",
  "chargeback",
  "ratif",
  "topolog",
  "system-of-record",
  "augment",
  "deterministic",
  "hardening",
  "taxonom",
  "canonical",
  "boundar",
  "corpus",
  "leverage",
  "robust",
  "streamline",
  "delve",
  "reach out",
  "worth noting",
  "Additionally",
  "utilize",
  "seamless",
  "I reviewed the",
];

function promptFile() {
  return join(
    process.env.LOCALAPPDATA || join(process.env.USERPROFILE || ".", "AppData", "Local"),
    "IPCorpBrain",
    "voice-writer",
    `prompt.${process.pid}.${Date.now()}.md`
  );
}

export function buildVoicePrompt(items) {
  const briefs = items.map((item) => ({
    id: item.id,
    purposes: item.purposes,
    issue: item.issue || null,
    facts: item.facts || {},
    evidence: item.evidence,
  }));
  return `You are writing Jira text for Steve Nahrup, in his first-person voice,
one entry per brief below. Steve is a data architect writing to smart
colleagues: plain, direct, confident, explains the why, credits people by
name. Each brief gives the purpose, the target issue, established facts, and
verbatim evidence from real work sources.

Rules that decide whether your output is usable:
- First person, as Steve. Never mention AI, assistants, automation, or tools.
- Never use an em dash or en dash anywhere.
- Never write: leverage, robust, streamline, delve, reach out, worth noting,
  Additionally, utilize, seamless, canonical, deterministic, hardening,
  taxonomy, chargeback, topology, corpus, augmenting, gate or gating in the
  blocking sense, note as the name for a message, or any "I reviewed the X"
  template opener. Patrick Stiller is always Patrick, never shortened.
- Ground every sentence in the supplied evidence and facts. Add nothing the
  evidence does not support. Quote or restate the evidence naturally.
- Each brief lists its purposes; write one distinct entry per purpose:
  "comment": 2 to 5 sentences a colleague finds useful: what happened, why it
  lands on this issue, what happens next.
  "worklog": 1 to 2 sentences describing the work done, in narrative form,
  different wording from the comment.
  "description": sections titled Objective, Context, Approach, Acceptance,
  separated by blank lines, plain prose under each.
  "stale_close": 2 to 3 sentences: how long it has sat per the facts, that
  nothing in the reviewed sources mentions it, reopen if still needed.
- Vary sentence rhythm and openings between entries so no two read as the
  same shape.

BRIEFS
${JSON.stringify(briefs, null, 2)}
END BRIEFS

Output exactly one JSON object mapping each brief id to an object with one
key per requested purpose:
TEXTS:
{ "brief-id": { "comment": "...", "worklog": "..." }, ... }
END TEXTS`;
}

export function parseVoiceOutput(output) {
  const block = /TEXTS:[ \t]*\r?\n([\s\S]*?)END TEXTS/m.exec(String(output || ""))?.[1];
  const text = String(output || "");
  const candidates = [];
  if (block) candidates.push(block.trim());
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {
      // Try the next salvage candidate.
    }
  }
  return null;
}

export function violatesVoiceRules(text) {
  const value = String(text || "");
  if (!value.trim()) return "empty";
  const lowered = value.toLowerCase();
  for (const fragment of BANNED_FRAGMENTS) {
    const needle = fragment.toLowerCase();
    if (needle.trim() && lowered.includes(needle)) return fragment.trim();
  }
  if (/\bpat\b/i.test(value)) return "Pat";
  return null;
}

function runVoiceModel(prompt) {
  return new Promise((resolvePromise, reject) => {
    const file = promptFile();
    mkdir(dirname(file), { recursive: true })
      .then(() => writeFile(file, prompt, "utf8"))
      .then(() => {
        const child = spawn(
          "claude",
          ["-p", `@${file}`, "--model", "opus", "--output-format", "text"],
          { shell: true, windowsHide: true }
        );
        let out = "";
        let err = "";
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error("Voice writing timed out."));
        }, VOICE_TIMEOUT_MS);
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
          else reject(new Error(`Voice writing exited ${code}: ${err.slice(-300)}`));
        });
      })
      .catch(reject);
  });
}

/**
 * Fill every prose-bearing change on the given proposals. Returns
 * { written, withheld } where withheld lists proposals whose wording could
 * not be produced or failed the voice rules; those must not reach Jira.
 */
export async function writeProposalProse(proposals, runModel = runVoiceModel) {
  const briefs = [];
  for (const proposal of proposals) {
    if (!proposal.prose) continue;
    briefs.push({ id: proposal.id, ...proposal.prose });
  }
  if (!briefs.length) return { written: proposals, withheld: [] };

  let texts = null;
  try {
    texts = parseVoiceOutput(await runModel(buildVoicePrompt(briefs)));
  } catch {
    texts = null;
  }

  const PURPOSE_FOR_KIND = {
    comment: (proposal) =>
      proposal.prose.purposes.includes("stale_close") ? "stale_close" : "comment",
    worklog: () => "worklog",
    create_issue: () => "description",
  };

  const written = [];
  const withheld = [];
  for (const proposal of proposals) {
    if (!proposal.prose) {
      written.push(proposal);
      continue;
    }
    const entry = texts?.[proposal.id];
    let violation = entry && typeof entry === "object" ? null : "missing";
    const filled = structuredClone(proposal);
    for (const change of filled.changes) {
      if (violation) break;
      const purposeFor = PURPOSE_FOR_KIND[change.kind];
      if (!purposeFor) continue;
      const text = entry[purposeFor(proposal)];
      violation = violatesVoiceRules(text);
      if (violation) break;
      if (change.kind === "comment") change.body = text;
      if (change.kind === "worklog") change.comment = text;
      if (change.kind === "create_issue") change.description = text;
    }
    if (violation) {
      withheld.push({ proposal, reason: `Wording unavailable (${violation}).` });
      continue;
    }
    filled.after = { changes: filled.changes };
    written.push(filled);
  }
  return { written, withheld };
}
