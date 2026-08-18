import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Hands a Jira issue to Claude Code or Codex and writes the outcome back to Jira.
 *
 * Flow, so the board never lies about what is happening:
 *   1. Move the issue to In Progress before the agent starts. If that write fails,
 *      nothing is dispatched. No comment accompanies it — the transition itself is a
 *      timestamped, visible signal, and a comment that only says work is starting has
 *      no content of its own to add.
 *   2. Run the agent headless with a prompt built from the real issue.
 *   3. On exit, decide Done, In Review or Blocked from what the agent actually
 *      reported, comment with its summary, and log the elapsed time.
 *
 * A run that dies or is killed leaves the issue In Progress rather than silently
 * reverting, so a half-finished run is visible on the board itself.
 */

const LEGACY_RUNS_DIR = join(process.cwd(), ".agent-runs");
const SUMMARY_SUFFIX = ".summary.json";
const MAX_RUNTIME_MS = 45 * 60 * 1000;
const MAX_OUTPUT = 400_000;

/** issueKey -> run */
const runs = new Map();

// A run writes a real status, comment and worklog onto a live Jira issue, so the model
// and reasoning effort are pinned here rather than inherited from whatever each CLI
// happens to be configured with. Ambient config drifts: ~/.codex/config.toml was found
// pointing model_provider at a local Ollama endpoint serving zero models, which would
// have failed every Codex run and written a false "Blocked" onto a real issue.
// The prompt arrives on STDIN, never as an "@file" argument. Two independent
// failures on 2026-08-17/18 forced this: the run directory is a backslash
// Windows path that the CLI does not resolve, so the model answered the
// session's startup context instead of the ticket; and where the path did
// resolve, a current model treated instructions sitting in file data as an
// injection attempt and refused them outright. Both end the same way, with a
// run writing status, a comment and a worklog onto a live issue having done
// nothing that was asked. On stdin the prompt is the turn itself.
const AGENTS = {
  claude: {
    label: "Claude Code",
    command: "claude",
    args: () => [
      "-p",
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
    stdio: ["pipe", "pipe", "pipe"],
    parse: parseClaudeEvent,
    activity: parseClaudeActivity,
  },
  codex: {
    label: "Codex",
    command: "codex",
    // codex exec reads its instructions from stdin when no prompt argument is
    // given, which is documented in its own help.
    args: () => [
      "exec",
      "--full-auto",
      "--model",
      "gpt-5.6-sol",
      "-c",
      "model_provider=openai",
      "-c",
      "model_reasoning_effort=high",
      "--json",
    ],
    stdio: ["pipe", "pipe", "pipe"],
    parse: parseCodexEvent,
    activity: parseCodexActivity,
  },
};

/** Exposed so a test can assert the invocation shape without spending a run. */
export const AGENT_INVOCATIONS = AGENTS;

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

function localAppDataRoot() {
  return process.env.LOCALAPPDATA || join(process.env.USERPROFILE || homedir(), "AppData", "Local");
}

export function agentRunsDir() {
  return process.env.IPCORP_AGENT_RUNS_DIR || join(localAppDataRoot(), "IPCorpBrain", "agent-runs");
}

function legacyRunsDir() {
  return process.env.IPCORP_AGENT_RUNS_LEGACY_DIR || LEGACY_RUNS_DIR;
}

function publicMessages(run) {
  return (run.messages ?? [])
    .filter((message) => message?.role === "agent" && String(message.text || "").trim())
    .map((message) => ({
      seq: Number.isFinite(message.seq) ? message.seq : 0,
      role: "agent",
      text: String(message.text).trim(),
      at: String(message.at || ""),
    }));
}

function publicRunSummary(run, { includeMessages = false } = {}) {
  const issueKey = String(run?.issueKey || "")
    .trim()
    .toUpperCase();
  if (!issueKey) return null;
  const summary = {
    issueKey,
    agent: String(run.agent || ""),
    agentLabel: String(run.agentLabel || run.agent || ""),
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
    humanize: run.humanize ?? null,
  };
  if (includeMessages) summary.messages = publicMessages(run);
  return summary;
}

function sortTime(run) {
  const value = Date.parse(run?.finishedAt || run?.lastEventAt || run?.startedAt || "");
  return Number.isFinite(value) ? value : 0;
}

function uniqueRunKey(run) {
  return `${run.issueKey}|${run.finishedAt || run.startedAt || ""}`;
}

function dedupeRuns(items) {
  const byKey = new Map();
  for (const item of items) {
    const summary = publicRunSummary(item);
    if (!summary) continue;
    byKey.set(uniqueRunKey(summary), summary);
  }
  return [...byKey.values()].sort((a, b) => sortTime(b) - sortTime(a));
}

function summaryFileName(summary) {
  const time = sortTime(summary) || Date.now();
  const key = String(summary.issueKey || "run").replace(/[^A-Z0-9-]/gi, "_");
  return `${key}.${time}${SUMMARY_SUFFIX}`;
}

async function persistRunSummary(run) {
  const summary = publicRunSummary(run);
  if (!summary) return;
  try {
    await mkdir(agentRunsDir(), { recursive: true });
    await writeFile(
      join(agentRunsDir(), summaryFileName(summary)),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8"
    );
  } catch {
    // Losing this file must not change the run result.
  }
}

async function readJsonFiles(directory, accept) {
  const names = await readdir(directory).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const items = [];
  for (const name of names) {
    if (!accept(name)) continue;
    try {
      const parsed = JSON.parse(await readFile(join(directory, name), "utf8"));
      const summary = publicRunSummary(parsed);
      if (summary) items.push(summary);
    } catch {
      // One bad archive cannot hide the rest of the run history.
    }
  }
  return items;
}

async function readSavedSummaries() {
  const current = await readJsonFiles(agentRunsDir(), (name) => name.endsWith(SUMMARY_SUFFIX));
  const legacy = await readJsonFiles(
    legacyRunsDir(),
    (name) =>
      /\.json$/i.test(name) &&
      !name.endsWith(SUMMARY_SUFFIX) &&
      !name.startsWith("humanize.") &&
      name !== "humanize-shapes.json"
  );
  return dedupeRuns([...legacy, ...current]);
}

function buildPrompt(issue, extraContext) {
  const subtasks = (issue.subtasks ?? [])
    .map((s) => `  - ${s.key} [${s.status}] ${s.summary}`)
    .join("\n");
  const links = (issue.links ?? [])
    .map((l) => `  - ${l.type} ${l.direction === "outward" ? "->" : "<-"} ${l.key} ${l.summary}`)
    .join("\n");
  // A ticket's decisions usually live in its comments, not its description.
  // Dropping them was how an agent could redo settled work or contradict a
  // call Patrick already made on the same issue.
  const comments = (issue.comments ?? [])
    .map((c) => `  - ${c.author ?? "unknown"} on ${c.created ?? "unknown date"}: ${c.body ?? ""}`)
    .join("\n");
  const worklogs = (issue.worklogs ?? [])
    .map(
      (w) =>
        `  - ${w.author ?? "unknown"} logged ${w.timeSpent ?? "?"} on ${w.started ?? "?"}${
          w.comment ? `: ${w.comment}` : ""
        }`
    )
    .join("\n");
  const attached = (issue.attachments ?? [])
    .map((a) => `  - ${a.filename ?? a.name ?? "unnamed"}`)
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
Estimate: ${issue.timeTracking?.originalEstimate ?? "not set"} original, ${
    issue.timeTracking?.remainingEstimate ?? "not set"
  } remaining

DESCRIPTION
${issue.description || "(no description)"}
${subtasks ? `\nSUBTASKS\n${subtasks}` : ""}
${links ? `\nRELATED\n${links}` : ""}
${comments ? `\nDISCUSSION ALREADY ON THIS TICKET, treat every decision in it as settled\n${comments}` : ""}
${worklogs ? `\nWORK ALREADY LOGGED, so you know how far along this is\n${worklogs}` : ""}
${attached ? `\nALREADY ATTACHED TO THE TICKET, read before producing anything that overlaps\n${attached}` : ""}
${extraContext ? `\nEXTRA CONTEXT FROM STEVE\n${extraContext}` : ""}

BEFORE YOU WRITE ANYTHING
This is a live client engagement, not a sandbox. Gather the same context Steve would
have in his head before starting:

1. Restate the acceptance criteria in your own words from the description, the subtasks
   and the discussion above. If the issue never states them, say so explicitly rather
   than inventing a definition of finished that happens to match what you produced.
2. Search the architecture brain for what already exists on this subject: prior meeting
   records, decisions, existing documents in the same domain, and anything the RELATED
   issues produced. Read what you find before writing a line. Contradicting a decision
   already recorded there is worse than delivering nothing.
3. Read the brain's own house rules before writing into it: AGENTS.md, the ingestion
   playbook, and the current CHANGELOG and its MANIFEST. A brain write that does not
   append its CHANGELOG row in the same change breaks the protocol.

STAYING ON THE RAILS
Fabric, Power BI, Purview and general BI architecture have real, established practice.
Use it as a check on yourself: before you recommend a pattern, satisfy yourself that it
is a thing practitioners actually do with that product, not something that merely sounds
right. Inventing a best practice that does not exist is the failure to avoid here.

This is a sanity check, not a citation exercise. Do not write like you are quoting a
documentation site, do not cite Learn articles or link dumps, and do not pad the comment
with references to prove you checked. Steve writes from his own understanding of the
platform. The validation is silent; only the recommendation is visible.

WHAT THE DELIVERABLE SHOULD BE
Match the artifact to who reads it. A markdown file is the right answer for a
record in the architecture brain, because that is the brain's own format. It is
the wrong answer for anything a client, a steward or a leadership audience
opens. Governance and access documentation, process guides, decision packets,
runbooks and briefs are read by people who do not work in a text editor, and a
raw .md handed to them reads as unfinished.

For those, produce a real document: a PDF or Word file for prose, a deck when
the point is to walk a room through something, a spreadsheet when the substance
is a table people will filter. python-docx and python-pptx are installed, and
the docx, pptx and pdf skills are available. Use them.

Make it genuinely good, and do not overdo it. Steve's work is read as the work
of one capable architect, not a design agency: a clear title, a short executive
summary that stands alone, real structure with numbered sections, tables where
tables help, diagrams only where a diagram carries something prose cannot, and
white space. No stock imagery, no gradient title pages, no clip art, no
decorative icons on every heading. A reader should think this person knows the
subject and respects my time, never this took someone a week.

Ask before inventing: if the ticket does not say what format the reader needs,
choose the one the audience implies and say in the comment why you chose it.

WHAT TO DO
Complete the work this issue describes. Read before you write. If the issue calls for a
document, produce the document. If it calls for a decision, gather the evidence and write
the decision record. Do not stop at a plan.

WHEN YOU DO NOT HAVE WHAT YOU NEED
Do not invent, guess, or fabricate a plausible answer. A missing number, an unnamed owner
or an undecided scope is a question for Steve, not a blank to fill. Return RESULT: BLOCKED
with the exact question and who can answer it. A missing answer is a valid outcome. An
invented one is a false record on a client engagement, and it will be read as fact.

DELIVERABLES GO ON THE TICKET
Any file you produce or materially change gets attached to ${issue.key}, because a path
in a comment is unreachable for anyone reading the board. List every one of them by
absolute path in the ATTACH block below. Files that only exist on disk do not count as
delivered.

AS YOU WORK
Whatever you say between tool calls is shown to Steve live while this runs, so it has to
carry information, not throat-clearing. Skip openers like "I'll start by understanding the
current state" or "Let me look at what exists". Silence between tool calls is fine and
expected. When you do say something, report a finding, a decision, or what you just
changed, in a sentence or two, not a plan for what you are about to do.

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

ATTACH:
<one absolute file path per line for every deliverable, or leave the block empty>
END ATTACH
COMMENT:
<the Jira comment, posted to ${issue.key} under Steve's name, verbatim and unedited>
END COMMENT
RESULT: DONE|REVIEW|BLOCKED <one sentence>
TIME: <human-scale effort for what was delivered, like 3h or 2h 30m>

TIME is logged to the issue as work done, so it is what the delivered work represents
for a person doing it, anchored to the issue's estimate. It is never this run's wall
clock. A half-day document is a half-day of logged work.

The COMMENT block is published to Jira exactly as written, so write it as Steve writing
a comment on his own issue. Plain sentences in short paragraphs, first person, saying
what he did and why the judgment calls went the way they did. Blank line between
paragraphs.

- No markdown at all. Jira renders ** and backticks literally, so they arrive as
  punctuation on the page. No bold, no headings, no bullets, no code formatting.
- No narration of your own process. Never "What the run reported", "Now the next step",
  "I will now", or any running commentary. The reader wants the outcome and the
  reasoning, not a log.
- NEVER put a local or relative file path in a Jira comment. A path like
  docs/whatever.md or C:Users... is unreachable for every person reading the
  board, and it goes stale the moment the file moves. There are exactly two
  ways to reference a file:
  1. It lives in the architecture brain, so reference it by its SharePoint web
     URL, which is what lets a reader open the current version. If you do not
     have that URL, attach the file instead rather than writing a path.
  2. It is a one-off deliverable produced for this ticket, so it is attached to
     the ticket itself as a real file and referred to by name.
- Do not repeat the RESULT sentence inside the comment.
- Shape it for a reader with ADHD, because Steve is the first person who reads
  it back. The opening line is the outcome or the thing someone has to do next,
  never a wind-up and never context first. Anything that took more than one step
  is a numbered list, one bounded action per line. Numbers are specific: real
  file counts, real hours, real ticket keys, never "several" or "a bit". If
  something is still open, the last line names it as a single next action with
  whoever owns it. Anything not on the page is forgotten, so restate what
  changed rather than referring back to earlier comments.
- Short. If a paragraph runs past four sentences it is two paragraphs, or it is
  a numbered list, or half of it was not worth writing.
- State which acceptance criteria are met and how each was verified. Name what
  you could NOT verify just as plainly. "Verified" means you checked the result,
  not that you produced something and it looked right. Never report an item as
  met on the strength of having written about it.
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
/** Mechanical cleanup for every string that reaches Jira, whichever path it takes. */
function scrubForJira(text) {
  return (
    text
      // Markdown emphasis and code ticks render as literal punctuation in Jira.
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      // Dashes Steve never uses, whichever way the agent typed them.
      .replace(/—/g, ". ")
      .replace(/–/g, "-")
      // The Nexus session hook makes spawned agents prefix replies with their session
      // name. On MT-260 that put "[ipcorp-architecture-brain]" into a client-visible
      // comment, which is as loud as an automation reveal gets.
      .replace(/^\[[\w-]+\]\s*/gm, "")
      // The dash replacement can leave doubled spaces behind.
      .replace(/[^\S\n]{2,}/g, " ")
      .trim()
  );
}

/** Exposed so the prompt itself can be asserted without spending a run. */
export const buildAgentPrompt = buildPrompt;

/**
 * The absolute paths a run says it produced. An empty or absent block means no
 * attachments, never a guess: attaching a file nobody asked for is as wrong as
 * losing one, and the ticket is client-visible.
 */
export function extractAttachments(prose) {
  const match = /^[ \t]*ATTACH:[ \t]*\r?\n([\s\S]*?)^[ \t]*END ATTACH[ \t]*$/m.exec(prose ?? "");
  if (!match) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("<"));
}

export function extractComment(prose) {
  const match = /^[ \t]*COMMENT:[ \t]*\r?\n([\s\S]*?)^[ \t]*END COMMENT[ \t]*$/m.exec(prose);
  if (!match) return null;
  return scrubForJira(match[1]) || null;
}

/**
 * What goes on the issue when the agent did not produce a usable comment.
 *
 * The note is the agent's RESULT sentence, which describes the run from the outside
 * and so tends to talk about Steve in the third person. The comment is published under
 * his name, so those references flip to first person before anything is posted.
 */
/** The RESULT sentence describes the run from the outside; publish it as Steve. */
export function firstPersonNote(note) {
  return scrubForJira(note)
    .replace(/\bSteve needs\b/g, "I need")
    .replace(/\bSteve has to\b/g, "I have to")
    .replace(/\bSteve (should|must|will|can)\b/g, "I $1")
    .replace(/\bSteve's\b/g, "my");
}

export function fallbackComment(verdict, note) {
  const cleaned = firstPersonNote(note);
  if (verdict === "DONE") return `Finished this. ${cleaned}`;
  if (verdict === "REVIEW") {
    return `This is far enough along to look at, but it needs your eyes before it closes. ${cleaned}`;
  }
  return `Stopped on this one. ${cleaned}`;
}

function buildOutcomeComment(run, verdict, note) {
  return extractComment(agentProse(run)) ?? fallbackComment(verdict, note);
}

// ---------------------------------------------------------------------------
// Humanizer stage. The main run is ASKED to apply the two passes, but a prompt
// instruction is not a pipeline. This stage runs regardless: a dedicated rewrite
// call carrying the full text of both skills, then the mechanical scanners as
// a recorded floor. If any part of it fails, the mechanically scrubbed comment
// still posts; the stage can only improve the text, never lose it.
// ---------------------------------------------------------------------------

const SKILL_DIRS = [
  process.env.IPCORP_AGENT_SKILLS_DIR || "",
  join(process.cwd(), ".agents", "skills"),
  join(homedir(), ".claude", "skills"),
].filter(Boolean);
const COPY_SCANNER = join(
  homedir(),
  "CascadeProjects",
  "humanizer-stack",
  "scripts",
  "copy_scan.py"
);
const STRUCTURAL_SCANNER = join(
  SKILL_DIRS[0],
  "structural-humanizer",
  "scripts",
  "structural_scan.py"
);
const HUMANIZE_TIMEOUT_MS = 4 * 60 * 1000;

async function readSkillFile(name) {
  for (const root of SKILL_DIRS) {
    try {
      return await readFile(join(root, name, "SKILL.md"), "utf8");
    } catch {
      // Try the next configured skill root.
    }
  }
  return null;
}

export function extractRewrite(output) {
  const match = /REWRITE:[ \t]*\r?\n([\s\S]*?)END REWRITE/m.exec(output);
  return match ? scrubForJira(match[1]) || null : null;
}

/** Count scanner hits without failing the pipeline when a scanner is unavailable. */
function scanWith(script, text) {
  return new Promise((resolve) => {
    if (!existsSync(script)) return resolve(null);
    const child = spawn("python", [script, "-"], { windowsHide: true });
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, 30_000);
    child.stdout.on("data", (c) => {
      out += c.toString();
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", () => {
      clearTimeout(timer);
      if (/clean: no mechanical copy tells/.test(out)) return resolve(0);
      const total = /total:\s*(\d+)\s*hits?/.exec(out);
      if (total) return resolve(Number(total[1]));
      let hits = 0;
      let found = false;
      const audit = /\[[\w-]+\]\s*(\d+)\s*hit/g;
      let m = audit.exec(out);
      while (m) {
        found = true;
        hits += Number(m[1]);
        m = audit.exec(out);
      }
      resolve(found ? hits : null);
    });
    child.stdin.end(text);
  });
}

/**
 * A randomized structural recipe, rolled fresh for every rewrite.
 *
 * Steve's observation, and the StoryScope finding behind it: you cannot prompt your way
 * to "a pattern of no patterns," because a model told to vary still varies in its own
 * recognizable way. Humans are dispersed because outside context drives their structure.
 * The engineering equivalent is to inject the entropy from out here, then have the text
 * structured according to the roll. Same input, different run, different shape.
 */
export function structuralRecipe(rng = Math.random, avoid = { openings: [], moves: [] }) {
  // Never roll a shape used in the last few rewrites. If everything has been used
  // recently, the full list comes back rather than the roll failing.
  const usable = (list, used) => {
    const left = list.filter((entry) => !used.includes(entry));
    return left.length ? left : list;
  };
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const openings = [
    "open with the artifact that now exists",
    "open with the decision that still has to be made",
    "open with the detail that surprised you while doing the work",
    "open with a concrete number, name or file",
    "open mid-thought, as if continuing an earlier conversation about this issue",
  ];
  const moves = [
    "leave one secondary thread visibly unresolved instead of tying everything off",
    "put one short sideways aside in the middle",
    "let one paragraph be a single sentence",
    "put the most important point second from last, not first",
    "address the reader directly once, and only once",
    "keep one hyper-specific detail another writer would have rounded off",
  ];
  const openPool = usable(openings, avoid.openings);
  const movePool = usable(moves, avoid.moves);
  const first = pick(movePool);
  let moveSet = [first];
  if (rng() < 0.5 && movePool.length > 1) {
    moveSet = [first, pick(movePool.filter((move) => move !== first))];
  }
  return { opening: pick(openPool), moves: moveSet, paragraphs: 2 + Math.floor(rng() * 3) };
}

/**
 * The voice ledger: every text that passes through the seat, original and rewritten,
 * with where it went and why. Two jobs. It is the audit record of what was changed
 * before publishing, and it is what lets the rewriter sound like the same person
 * across comments: the last few outputs ride along in the next prompt as a voice
 * reference, while the shape ledger keeps their skeletons from repeating.
 */
const LEDGER_FILE = () => join(agentRunsDir(), "voice-ledger.jsonl");

async function appendLedger(entry) {
  try {
    await mkdir(agentRunsDir(), { recursive: true });
    const line = `${JSON.stringify(entry)}\n`;
    await writeFile(LEDGER_FILE(), line, { flag: "a" });
  } catch {
    // The ledger is a record, not a dependency; publishing never waits on it.
  }
}

async function recentOutputs(count = 3) {
  try {
    const lines = (await readFile(LEDGER_FILE(), "utf8")).trim().split("\n");
    return lines
      .slice(-count)
      .map((line) => JSON.parse(line).rewritten)
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** The last few rolled shapes, so the next roll cannot repeat them. */
const SHAPES_FILE = () => join(agentRunsDir(), "humanize-shapes.json");

async function recentShapes() {
  try {
    return JSON.parse(await readFile(SHAPES_FILE(), "utf8"));
  } catch {
    return [];
  }
}

async function rememberShape(recipe) {
  try {
    const shapes = [...(await recentShapes()), recipe].slice(-6);
    await mkdir(agentRunsDir(), { recursive: true });
    await writeFile(SHAPES_FILE(), JSON.stringify(shapes, null, 2), "utf8");
  } catch {
    // Losing the ledger costs variety, not correctness.
  }
}

function buildRewritePrompt(text, pass1, pass2, recipe = structuralRecipe(), priorOutputs = []) {
  const voiceReference = priorOutputs.length
    ? `\nRECENT COMMENTS BY THE SAME AUTHOR
For voice consistency only: match how these sound, and do not reuse their openings or
shapes.
${priorOutputs.map((prior, i) => `--- ${i + 1} ---\n${prior.slice(0, 600)}`).join("\n")}\n`
    : "";
  return `Rewrite the comment below by applying the two editing passes whose full
instructions follow. Pass 1 first (words and phrasing), then pass 2 (structure).

This is one comment on a Jira issue, written by the author about his own work.
- Keep every fact about the work: file paths, people's names, numbers, decisions.
- Delete outright any sentence about the writing process itself: mentions of sessions,
  sandboxes, permissions, tools, prompts, models, runs, or narration like "What the run
  reported" or "Now the next step". If it says the author could not run git, drop that.
- Never keep a RESULT: line or a TIME: line.
- Write in first person. If the text calls Steve by name in the third person, it is
  wrongly voiced; he is the author, so it becomes first person.
- No markdown. No em or en dashes. Do not add claims, and do not end with a sentence
  that summarizes the comment.

STRUCTURAL RECIPE FOR THIS REWRITE
Rolled at random for this run so no two comments share a shape. Follow it rather than
your own default structure:
- ${recipe.opening}
- ${recipe.moves.join("\n- ")}
- Land around ${recipe.paragraphs} paragraphs.
${voiceReference}
THE COMMENT
${text}

PASS 1 INSTRUCTIONS
${pass1}

PASS 2 INSTRUCTIONS
${pass2}

Reply with exactly:
REWRITE:
<the rewritten comment>
END REWRITE`;
}

async function defaultExecRewrite(prompt) {
  await mkdir(agentRunsDir(), { recursive: true });
  const file = join(agentRunsDir(), `humanize.${Date.now()}.prompt.md`);
  await writeFile(file, prompt, "utf8");
  return new Promise((resolve, reject) => {
    // Sonnet: this is a bounded rewrite with the full instructions in hand, where
    // speed matters because the issue is sitting unresolved until the comment posts.
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
      reject(new Error("humanize pass timed out"));
    }, HUMANIZE_TIMEOUT_MS);
    child.stdout.on("data", (c) => {
      out += c.toString();
    });
    child.stderr.on("data", (c) => {
      err += c.toString();
    });
    child.on("error", (cause) => {
      clearTimeout(timer);
      reject(cause);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`humanize pass exited ${code}: ${err.slice(-200)}`));
    });
  });
}

