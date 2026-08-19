/**
 * Turn a finished run into something Steve can read on the way into a meeting.
 *
 * The run record already holds everything: the instruction it was given, the plan it
 * stated, what it said while working, what it posted, and what it delivered. What it
 * does not hold is an answer to the only question that matters at 8:58 before a 9:00,
 * which is "if someone asks me about this, what do I say?"
 *
 * The readout is shaped by how the run ended, because the useful answer is different.
 * A blocked run needs to say what stopped it and what Steve has to do. A finished one
 * needs to say what he should know before he is asked, what looked odd, and who cares.
 *
 * Two rules from this repo decide the whole design. Every word is written by a model
 * reading the actual run, never assembled from a template, and a readout that cannot be
 * produced is withheld rather than faked. And every claim carries a verbatim quote from
 * the record; a claim whose quote is not found in the evidence is dropped, and the drop
 * is recorded rather than hidden. A confident readout built on a sentence the agent
 * never wrote is worse than no readout, because it gets repeated in a meeting.
 */

/** Sections asked for, by how the run ended. */
export const SECTIONS_BY_VERDICT = {
  BLOCKED: ["whatHappened", "whatBlockedIt", "whatSteveMustDo", "peopleInvolved", "artifacts"],
  REVIEW: [
    "whatHappened",
    "whatToKnow",
    "anomalies",
    "whatSteveMustDo",
    "peopleInvolved",
    "artifacts",
  ],
  DONE: ["whatHappened", "whatToKnow", "anomalies", "peopleInvolved", "artifacts"],
};

/** Prose sections carry one grounded claim each; these carry lists. */
const LIST_SECTIONS = new Set(["anomalies", "peopleInvolved", "artifacts"]);

export class ReadoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReadoutError";
  }
}

/** Everything the model is allowed to have read, as one searchable body. */
export function evidenceOf(detail) {
  const review = detail?.review ?? {};
  const parts = [
    review.request ?? "",
    review.approach ?? "",
    ...(Array.isArray(review.plan)
      ? review.plan.map((step) => `${step.text ?? ""} ${step.note ?? ""}`)
      : []),
    ...(Array.isArray(review.messages) ? review.messages.map((message) => message.text ?? "") : []),
    review.postedComment ?? "",
    detail?.note ?? "",
  ];
  return parts.filter(Boolean).join("\n\n");
}

/**
 * Compare quoted text to the record the way a reader would.
 *
 * Whitespace and case are ignored because a model re-wrapping a line is not a
 * fabrication. Nothing else is: the words themselves have to be there in order.
 */
function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteIsGrounded(quote, evidence) {
  const needle = normalize(quote);
  if (needle.length < 12) return false;
  return normalize(evidence).includes(needle);
}

/**
 * The instruction the run was given, cut back to the ticket's own words.
 *
 * The prompt wraps the issue in a lot of standing scaffolding about how to behave. None
 * of that describes the work, so it is dropped before the model sees the evidence,
 * leaving the summary, description and acceptance criteria that a person would recognise
 * as the ticket.
 */
export function ticketFromRequest(request) {
  const text = String(request ?? "");
  const start = text.search(/^JIRA ISSUE\s+[A-Z]+-\d+/m);
  if (start === -1) return null;
  const rest = text.slice(start);
  // The standing instructions resume at the first all-caps directive heading that is
  // not part of the issue itself.
  const end = rest.search(/^(BEFORE THE WORK|AS YOU WORK|WHEN YOU ARE DONE|HOW TO)/m);
  return (end === -1 ? rest : rest.slice(0, end)).trim() || null;
}

/**
 * What the plan says happened, as facts rather than prose.
 *
 * A step that started and never reported an ending is its own signal, and one the model
 * must not be trusted to notice on its own.
 */
export function planOutcome(plan) {
  const steps = Array.isArray(plan) ? plan : [];
  const counts = { done: 0, failed: 0, skipped: 0, unfinished: 0, total: steps.length };
  const failures = [];
  for (const step of steps) {
    if (step.status === "done") counts.done += 1;
    else if (step.status === "failed") {
      counts.failed += 1;
      failures.push({ text: step.text ?? "", note: step.note ?? "" });
    } else if (step.status === "skipped") counts.skipped += 1;
    else counts.unfinished += 1;
  }
  return { counts, failures };
}

/**
 * Artifacts come from the record, not from the model.
 *
 * What a run delivered is a fact already written down when it attached the files. Asking
 * a model to restate it only creates a chance to get it wrong, so the list is built here
 * and the model is asked to describe them, never to enumerate them.
 */
export function artifactsOf(detail) {
  const attachments = Array.isArray(detail?.attachments) ? detail.attachments : [];
  return attachments.map((entry) => ({
    path: String(entry.path ?? ""),
    name:
      String(entry.path ?? "")
        .split(/[\\/]/)
        .pop() || String(entry.path ?? ""),
    delivered: Boolean(entry.ok),
    error: entry.error ? String(entry.error) : null,
  }));
}

