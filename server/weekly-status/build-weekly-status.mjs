/**
 * The weekly MDM / Data Governance status update.
 *
 * One click gathers the week's real Jira movement, drafts the prose in Steve's voice,
 * and renders the email he actually sends. Nothing in this file sends mail: the draft
 * handoff creates an Outlook draft and stops there.
 *
 * The layout mirrors the emails already in circulation (see the 7/9 and 7/30 sends):
 * navy header band, an overall status pill, Bottom Line, three condition chips,
 * Highlights, What We Need From the Business, Risks / Issues, then the signature.
 */
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** State belongs outside the repo: a write in the tree full-reloads every open tab. */
const STATE_DIR =
  process.env.IPCORP_WEEKLY_STATUS_DIR ||
  join(
    process.env.LOCALAPPDATA || join(process.env.USERPROFILE || ".", "AppData", "Local"),
    "IPCorpBrain",
    "weekly-status"
  );
const DRAFT_TIMEOUT_MS = 10 * 60 * 1000;
const HISTORY_WEEKS = 3;

const STATUS_TONE = {
  "On Track": { background: "#dff0d8", border: "#d6e9c6" },
  "At Risk": { background: "#fcf3cd", border: "#faebcc" },
  "Off Track": { background: "#f2dede", border: "#ebccd1" },
};

export const DEFAULT_FIELDS = {
  overallStatus: "On Track",
  budget: "On Budget",
  schedule: "On Schedule",
  scope: "No Issues",
  bottomLine: "",
  highlights: [],
  needsFromBusiness: [],
  risks: [],
};