export async function humanizeComment(text, execRewrite = defaultExecRewrite, meta = {}) {
  const started = Date.now();
  const stage = { applied: false, copyHits: null, structuralHits: null, reason: null, ms: 0 };
  try {
    const [pass1, pass2] = await Promise.all([
      readSkillFile("humanizer"),
      readSkillFile("structural-humanizer"),
    ]);
    if (!pass1 || !pass2) {
      stage.reason = "humanizer skills are not installed globally";
      return { text, stage };
    }
    // Roll a shape that none of the last three rewrites used, and carry the last few
    // published outputs so the voice stays one person's.
    const recent = (await recentShapes()).slice(-3);
    const recipe = structuralRecipe(Math.random, {
      openings: recent.map((shape) => shape.opening),
      moves: recent.flatMap((shape) => shape.moves),
    });
    stage.recipe = recipe;
    const rewritten = extractRewrite(
      await execRewrite(buildRewritePrompt(text, pass1, pass2, recipe, await recentOutputs()))
    );
    if (!rewritten) {
      stage.reason = "the pass returned no rewrite block";
      return { text, stage };
    }
    stage.applied = true;
    await rememberShape(recipe);
    [stage.copyHits, stage.structuralHits] = await Promise.all([
      scanWith(COPY_SCANNER, rewritten),
      scanWith(STRUCTURAL_SCANNER, rewritten),
    ]);
    await appendLedger({
      at: nowIso(),
      issueKey: meta.issueKey ?? null,
      purpose: meta.purpose ?? "jira outcome comment",
      recipe,
      copyHits: stage.copyHits,
      structuralHits: stage.structuralHits,
      original: text,
      rewritten,
    });
    return { text: rewritten, stage };
  } catch (cause) {
    stage.reason = cause.message;
    return { text, stage };
  } finally {
    stage.ms = Date.now() - started;
  }
}

