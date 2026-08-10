import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { inspectPng, renderMeetingInfographic } from "./meeting-infographic-renderer.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_BRAIN_ROOT =
  "C:\\Users\\snahrup\\OneDrive - IP-Corporation\\ipcorp-architecture-brain";
const ADAPTER_PATH = resolve(process.cwd(), "server", "meeting-closeout-adapter.py");
const MAX_BODY_BYTES = 2_000_000;
const PACKAGE_MARKER = "WORKBENCH_CLOSEOUT_JSON";
const activeProcessing = new Map();

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function localDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const read = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function localTime(value = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function safeSlug(value) {
  return (
    asText(value)
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "meeting"
  );
}

function safePath(root, ...segments) {
  const resolvedRoot = resolve(root);
  const candidate = resolve(resolvedRoot, ...segments);
  if (candidate !== resolvedRoot && !candidate.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error("The requested Brain path is outside the configured root.");
  }
  return candidate;
}

function parseJsonFromText(value) {
  if (value && typeof value === "object") return value;
  const text = asText(value);
  if (!text) return null;
  const candidates = [text];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next bounded candidate.
    }
  }
  return null;
}

async function loadFixture(fixturePath = process.env.MEETING_CLOSEOUT_FIXTURE) {
  if (!fixturePath) return null;
  return JSON.parse(await readFile(resolve(fixturePath), "utf8"));
}

async function runAdapter(command, payload = {}) {
  const python = process.env.MEETING_CLOSEOUT_PYTHON || "python";
  const { stdout } = await execFileAsync(python, [ADAPTER_PATH, command, JSON.stringify(payload)], {
    cwd: process.cwd(),
    timeout: 240_000,
    windowsHide: true,
    maxBuffer: 8_000_000,
    env: process.env,
  });
  const parsed = parseJsonFromText(stdout);
  if (!parsed) throw new Error("Microsoft 365 returned an unreadable response.");
  return parsed;
}

function looksLikeMeeting(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    Boolean(value.title || value.subject || value.name) &&
    Boolean(value.start || value.startDate || value.startTime || value.date || value.when)
  );
}

function meetingCandidates(value, depth = 0) {
  if (depth > 5 || value == null) return [];
  if (Array.isArray(value)) {
    const direct = value.filter(looksLikeMeeting);
    if (direct.length) return direct;
    return value.flatMap((item) => meetingCandidates(item, depth + 1));
  }
  if (looksLikeMeeting(value)) return [value];
  if (typeof value !== "object") return [];
  const preferredKeys = ["meetings", "events", "items", "results", "data", "result"];
  for (const key of preferredKeys) {
    if (key in value) {
      const found = meetingCandidates(value[key], depth + 1);
      if (found.length) return found;
    }
  }
  return [];
}

function valueDate(value) {
  if (!value) return "";
  if (typeof value === "object") {
    return asText(value.dateTime || value.date || value.value);
  }
  return asText(value);
}

function normalizeMeeting(value, index = 0) {
  const title = asText(value.title || value.subject || value.name) || "Untitled meeting";
  const start =
    valueDate(value.start || value.startDate || value.startTime || value.date || value.when) ||
    `${localDate()}T00:00:00`;
  const end = valueDate(value.end || value.endDate || value.endTime);
  const organizer =
    asText(value.organizer?.name || value.organizer?.emailAddress?.name || value.organizer) || null;
  const rawAttendees = value.attendees || value.participants || [];
  const attendees = Array.isArray(rawAttendees)
    ? rawAttendees
        .map((item) => asText(item?.name || item?.emailAddress?.name || item?.displayName || item))
        .filter(Boolean)
    : asText(rawAttendees)
        .split(/[,;]+/)
        .map((item) => item.trim())
        .filter(Boolean);
  const sourceId = asText(value.id || value.eventId || value.meetingId || value.iCalUId);
  const id = sourceId || `${safeSlug(title)}-${start.slice(0, 16)}-${index}`;
  return {
    id,
    title,
    start,
    end: end || null,
    organizer,
    attendees,
    isAllDay: Boolean(value.isAllDay || value.allDay),
    status: asText(value.status || value.showAs) || "scheduled",
  };
}

async function preparedMeetingsForToday(date) {
  try {
    const raw = JSON.parse(
      await readFile(resolve(process.cwd(), "data", "meeting-index.json"), "utf8")
    );
    const candidates = [
      ...(Array.isArray(raw.meetings) ? raw.meetings : []),
      ...(Array.isArray(raw.upcoming) ? raw.upcoming : []),
      ...(Array.isArray(raw.active) ? raw.active : []),
      ...(Array.isArray(raw.recent) ? raw.recent : []),
    ];
    const seen = new Set();
    return candidates.map(normalizeMeeting).filter((meeting) => {
      if (meeting.start.slice(0, 10) !== date || seen.has(meeting.id)) return false;
      seen.add(meeting.id);
      return true;
    });
  } catch {
    return [];
  }
}