/** The seven days ending on the report date, which is how the sent emails read. */
export function reportingPeriod(reportDate) {
  const end = new Date(`${reportDate}T23:59:59`);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

/**
 * A bare "YYYY-MM-DD" is parsed as UTC midnight by the Date constructor, which reads
 * as the previous day everywhere west of Greenwich. The report date is a calendar
 * date, so it is built in local time or the header and subject are a day early.
 */
function asLocalDate(value) {
  if (value instanceof Date) return value;
  const text = String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(text);
}

export function toIsoDate(value) {
  const date = asLocalDate(value);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function usDate(value) {
  const date = asLocalDate(value);
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

/**
 * Sort the week's issues into what moved, what is moving, and what is stuck. An issue
 * counts for the week only if it actually changed inside the period; a ticket sitting
 * untouched is not this week's news.
 */
export function partitionWeek(issues, period) {
  const from = period.start.getTime();
  const to = period.end.getTime();
  const touched = issues.filter((issue) => {
    const updated = new Date(issue.updatedAt || 0).getTime();
    return Number.isFinite(updated) && updated >= from && updated <= to;
  });
  const completed = [];
  const inProgress = [];
  const blocked = [];
  for (const issue of touched) {
    const category = issue.status?.category || "";
    const name = String(issue.status?.name || "").toLowerCase();
    const labels = (issue.labels || []).map((label) => String(label).toLowerCase());
    if (name.includes("block") || labels.includes("blocked") || issue.flagged) {
      blocked.push(issue);
      continue;
    }
    if (category === "done") completed.push(issue);
    else inProgress.push(issue);
  }
  return { touched, completed, inProgress, blocked };
}

function issueLine(issue) {
  const parts = [`${issue.key}: ${issue.summary}`];
  if (issue.status?.name) parts.push(`[${issue.status.name}]`);
  if (issue.assignee?.displayName) parts.push(`(${issue.assignee.displayName})`);
  return parts.join(" ");
}

export async function readHistory(limit = HISTORY_WEEKS) {
  try {
    const files = (await readdir(STATE_DIR))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .slice(-limit);
    const entries = [];
    for (const name of files) {
      try {
        entries.push(JSON.parse(await readFile(join(STATE_DIR, name), "utf8")));
      } catch {
        // A damaged history file only costs the repetition check for that week.
      }
    }
    return entries;
  } catch {
    return [];
  }
}

export async function saveHistory(reportDate, fields) {
  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(
    join(STATE_DIR, `${reportDate}.json`),
    `${JSON.stringify({ reportDate, savedAt: new Date().toISOString(), ...fields }, null, 2)}\n`,
    "utf8"
  );
}

export function buildPrompt({ reportDate, period, week, history, guidance }) {
  const priorBullets = history
    .flatMap((entry) => [
      ...(entry.highlights || []),
      ...(entry.needsFromBusiness || []),
      ...(entry.risks || []).map((risk) => `${risk.title}: ${risk.detail}`),
    ])
    .slice(-40);

  return `You are drafting Steve Nahrup's weekly MDM and Data Governance status update for IP Corporation. Steve is the Data Architect. The audience is executive: Patrick Stiller and the leadership distribution.

Reporting period: ${usDate(period.start)} to ${usDate(period.end)}. Report date: ${usDate(reportDate)}.

WORK COMPLETED THIS PERIOD (${week.completed.length}):
${week.completed.map(issueLine).join("\n") || "None recorded in Jira."}

WORK IN PROGRESS (${week.inProgress.length}):
${week.inProgress.map(issueLine).join("\n") || "None recorded in Jira."}

BLOCKED OR FLAGGED (${week.blocked.length}):
${week.blocked.map(issueLine).join("\n") || "None recorded in Jira."}

BULLETS ALREADY SENT IN RECENT WEEKS, do not repeat or paraphrase these:
${priorBullets.join("\n") || "No earlier weeks on record."}
${guidance ? `\nSTEVE'S GUIDANCE FOR THIS WEEK, treat as top priority:\n${guidance}\n` : ""}
How Steve writes:
- Plain, direct, engineer explaining something to a smart colleague. Confident, never formal or templated.
- First person where it reads naturally. Real numbers and real system names, never filler like "various" or "several".
- NEVER use an em dash or en dash. Commas and periods only.
- Never use these words: gate, gating, contract, chargeback, ratification, topology, system-of-record, augmenting, deterministic, hardening, slate, taxonomy, canonical, boundary, corpus, slice.
- Never use consultant filler: leverage, robust, streamline, delve, reach out, seamless, utilize, holistic, operationalize, in order to, additionally, worth noting.
- Never mention AI, assistants, automation, transcripts, tutorials, or tooling that produced this. The work is Steve's own analysis.
- Write "Patrick" in full, never "Pat".

Return JSON only, no prose around it, exactly this shape:
{
  "overallStatus": "On Track | At Risk | Off Track",
  "budget": "On Budget | Over Budget | Under Budget",
  "schedule": "On Schedule | Behind Schedule | Ahead of Schedule",
  "scope": "No Issues | Scope Change | Scope Risk",
  "bottomLine": "2 to 4 sentences. What leadership needs to know, what moved, what slipped, and the date that matters.",
  "highlights": ["3 to 4 items. One or two sentences each, past tense, specific, with the consequence for the program."],
  "needsFromBusiness": ["1 to 3 items. The exact decision or name needed, who from, and what is waiting on it."],
  "risks": [{"title": "short risk name", "severity": "High | Medium | Low", "detail": "one or two sentences on impact and what happens next"}]
}

Base every statement on the Jira evidence above. If the evidence does not support a claim, leave it out rather than inventing it. If a section has nothing real to say this week, return an empty array for it.`;
}

async function defaultDraftWithClaude(prompt) {
  await mkdir(STATE_DIR, { recursive: true });
  const file = join(STATE_DIR, `prompt.${Date.now()}.md`);
  await writeFile(file, prompt, "utf8");
  return new Promise((resolve, reject) => {
    // The status update is read by leadership and is one bounded writing task, so it
    // is worth the stronger model rather than the fast one.
    const child = spawn(
      "claude",
      ["-p", `@${file}`, "--model", "opus", "--output-format", "text"],
      {
        shell: true,
        windowsHide: true,
      }
    );
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("The status draft timed out before it finished."));
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
      else reject(new Error(`The status draft exited ${code}: ${err.slice(-240)}`));
    });
  });
}

export function parseDraft(text) {
  const candidates = [text];
  if (text.includes("```")) {
    candidates.push(
      ...text
        .split("```")
        .filter((segment) => segment.includes("{") && segment.includes("}"))
        .map((segment) => segment.replace(/^json/i, "").trim())
    );
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Try the next shape.
    }
  }
  return null;
}

/** Dashes survive a lot of instructions, so they are removed rather than trusted. */
export function scrubDashes(value) {
  return String(value ?? "")
    .replaceAll(/\s*[—–]\s*/g, ", ")
    .replaceAll("&#8212;", ", ")
    .trim();
}

export function normalizeFields(raw) {
  const list = (value, limit) =>
    (Array.isArray(value) ? value : [])
      .map((item) => scrubDashes(item))
      .filter(Boolean)
      .slice(0, limit);
  return {
    overallStatus: STATUS_TONE[raw?.overallStatus] ? raw.overallStatus : "On Track",
    budget: scrubDashes(raw?.budget) || "On Budget",
    schedule: scrubDashes(raw?.schedule) || "On Schedule",
    scope: scrubDashes(raw?.scope) || "No Issues",
    bottomLine: scrubDashes(raw?.bottomLine),
    highlights: list(raw?.highlights, 6),
    needsFromBusiness: list(raw?.needsFromBusiness, 5),
    risks: (Array.isArray(raw?.risks) ? raw.risks : [])
      .slice(0, 6)
      .map((risk) => ({
        title: scrubDashes(risk?.title),
        severity: ["High", "Medium", "Low"].includes(risk?.severity) ? risk.severity : "Medium",
        detail: scrubDashes(risk?.detail),
      }))
      .filter((risk) => risk.title),
  };
}

export async function generateWeeklyStatus({
  reportDate,
  issues,
  guidance,
  draftWithClaude = defaultDraftWithClaude,
}) {
  const period = reportingPeriod(reportDate);
  const week = partitionWeek(issues, period);
  const history = await readHistory();
  const prompt = buildPrompt({ reportDate, period, week, history, guidance });
  const raw = await draftWithClaude(prompt);
  const parsed = parseDraft(raw);
  if (!parsed) {
    throw new Error("The status draft came back in a shape that could not be read.");
  }
  const fields = normalizeFields(parsed);
  return {
    reportDate,
    period: { start: toIsoDate(period.start), end: toIsoDate(period.end) },
    counts: {
      completed: week.completed.length,
      inProgress: week.inProgress.length,
      blocked: week.blocked.length,
      touched: week.touched.length,
    },
    evidence: {
      completed: week.completed.map(issueLine),
      inProgress: week.inProgress.map(issueLine),
      blocked: week.blocked.map(issueLine),
    },
    historyWeeks: history.length,
    fields,
  };
}

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const FONT = "font-family:Aptos,Segoe UI,sans-serif; font-size:9.5pt";

function sectionHeading(title) {
  return `<tr><td style="padding:15pt 0 6pt"><p style="margin:0; ${FONT}"><span style="color:rgb(0,51,102)">&#9632;</span> <b style="color:rgb(0,51,102)">${escapeHtml(
    title
  )}</b></p></td></tr>`;
}

function bulletRow(text) {
  return `<tr><td style="padding:0 0 7pt"><table cellspacing="0" cellpadding="0" border="0" style="width:100%; border-collapse:collapse"><tbody><tr><td valign="top" style="width:14pt; padding:0"><p style="margin:0; ${FONT}"><span style="color:rgb(0,102,204)">&bull;</span></p></td><td style="padding:0"><p style="margin:0; ${FONT}; color:rgb(51,51,51); line-height:1.45">${escapeHtml(
    text
  )}</p></td></tr></tbody></table></td></tr>`;
}

function conditionChip(label, value) {
  return `<td style="padding:0 6pt 0 0; width:33%"><table cellspacing="0" cellpadding="0" border="0" style="width:100%; border-collapse:collapse; border:1pt solid rgb(221,228,235)"><tbody><tr><td style="padding:6pt 9pt"><p style="margin:0; ${FONT}; color:rgb(102,119,136); font-size:8pt">${escapeHtml(
    label
  )}</p><p style="margin:2pt 0 0; ${FONT}; color:rgb(51,51,51)"><b>${escapeHtml(
    value
  )}</b></p></td></tr></tbody></table></td>`;
}

/**
 * Fill in whatever the caller left out and take the dashes back out, without the
 * length caps that belong to model output. Steve's seventh highlight is his to add;
 * it must reach the email rather than disappear from the preview.
 */
function safeFields(fields = {}) {
  const list = (value) =>
    (Array.isArray(value) ? value : []).map((item) => scrubDashes(item)).filter(Boolean);
  return {
    ...DEFAULT_FIELDS,
    ...fields,
    overallStatus: STATUS_TONE[fields.overallStatus] ? fields.overallStatus : "On Track",
    budget: scrubDashes(fields.budget) || DEFAULT_FIELDS.budget,
    schedule: scrubDashes(fields.schedule) || DEFAULT_FIELDS.schedule,
    scope: scrubDashes(fields.scope) || DEFAULT_FIELDS.scope,
    bottomLine: scrubDashes(fields.bottomLine),
    highlights: list(fields.highlights),
    needsFromBusiness: list(fields.needsFromBusiness),
    risks: (Array.isArray(fields.risks) ? fields.risks : [])
      .map((risk) => ({
        title: scrubDashes(risk?.title),
        severity: ["High", "Medium", "Low"].includes(risk?.severity) ? risk.severity : "Medium",
        detail: scrubDashes(risk?.detail),
      }))
      .filter((risk) => risk.title),
  };
}

/**
 * Outlook-safe HTML: nested tables, inline styles, points not pixels. Anything
 * cleverer is stripped or reflowed by the Outlook rendering engine.
 */
export function renderWeeklyStatusHtml({ reportDate, fields: rawFields }) {
  const fields = safeFields(rawFields);
  const tone = STATUS_TONE[fields.overallStatus];
  const risks = fields.risks
    .map(
      (risk, index) =>
        `<tr><td style="padding:0 0 8pt"><p style="margin:0; ${FONT}; color:rgb(51,51,51); line-height:1.45"><b>${
          index + 1
        }. ${escapeHtml(risk.title)}</b> (${escapeHtml(risk.severity)}). ${escapeHtml(
          risk.detail
        )}</p></td></tr>`
    )
    .join("");

  return `<div align="center"><table cellspacing="0" cellpadding="0" border="0" style="width:450pt; border-collapse:collapse"><tbody>
<tr><td style="background-color:rgb(0,51,102); padding:16.5pt 21pt">
  <table cellspacing="0" cellpadding="0" border="0" style="width:100%; border-collapse:collapse"><tbody>
    <tr>
      <td style="padding:0"><p style="margin:0; ${FONT}"><span style="color:rgb(255,255,255)"><b>Project Status Report</b></span></p></td>
      <td align="right" style="padding:0"><table cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse"><tbody><tr><td style="border:1pt solid ${
        tone.border
      }; background-color:${
        tone.background
      }; padding:4.5pt 13.5pt"><p style="margin:0; ${FONT}"><span style="color:rgb(51,51,51)"><b>${escapeHtml(
        fields.overallStatus
      )}</b></span></p></td></tr></tbody></table></td>
    </tr>
    <tr><td colspan="2" style="padding:4.5pt 0 0"><p style="margin:0; ${FONT}"><span style="color:rgb(255,255,255)">&nbsp;IT&nbsp; &bull; &nbsp;MDM / Data Governance&nbsp; &bull; &nbsp;Report Date: ${escapeHtml(
      usDate(reportDate)
    )}</span></p></td></tr>
  </tbody></table>
</td></tr>
<tr><td style="background-color:rgb(0,102,204); height:2.25pt; font-size:1pt">&nbsp;</td></tr>
<tr><td style="background-color:white; padding:0 21pt 18pt">
  <table cellspacing="0" cellpadding="0" border="0" style="width:100%; border-collapse:collapse"><tbody>
    ${sectionHeading("Bottom Line")}
    <tr><td style="padding:0 0 12pt"><p style="margin:0; ${FONT}; color:rgb(51,51,51); line-height:1.5">${escapeHtml(
      fields.bottomLine
    )}</p></td></tr>
    <tr><td style="padding:0 0 6pt"><table cellspacing="0" cellpadding="0" border="0" style="width:100%; border-collapse:collapse"><tbody><tr>
      ${conditionChip("Budget", fields.budget)}
      ${conditionChip("Schedule", fields.schedule)}
      ${conditionChip("Scope", fields.scope)}
    </tr></tbody></table></td></tr>
    ${fields.highlights.length ? sectionHeading("Highlights") : ""}
    ${fields.highlights.map(bulletRow).join("")}
    ${fields.needsFromBusiness.length ? sectionHeading("What We Need From the Business") : ""}
    ${fields.needsFromBusiness.map(bulletRow).join("")}
    ${risks ? sectionHeading("Risks / Issues") : ""}
    ${risks}
    <tr><td style="padding:16pt 0 0"><p style="margin:0; ${FONT}; color:rgb(51,51,51)">Best,<br>Steve</p></td></tr>
    <tr><td style="padding:12pt 0 0"><p style="margin:0; ${FONT}; color:rgb(102,119,136); line-height:1.5"><b style="color:rgb(51,51,51)">Steve Nahrup</b><br>Data Architect<br>p: (312) 350-6854<br>IP Corporation | Interplastic Corporation | North American Composites | Molding Products</p></td></tr>
  </tbody></table>
</td></tr>
</tbody></table></div>`;
}

export function weeklyStatusSubject(reportDate) {
  return `MDM / Data Governance Weekly Status, ${usDate(reportDate)}`;
}