/**
 * The TIME line: the effort the delivered work represents at human pace.
 *
 * The first run logged its own wall clock, which put 8 minutes of work on an issue
 * whose deliverable was a half-day document. On a board where every other entry is
 * human-scale, machine-clock time is both wrong for the record and an obvious tell.
 * Returns seconds, or null if the agent did not declare a usable time.
 */
export function parseTime(prose) {
  const match = /^[ \t]*TIME:[ \t]*(.+?)[ \t]*$/m.exec(prose);
  if (!match) return null;
  let seconds = 0;
  let found = false;
  const part = /(\d+(?:\.\d+)?)[ \t]*([dhm])/gi;
  let hit = part.exec(match[1]);
  while (hit) {
    found = true;
    const value = Number(hit[1]);
    const unit = hit[2].toLowerCase();
    seconds += unit === "d" ? value * 8 * 3600 : unit === "h" ? value * 3600 : value * 60;
    hit = part.exec(match[1]);
  }
  return found ? Math.round(seconds) : null;
}

/** Bounded so a misjudged declaration cannot log an absurd entry either way. */
export function workSeconds(prose, elapsedSeconds) {
  const declared = parseTime(prose);
  // No declaration: scale the wall clock by the same 3.5x normalization the rest of
  // the board's estimates use, then clamp.
  const basis = declared ?? Math.round(elapsedSeconds * 3.5);
  return Math.min(6 * 3600, Math.max(30 * 60, basis));
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
  const run = runs.get(issueKey);
  return run ? publicRunSummary(run, { includeMessages: true }) : null;
}