function calendarFailureAvailability(value) {
  let detail = value instanceof Error ? value.message : "";
  if (!detail) {
    try {
      detail = JSON.stringify(value ?? "");
    } catch {
      detail = String(value ?? "");
    }
  }
  return /auth|sign[ _-]?in|login|not[ _-]?connected|not[ _-]?configured|session.{0,20}expired|unavailable|disabled|enoent|no such file|cannot find/i.test(
    detail
  )
    ? "unavailable"
    : "error";
}

export async function listTodaysMeetings(options = {}) {
  const date = options.date || localDate();
  const fixture = options.fixture ?? (await loadFixture(options.fixturePath));
  const fallback = options.preparedMeetings ?? (await preparedMeetingsForToday(date));
  if (fixture) {
    const meetings = (fixture.todayMeetings || []).map(normalizeMeeting);
    const listed = meetings.length ? meetings : fallback;
    if (fixture.calendarError) {
      return {
        date,
        meetings: listed,
        source: meetings.length ? "previous_calendar_result" : "brain_snapshot",
        availability: "error",
        microsoft365Available: false,
        detail: "The calendar query failed. Listed meetings remain available when present.",
      };
    }
    if (fixture.calendarAvailable === false || fixture.calendarConnected === false) {
      return {
        date,
        meetings: listed,
        source: meetings.length ? "previous_calendar_result" : "brain_snapshot",
        availability: "unavailable",
        microsoft365Available: false,
        detail: "Microsoft 365 is unavailable or not connected.",
      };
    }
    if (meetings.length) {
      return {
        date,
        meetings,
        source: "microsoft_365",
        availability: "current",
        microsoft365Available: true,
        detail: "Today's Outlook meetings are current.",
      };
    }
    if (fallback.length) {
      return {
        date,
        meetings: fallback,
        source: "brain_snapshot",
        availability: "fallback",
        microsoft365Available: true,
        detail: "Outlook returned no current meetings. Prepared meetings remain available.",
      };
    }
    return {
      date,
      meetings: [],
      source: "microsoft_365",
      availability: "empty",
      microsoft365Available: true,
      detail: "Outlook returned no meetings for today.",
    };
  }
  try {
    const response = await runAdapter("calendar", { date });
    const meetings = meetingCandidates(response).map(normalizeMeeting);
    if (!response.ok) {
      const availability = calendarFailureAvailability(response);
      return {
        date,
        meetings: meetings.length ? meetings : fallback,
        source: meetings.length ? "previous_calendar_result" : "brain_snapshot",
        availability,
        microsoft365Available: false,
        detail:
          availability === "unavailable"
            ? "Microsoft 365 is unavailable or not connected."
            : "The calendar query failed. Listed meetings remain available when present.",
      };
    }
    if (meetings.length) {
      return {
        date,
        meetings,
        source: "microsoft_365",
        availability: "current",
        microsoft365Available: true,
        detail: "Today's Outlook meetings are current.",
      };
    }
    if (fallback.length) {
      return {
        date,
        meetings: fallback,
        source: "brain_snapshot",
        availability: "fallback",
        microsoft365Available: true,
        detail: "Outlook returned no current meetings. Prepared meetings remain available.",
      };
    }
    return {
      date,
      meetings: [],
      source: "microsoft_365",
      availability: "empty",
      microsoft365Available: true,
      detail: "Outlook returned no meetings for today.",
    };
  } catch (error) {
    const availability = calendarFailureAvailability(error);
    return {
      date,
      meetings: fallback,
      source: "brain_snapshot",
      availability,
      microsoft365Available: false,
      detail:
        availability === "unavailable"
          ? "Microsoft 365 is unavailable or not connected."
          : "The calendar query failed. Listed meetings remain available when present.",
    };
  }
}

function transcriptError(value) {
  const text = asText(value).toLowerCase();
  return (
    !text ||
    text.includes("no transcript") ||
    text.includes("not available") ||
    text.includes("unavailable") ||
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("circuit_open")
  );
}

function findText(value, keys, depth = 0) {
  if (depth > 5 || value == null) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => findText(item, keys, depth + 1))
      .filter(Boolean)
      .join("\n");
  }
  if (typeof value !== "object") return "";
  for (const key of keys) {
    if (key in value) {
      const text = findText(value[key], keys, depth + 1);
      if (text) return text;
    }
  }
  for (const key of ["data", "result", "response", "content"]) {
    if (key in value) {
      const text = findText(value[key], keys, depth + 1);
      if (text) return text;
    }
  }
  return "";
}

