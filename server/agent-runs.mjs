import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { agentRunsDir, extractComment } from "./agent-dispatch.mjs";

/**
 * The read layer for the Autonomy screen, plus its two write actions.
 *
 * Reads: run detail (request, approach, plan, working notes, delivery) derived
 * entirely from the run's own record. The plan is parsed from markers the
 * dispatch prompt asks the agent to print (APPROACH / PLAN / STEP n ...); a run
 * that never printed them gets plan: null, and the interface says so rather
 * than reconstructing one. Nothing here invents data.
 *
 * Writes: a question (answered by a spawned companion session holding the run's
 * record, never by touching the worker) and a change request (handled by the
 * gateway route, which starts a normal dispatch carrying the prior run's
 * record). Those are the only two.
 */

// ---------------------------------------------------------------------------
// Run identity. A run is issueKey + startedAt; the id survives polls, archive
// reads and phone tunnels because both halves are already in every record.
// ---------------------------------------------------------------------------

export function runIdOf(run) {
  if (!run?.issueKey || !run?.startedAt) return null;
  return `${run.issueKey}@${run.startedAt}`;
}

export function parseRunId(value) {
  const match = /^([A-Z][A-Z0-9]*-\d+)@(.+)$/.exec(String(value || "").trim());
  if (!match) return null;
  if (!Number.isFinite(Date.parse(match[2]))) return null;
  return { issueKey: match[1], startedAt: match[2] };
}

/** A list summary with its id attached, for /api/agents/runs. */
export function withRunId(summary) {
  return { ...summary, runId: runIdOf(summary) };
}

// ---------------------------------------------------------------------------
// Plan derivation. The contract lives in the dispatch prompt (agent-dispatch
// buildPrompt) and in docs/specs/workbench-autonomy-monitor.md:
//
//   APPROACH:                       PLAN:
//   <one short paragraph>           1. <first phase>
//   END APPROACH                    2. <next phase>
//                                   END PLAN
//
//   STEP 2 START | STEP 2 DONE | STEP 2 SKIP <why> | STEP 2 FAIL <why>
//
// Derived at read time from the run's messages, so it works identically for a
// run in flight, an archive from yesterday, and a re-read next month.
// ---------------------------------------------------------------------------

function extractBlock(text, name) {
  const pattern = new RegExp(
    `^[ \\t]*${name}:[ \\t]*\\r?\\n([\\s\\S]*?)^[ \\t]*END ${name}[ \\t]*$`,
    "m"
  );
  const match = pattern.exec(text ?? "");
  return match ? match[1].trim() : null;
}

const STEP_EVENT = /^[ \t]*STEP[ \t]+(\d+)[ \t]+(START|DONE|SKIP|FAIL)\b[ \t]*(.*)$/gim;

export function derivePlan(prose) {
  const block = extractBlock(prose, "PLAN");
  if (!block) return null;
  const steps = [];
  for (const line of block.split(/\r?\n/)) {
    const match = /^[ \t]*(\d+)[.)][ \t]+(.+)$/.exec(line);
    if (match) {
      steps.push({ n: Number(match[1]), title: match[2].trim(), status: "pending", reason: null });
    }
  }
  if (!steps.length) return null;
  const byN = new Map(steps.map((step) => [step.n, step]));
  STEP_EVENT.lastIndex = 0;
  let match = STEP_EVENT.exec(prose);
  while (match) {
    const step = byN.get(Number(match[1]));
    if (step) {
      const kind = match[2].toUpperCase();
      const rest = match[3].trim() || null;
      // Events are applied in the order the agent printed them, so a step that
      // started and later closed carries its terminal state, and one that only
      // started stays "active" (the interface words that honestly for finished
      // runs: started, never reported done).
      if (kind === "START") step.status = "active";
      if (kind === "DONE") step.status = "done";
      if (kind === "SKIP") {
        step.status = "skipped";
        step.reason = rest;
      }
      if (kind === "FAIL") {
        step.status = "failed";
        step.reason = rest;
      }
    }
    match = STEP_EVENT.exec(prose);
  }
  return steps;
}

