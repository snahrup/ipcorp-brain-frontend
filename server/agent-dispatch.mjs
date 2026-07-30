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

// A run writes a real status, comment and worklog onto a live Jira issue, so the model
// and reasoning effort are pinned here rather than inherited from whatever each CLI
// happens to be configured with. Ambient config drifts: ~/.codex/config.toml was found
// pointing model_provider at a local Ollama endpoint serving zero models, which would
// have failed every Codex run and written a false "Blocked" onto a real issue.
const AGENTS = {
  claude: {
    label: "Claude Code",
    command: "claude",
    args: (promptFile) => [
      "-p",
      `@${promptFile}`,
      "--model",
      "opus",
      "--permission-mode",
      "acceptEdits",
      // Structured events are what make a readable transcript possible. Plain text
      // interleaves prose with tool noise and cannot be separated again afterwards.
      "--output-format",
      "stream-json",
      "--verbose",
    ],
    parse: parseClaudeEvent,
    activity: parseClaudeActivity,
  },
  codex: {
    label: "Codex",
    command: "codex",
    args: (promptFile) => [
      "exec",
      "--full-auto",
      "--model",
      "gpt-5.6-sol",
      "-c",
      "model_provider=openai",
      "-c",
      "model_reasoning_effort=high",
      "--json",
      `@${promptFile}`,
    ],
    parse: parseCodexEvent,
    activity: parseCodexActivity,
  },
};

/** Claude stream-json: assistant turns carry text and tool_use side by side. */
export function parseClaudeEvent(event) {
  if (event?.type !== "assistant") return [];
  const content = event.message?.content;
  if (!Array.isArray(content)) return [];
  // tool_use blocks are dropped on purpose. This view is for reading what the agent
  // said and why, not for watching it operate.
  return content
    .filter((block) => block?.type === "text" && block.text?.trim())
    .map((block) => ({ role: "agent", text: block.text.trim() }));
}

/**
 * What the agent is doing right now, for the activity line.
 *
 * A headless run can work silently through dozens of tool calls before it says a word,
 * so the conversation alone can sit empty for minutes on a run that is perfectly
 * healthy. Something always has to be moving, or a working run reads as a hung one.
 */
export function parseClaudeActivity(event) {
  if (event?.type !== "assistant") return null;
  const content = event.message?.content;
  if (!Array.isArray(content)) return null;
  const tool = content.find((block) => block?.type === "tool_use" && block.name);
  return tool ? tool.name : null;
}

export function parseCodexActivity(event) {
  const item = event?.item ?? event?.msg ?? event;
  const type = item?.type;
  if (type === "command_execution" || type === "exec_command_begin") return "Shell";
  if (type === "file_change" || type === "patch_apply_begin") return "Edit";
  if (type === "web_search" || type === "mcp_tool_call") return "Search";
  return null;
}

/**
 * Codex JSONL. The event shape has moved between versions, so every known spelling of
 * "the agent said something" is accepted and anything else is ignored.
 */
export function parseCodexEvent(event) {
  const candidates = [
    event?.item?.type === "agent_message" ? event.item.text : null,
    event?.msg?.type === "agent_message" ? (event.msg.message ?? event.msg.text) : null,
    event?.type === "agent_message" ? (event.message ?? event.text) : null,
  ];
  return candidates
    .filter((text) => typeof text === "string" && text.trim())
    .map((text) => ({ role: "agent", text: text.trim() }));
}

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

FINISH BY PRINTING EXACTLY THIS, AND NOTHING AFTER IT

COMMENT:
<the Jira comment, posted to ${issue.key} under Steve's name, verbatim and unedited>
END COMMENT
RESULT: DONE|REVIEW|BLOCKED <one sentence>

The COMMENT block is published to Jira exactly as written, so write it as Steve writing
a comment on his own issue. Plain sentences in short paragraphs, first person, saying
what he did and why the judgment calls went the way they did. Blank line between
paragraphs.

- No markdown at all. Jira renders ** and backticks literally, so they arrive as
  punctuation on the page. No bold, no headings, no bullets, no code formatting.