export async function listRuns() {
  const saved = await readSavedSummaries();
  const live = [...runs.values()].map((run) => publicRunSummary(run));
  return dedupeRuns([...saved, ...live]);
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

  // Move the board first. If this fails we have not started anything. The transition
  // itself is the real audit signal — a timestamped, visible state change on the ticket
  // — so no separate "picked this up" comment follows it. A comment that only says work
  // is starting carries no content, and it used to sit as the newest comment on an issue
  // for the whole run, which made the Activity view's last-activity line say nothing
  // happened yet on a ticket that was actively being worked.
  await deps.transition(issueKey, "In Progress");

  await mkdir(agentRunsDir(), { recursive: true });
  const promptFile = join(agentRunsDir(), `${issueKey}.prompt.md`);
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

  // The prompt file is still written, because it is the record of exactly what
  // was asked, but the agent is handed the prompt on stdin rather than a path.
  const child = spawn(config.command, config.args(), {
    cwd: cwd || process.cwd(),
    shell: true,
    windowsHide: true,
    stdio: config.stdio ?? ["pipe", "pipe", "pipe"],
  });
  run.child = child;
  child.stdin?.on("error", () => {
    // A process that died before reading is reported by its close handler.
  });
  child.stdin?.end(prompt, "utf8");

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

    // Deliverables go up BEFORE the comment, so the comment never refers to a
    // file that is not on the ticket yet. A file that cannot be attached is
    // reported as such rather than quietly dropped, because a comment claiming
    // a deliverable that is not there is worse than no comment.
    run.attachments = [];
    for (const path of extractAttachments(agentProse(run) || run.output)) {
      if (!deps.attach) {
        run.attachments.push({ path, ok: false, error: "attachments are not wired" });
        continue;
      }
      try {
        await deps.attach(issueKey, path);
        run.attachments.push({ path, ok: true });
      } catch (cause) {
        run.attachments.push({
          path,
          ok: false,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }

    try {
      // The humanize stage always runs; if the pass fails the scrubbed original posts.
      const outcome = await humanizeComment(buildOutcomeComment(run, verdict, note), undefined, {
        issueKey,
        purpose: "jira outcome comment",
      });
      run.humanize = outcome.stage;
      await deps.comment(issueKey, outcome.text);
      // Human-scale time with the outcome as the narrative, never the machine clock
      // and never the same canned sentence on every entry.
      await deps.logWork(
        issueKey,
        workSeconds(agentProse(run), elapsedSeconds),
        firstPersonNote(note)
      );
      await deps.transition(
        issueKey,
        verdict === "DONE" ? "Done" : verdict === "REVIEW" ? "In Review" : "Blocked"
      );
    } catch (cause) {
      run.error = `The work finished but writing the outcome back failed: ${cause.message}`;
    }

    try {
      await persistRunSummary(run);
      await writeFile(
        join(agentRunsDir(), `${issueKey}.${startedAt}.json`),
        JSON.stringify({ ...run, child: undefined }, null, 2),
        "utf8"
      );
    } catch {
      // A missing archive file must not change the run result.
    }
  });

  return publicRunSummary(run, { includeMessages: true });
}

export async function loadArchivedRun(issueKey) {
  const key = String(issueKey || "")
    .trim()
    .toUpperCase();
  if (!key) return null;
  return (await readSavedSummaries()).find((run) => run.issueKey === key) ?? null;
}
