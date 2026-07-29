import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Hands a Jira issue to Claude Code or Codex and writes the outcome back to Jira.
 *
 * Flow, so the board never lies about what is happening:
 *   1. Move the issue to In Progress and comment that it was picked up, before the
 *      agent starts. If that write fails, nothing is dispatched.
 *   2. Run the agent headless with a prompt built from the real issue.
 *   3. On exit, decide Done, In Review or Blocked from what the agent actually
 *      reported, comment with its summary, and log the elapsed time.
 *
 * A run that dies or is killed leaves the issue In Progress with its pickup comment
 * intact rather than silently reverting, so a half-finished run is visible.
 */

const RUNS_DIR = join(process.cwd(), ".agent-runs");
const MAX_RUNTIME_MS = 45 * 60 * 1000;
const MAX_OUTPUT = 400_000;

/** issueKey -> run */
const runs = new Map();

const AGENTS = {
  claude: {
    label: "Claude Code",
    command: "claude",
    args: (promptFile) => [
      "-p",
      `@${promptFile}`,
      "--permission-mode",
      "acceptEdits",
      "--output-format",
      "text",
    ],
  },
  codex: {
    label: "Codex",
    command: "codex",
    args: (promptFile) => ["exec", "--full-auto", `@${promptFile}`],
  },
};

function nowIso() {
  return new Date().toISOString();
}

function buildPrompt(issue, extraContext) {
  const subtasks = (issue.subtasks ?? [])
    .map((s) => `  - ${s.key} [${s.status}] ${s.summary}`)
    .join("\n");
  const links = (issue.links ?? [])
    .map((l) => `  - ${l.type} ${l.direction === "outward" ? "->" : "<-"} ${l.key} ${l.summary}`)
    .join("\n");

  return `You are completing a real work item for Steve Nahrup on the IP Corporation
Fabric and MDM engagement. Work in the architecture brain at
"C:\\Users\\snahrup\\OneDrive - IP-Corporation\\ipcorp-architecture-brain" unless the
issue clearly concerns another repository.

JIRA ISSUE ${issue.key}
Summary : ${issue.summary}
Status  : ${issue.status?.name ?? "unknown"}
Priority: ${issue.priority?.name ?? "none"}
Due     : ${issue.dueDate ?? "not set"}
Labels  : ${(issue.labels ?? []).join(", ") || "none"}

DESCRIPTION
${issue.description || "(no description)"}
${subtasks ? `\nSUBTASKS\n${subtasks}` : ""}
${links ? `\nRELATED\n${links}` : ""}
${extraContext ? `\nEXTRA CONTEXT FROM STEVE\n${extraContext}` : ""}

WHAT TO DO
Complete the work this issue describes. Read before you write. If the issue calls for a
document, produce the document. If it calls for a decision, gather the evidence and write
the decision record. Do not stop at a plan.

WRITING RULES
Everything you write is in Steve's voice and may be read by his manager and CIO.
- Never mention Claude, Codex, Copilot, assistants, automation, transcripts as a source,
  tutorials, or videos. Research is always Steve's own analysis.
- Never use these words in any inflection: gate, contract, chargeback, ratification,
  topology, system-of-record, augmenting, deterministic, hardening, slate, taxonomy,
  canonical. Use boundary very sparingly.
- No em dashes or en dashes. No AI-fingerprint phrasing.
- Patrick Stiller is never "Pat".

FINISH BY PRINTING EXACTLY ONE OF THESE LINES AS THE LAST LINE OF YOUR OUTPUT
RESULT: DONE <one sentence on what you completed>
RESULT: REVIEW <one sentence on what you produced that needs Steve to look at it>
RESULT: BLOCKED <one sentence naming exactly what stopped you>

Use BLOCKED only when something outside your control stopped you: a missing permission,
an unavailable source, or a decision only Steve can make. Do not claim DONE for work you
did not verify.`;
}

function classify(output) {
  const lines = output.trim().split(/\r?\n/).reverse();
  for (const line of lines) {
    const match = /^\s*RESULT:\s*(DONE|REVIEW|BLOCKED)\b(.*)$/i.exec(line);
    if (match) {
      return { verdict: match[1].toUpperCase(), note: match[2].trim() };
    }
  }
  // No verdict line means the agent did not finish its own contract, so a human looks.
  return {
    verdict: "REVIEW",
    note: "The run finished without stating a result, so its output needs a read.",
  };
}