- No narration of your own process. Never "What the run reported", "Now the next step",
  "I will now", or any running commentary. The reader wants the outcome and the
  reasoning, not a log.
- Name file paths plainly in a sentence.
- Do not repeat the RESULT sentence inside the comment.
- Before printing the block, run it through the humanizer skill and then the
  structural-humanizer skill (both installed globally). At minimum, strip these tells
  yourself: "isn't just X, it's Y", rule-of-three lists used as emphasis, negative
  parallelism, hype adjectives, and a closing sentence that summarizes the comment.

Use BLOCKED only when something outside your control stopped you: a missing permission,
an unavailable source, or a decision only Steve can make. Do not claim DONE for work you
did not verify.`;
}

/** Everything the agent actually said, in order, with the prompt left out. */
function agentProse(run) {
  return (run.messages ?? [])
    .filter((m) => m.role === "agent")
    .map((m) => m.text)
    .join("\n\n");
}

/**
 * The comment the agent wrote for Jira, or null if it did not write one.
 *
 * Only the block between the markers is published. Everything else the agent printed is
 * working narration addressed to nobody, and stapling that onto an issue is how a
 * comment ends up reading like a console log instead of like Steve.
 */
export function extractComment(prose) {
  const match = /^[ \t]*COMMENT:[ \t]*\r?\n([\s\S]*?)^[ \t]*END COMMENT[ \t]*$/m.exec(prose);
  if (!match) return null;
  const body = match[1]
    .trim()
    // Markdown emphasis and code ticks render as literal punctuation in Jira.
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    // Dashes Steve never uses, whichever way the agent typed them.
    .replace(/—/g, ". ")
    .replace(/–/g, "-");
  return body || null;
}

/** What goes on the issue when the agent did not produce a usable comment. */
function fallbackComment(verdict, note) {
  if (verdict === "DONE") return `Finished this. ${note}`;
  if (verdict === "REVIEW") {
    return `This is far enough along to look at, but it needs your eyes before it closes. ${note}`;
  }
  return `Stopped on this one. ${note}`;
}

function buildOutcomeComment(run, verdict, note) {
  return extractComment(agentProse(run)) ?? fallbackComment(verdict, note);
}

export function classify(output) {
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
  const prompt = buildPrompt(issue, context);
  await writeFile(promptFile, prompt, "utf8");

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
    // The readable record: what was asked, and what came back in prose. Grows while
    // the run is live so the modal can show it as it happens.
    messages: [{ seq: 0, role: "sent", text: prompt, at: nowIso() }],
    // Activity counters, so a silent run still shows visible movement.
    steps: 0,
    lastAction: null,
    lastEventAt: nowIso(),
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

  // Both CLIs emit one JSON object per line, but a chunk can split a line anywhere, so
  // the remainder is carried until its newline arrives.
  let pending = "";
  const consume = (chunk) => {
    const text = chunk.toString();
    run.output = (run.output + text).slice(-MAX_OUTPUT);
    pending += text;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim().startsWith("{")) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue; // A line we cannot read is not a reason to lose the run.
      }
      for (const message of config.parse(event)) {
        run.messages.push({ ...message, seq: run.messages.length, at: nowIso() });
      }
      const tool = config.activity(event);
      if (tool) {
        run.steps += 1;
        run.lastAction = tool;
      }
      // Any event at all proves the process is alive, which is what the activity line
      // is really reporting.
      run.lastEventAt = nowIso();
    }
  };
  child.stdout?.on("data", consume);
  // stderr is progress and warnings, not conversation. It stays in the raw output only.
  child.stderr?.on("data", (chunk) => {
    run.output = (run.output + chunk.toString()).slice(-MAX_OUTPUT);
  });

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
      // The verdict line lives in the agent's prose. With structured output the raw
      // stream is JSON, so classifying it directly would never find the line and every
      // run would come back REVIEW. Fall back to raw only if nothing parsed at all.
      ({ verdict, note } = classify(agentProse(run) || run.output));
    }

    run.state = "finished";
    run.verdict = verdict;
    run.note = note;

    try {
      await deps.comment(issueKey, buildOutcomeComment(run, verdict, note));
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