function findRelatedMaterial(value, depth = 0) {
  if (depth > 5 || value == null) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => findRelatedMaterial(item, depth + 1))
      .map((item) => asText(item))
      .filter(Boolean);
  }
  if (typeof value === "string") return [value];
  if (typeof value !== "object") return [];
  for (const key of ["relatedMaterial", "supportingMaterial", "links", "files", "references"]) {
    if (key in value) return findRelatedMaterial(value[key], depth + 1);
  }
  for (const key of ["data", "result", "response"]) {
    if (key in value) {
      const found = findRelatedMaterial(value[key], depth + 1);
      if (found.length) return found;
    }
  }
  return [];
}

async function meetingEvidence(meeting, options = {}) {
  const fixture = options.fixture ?? (await loadFixture(options.fixturePath));
  if (fixture) {
    const record = fixture.transcripts?.[meeting.id];
    if (!record) return null;
    if (typeof record === "string") return { transcript: record, recap: "", relatedMaterial: [] };
    return {
      transcript: asText(record.transcript),
      recap: asText(record.recap),
      relatedMaterial: Array.isArray(record.relatedMaterial)
        ? record.relatedMaterial.map(asText).filter(Boolean)
        : [],
    };
  }
  try {
    const response = await runAdapter("transcript", { meeting });
    if (response.ok === false) return null;
    const transcript = findText(response, ["transcript", "verbatimTranscript", "vtt"]);
    if (transcriptError(transcript)) return null;
    return {
      transcript,
      recap: findText(response, ["recap", "recordingRecap", "summary"]),
      relatedMaterial: findRelatedMaterial(response),
    };
  } catch {
    return null;
  }
}

function compactUnits(transcript) {
  return transcript
    .replace(/\r/g, "")
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 8)
    .slice(0, 2000);
}