/** The prompt. Kept here so a test can assert what the model is actually asked. */
export function buildReadoutPrompt(detail) {
  const verdict = String(detail?.verdict ?? "REVIEW").toUpperCase();
  const sections = SECTIONS_BY_VERDICT[verdict] ?? SECTIONS_BY_VERDICT.REVIEW;
  const ticket = ticketFromRequest(detail?.review?.request);
  const outcome = planOutcome(detail?.review?.plan);
  const artifacts = artifactsOf(detail);

  const shape = {
    whatHappened: "one short paragraph: what this run actually did, in plain past tense",
    whatBlockedIt: "the specific thing that stopped it, named concretely",
    whatToKnow: "what Steve should know before somebody asks him about this",
    whatSteveMustDo: "the single next action that is his, not the agent's",
    anomalies:
      "list: anything odd, surprising or worth saying out loud. Empty list if nothing was.",
    peopleInvolved:
      "list: people this touches, by the name the record uses, and why each one cares",
    artifacts: "list: describe what each delivered file IS, in a few words. Do not invent files.",
  };

  const asked = sections.map((key) => `- ${key}: ${shape[key]}`).join("\n");

  return `You are writing a briefing for Steve Nahrup about one piece of background work
that an agent carried out on his behalf. He may read this walking into a meeting where
people ask him about it, so it has to be accurate and short.

HOW THE RUN ENDED: ${verdict}
STEPS: ${outcome.counts.done} done, ${outcome.counts.failed} failed, ${outcome.counts.skipped} skipped, ${outcome.counts.unfinished} started and never reported finished, of ${outcome.counts.total}
FILES IT DELIVERED: ${artifacts.length ? artifacts.map((file) => file.name).join(", ") : "none"}

THE TICKET
${ticket ?? "(the ticket text was not recorded on this run)"}

WHAT THE AGENT SAID WHILE WORKING
${evidenceOf(detail).slice(0, 24_000)}

Return ONLY a JSON object, no prose around it, with exactly these keys:
${asked}

Every entry must be an object with "text" and "quote". "quote" is a span of at least a
dozen words copied EXACTLY from the material above that supports what you wrote. If you
cannot find a real quote for something, leave that entry out entirely. Do not paraphrase
into the quote field. A dropped entry is a good outcome; an unsupported one is not.

List sections are arrays of those objects. Prose sections are a single object.

Write plainly, the way an engineer explains something to a colleague. No em dashes. Do
not use: gate, gating, contract, canonical, leverage, robust, streamline, delve, reach
out, worth noting, Additionally, utilize, seamless, holistic. Never write "Pat"; the name
is Patrick. Do not mention agents, automation, or that this was written by a model.`;
}

function coerceEntry(value) {
  if (!value || typeof value !== "object") return null;
  const text = String(value.text ?? "").trim();
  const quote = String(value.quote ?? "").trim();
  if (!text) return null;
  return { text, quote };
}

/**
 * Check a model's readout against the record and drop whatever it cannot support.
 *
 * Returns the surviving sections plus every drop and why. The drops are part of the
 * result rather than a log line, because "the model claimed three anomalies and two were
 * not in the record" is exactly the thing a reader needs to know about a readout before
 * trusting the one that remains.
 */
export function verifyReadout({ parsed, detail, isBanned }) {
  const verdict = String(detail?.verdict ?? "REVIEW").toUpperCase();
  const sections = SECTIONS_BY_VERDICT[verdict] ?? SECTIONS_BY_VERDICT.REVIEW;
  const evidence = evidenceOf(detail);

  const kept = {};
  const dropped = [];

  const check = (section, entry) => {
    const coerced = coerceEntry(entry);
    if (!coerced) {
      dropped.push({ section, reason: "the entry had no text" });
      return null;
    }
    if (isBanned?.(coerced.text)) {
      dropped.push({ section, reason: "the wording broke a voice rule", text: coerced.text });
      return null;
    }
    if (!quoteIsGrounded(coerced.quote, evidence)) {
      dropped.push({
        section,
        reason: "its quote is not in the run record",
        text: coerced.text,
        quote: coerced.quote,
      });
      return null;
    }
    return coerced;
  };

  for (const section of sections) {
    const value = parsed?.[section];
    if (LIST_SECTIONS.has(section)) {
      const list = Array.isArray(value) ? value : [];
      kept[section] = list.map((entry) => check(section, entry)).filter(Boolean);
    } else {
      const single = value === undefined || value === null ? null : check(section, value);
      if (single) kept[section] = single;
    }
  }

  // Artifacts are a recorded fact, so the file list is authoritative here and the
  // model's contribution is only the description attached to each one.
  const recorded = artifactsOf(detail);
  if (sections.includes("artifacts")) {
    const described = new Map(
      (kept.artifacts ?? []).map((entry) => [normalize(entry.text), entry])
    );
    kept.artifacts = recorded.map((file) => {
      const match = [...described.values()].find((entry) =>
        normalize(entry.text).includes(normalize(file.name))
      );
      return { ...file, text: match?.text ?? null };
    });
  }

  return { sections: kept, dropped, verdict };
}