/** Prose with the marker blocks and STEP lines removed, for the notes feed. */
export function stripMarkers(text) {
  return String(text ?? "")
    .replace(/^[ \t]*APPROACH:[ \t]*\r?\n[\s\S]*?^[ \t]*END APPROACH[ \t]*$/gm, "")
    .replace(/^[ \t]*PLAN:[ \t]*\r?\n[\s\S]*?^[ \t]*END PLAN[ \t]*$/gm, "")
    .replace(/^[ \t]*STEP[ \t]+\d+[ \t]+(START|DONE|SKIP|FAIL)\b.*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The reviewable record derived from a run's messages. `recordLevel: "full"`
 * only when the conversation exists; callers pass what they have and the
 * summary-only case is built by the caller with recordLevel "summary".
 */
export function deriveReview(run) {
  const messages = Array.isArray(run?.messages) ? run.messages : [];
  const sent = messages.find((message) => message.role === "sent");
  const prose = messages
    .filter((message) => message.role === "agent")
    .map((message) => String(message.text ?? ""))
    .join("\n\n");
  const notes = messages
    .filter((message) => message.role === "agent")
    .map((message) => ({ ...message, text: stripMarkers(message.text) }))
    .filter((message) => message.text);
  return {
    request: sent ? String(sent.text) : null,
    approach: extractBlock(prose, "APPROACH"),
    plan: derivePlan(prose),
    messages: notes,
    postedComment: extractComment(prose),
    recordLevel: "full",
  };
}

// ---------------------------------------------------------------------------
// Reading a single run back. Live map first (the caller passes it), then the
// full archive written at close (`ISSUE.startedMs.json`, which carries the
// whole conversation), then the outcome summary as the honest floor.
// ---------------------------------------------------------------------------

const SUMMARY_SUFFIX = ".summary.json";

async function readRunFiles(issueKey, accept) {
  const directory = agentRunsDir();
  const names = await readdir(directory).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const records = [];
  for (const name of names) {
    if (!name.startsWith(`${issueKey}.`) || !name.endsWith(".json") || !accept(name)) continue;
    try {
      records.push(JSON.parse(await readFile(join(directory, name), "utf8")));
    } catch {
      // One unreadable archive cannot hide the run; the summary floor remains.
    }
  }
  return records;
}

function baseSummary(run) {
  return {
    runId: runIdOf(run),
    issueKey: String(run.issueKey || ""),
    issueSummary: run.issueSummary ? String(run.issueSummary) : null,
    agent: String(run.agent || ""),
    agentLabel: String(run.agentLabel || run.agent || ""),
    sessionName: run.sessionName ? String(run.sessionName) : null,
    model: run.model ? String(run.model) : null,
    state: String(run.state || "finished"),
    startedAt: run.startedAt ? String(run.startedAt) : null,
    finishedAt: run.finishedAt ? String(run.finishedAt) : null,
    verdict: run.verdict ? String(run.verdict).toUpperCase() : null,
    note: run.note ? String(run.note) : null,
    steps: Number.isFinite(run.steps) ? run.steps : 0,
    lastAction: run.lastAction ? String(run.lastAction) : null,
    lastEventAt: run.lastEventAt ? String(run.lastEventAt) : null,
    exitCode: Number.isFinite(run.exitCode) ? run.exitCode : null,
    error: run.error ? String(run.error) : null,
    followsRun: run.followsRun ? String(run.followsRun) : null,
    attachments: Array.isArray(run.attachments)
      ? run.attachments.map((entry) => ({
          path: String(entry.path || ""),
          ok: Boolean(entry.ok),
          error: entry.error ? String(entry.error) : null,
        }))
      : null,
  };
}

/**
 * @param parsed  {issueKey, startedAt} from parseRunId
 * @param liveRun the dispatcher's in-memory run for that issue (with messages),
 *                or null; passed in so this module never reaches into the map.
 */
export async function getRunDetail(parsed, { liveRun = null } = {}) {
  const { issueKey, startedAt } = parsed;

  if (liveRun && liveRun.startedAt === startedAt) {
    return { ...baseSummary(liveRun), review: deriveReview(liveRun) };
  }

  const archives = await readRunFiles(issueKey, (name) => !name.endsWith(SUMMARY_SUFFIX));
  const archived = archives.find((run) => run.startedAt === startedAt);
  if (archived) {
    return { ...baseSummary(archived), review: deriveReview(archived) };
  }

  const summaries = await readRunFiles(issueKey, (name) => name.endsWith(SUMMARY_SUFFIX));
  const summary = summaries.find((run) => run.startedAt === startedAt);
  if (summary) {
    return {
      ...baseSummary(summary),
      review: {
        request: null,
        approach: null,
        plan: null,
        messages: [],
        postedComment: null,
        recordLevel: "summary",
      },
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Questions. Every question starts a separate companion session that has the
// run's record and answers on its behalf. It never signals, writes to, or
// waits on the worker process, so asking about a live run cannot disturb it,
// and asking about a run from last week behaves identically. The thread is a
// sidecar file next to the run archives, so it is kept with the run.
// ---------------------------------------------------------------------------

const ANSWER_TIMEOUT_MS = 5 * 60 * 1000;

function questionsDir() {
  return join(agentRunsDir(), "questions");
}

function questionsFile(runId) {
  return join(questionsDir(), `${runId.replace(/[^A-Za-z0-9@:.-]/g, "_")}.questions.json`);
}

export async function listQuestions(runId) {
  try {
    const parsed = JSON.parse(await readFile(questionsFile(runId), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function persistQuestions(runId, thread) {
  await mkdir(questionsDir(), { recursive: true });
  await writeFile(questionsFile(runId), `${JSON.stringify(thread, null, 2)}\n`, "utf8");
}

export function buildCompanionPrompt(detail, thread, question) {
  const plan = detail.review.plan
    ? detail.review.plan
        .map(
          (step) =>
            `  ${step.n}. [${step.status}${step.reason ? `: ${step.reason}` : ""}] ${step.title}`
        )
        .join("\n")
    : "  (this run recorded no plan)";
  const notes = detail.review.messages.length
    ? detail.review.messages.map((message) => `  [${message.at}] ${message.text}`).join("\n")
    : "  (no working notes were recorded)";
  const files = Array.isArray(detail.attachments)
    ? detail.attachments
        .map((file) => `  - ${file.path} (${file.ok ? "attached" : `failed: ${file.error}`})`)
        .join("\n") || "  (none)"
    : "  (not recorded)";
  const prior = thread
    .filter((entry) => entry.state === "answered")
    .map((entry) => `Q: ${entry.question}\nA: ${entry.answer}`)
    .join("\n\n");

  return `You are a review session for the IP Corporation Workbench. A ${detail.agentLabel}
run worked Jira issue ${detail.issueKey}${detail.issueSummary ? ` (${detail.issueSummary})` : ""}
and Steve is asking about that work. You are not the agent that did it; you hold its
record, below, and you answer on its behalf.

Rules, all of them hard:
- Answer only from the record and from files it names that you can actually read.
- If the record does not show the answer, say exactly that. Never guess or invent.
- Do not change anything: no file writes, no Jira writes, no new work.
- Answer plainly in a few sentences. No headings, no markdown, no em dashes.

THE RECORD
State: ${detail.state}, verdict ${detail.verdict ?? "none yet"}${detail.note ? `, note: ${detail.note}` : ""}
Ran: ${detail.startedAt} to ${detail.finishedAt ?? "still running"}

What it was asked:
${detail.review.request ?? "(the instruction was not archived)"}

Its stated approach:
${detail.review.approach ?? "(none recorded)"}

Its plan:
${plan}

What it said while working:
${notes}

Files it delivered:
${files}

The comment it posted:
${detail.review.postedComment ?? "(not carried in the record)"}
${prior ? `\nEARLIER QUESTIONS ON THIS RUN\n${prior}\n` : ""}
STEVE'S QUESTION
${question}`;
}

function defaultExecAnswer(prompt) {
  return new Promise((resolve, reject) => {
    // Sonnet, text out: a bounded read-and-answer with the record in hand.
    // The prompt arrives on stdin for the same reasons dispatch sends its
    // prompt on stdin: paths do not survive the shell, files read as data.
    const child = spawn("claude", ["-p", "--model", "sonnet", "--output-format", "text"], {
      shell: true,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("The review session ran past five minutes and was stopped."));
    }, ANSWER_TIMEOUT_MS);
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
      if (code === 0 && out.trim()) resolve(out.trim());
      else reject(new Error(`The review session exited ${code}. ${err.slice(-200)}`.trim()));
    });
    child.stdin.on("error", () => {
      // A session that died before reading is reported by its close handler.
    });
    child.stdin.end(prompt, "utf8");
  });
}

/**
 * Records the question, answers it in the background, and returns the thread
 * immediately with the new entry in state "answering". The caller polls
 * listQuestions until it settles.
 */
export async function askQuestion(runId, question, { detail, execAnswer = defaultExecAnswer }) {
  const text = String(question || "").trim();
  if (!text) throw new Error("A question is required.");
  if (!detail) throw new Error("No record of that run exists, so nothing can answer for it.");

  const thread = await listQuestions(runId);
  const entry = {
    id: `q-${Date.now()}-${thread.length}`,
    question: text,
    askedAt: new Date().toISOString(),
    state: "answering",
    answer: null,
    answeredAt: null,
    error: null,
  };
  const next = [...thread, entry];
  await persistQuestions(runId, next);

  // Fire and record. The HTTP request is not held open for a five-minute
  // session; the thread file is the durable state either way.
  void execAnswer(buildCompanionPrompt(detail, thread, text))
    .then(async (answer) => {
      const current = await listQuestions(runId);
      await persistQuestions(
        runId,
        current.map((item) =>
          item.id === entry.id
            ? { ...item, state: "answered", answer, answeredAt: new Date().toISOString() }
            : item
        )
      );
    })
    .catch(async (cause) => {
      const current = await listQuestions(runId);
      await persistQuestions(
        runId,
        current.map((item) =>
          item.id === entry.id
            ? {
                ...item,
                state: "failed",
                error: cause instanceof Error ? cause.message : String(cause),
                answeredAt: new Date().toISOString(),
              }
            : item
        )
      );
    });

  return next;
}

// ---------------------------------------------------------------------------
// Change requests. Not a note: a new run on the same ticket, dispatched by the
// gateway route through the normal dispatch path, carrying the request and the
// previous run's outcome as its extra context, and linked via followsRun.
// ---------------------------------------------------------------------------

export function buildFollowUpContext(detail, instruction) {
  const files = Array.isArray(detail.attachments)
    ? detail.attachments
        .filter((file) => file.ok)
        .map((file) => `  - ${file.path}`)
        .join("\n")
    : "";
  return `THIS IS A CHANGE REQUEST ON WORK ALREADY DONE.
A previous ${detail.agentLabel} run on ${detail.issueKey} finished ${detail.verdict ?? "without a verdict"}${
    detail.note ? ` (${detail.note})` : ""
  }.
${detail.review.postedComment ? `\nThe comment it posted on the ticket:\n${detail.review.postedComment}\n` : ""}${
  files ? `\nFiles it attached to the ticket:\n${files}\n` : ""
}
Steve reviewed that work and asks for these changes:
${instruction}

Revise the existing deliverables rather than starting over. Read what is already on
the ticket first, keep what was right, and change what was asked.`;
}