function uniqueBy(items, selector) {
  const seen = new Set();
  return items.filter((item) => {
    const key = selector(item).toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanEvidence(value) {
  return value.replace(/^[-*•]\s*/, "").slice(0, 500);
}

function recipientFrom(line) {
  const match = line.match(
    /\b(?:email|message|send|reply to|follow up with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/
  );
  if (!match) return null;
  if (match[1] === "Patrick") return "Patrick Stiller";
  return match[1];
}

function topThemes(units) {
  const stop = new Set([
    "about",
    "after",
    "again",
    "also",
    "because",
    "before",
    "could",
    "from",
    "have",
    "just",
    "meeting",
    "need",
    "that",
    "their",
    "there",
    "they",
    "this",
    "what",
    "when",
    "where",
    "which",
    "with",
    "would",
    "your",
    "yeah",
  ]);
  const counts = new Map();
  for (const word of units
    .join(" ")
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{3,}/g) || []) {
    if (stop.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([word]) => word.replace(/\b\w/g, (letter) => letter.toUpperCase()));
}

export function buildReviewPackage({
  meeting,
  transcript,
  contextNotes = "",
  recap = "",
  relatedMaterial = [],
}) {
  const units = compactUnits(transcript);
  const commitmentPattern =
    /\b(?:i(?:'ll| will| need to| can| should| am going to)|steve (?:will|owns|needs to)|my action|action for me)\b/i;
  const commitments = uniqueBy(
    units
      .filter((line) => commitmentPattern.test(line))
      .map((line) => ({
        text: cleanEvidence(line),
        evidence: cleanEvidence(line),
        status: "Review",
      })),
    (item) => item.text
  ).slice(0, 20);

  const jiraLines = units.filter((line) =>
    /\b(?:jira|ticket|issue|epic|subtask|MT-\d+|IPC-\d+)\b/i.test(line)
  );
  const jiraProposals = uniqueBy(
    jiraLines.map((line) => {
      const key = line.match(/\b(?:MT|IPC)-\d+\b/i)?.[0]?.toUpperCase() || null;
      return {
        operation: key ? "Update" : "Create",
        jiraKey: key,
        title: cleanEvidence(line).slice(0, 180),
        rationale: "Proposed from the selected meeting for review.",
        evidence: cleanEvidence(line),
      };
    }),
    (item) => `${item.operation}-${item.jiraKey || item.title}`
  ).slice(0, 20);

  const supportingPattern =
    /https?:\/\/|\\\\|\b(?:sharepoint|onedrive|workbook|spreadsheet|deck|document|recording|recap|\.xlsx|\.docx|\.pptx|\.pdf)\b/i;
  const supporting = uniqueBy(
    [
      ...relatedMaterial.map((reference) => ({
        label: cleanEvidence(reference).slice(0, 180),
        reference: cleanEvidence(reference),
        kind: "Related material",
      })),
      ...units
        .filter((line) => supportingPattern.test(line))
        .map((line) => ({
          label: cleanEvidence(line).slice(0, 180),
          reference: cleanEvidence(line),
          kind: "Mentioned in meeting",
        })),
    ],
    (item) => item.reference
  ).slice(0, 24);

  const documentRequests = uniqueBy(
    units
      .filter(
        (line) =>
          /\b(?:send|share|provide|attach|upload|request|need)\b/i.test(line) &&
          /\b(?:file|document|workbook|spreadsheet|deck|report|export|diagram|list)\b/i.test(line)
      )
      .map((line) => ({
        text: cleanEvidence(line),
        owner: null,
        status: "Review",
      })),
    (item) => item.text
  ).slice(0, 16);

  const reminderCandidates = uniqueBy(
    units
      .filter((line) =>
        /\b(?:follow up|remind|tomorrow|today|next week|monday|tuesday|wednesday|thursday|friday|by end of|due|deadline|before \d|after \d)\b/i.test(
          line
        )
      )
      .map((line) => ({
        text: cleanEvidence(line),
        timing:
          line.match(
            /\b(?:today|tomorrow|next week|monday|tuesday|wednesday|thursday|friday|by end of [^,.]+)/i
          )?.[0] || null,
        status: "Candidate",
      })),
    (item) => item.text
  ).slice(0, 16);

  const emailSignals = units.filter((line) =>
    /\b(?:email|reply|message|send a note|follow up with)\b/i.test(line)
  );
  const emailDrafts = uniqueBy(
    emailSignals.map((line) => {
      const to = recipientFrom(line);
      const commitmentBullets = commitments.slice(0, 4).map((item) => `- ${item.text}`);
      const body = [
        to ? `${to.split(" ")[0]},` : "Hi,",
        "",
        `Here is where ${meeting.title} landed:`,
        "",
        ...(commitmentBullets.length ? commitmentBullets : [`- ${cleanEvidence(line)}`]),
        "",
        "I will keep the remaining items moving and flag anything that needs a decision.",
        "",
        "Steve",
      ].join("\n");
      return {
        to,
        subject: `${meeting.title} follow-up`,
        body,
        status: "Draft only",
        evidence: cleanEvidence(line),
      };
    }),
    (item) => `${item.to || ""}-${item.subject}`
  ).slice(0, 6);

  const themes = topThemes(units);
  const packageId = `${meeting.start.slice(0, 10)}-${safeSlug(meeting.title)}`;
  const summarySource = recap || units.slice(0, 3).join(" ");
  return {
    id: packageId,
    meeting,
    createdAt: new Date().toISOString(),
    source: "Pending persistence",
    summary: cleanEvidence(summarySource || "Meeting text captured for review."),
    contextNotes: asText(contextNotes),
    commitments,
    jiraProposals,
    supportingMaterial: supporting,
    documentRequests,
    reminderCandidates,
    emailDrafts,
    infographic: {
      headline: meeting.title,
      subhead: "Meeting closeout",
      metrics: [
        { label: "Commitments", value: commitments.length },
        { label: "Jira proposals", value: jiraProposals.length },
        { label: "Document requests", value: documentRequests.length },
        { label: "Reminders", value: reminderCandidates.length },
      ],
      themes,
      nextMoves: commitments.slice(0, 4).map((item) => item.text),
    },
    files: {},
    externalActions: {
      emailSent: false,
      jiraChanged: false,
    },
  };
}

function markdownList(items, render) {
  return items.length ? items.map((item) => `- ${render(item)}`).join("\n") : "- None identified.";
}

function packageMarker(value) {
  return `<!-- ${PACKAGE_MARKER} ${Buffer.from(JSON.stringify(value), "utf8").toString("base64")} -->`;
}

function parsePackageMarker(text) {
  const expression = new RegExp(`<!-- ${PACKAGE_MARKER} ([A-Za-z0-9+/=]+) -->`, "g");
  let parsed = null;
  for (const match of text.matchAll(expression)) {
    try {
      parsed = JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
    } catch {
      // A damaged historical marker does not hide other packages.
    }
  }
  return parsed;
}

function summaryMarkdown(value, transcriptReference, sourceLabel) {
  return `# ${value.meeting.title} - ${value.meeting.start.slice(0, 10)}

**Date:** ${value.meeting.start.slice(0, 10)}
**Attendees:** ${value.meeting.attendees.join(", ") || "Not confirmed"}
**Source:** ${sourceLabel}
**Transcript:** \`${transcriptReference}\`

## Executive readout

${value.summary}

## Steve's commitments

${markdownList(value.commitments, (item) => item.text)}

## Proposed Jira work

${markdownList(
  value.jiraProposals,
  (item) => `${item.operation}${item.jiraKey ? ` ${item.jiraKey}` : ""}: ${item.title}`
)}

## Supporting material

${markdownList(value.supportingMaterial, (item) => item.reference)}

## Document requests

${markdownList(value.documentRequests, (item) => item.text)}

## Reminder candidates

${markdownList(value.reminderCandidates, (item) => item.text)}

## Draft email follow-ups

${markdownList(
  value.emailDrafts,
  (item) => `${item.subject}${item.to ? ` to ${item.to}` : ""}, draft only`
)}

## Meeting infographic

| Commitments | Jira proposals | Document requests | Reminders |
|---:|---:|---:|---:|
| ${value.commitments.length} | ${value.jiraProposals.length} | ${value.documentRequests.length} | ${value.reminderCandidates.length} |

Themes: ${value.infographic.themes.join(", ") || "Review the meeting package"}

## Context notes

${value.contextNotes || "None supplied."}

${packageMarker(value)}
`;
}

function taskSpecMarkdown(value, summaryReference) {
  return `# ${value.meeting.title} closeout review

Source: \`${summaryReference}\`

| Review area | Count | Status |
|---|---:|---|
| Steve's commitments | ${value.commitments.length} | REVIEW |
| Jira proposals | ${value.jiraProposals.length} | PREPARED |
| Supporting material | ${value.supportingMaterial.length} | REVIEW |
| Document requests | ${value.documentRequests.length} | REVIEW |
| Reminder candidates | ${value.reminderCandidates.length} | PREPARED |
| Draft email follow-ups | ${value.emailDrafts.length} | PREPARED |

No email was sent and no Jira issue was changed.
`;
}

function infographicHtml(value) {
  const cards = value.infographic.metrics
    .map(
      (metric) =>
        `<article><strong>${metric.value}</strong><span>${escapeHtml(metric.label)}</span></article>`
    )
    .join("");
  const themes = value.infographic.themes.map((theme) => `<li>${escapeHtml(theme)}</li>`).join("");
  const moves = value.infographic.nextMoves.map((move) => `<li>${escapeHtml(move)}</li>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${escapeHtml(value.meeting.title)} meeting infographic</title>
<style>
body{margin:0;background:#f3f6fa;color:#12233f;font:16px/1.5 Arial,sans-serif}
main{max-width:1100px;margin:40px auto;padding:34px;background:white;border:1px solid #d9e2ef;border-radius:24px}
header{border-left:8px solid #1769e0;padding-left:20px}h1{margin:0;font-size:40px}header p{color:#52647d}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:28px 0}.metrics article{background:#edf4ff;padding:22px;border-radius:16px}.metrics strong{display:block;font-size:38px;color:#0d5bc6}.metrics span{font-weight:700}
.grid{display:grid;grid-template-columns:1fr 2fr;gap:20px}.panel{padding:22px;border:1px solid #d9e2ef;border-radius:16px}li{margin:10px 0}
@media(max-width:700px){.metrics,.grid{grid-template-columns:1fr 1fr}h1{font-size:30px}}
</style></head><body><main><header><h1>${escapeHtml(value.meeting.title)}</h1><p>Meeting closeout, ${escapeHtml(value.meeting.start.slice(0, 10))}</p></header>
<section class="metrics">${cards}</section><section class="grid"><div class="panel"><h2>Themes</h2><ul>${themes || "<li>Review package</li>"}</ul></div>
<div class="panel"><h2>Next moves</h2><ol>${moves || "<li>No commitment was identified.</li>"}</ol></div></section>
</main></body></html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function atomicWriteNew(path, content) {
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await readFile(path, "utf8");
    if (existing !== content) throw new Error(`A different file already exists at ${path}.`);
  }
}

async function ensureGeneratedFile(path, content) {
  await mkdir(dirname(path), { recursive: true });
  try {
    if ((await readFile(path, "utf8")) === content) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
  return true;
}

async function appendOnce(path, marker, content) {
  await mkdir(dirname(path), { recursive: true });
  try {
    if ((await readFile(path, "utf8")).includes(marker)) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await appendFile(path, content, "utf8");
  return true;
}

async function appendMarkerToSummary(path, content, value) {
  try {
    const existing = await readFile(path, "utf8");
    const stored = parsePackageMarker(existing);
    if (stored) return stored;
    await appendFile(
      path,
      `\n\n## Workbench closeout review\n\n${content}\n${packageMarker(value)}\n`,
      "utf8"
    );
    return null;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await atomicWriteNew(path, content);
    return null;
  }
}

async function verifyBrainWriteInstructions(brainRoot) {
  const instructionPaths = {
    agents: safePath(brainRoot, "AGENTS.md"),
    playbook: safePath(brainRoot, "INGESTION_PLAYBOOK.md"),
    changelog: safePath(brainRoot, "CHANGELOG.md"),
  };
  let agents;
  let playbook;
  let changelog;
  try {
    [agents, playbook, changelog] = await Promise.all([
      readFile(instructionPaths.agents, "utf8"),
      readFile(instructionPaths.playbook, "utf8"),
      readFile(instructionPaths.changelog, "utf8"),
    ]);
  } catch (error) {
    const missing = new Error(
      "Brain write instructions are unavailable. No meeting file was written."
    );
    missing.code = "brain_write_instructions_unavailable";
    missing.cause = error;
    throw missing;
  }
  const sectionOneIndex = changelog.search(/^## SECTION 1\b/im);
  const sectionTwoIndex = changelog.search(/^## SECTION 2\b/im);
  const processedIndex = changelog.search(/^### Processed manifest items\b/im);
  const hasInstructionSet =
    agents.includes("INGESTION_PLAYBOOK.md") &&
    /CHANGELOG\/MANIFEST/i.test(playbook) &&
    sectionOneIndex >= 0 &&
    sectionTwoIndex > sectionOneIndex &&
    processedIndex > sectionTwoIndex;
  if (!hasInstructionSet) {
    const incomplete = new Error(
      "Brain write instructions are incomplete. No meeting file was written."
    );
    incomplete.code = "brain_write_instructions_incomplete";
    throw incomplete;
  }
  const changeRows = changelog
    .slice(sectionOneIndex, sectionTwoIndex)
    .split(/\r?\n/)
    .filter((line) => /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(line));
  if (!changeRows.length) {
    const incomplete = new Error(
      "Brain change history has no dated row to review. No meeting file was written."
    );
    incomplete.code = "brain_change_history_unavailable";
    throw incomplete;
  }
  const manifestRows = changelog
    .slice(sectionTwoIndex, processedIndex)
    .split(/\r?\n/)
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => {
      const cells = line
        .trim()
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim().replaceAll("**", ""));
      return { id: cells[0], action: cells[3] || "" };
    });
  const processedItems = changelog.slice(processedIndex);
  const pendingWrites = manifestRows.filter((item) => {
    const needsWrite = /\b(?:INSTALL|REPLACE|APPEND|UPDATE|MOVE|DELETE)\b/i.test(item.action);
    const referenceOnly = /DO NOT INGEST|READ|REFERENCE/i.test(item.action);
    const processed = new RegExp(`\\bitem\\s*#${item.id}\\b`, "i").test(processedItems);
    return needsWrite && !referenceOnly && !processed;
  });
  if (pendingWrites.length) {
    const pending = new Error(
      `Brain MANIFEST has ${pendingWrites.length} unresolved write item${pendingWrites.length === 1 ? "" : "s"}. No meeting file was written.`
    );
    pending.code = "brain_manifest_items_pending";
    throw pending;
  }
}

function relativeToRoot(root, path) {
  return path.slice(resolve(root).length + 1).replace(/\\/g, "/");
}

export async function persistMeetingPackage(value, transcript, source, options = {}) {
  const brainRoot = resolve(
    options.brainRoot || process.env.MEETING_CLOSEOUT_BRAIN_ROOT || DEFAULT_BRAIN_ROOT
  );
  await verifyBrainWriteInstructions(brainRoot);
  const date = value.meeting.start.slice(0, 10) || localDate();
  const slug = safeSlug(value.meeting.title);
  const transcriptFolder = source === "cluely" ? "cluely-export" : "teams-export";
  const transcriptPath = safePath(
    brainRoot,
    "core",
    "meetings",
    "transcripts",
    transcriptFolder,
    `${date}-${slug}.md`
  );
  const summaryPath = safePath(brainRoot, "core", "meetings", "summaries", `${date}-${slug}.md`);
  const runReportPath = safePath(
    brainRoot,
    "core",
    "meetings",
    "summaries",
    `_RUN_REPORT_${date}-${slug}-workbench-closeout.md`
  );
  const taskSpecPath = safePath(
    brainRoot,
    "core",
    "deliverables",
    "meeting-closeouts",
    `${date}-${slug}-task-spec.md`
  );
  const infographicHtmlPath = safePath(
    brainRoot,
    "core",
    "deliverables",
    "meeting-closeouts",
    `${date}-${slug}-infographic.html`
  );
  const infographicId = value.id || `${date}-${slug}`;
  const infographicFile = `${date}-${slug}.png`;
  const infographicPngPath = safePath(
    brainRoot,
    "natively",
    "meeting-infographics",
    infographicId,
    infographicFile
  );
  const infographicStatusPath = safePath(
    brainRoot,
    "natively",
    "meeting-infographics",
    infographicId,
    "status.json"
  );

  const transcriptDocument = `# ${value.meeting.title} - ${date}\n\n${transcript.trim()}\n`;
  await atomicWriteNew(transcriptPath, transcriptDocument);
  const sourceLabel =
    source === "cluely" ? "Cluely transcript supplied in Workbench" : "Teams meeting evidence";
  const nextValue = {
    ...value,
    source: sourceLabel,
    files: {
      transcript: relativeToRoot(brainRoot, transcriptPath),
      summary: relativeToRoot(brainRoot, summaryPath),
      taskSpec: relativeToRoot(brainRoot, taskSpecPath),
      runReport: relativeToRoot(brainRoot, runReportPath),
      infographic: relativeToRoot(brainRoot, infographicHtmlPath),
      infographicHtml: relativeToRoot(brainRoot, infographicHtmlPath),
      infographicPng: relativeToRoot(brainRoot, infographicPngPath),
      infographicStatus: relativeToRoot(brainRoot, infographicStatusPath),
    },
  };
  const summary = summaryMarkdown(nextValue, nextValue.files.transcript, sourceLabel);
  const existingPackage = await appendMarkerToSummary(summaryPath, summary, nextValue);
  if (options.failAfter === "summary_marker") {
    const error = new Error("Injected stop after the summary marker.");
    error.code = "injected_summary_marker_stop";
    throw error;
  }

  await ensureGeneratedFile(taskSpecPath, taskSpecMarkdown(nextValue, nextValue.files.summary));
  await ensureGeneratedFile(infographicHtmlPath, infographicHtml(nextValue));
  await ensureGeneratedFile(
    runReportPath,
    `# Meeting closeout run report - ${date}\n\n- Meeting: ${value.meeting.title}\n- Transcript: \`${nextValue.files.transcript}\`\n- Summary: \`${nextValue.files.summary}\`\n- Task spec: \`${nextValue.files.taskSpec}\`\n- Infographic HTML: \`${nextValue.files.infographicHtml}\`\n- Infographic PNG: \`${nextValue.files.infographicPng}\`\n- Email sent: no\n- Jira changed: no\n`
  );

  const render = options.renderInfographic || renderMeetingInfographic;
  const visual = await render({
    htmlPath: infographicHtmlPath,
    outputPath: infographicPngPath,
    statusPath: infographicStatusPath,
    meetingId: infographicId,
    browserFactory: options.browserFactory,
  });
  const finalValue = {
    ...nextValue,
    createdAt: existingPackage?.createdAt || nextValue.createdAt,
    infographic: {
      ...nextValue.infographic,
      saved: {
        id: infographicId,
        file: infographicFile,
        width: visual.width,
        height: visual.height,
        bytes: visual.bytes,
        sha256: visual.sha256,
      },
    },
  };
  const finalMarker = packageMarker(finalValue);
  await appendOnce(summaryPath, finalMarker, `\n${finalMarker}\n`);

  const digest = createHash("sha256").update(transcript.trim()).digest("hex");
  const processedPath = safePath(brainRoot, "_intake", "processed.log");
  const processedMarker = `workbench-meeting-closeout | ${finalValue.id} | sha256:${digest}`;
  await appendOnce(
    processedPath,
    processedMarker,
    `${new Date().toISOString()} | ${processedMarker}\n`
  );
  const changelogPath = safePath(brainRoot, "CHANGELOG.md");
  const changelogMarker = `Workbench meeting closeout stored ${finalValue.id}`;
  await appendOnce(
    changelogPath,
    changelogMarker,
    `\n| ${date} | ${localTime()} ET | Workbench | ${finalValue.files.transcript}; ${finalValue.files.summary}; ${finalValue.files.taskSpec}; ${finalValue.files.runReport}; ${finalValue.files.infographicHtml}; ${finalValue.files.infographicPng}; ${finalValue.files.infographicStatus}; _intake/processed.log; CHANGELOG.md | ${changelogMarker}, review package, and saved infographic. Email and Jira remained review-only. No staged file was left unwritten. |\n`
  );
  return finalValue;
}

export async function inspectStoredMeetingPackage(value, options = {}) {
  const brainRoot = resolve(
    options.brainRoot || process.env.MEETING_CLOSEOUT_BRAIN_ROOT || DEFAULT_BRAIN_ROOT
  );
  const required = [
    "transcript",
    "summary",
    "taskSpec",
    "runReport",
    "infographicHtml",
    "infographicPng",
    "infographicStatus",
  ];
  const missing = [];
  for (const key of required) {
    const relative = value?.files?.[key];
    if (!relative) {
      missing.push(key);
      continue;
    }
    try {
      await readFile(safePath(brainRoot, ...relative.split("/")));
    } catch {
      missing.push(key);
    }
  }
  let visual = null;
  if (!missing.includes("infographicPng")) {
    visual = inspectPng(
      await readFile(safePath(brainRoot, ...value.files.infographicPng.split("/")))
    );
  }
  const processed = await readFile(safePath(brainRoot, "_intake", "processed.log"), "utf8").catch(
    () => ""
  );
  const changelog = await readFile(safePath(brainRoot, "CHANGELOG.md"), "utf8").catch(() => "");
  const processedRecorded = processed.includes(`workbench-meeting-closeout | ${value.id} |`);
  const changeRecorded = changelog.includes(`Workbench meeting closeout stored ${value.id}`);
  return {
    complete:
      missing.length === 0 &&
      Boolean(value?.infographic?.saved) &&
      processedRecorded &&
      changeRecorded,
    missing,
    visual,
    associated: Boolean(value?.infographic?.saved?.id && value?.infographic?.saved?.file),
    processedRecorded,
    changeRecorded,
  };
}

export async function listStoredPackages(options = {}) {
  const brainRoot = resolve(
    options.brainRoot || process.env.MEETING_CLOSEOUT_BRAIN_ROOT || DEFAULT_BRAIN_ROOT
  );
  const summaries = safePath(brainRoot, "core", "meetings", "summaries");
  let names = [];
  try {
    names = await readdir(summaries);
  } catch {
    return [];
  }
  const packages = [];
  for (const name of names.filter((item) => item.endsWith(".md") && !item.startsWith("_"))) {
    try {
      const stored = parsePackageMarker(await readFile(join(summaries, basename(name)), "utf8"));
      if (stored) packages.push(stored);
    } catch {
      // A single unreadable historical summary must not hide the rest.
    }
  }
  return packages.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function processMeetingCloseout(payload, options = {}) {
  const meeting = normalizeMeeting(payload.meeting || {});
  if (!asText(meeting.title) || meeting.title === "Untitled meeting") {
    const error = new Error("Select a meeting before processing.");
    error.code = "invalid_meeting";
    throw error;
  }
  const suppliedTranscript = asText(payload.transcript);
  const source = suppliedTranscript ? "cluely" : "teams";
  const evidence = suppliedTranscript ? null : await meetingEvidence(meeting, options);
  const transcript = suppliedTranscript || asText(evidence?.transcript);
  if (!transcript || transcriptError(transcript)) {
    return {
      ok: false,
      code: "transcript_unavailable",
      detail:
        "No Teams capture is available for this meeting. Paste the Cluely transcript and add any context notes.",
      meeting,
    };
  }
  const value = buildReviewPackage({
    meeting,
    transcript,
    contextNotes: payload.contextNotes,
    recap: evidence?.recap || "",
    relatedMaterial: evidence?.relatedMaterial || [],
  });
  const stored = await persistMeetingPackage(value, transcript, source, options);
  const inspection = await inspectStoredMeetingPackage(stored, options);
  return inspection.complete
    ? { ok: true, package: stored, inspection }
    : {
        ok: false,
        code: "meeting_package_incomplete",
        detail: `Meeting processing is incomplete: ${inspection.missing.join(", ") || "saved association or history"}.`,
        meeting,
        package: stored,
        inspection,
      };
}

async function readJsonBody(request) {
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
      const error = new Error("The transcript is too large for this request.");
      error.code = "body_too_large";
      throw error;
    }
  }
  return text ? JSON.parse(text) : {};
}

export async function handleMeetingCloseoutRoute(request, url) {
  if (!url.pathname.startsWith("/api/meeting-closeout")) return null;
  if (request.method === "GET" && url.pathname === "/api/meeting-closeout/today") {
    return { status: 200, body: { ok: true, data: await listTodaysMeetings() } };
  }
  if (request.method === "GET" && url.pathname === "/api/meeting-closeout/packages") {
    return { status: 200, body: { ok: true, data: await listStoredPackages() } };
  }
  if (request.method === "POST" && url.pathname === "/api/meeting-closeout/process") {
    try {
      const payload = await readJsonBody(request);
      const key = asText(payload?.meeting?.id) || JSON.stringify(payload?.meeting || {});
      let pending = activeProcessing.get(key);
      if (!pending) {
        pending = processMeetingCloseout(payload).finally(() => activeProcessing.delete(key));
        activeProcessing.set(key, pending);
      }
      const result = await pending;
      return {
        status: result.ok || result.code === "transcript_unavailable" ? 200 : 409,
        body: result.ok
          ? result
          : { ok: false, code: result.code, error: result.detail, data: result },
      };
    } catch (error) {
      return {
        status: error.code === "body_too_large" ? 413 : 400,
        body: { ok: false, code: error.code || "closeout_failed", error: error.message },
      };
    }
  }
  return { status: 404, body: { ok: false, error: "Meeting closeout route not found." } };
}