/**
 * Whether what survived is worth showing.
 *
 * A readout that lost its central section is not a shorter readout, it is a misleading
 * one, because the sections that remain read as the whole story. Blocked runs must still
 * say what blocked them; everything else must still say what happened.
 */
export function isUsable(result) {
  if (!result?.sections?.whatHappened) return false;
  if (result.verdict === "BLOCKED" && !result.sections.whatBlockedIt) return false;
  return true;
}

/** Pull the JSON object out of whatever the model returned around it. */
export function parseModelJson(raw) {
  const text = String(raw ?? "");
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new ReadoutError("The model did not return a JSON object.");
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (cause) {
    throw new ReadoutError(`The model's JSON could not be read: ${cause.message}`);
  }
}

// ---------------------------------------------------------------------------
// Producing one. The prompt goes to a model the same way every other piece of
// written prose in this repo does, and the result is cached beside the run
// records so a readout is written once and read many times.
// ---------------------------------------------------------------------------

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { violatesVoiceRules } from "./activity-reconciliation/voice-writer.mjs";

const READOUT_TIMEOUT_MS = 4 * 60_000;

function stateRoot() {
  const local =
    process.env.LOCALAPPDATA || join(process.env.USERPROFILE || homedir(), "AppData", "Local");
  return process.env.IPCORP_READOUT_DIR || join(local, "IPCorpBrain", "run-readouts");
}

/** One file per run. The id carries a colon and slashes, so it is flattened. */
export function readoutPath(runId) {
  return join(stateRoot(), `${String(runId).replace(/[^A-Za-z0-9._-]/g, "_")}.json`);
}

export async function readCachedReadout(runId) {
  try {
    return JSON.parse(await readFile(readoutPath(runId), "utf8"));
  } catch (reason) {
    if (reason?.code === "ENOENT") return null;
    return null;
  }
}

function runReadoutModel(prompt) {
  return new Promise((resolvePromise, reject) => {
    const file = join(stateRoot(), `prompt-${Date.now()}.md`);
    mkdir(dirname(file), { recursive: true })
      .then(() => writeFile(file, prompt, "utf8"))
      .then(() => {
        const child = spawn(
          "claude",
          ["-p", `@${file}`, "--model", "sonnet", "--output-format", "text"],
          { shell: true, windowsHide: true }
        );
        let out = "";
        let err = "";
        const timer = setTimeout(() => {
          child.kill();
          reject(new ReadoutError("Writing the readout timed out."));
        }, READOUT_TIMEOUT_MS);
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
          else reject(new ReadoutError(`Writing the readout exited ${code}: ${err.slice(-300)}`));
        });
      })
      .catch(reject);
  });
}

/**
 * The readout for one run, written once and cached.
 *
 * Returns `{ state }` in every case so a caller never has to guess why something is
 * absent. "withheld" is a real outcome and carries its reason: a readout whose central
 * section could not be supported by the record is not shown at all, because the sections
 * that survived would read as the whole story.
 */
export async function getReadout(
  runId,
  detail,
  { refresh = false, runModel = runReadoutModel } = {}
) {
  if (!refresh) {
    const cached = await readCachedReadout(runId);
    if (cached) return cached;
  }
  if (!detail) return { state: "unavailable", reason: "No record of that run exists." };
  if (detail.state === "running") {
    return {
      state: "unavailable",
      reason: "The run is still going; a readout waits until it ends.",
    };
  }

  let result;
  try {
    const parsed = parseModelJson(await runModel(buildReadoutPrompt(detail)));
    result = verifyReadout({
      parsed,
      detail,
      isBanned: (text) => Boolean(violatesVoiceRules(text)),
    });
  } catch (cause) {
    // No template fallback. A readout that cannot be written is absent and says so.
    return { state: "unavailable", reason: cause.message, runId };
  }

  const readout = isUsable(result)
    ? { state: "ready", runId, writtenAt: new Date().toISOString(), ...result }
    : {
        state: "withheld",
        runId,
        writtenAt: new Date().toISOString(),
        reason:
          result.verdict === "BLOCKED"
            ? "What blocked this run could not be supported by its own record, so the readout is withheld."
            : "What happened could not be supported by the run's own record, so the readout is withheld.",
        dropped: result.dropped,
      };

  try {
    await mkdir(stateRoot(), { recursive: true });
    await writeFile(readoutPath(runId), JSON.stringify(readout, null, 2), "utf8");
  } catch {
    // A readout that cannot be cached is still a good readout; it is just written again
    // next time. Losing the answer over a disk problem would be the worse trade.
  }
  return readout;
}