export function getRun(issueKey) {
  return runs.get(issueKey) ?? null;
}

export function listRuns() {
  return [...runs.values()].map(({ child, ...rest }) => rest);
}

/**
 * @param deps.getIssue      (key) => issue detail
 * @param deps.transition    (key, statusName) => void
 * @param deps.comment       (key, text) => void
 * @param deps.logWork       (key, seconds, text) => void
 */
export async function dispatch({ issueKey, agent, context, cwd, deps }) {
  const config = AGENTS[agent];
  if (!config) throw new Error(`Unknown agent "${agent}".`);

  const existing = runs.get(issueKey);
  if (existing && existing.state === "running") {
    throw new Error(`${issueKey} is already running on ${existing.agentLabel}.`);
  }

  const issue = await deps.getIssue(issueKey);

  // Move the board first. If this fails we have not started anything.
  await deps.transition(issueKey, "In Progress");
  await deps.comment(
    issueKey,
    `Picked this up to work on it now. Starting from the description and the linked items above. I will come back with what landed, what still needs a look, or what stopped me.`
  );

  await mkdir(RUNS_DIR, { recursive: true });
  const promptFile = join(RUNS_DIR, `${issueKey}.prompt.md`);
  await writeFile(promptFile, buildPrompt(issue, context), "utf8");

  const startedAt = Date.now();
  const run = {
    issueKey,
    agent,
    agentLabel: config.label,
    state: "running",
    startedAt: nowIso(),
    finishedAt: null,
    verdict: null,
    note: null,
    output: "",
    exitCode: null,
    error: null,
  };
  runs.set(issueKey, run);

  const child = spawn(config.command, config.args(promptFile), {
    cwd: cwd || process.cwd(),
    shell: true,
    windowsHide: true,
  });
  run.child = child;

  const append = (chunk) => {
    run.output = (run.output + chunk.toString()).slice(-MAX_OUTPUT);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);

  const killer = setTimeout(() => {
    run.error = `Stopped after ${MAX_RUNTIME_MS / 60000} minutes without finishing.`;
    child.kill();
  }, MAX_RUNTIME_MS);

  child.on("error", (cause) => {
    run.error = cause.message;
  });

  child.on("close", async (code) => {
    clearTimeout(killer);
    run.exitCode = code;
    run.finishedAt = nowIso();
    delete run.child;

    const elapsedSeconds = Math.max(60, Math.round((Date.now() - startedAt) / 1000));
    let verdict;
    let note;

    if (run.error) {
      verdict = "BLOCKED";
      note = run.error;
    } else if (code !== 0) {
      verdict = "BLOCKED";
      note = `The run exited with code ${code}.`;
    } else {
      ({ verdict, note } = classify(run.output));
    }

    run.state = "finished";
    run.verdict = verdict;
    run.note = note;

    const tail = run.output.trim().split(/\r?\n/).slice(-40).join("\n");
    try {
      await deps.comment(
        issueKey,
        verdict === "DONE"
          ? `Finished this. ${note}\n\nWhat the run reported:\n${tail}`
          : verdict === "REVIEW"
            ? `This is done enough to look at, but it needs your eyes before it closes. ${note}\n\nWhat the run reported:\n${tail}`
            : `Stopped on this one. ${note}\n\nWhat the run reported:\n${tail}`
      );
      await deps.logWork(
        issueKey,
        elapsedSeconds,
        `Worked ${issueKey} end to end and recorded the outcome.`
      );
      await deps.transition(
        issueKey,
        verdict === "DONE" ? "Done" : verdict === "REVIEW" ? "In Review" : "Blocked"
      );
    } catch (cause) {
      run.error = `The work finished but writing the outcome back failed: ${cause.message}`;
    }

    try {
      await writeFile(
        join(RUNS_DIR, `${issueKey}.${startedAt}.json`),
        JSON.stringify({ ...run, child: undefined }, null, 2),
        "utf8"
      );
    } catch {
      // A missing archive file must not change the run result.
    }
  });

  return { ...run, child: undefined };
}

export async function loadArchivedRun(issueKey) {
  if (!existsSync(RUNS_DIR)) return null;
  try {
    const raw = await readFile(join(RUNS_DIR, `${issueKey}.latest.json`), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
