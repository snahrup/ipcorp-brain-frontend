import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { generateMeetingInfographicWithCodex } from "./codex-infographic-generator.mjs";
import { inspectPng } from "./meeting-infographic-renderer.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_BRAIN_ROOT =
  "C:\\Users\\snahrup\\OneDrive - IP-Corporation\\ipcorp-architecture-brain";
const ADAPTER_PATH = resolve(process.cwd(), "server", "meeting-closeout-adapter.py");
const MAX_BODY_BYTES = 2_000_000;
const PACKAGE_MARKER = "WORKBENCH_CLOSEOUT_JSON";

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

// A caller that passes `fixture` decides the answer, including passing null to
// mean "no fixture, do the real read". `options.fixture ?? loadFixture()` read
// that null as absent and fell back to MEETING_CLOSEOUT_FIXTURE, so a fixture
// path left in the environment silently replaced the live calendar answer.
async function resolveFixture(options) {
  if ("fixture" in options) return options.fixture;
  return loadFixture(options.fixturePath);
}

// The calendar read waits on a Microsoft 365 job that can genuinely take many
// minutes; killing the adapter early strands a query that Cowork is still
// working on. Sixteen minutes covers the adapter's own fifteen-minute wait
// budget. Transcript reads keep the shorter bound because the browser is
// waiting on that request directly.
const ADAPTER_TIMEOUTS_MS = { calendar: 16 * 60_000, transcript: 240_000 };

async function runAdapter(command, payload = {}) {
  const python = process.env.MEETING_CLOSEOUT_PYTHON || "python";
  const { stdout } = await execFileAsync(python, [ADAPTER_PATH, command, JSON.stringify(payload)], {
    cwd: process.cwd(),
    timeout: ADAPTER_TIMEOUTS_MS[command] || 240_000,
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

// One shared calendar read at a time, with its last answer cached, so opening
// the wrap-up page never fires a duplicate Microsoft 365 query and navigating
// away never strands one. A good answer is served for ten minutes; a failure
// is retried after thirty seconds; Refresh forces a new read immediately.
const TODAY_CACHE_GOOD_MS = 10 * 60_000;
const TODAY_CACHE_FAILURE_MS = 30_000;
let todayCalendarCache = null;
let todayCalendarJob = null;

export function resetTodayCalendarState() {
  todayCalendarCache = null;
  todayCalendarJob = null;
}

function loadingCalendarResponse(date, fallback) {
  return {
    date,
    meetings: fallback,
    source: fallback.length ? "brain_snapshot" : "microsoft_365",
    availability: "loading",
    microsoft365Available: true,
    detail:
      "The Outlook calendar read is still running. Prepared meetings stay available while it finishes.",
  };
}

export async function listTodaysMeetings(options = {}) {
  const date = options.date || localDate();
  const fixture = await resolveFixture(options);
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
  const clock = options.clock || (() => new Date());
  const nowMs = clock().getTime();
  const readCalendar = options.readCalendar || ((day) => runAdapter("calendar", { date: day }));

  const cacheTtl = todayCalendarCache?.value?.microsoft365Available
    ? TODAY_CACHE_GOOD_MS
    : TODAY_CACHE_FAILURE_MS;
  const cacheFresh =
    todayCalendarCache &&
    todayCalendarCache.date === date &&
    nowMs - todayCalendarCache.at < cacheTtl;
  if (!options.force && cacheFresh) return structuredClone(todayCalendarCache.value);

  // Background pollers read; they never initiate. The loop walks the board
  // every few minutes, and without this it expired the cache and started a
  // fresh Microsoft read roughly every fifteen minutes all night, each one a
  // billed Copilot task. Only a person's visit or an explicit refresh may
  // start a read.
  if (options.cachedOnly) {
    if (todayCalendarCache?.date === date) return structuredClone(todayCalendarCache.value);
    return {
      date,
      meetings: fallback,
      source: fallback.length ? "brain_snapshot" : "microsoft_365",
      availability: "stale",
      microsoft365Available: true,
      detail:
        "No cached calendar answer yet. Background reads never start a Microsoft call; open the page or use Refresh.",
    };
  }

  // A read already in flight is never duplicated, force or not: a second tab
  // or a repeat visit attaches to the same pending answer.
  if (todayCalendarJob?.date === date) return loadingCalendarResponse(date, fallback);

  const work = (async () => {
    try {
      const response = await readCalendar(date);
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
  })();
  todayCalendarJob = { date, promise: work };
  work
    .then((value) => {
      todayCalendarCache = { date, at: clock().getTime(), value: structuredClone(value) };
    })
    .finally(() => {
      if (todayCalendarJob?.promise === work) todayCalendarJob = null;
    });
  return loadingCalendarResponse(date, fallback);
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

const SPEAKER_TURN = /^(?:\*\*)?[^\n:]{1,60}(?:\*\*)?(?::\s*\S|\s+\[\d{1,2}:\d{2}\]\s*$)/m;

/**
 * A Teams capture with no speaker turns and almost no text is not a transcript.
 * When the Microsoft bridge cannot reach the recording it answers
 * conversationally ("I'll start by locating the meeting on your calendar."),
 * and that sentence names no failure, so every phrase check above passes it.
 * Synthesis then runs against one line of a non-answer. Pasted Cluely
 * transcripts never reach this check; they take the supplied path.
 */
function capturedTranscriptUnusable(value) {
  const text = asText(value);
  return !SPEAKER_TURN.test(text) && text.length < 400;
}

const ABRIDGED_DISCLOSURE = [
  /[([][^)\]\n]{0,160}\b(?:excerpt|excerpted|abridged|truncated|condensed|partial transcript)\b[^)\]\n]{0,160}[)\]]/i,
  /\bfull transcript\b[^.\n]{0,80}\b(?:available at source|available on request|continues at)\b/i,
];

export function transcriptIsAbridged(value) {
  const text = asText(value);
  return ABRIDGED_DISCLOSURE.some((pattern) => pattern.test(text));
}

const TRANSCRIPT_TIMESTAMP = /\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]/g;
const COVERAGE_FLOOR = 0.25;
const COVERAGE_MIN_MEETING_SECONDS = 20 * 60;

export function transcriptCoverage(transcript, meeting) {
  const seconds = [...asText(transcript).matchAll(TRANSCRIPT_TIMESTAMP)].map(
    ([, hours, minutes, secs]) => Number(hours || 0) * 3600 + Number(minutes) * 60 + Number(secs)
  );
  const start = Date.parse(meeting?.start || "");
  const end = Date.parse(meeting?.end || "");
  if (seconds.length < 2 || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  const meetingSeconds = (end - start) / 1000;
  if (meetingSeconds < COVERAGE_MIN_MEETING_SECONDS) return null;
  const covered = Math.max(...seconds) - Math.min(...seconds);
  return { covered, meetingSeconds, ratio: covered / meetingSeconds };
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

/**
 * Keep only evidence a real capture could produce. The recap and related
 * material are dropped when they repeat the transcript: the bridge often
 * returns one blob of text with none of the specific keys, so the same string
 * would otherwise arrive in the prompt three times as three kinds of evidence.
 */
function usableEvidence(evidence) {
  const transcript = asText(evidence.transcript);
  if (transcriptError(transcript) || capturedTranscriptUnusable(transcript)) return null;
  const recap = asText(evidence.recap);
  return {
    transcript,
    recap: recap === transcript ? "" : recap,
    relatedMaterial: (evidence.relatedMaterial || []).filter(
      (item) => asText(item) && asText(item) !== transcript
    ),
  };
}

async function meetingEvidence(meeting, options = {}) {
  const fixture = await resolveFixture(options);
  if (fixture) {
    const record = fixture.transcripts?.[meeting.id];
    if (!record) return null;
    if (typeof record === "string") return usableEvidence({ transcript: record });
    return usableEvidence({
      transcript: record.transcript,
      recap: record.recap,
      relatedMaterial: Array.isArray(record.relatedMaterial) ? record.relatedMaterial : [],
    });
  }
  try {
    const response = await runAdapter("transcript", { meeting });
    if (response.ok === false) return null;
    return usableEvidence({
      transcript: findText(response, ["transcript", "verbatimTranscript", "vtt"]),
      recap: findText(response, ["recap", "recordingRecap", "summary"]),
      relatedMaterial: findRelatedMaterial(response),
    });
  } catch {
    return null;
  }
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

// The executive readout is a paragraph the model wrote, not a quotation, so it
// gets no length cap. Running it through cleanEvidence chopped it at 500
// characters and left stored summaries ending mid-word.
function cleanReadout(value) {
  return value.replace(/^[-*•]\s*/, "").trim();
}

// ---------------------------------------------------------------------------
// Raw capture cleanup. A raw Cluely capture labels every other voice "Them",
// splits utterances across lines, and narrates the screen. The house rule is
// that a capture is cleaned to Teams quality BEFORE anything downstream reads
// it: named speakers, whole utterances, no narration, substance never cut and
// no claim invented. If the cleanup cannot be produced, the meeting stays
// unprocessed; raw junk is never stored for consistency's sake.
// ---------------------------------------------------------------------------

export function transcriptNeedsCleanup(text) {
  return /^\s*(?:\*\*)?(?:Them|Me|Speaker \d+)(?:\*\*)?\s*[[:\d]/im.test(String(text || ""));
}

function buildTranscriptCleanupPrompt({ meeting, transcript }) {
  const people = [meeting.organizer, ...(meeting.attendees || [])].filter(Boolean);
  const roster = [...new Set(people)].join(", ") || "not listed";
  return `Rewrite this raw meeting capture to the quality of a Microsoft Teams
transcript. It came from a capture tool that labels the machine's owner "Me"
and every other voice "Them".

Meeting: ${meeting.title}
People in the meeting: ${roster}
"Me" is Steve Nahrup.

Rules that decide whether your output is usable:
- Attribute every utterance to a named person from the list above, using what
  is said (names used in address, who answers whom, who runs the screen) to
  tell the "Them" voices apart. No line may keep Me, Them, or Speaker labels.
- Merge fragment lines into whole utterances under the earliest timestamp of
  the fragment run. Keep the [m:ss] timestamps where present.
- Strip screen narration, filler, and asides that carry no substance.
- Fix obvious mis-transcriptions conservatively.
- Where timestamps reset, note a capture restart on its own line.
- Never cut substance. Never paraphrase a statement into a claim that was not
  made. Never add anything that is not in the capture.
- Format each turn as **Name** [m:ss] on one line, the utterance below it, a
  blank line between turns.

RAW CAPTURE
${transcript}
END RAW CAPTURE

Output exactly:
CLEANED:
<the full cleaned transcript>
END CLEANED`;
}

function parseCleanupOutput(output) {
  return /CLEANED:[ \t]*\r?\n([\s\S]*?)END CLEANED/m.exec(String(output || ""))?.[1]?.trim() || "";
}

async function cleanupPastedTranscript(input, runModel = runSynthesisModel) {
  const cleaned = parseCleanupOutput(await runModel(buildTranscriptCleanupPrompt(input)));
  if (!cleaned || cleaned.length < 80 || transcriptNeedsCleanup(cleaned)) {
    const error = new Error("The capture cleanup did not produce a fully attributed transcript.");
    error.code = "transcript_cleanup_unavailable";
    throw error;
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Transcript reconciliation. A meeting can arrive with a Teams capture, a
// Cluely paste, and older saved files for the same meeting. The closeout reads
// every matching source, filters bad captures, keeps partial captures as
// supporting input only when a full source exists, and stores one context file
// that downstream synthesis reads.
// ---------------------------------------------------------------------------

const TRANSCRIPT_FOLDER_FALLBACKS = [
  "teams-export",
  "cluely-export",
  "notion-export",
  "email-export",
  "elt-prep-feedback",
];
const CONSOLIDATED_TRANSCRIPT_FOLDER = "consolidated";

function sourceFolderFor(value) {
  return value === "cluely" ? "cluely-export" : "teams-export";
}

function transcriptBodyFromDocument(value) {
  return asText(value)
    .replace(/^# .+?\r?\n\r?\n/, "")
    .trim();
}

function normalizedTranscriptKey(value) {
  return transcriptBodyFromDocument(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function transcriptHash(value) {
  return createHash("sha256").update(transcriptBodyFromDocument(value)).digest("hex");
}

function transcriptMatchesMeeting(fileName, meeting, date, slug) {
  const stem = basename(fileName).replace(/\.md$/i, "").toLowerCase();
  const idSlug = safeSlug(meeting.id || "");
  return (
    stem === `${date}-${slug}` ||
    stem.includes(`${date}-${slug}`) ||
    (idSlug && stem.includes(idSlug)) ||
    (stem.includes(date) && stem.includes(slug))
  );
}

async function transcriptFolders(root) {
  try {
    const folders = await readdir(root, { withFileTypes: true });
    const names = folders
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .filter((name) => name !== CONSOLIDATED_TRANSCRIPT_FOLDER);
    return names.length ? names : TRANSCRIPT_FOLDER_FALLBACKS;
  } catch {
    return TRANSCRIPT_FOLDER_FALLBACKS;
  }
}

async function walkMarkdownFiles(folder) {
  let entries = [];
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) files.push(...(await walkMarkdownFiles(path)));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(path);
  }
  return files;
}

function classifyTranscript(text, meeting) {
  if (transcriptError(text) || capturedTranscriptUnusable(text)) {
    return { state: "unusable", code: "transcript_unavailable", detail: "Capture is not usable." };
  }
  if (transcriptIsAbridged(text)) {
    return {
      state: "partial",
      code: "transcript_abridged",
      detail: "Capture says it is an excerpt.",
    };
  }
  const coverage = transcriptCoverage(text, meeting);
  if (coverage && coverage.ratio < COVERAGE_FLOOR) {
    return {
      state: "partial",
      code: "transcript_partial",
      detail: `Capture covers ${Math.round(coverage.covered / 60)} minutes of the ${Math.round(coverage.meetingSeconds / 60)} minute meeting.`,
    };
  }
  return { state: "full", code: "transcript_ready", detail: "Usable full capture." };
}

async function discoverStoredTranscriptSources(brainRoot, meeting, date, slug) {
  const root = safePath(brainRoot, "core", "meetings", "transcripts");
  const folders = await transcriptFolders(root);
  const sources = [];
  for (const folderName of folders) {
    const folder = safePath(root, folderName);
    for (const path of await walkMarkdownFiles(folder)) {
      if (!transcriptMatchesMeeting(path, meeting, date, slug)) continue;
      const document = await readFile(path, "utf8");
      const body = transcriptBodyFromDocument(document);
      const quality = classifyTranscript(body, meeting);
      sources.push({
        kind: folderName,
        origin: "stored",
        path,
        relativePath: relativeToRoot(brainRoot, path),
        text: body,
        hash: transcriptHash(body),
        quality,
      });
    }
  }
  return sources;
}

function incomingTranscriptSource({ brainRoot, meeting, date, slug, source, transcript }) {
  if (!transcript) return null;
  const folder = sourceFolderFor(source);
  const text = transcriptBodyFromDocument(transcript);
  const hash = transcriptHash(text);
  const path = safePath(brainRoot, "core", "meetings", "transcripts", folder, `${date}-${slug}.md`);
  return {
    kind: folder,
    origin: "incoming",
    path,
    relativePath: relativeToRoot(brainRoot, path),
    text,
    hash,
    quality: classifyTranscript(text, meeting),
  };
}

function selectTranscriptSources(sources) {
  const usable = sources.filter((source) => source.quality.state !== "unusable");
  const unique = uniqueBy(usable, (source) => normalizedTranscriptKey(source.text));
  const full = unique.filter((source) => source.quality.state === "full");
  const partial = unique.filter((source) => source.quality.state === "partial");
  if (!full.length) {
    const first = partial[0];
    return {
      ok: false,
      code: first?.quality.code || "transcript_unavailable",
      detail:
        first?.quality.code === "transcript_abridged"
          ? "Only excerpted captures were found. The meeting stays unprocessed until a full source is available."
          : first?.quality.code === "transcript_partial"
            ? `${first.quality.detail} The meeting stays unprocessed until a full source is available.`
            : "No usable transcript source was found.",
    };
  }
  return { ok: true, sources: [...full, ...partial] };
}

function buildTranscriptConsolidationPrompt({ meeting, sources }) {
  const sourceBlocks = sources
    .map(
      (source, index) => `SOURCE ${index + 1}
Path: ${source.relativePath}
Quality: ${source.quality.state}
SHA256: ${source.hash}

${source.text}`
    )
    .join("\n\n---\n\n");
  return `Build one meeting context transcript from the sources below.

Meeting: ${meeting.title}
Date: ${meeting.start.slice(0, 10)}

Rules:
- Preserve speaker names and attribution from the sources.
- On overlapping speech, treat a Teams transcript as the stronger source for exact wording and speaker attribution; use Cluely to fill gaps or extend a partial Teams capture.
- Merge complementary details and remove duplicated turns.
- If sources disagree, keep the uncertainty visible in brackets.
- If a partial source adds context, include only what it actually contains.
- Do not invent words, decisions, dates, owners, or certainty.
- Do not summarize away commitments or requested follow-up.

${sourceBlocks}

Output exactly:
CONSOLIDATED:
<the consolidated meeting context>
END CONSOLIDATED`;
}

function parseConsolidatedTranscript(output) {
  return (
    /CONSOLIDATED:[ \t]*\r?\n([\s\S]*?)END CONSOLIDATED/m.exec(String(output || ""))?.[1]?.trim() ||
    ""
  );
}

async function consolidateTranscriptSources({ meeting, sources }, runModel = runSynthesisModel) {
  if (sources.length === 1) return sources[0].text;
  const consolidated = parseConsolidatedTranscript(
    await runModel(buildTranscriptConsolidationPrompt({ meeting, sources }))
  );
  if (!consolidated || consolidated.length < 80) {
    const error = new Error("Transcript consolidation did not return a usable context artifact.");
    error.code = "transcript_consolidation_unavailable";
    throw error;
  }
  return consolidated;
}

async function prepareTranscriptContext({ meeting, transcript, source }, options = {}) {
  const brainRoot = resolve(
    options.brainRoot || process.env.MEETING_CLOSEOUT_BRAIN_ROOT || DEFAULT_BRAIN_ROOT
  );
  const date = meeting.start.slice(0, 10) || localDate();
  const slug = safeSlug(meeting.title);
  const stored = await discoverStoredTranscriptSources(brainRoot, meeting, date, slug);
  const incoming = incomingTranscriptSource({ brainRoot, meeting, date, slug, source, transcript });
  const selected = selectTranscriptSources([...stored, ...(incoming ? [incoming] : [])]);
  if (!selected.ok) {
    const error = new Error(selected.detail);
    error.code = selected.code;
    throw error;
  }
  const reconciled = await consolidateTranscriptSources(
    { meeting, sources: selected.sources },
    options.runModel
  );
  const sourceLabel =
    selected.sources.length === 1
      ? selected.sources[0].kind === "cluely-export"
        ? "Cluely transcript supplied in Workbench"
        : "Teams meeting evidence"
      : `Consolidated meeting context from ${selected.sources.length} transcript sources`;
  return {
    text: reconciled,
    sources: selected.sources,
    sourceLabel,
  };
}

async function writeTranscriptSource(source, meeting, date) {
  if (source.origin === "stored") return { ...source, created: false };
  const document = `# ${meeting.title} - ${date}\n\n${source.text.trim()}\n`;
  await mkdir(dirname(source.path), { recursive: true });
  try {
    await writeFile(source.path, document, { encoding: "utf8", flag: "wx" });
    return { ...source, created: true };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await readFile(source.path, "utf8");
    if (transcriptBodyFromDocument(existing) === source.text.trim()) {
      return { ...source, created: false };
    }
    const nextPath = source.path.replace(/\.md$/i, `-${source.hash.slice(0, 10)}.md`);
    let created = true;
    try {
      await writeFile(nextPath, document, { encoding: "utf8", flag: "wx" });
    } catch (nextError) {
      if (nextError.code !== "EEXIST") throw nextError;
      const existingVersion = await readFile(nextPath, "utf8");
      if (existingVersion !== document) throw nextError;
      created = false;
    }
    return {
      ...source,
      path: nextPath,
      relativePath: source.relativePath.replace(/\.md$/i, `-${source.hash.slice(0, 10)}.md`),
      created,
    };
  }
}

async function writeTranscriptContext({ brainRoot, meeting, date, slug, context }) {
  const writtenSources = [];
  for (const source of context.sources) {
    writtenSources.push(await writeTranscriptSource(source, meeting, date));
  }
  const contextPath = safePath(
    brainRoot,
    "core",
    "meetings",
    "transcripts",
    CONSOLIDATED_TRANSCRIPT_FOLDER,
    `${date}-${slug}.md`
  );
  const sourceLines = writtenSources
    .map(
      (source) => `- \`${source.relativePath}\` | ${source.quality.state} | sha256:${source.hash}`
    )
    .join("\n");
  const document = `# ${meeting.title} - ${date}

## Source receipts

${sourceLines || "- None."}

## Consolidated meeting context

${context.text.trim()}
`;
  await ensureGeneratedFile(contextPath, document);
  const files = {
    transcript: relativeToRoot(brainRoot, contextPath),
  };
  writtenSources.forEach((source, index) => {
    files[`transcriptSource${index + 1}`] = source.relativePath;
  });
  return {
    files,
    sourceLabel: context.sourceLabel,
    createdSourceFiles: writtenSources
      .filter((source) => source.created)
      .map((source) => source.relativePath),
  };
}

// ---------------------------------------------------------------------------
// Snapshot refresh. The Meetings Overview reads a synced snapshot, not the
// live Brain, and it sat frozen at 8/6 because nothing re-synced after new
// packages landed. Every closeout that completes against the real Brain now
// refreshes the snapshot. Best effort only: a failed sync logs and never
// fails the run, and test roots never trigger it.
// ---------------------------------------------------------------------------

export function shouldRefreshSnapshot(options = {}, env = process.env) {
  return !options.brainRoot && !env.MEETING_CLOSEOUT_BRAIN_ROOT;
}

function triggerSnapshotSync() {
  try {
    const child = spawn(process.execPath, [resolve(process.cwd(), "scripts", "sync-data.mjs")], {
      windowsHide: true,
      stdio: "ignore",
      detached: true,
    });
    child.unref();
  } catch {
    // Best effort; the Refresh button and the next closeout try again.
  }
}

// ---------------------------------------------------------------------------
// Model synthesis. The review package is written by an actual model reading
// the whole transcript, not by keyword patterns. Pattern matching produced
// review items like "Well, I'll drive you up the wall" as a commitment, which
// poisons everything downstream. There is deliberately NO heuristic fallback:
// if synthesis fails, the meeting stays unprocessed rather than storing junk.
// ---------------------------------------------------------------------------

const SYNTHESIS_TIMEOUT_MS = 10 * 60_000;

// The prompt is written beside Steve's other Workbench state so a failed run
// can be read back. A test must land somewhere else: the gateway test drove
// this path for real, so every run wrote a fixture prompt into his live
// %LOCALAPPDATA%\IPCorpBrain\meeting-closeout folder and spent an actual Opus
// call. MEETING_CLOSEOUT_STATE_DIR redirects the file and
// MEETING_CLOSEOUT_SYNTHESIS_BIN swaps the executable, the same way
// MEETING_CLOSEOUT_PYTHON already swaps the adapter.
function synthesisStateDir() {
  return (
    process.env.MEETING_CLOSEOUT_STATE_DIR ||
    join(
      process.env.LOCALAPPDATA || join(process.env.USERPROFILE || ".", "AppData", "Local"),
      "IPCorpBrain",
      "meeting-closeout"
    )
  );
}

function synthesisPromptFile() {
  return join(synthesisStateDir(), `synthesis-prompt.${process.pid}.${Date.now()}.md`);
}

export function buildSynthesisPrompt({
  meeting,
  transcript,
  contextNotes = "",
  recap = "",
  relatedMaterial = [],
}) {
  return `You are analyzing a real workplace meeting transcript for Steve Nahrup,
the data architect at IP Corporation. Steve is the speaker labeled "Steve";
other speakers may be labeled "Them" or by name. The transcription is noisy:
words are garbled, sentences fragment, and long stretches are personal small
talk. Read through the noise and analyze only the genuine work content.

Meeting: ${meeting.title}
Start: ${meeting.start}
End: ${meeting.end || "not recorded"}
Organizer: ${meeting.organizer || "not recorded"}
Attendees: ${(meeting.attendees || []).join(", ") || "not recorded"}
${contextNotes ? `Context notes from Steve: ${asText(contextNotes)}` : ""}
${recap ? `Recording recap: ${asText(recap)}` : ""}
${relatedMaterial.length ? `Related material: ${relatedMaterial.join("; ")}` : ""}

TRANSCRIPT
${asText(transcript).slice(0, 200_000)}
END TRANSCRIPT

Produce the meeting review package as JSON with exactly these fields:

- "summary": 3 to 6 plain sentences describing what actually happened in work
  terms: topics discussed, decisions made, direction given. If most of the
  meeting was personal conversation with a few work items at the end, say
  exactly that.
- "commitments": ONLY things Steve himself explicitly agreed or committed to
  do. Each: {"text": a clean one-sentence restatement of what Steve will do,
  "evidence": the verbatim transcript line(s) that prove it, "due": stated
  timing or null}. Someone else's task is not Steve's commitment. A fragment
  like "I can put her as I" is transcription noise, not a commitment.
- "jiraProposals": work items from this meeting that belong in Jira. Each:
  {"operation": "Update" or "Create", "jiraKey": "MT-123" if an existing item
  was named else null, "title": a real work-item title, "rationale": one
  sentence on why this belongs in Jira, "evidence": the verbatim line(s)}.
  Assignments given to Steve or his team count; passing mentions do not.
- "documentRequests": artifacts someone asked to be sent, shared, or produced.
  Each: {"text": what was requested, "owner": who asked, or null,
  "evidence": verbatim line}.
- "reminderCandidates": genuinely time-bound items worth a reminder. Each:
  {"text": the item, "timing": the stated timing, "evidence": verbatim line}.
- "supportingMaterial": real links, files, or systems referenced for the work.
  Each: {"label": short name, "reference": the link or reference as spoken}.
- "emailDrafts": ONLY if the meeting clearly requires an email follow-up from
  Steve. Each: {"to": recipient name or null, "subject": subject line,
  "body": the full draft, "evidence": verbatim line that requires it}. Write
  the body in Steve's voice: plain, direct, first person, no filler. Never use
  an em dash. Never write "reach out", "leverage", "robust", "streamline",
  "delve", "worth noting", or "Additionally". Never abbreviate Patrick
  Stiller's first name. Never mention AI or assistants.
- "themes": 2 to 4 short phrases naming the real work topics of this meeting.
- "notes": anything important for Steve's review that fits nowhere above, as
  an array of short strings, or [].

Rules that decide whether your output is usable:
- Empty arrays are correct answers. A meeting with no commitments has an
  empty commitments array. Do not pad.
- Never invent content. Every commitments/jiraProposals/documentRequests/
  reminderCandidates/emailDrafts item must carry "evidence" copied verbatim
  from the transcript above; items whose evidence is not found verbatim are
  discarded automatically.
- Quality over quantity everywhere.

Output exactly one JSON object between these markers and nothing else:
PACKAGE:
{ ... }
END PACKAGE`;
}

export function parseSynthesisOutput(output) {
  const block = /PACKAGE:[ \t]*\r?\n([\s\S]*?)END PACKAGE/m.exec(String(output || ""))?.[1];
  const candidates = [];
  if (block) candidates.push(block.trim());
  const text = String(output || "");
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

function runSynthesisModel(prompt) {
  return new Promise((resolvePromise, reject) => {
    const file = synthesisPromptFile();
    mkdir(dirname(file), { recursive: true })
      .then(() => writeFile(file, prompt, "utf8"))
      .then(() => {
        // Opus on purpose: Steve chose quality over speed for meeting review.
        const child = spawn(
          process.env.MEETING_CLOSEOUT_SYNTHESIS_BIN || "claude",
          ["-p", `@${file}`, "--model", "opus", "--output-format", "text"],
          { shell: true, windowsHide: true }
        );
        let out = "";
        let err = "";
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error("Meeting synthesis timed out."));
        }, SYNTHESIS_TIMEOUT_MS);
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
          else reject(new Error(`Meeting synthesis exited ${code}: ${err.slice(-300)}`));
        });
      })
      .catch(reject);
  });
}

function normalizeForEvidence(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function verifiedItems(items, transcript, pick) {
  const haystack = normalizeForEvidence(transcript);
  const dropped = [];
  const kept = [];
  for (const item of Array.isArray(items) ? items : []) {
    const value = pick(item);
    if (!value) continue;
    const evidence = normalizeForEvidence(item.evidence);
    if (evidence && haystack.includes(evidence)) kept.push(value);
    else dropped.push(pick(item));
  }
  return { kept, dropped };
}

function synthesisError(detail) {
  const error = new Error(detail);
  error.code = "synthesis_unavailable";
  return error;
}

/**
 * Build the review package from real model analysis of the transcript.
 * Every extracted item must quote the transcript verbatim or it is dropped.
 * Throws synthesis_unavailable on model failure; callers must not fall back
 * to anything weaker.
 */
export async function synthesizeReviewPackage(input, runModel = runSynthesisModel) {
  const { meeting, transcript, contextNotes = "" } = input;
  const output = await runModel(buildSynthesisPrompt(input));
  const parsed = parseSynthesisOutput(output);
  if (!parsed) throw synthesisError("The synthesis output was not a valid package.");
  const summary = cleanReadout(asText(parsed.summary));
  if (!summary) throw synthesisError("The synthesis output had no meeting summary.");

  const synthesisNotes = [];
  const note = (label, dropped) => {
    if (dropped.length) {
      synthesisNotes.push(
        `${dropped.length} ${label} item${dropped.length === 1 ? "" : "s"} dropped: evidence not found verbatim in the transcript.`
      );
    }
  };

  const commitments = verifiedItems(parsed.commitments, transcript, (item) =>
    asText(item.text)
      ? {
          text: cleanEvidence(asText(item.text)),
          evidence: cleanEvidence(asText(item.evidence)),
          due: asText(item.due) || null,
          status: "Review",
        }
      : null
  );
  note("commitment", commitments.dropped);

  const jiraProposals = verifiedItems(parsed.jiraProposals, transcript, (item) =>
    asText(item.title)
      ? {
          operation: item.operation === "Update" ? "Update" : "Create",
          jiraKey: /^(?:MT|IPC)-\d+$/i.test(asText(item.jiraKey))
            ? asText(item.jiraKey).toUpperCase()
            : null,
          title: cleanEvidence(asText(item.title)).slice(0, 180),
          rationale: cleanEvidence(asText(item.rationale)),
          evidence: cleanEvidence(asText(item.evidence)),
        }
      : null
  );
  note("Jira proposal", jiraProposals.dropped);

  const documentRequests = verifiedItems(parsed.documentRequests, transcript, (item) =>
    asText(item.text)
      ? {
          text: cleanEvidence(asText(item.text)),
          owner: asText(item.owner) || null,
          status: "Review",
        }
      : null
  );
  note("document request", documentRequests.dropped);

  const reminderCandidates = verifiedItems(parsed.reminderCandidates, transcript, (item) =>
    asText(item.text)
      ? {
          text: cleanEvidence(asText(item.text)),
          timing: asText(item.timing) || null,
          status: "Candidate",
        }
      : null
  );
  note("reminder", reminderCandidates.dropped);

  const emailDrafts = verifiedItems(parsed.emailDrafts, transcript, (item) =>
    asText(item.body) && asText(item.subject)
      ? {
          to: asText(item.to) || null,
          subject: cleanEvidence(asText(item.subject)).slice(0, 180),
          body: asText(item.body).slice(0, 6_000),
          status: "Draft only",
          evidence: cleanEvidence(asText(item.evidence)),
        }
      : null
  );
  note("email draft", emailDrafts.dropped);

  const supportingMaterial = uniqueBy(
    [
      ...(input.relatedMaterial || []).map((reference) => ({
        label: cleanEvidence(asText(reference)).slice(0, 180),
        reference: cleanEvidence(asText(reference)),
        kind: "Related material",
      })),
      ...(Array.isArray(parsed.supportingMaterial) ? parsed.supportingMaterial : [])
        .filter((item) => asText(item.reference))
        .map((item) => ({
          label: cleanEvidence(asText(item.label) || asText(item.reference)).slice(0, 180),
          reference: cleanEvidence(asText(item.reference)),
          kind: "Mentioned in meeting",
        })),
    ],
    (item) => item.reference
  ).slice(0, 24);

  const themes = (Array.isArray(parsed.themes) ? parsed.themes : [])
    .map((theme) => cleanEvidence(asText(theme)).slice(0, 60))
    .filter(Boolean)
    .slice(0, 4);

  const packageId = `${meeting.start.slice(0, 10)}-${safeSlug(meeting.title)}`;
  return {
    id: packageId,
    meeting,
    createdAt: new Date().toISOString(),
    source: "Pending persistence",
    summary,
    contextNotes: asText(contextNotes),
    commitments: commitments.kept.slice(0, 20),
    jiraProposals: jiraProposals.kept.slice(0, 20),
    supportingMaterial,
    documentRequests: documentRequests.kept.slice(0, 16),
    reminderCandidates: reminderCandidates.kept.slice(0, 16),
    emailDrafts: emailDrafts.kept.slice(0, 6),
    synthesisNotes: [
      ...synthesisNotes,
      ...(Array.isArray(parsed.notes) ? parsed.notes : [])
        .map((item) => cleanEvidence(asText(item)))
        .filter(Boolean)
        .slice(0, 8),
    ],
    infographic: {
      headline: meeting.title,
      subhead: "Meeting closeout",
      metrics: [
        { label: "Commitments", value: commitments.kept.length },
        { label: "Jira changes", value: jiraProposals.kept.length },
        { label: "Document requests", value: documentRequests.kept.length },
        { label: "Reminders", value: reminderCandidates.kept.length },
      ],
      themes,
      nextMoves: commitments.kept.slice(0, 4).map((item) => item.text),
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

function packageMarkerExpression() {
  return new RegExp(`<!-- ${PACKAGE_MARKER} ([A-Za-z0-9+/=]+) -->`, "g");
}

function parsePackageMarker(text) {
  let parsed = null;
  for (const match of text.matchAll(packageMarkerExpression())) {
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

## Recommended Jira changes

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

| Commitments | Jira changes | Document requests | Reminders |
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
| Recommended Jira changes | ${value.jiraProposals.length} | PREPARED |
| Supporting material | ${value.supportingMaterial.length} | REVIEW |
| Document requests | ${value.documentRequests.length} | REVIEW |
| Reminder candidates | ${value.reminderCandidates.length} | PREPARED |
| Draft email follow-ups | ${value.emailDrafts.length} | PREPARED |

No email was sent and no Jira issue was changed.
`;
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

function removeCloseoutSections(text) {
  const matches = [...String(text || "").matchAll(packageMarkerExpression())];
  if (!matches.length) return String(text || "").trimEnd();
  const ranges = matches.map((match) => {
    const markerEnd = match.index + match[0].length;
    const headerStart = text.lastIndexOf("\n## Workbench closeout review", match.index);
    return { start: headerStart >= 0 ? headerStart : 0, end: markerEnd };
  });
  const merged = [];
  for (const range of ranges.sort((a, b) => a.start - b.start || a.end - b.end)) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  let cleaned = String(text || "");
  for (const range of merged.sort((a, b) => b.start - a.start)) {
    cleaned = `${cleaned.slice(0, range.start)}${cleaned.slice(range.end)}`;
  }
  return cleaned.trimEnd();
}

async function appendMarkerToSummary(path, content, _value) {
  try {
    const existing = await readFile(path, "utf8");
    const stored = parsePackageMarker(existing);
    const cleaned = removeCloseoutSections(existing);
    const next = `${cleaned ? `${cleaned}\n\n` : ""}## Workbench closeout review\n\n${content.trim()}\n`;
    await ensureGeneratedFile(path, next);
    return stored;
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

function closeoutInfographicPaths(brainRoot, value) {
  const date = value.meeting.start.slice(0, 10) || localDate();
  const slug = safeSlug(value.meeting.title);
  const infographicId = value.id || `${date}-${slug}`;
  return {
    date,
    slug,
    infographicId,
    outputPath: safePath(
      brainRoot,
      "natively",
      "meeting-infographics",
      infographicId,
      `${date}-${slug}-codex.png`
    ),
    statusPath: safePath(
      brainRoot,
      "natively",
      "meeting-infographics",
      infographicId,
      "status.json"
    ),
  };
}

async function readInfographicAttemptHistory(path) {
  try {
    const status = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(status.attemptHistory) ? status.attemptHistory : [];
  } catch {
    return [];
  }
}

async function writePendingInfographicStatus(
  path,
  value,
  date,
  detail,
  { recordAttempt = false } = {}
) {
  const previousAttempts = await readInfographicAttemptHistory(path);
  const requestedAt = new Date().toISOString();
  const attemptHistory = recordAttempt
    ? [
        ...previousAttempts,
        {
          attempt: previousAttempts.length + 1,
          provider: "codex",
          attemptedAt: requestedAt,
          outcome: "failed",
          detail,
        },
      ]
    : previousAttempts;
  await ensureGeneratedFile(
    path,
    `${JSON.stringify(
      {
        meetingId: value.id,
        calendarTitle: value.meeting.title,
        meetingDate: date,
        status: "pending_generation",
        requestedProvider: "codex",
        alternateProvider: "notebooklm",
        requestedAt,
        detail,
        attemptHistory,
        note: "No placeholder image was created. Codex remains preferred; NotebookLM remains available for this or other artifact types.",
      },
      null,
      2
    )}\n`
  );
}

export async function generateMeetingCloseoutVisual(value, transcriptContext, options = {}) {
  const brainRoot = resolve(
    options.brainRoot || process.env.MEETING_CLOSEOUT_BRAIN_ROOT || DEFAULT_BRAIN_ROOT
  );
  const paths = closeoutInfographicPaths(brainRoot, value);
  let visual = options.visual || null;
  if (!visual) {
    try {
      visual = await readVerifiedMeetingInfographic(brainRoot, paths.infographicId);
    } catch {
      // Missing, incomplete, or malformed proof allows a fresh Codex attempt.
    }
  }

  if (visual) return { visual, generationError: null, ...paths };

  if (options.deferInfographic) {
    const detail = "Visual generation is queued as a separate closeout step.";
    await writePendingInfographicStatus(paths.statusPath, value, paths.date, detail);
    return { visual: null, generationError: detail, ...paths };
  }

  try {
    const generate = options.generateInfographic || generateMeetingInfographicWithCodex;
    visual = await generate(
      {
        meetingId: paths.infographicId,
        meeting: value.meeting,
        summary: value.summary,
        transcript: transcriptContext.text,
        commitments: value.commitments,
        themes: value.infographic.themes,
        outputPath: paths.outputPath,
      },
      options.codexInfographicOptions
    );
    const previousAttempts = await readInfographicAttemptHistory(paths.statusPath);
    const generatedAt = new Date().toISOString();
    await ensureGeneratedFile(
      paths.statusPath,
      `${JSON.stringify(
        {
          meetingId: paths.infographicId,
          calendarTitle: value.meeting.title,
          meetingDate: paths.date,
          status: "GENERATED",
          generatedBy: "OpenAI Codex built-in image generation",
          generatedAt,
          verifiedAt: generatedAt,
          generator: {
            provider: visual.provider,
            product: visual.product,
            agentModel: visual.agentModel,
            imageModel: visual.imageModel,
            invocation: visual.invocation,
            jobId: visual.jobId,
            taskId: visual.taskId,
          },
          artifactId: visual.artifactId,
          sourceIds: visual.sourceIds,
          sourceHashes: visual.sourceHashes,
          output: {
            file: visual.file,
            bytes: visual.bytes,
            width: visual.width,
            height: visual.height,
            sha256: visual.sha256,
          },
          attemptHistory: [
            ...previousAttempts,
            {
              attempt: previousAttempts.length + 1,
              provider: visual.provider || "codex",
              attemptedAt: generatedAt,
              outcome: "generated",
              jobId: visual.jobId,
              taskId: visual.taskId,
              outputHash: visual.sha256,
            },
          ],
          verification: `Codex job ${visual.jobId} inspected the generated image before filing it. The Workbench then decoded the PNG, checked its dimensions, and matched SHA-256 ${visual.sha256}.`,
        },
        null,
        2
      )}\n`
    );
    return { visual, generationError: null, ...paths };
  } catch (error) {
    const generationError = error instanceof Error ? error.message : String(error);
    await writePendingInfographicStatus(paths.statusPath, value, paths.date, generationError, {
      recordAttempt: true,
    });
    if (options.throwOnInfographicFailure) throw error;
    return { visual: null, generationError, ...paths };
  }
}

export async function persistMeetingPackage(value, transcript, source, options = {}) {
  const brainRoot = resolve(
    options.brainRoot || process.env.MEETING_CLOSEOUT_BRAIN_ROOT || DEFAULT_BRAIN_ROOT
  );
  await verifyBrainWriteInstructions(brainRoot);
  const date = value.meeting.start.slice(0, 10) || localDate();
  const slug = safeSlug(value.meeting.title);
  const transcriptContext =
    options.transcriptContext ||
    (await prepareTranscriptContext({ meeting: value.meeting, transcript, source }, options));
  const transcriptWrite = await writeTranscriptContext({
    brainRoot,
    meeting: value.meeting,
    date,
    slug,
    context: transcriptContext,
  });
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
  const {
    infographicId,
    statusPath: infographicStatusPath,
    visual,
    generationError,
  } = await generateMeetingCloseoutVisual(value, transcriptContext, options);
  const infographicPngPath = visual?.outputPath || null;

  const sourceLabel = transcriptWrite.sourceLabel;
  const nextValue = {
    ...value,
    source: sourceLabel,
    files: {
      ...transcriptWrite.files,
      summary: relativeToRoot(brainRoot, summaryPath),
      taskSpec: relativeToRoot(brainRoot, taskSpecPath),
      runReport: relativeToRoot(brainRoot, runReportPath),
      ...(infographicPngPath
        ? {
            infographic: relativeToRoot(brainRoot, infographicPngPath),
            infographicPng: relativeToRoot(brainRoot, infographicPngPath),
          }
        : {}),
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
  await ensureGeneratedFile(
    runReportPath,
    `# Meeting closeout run report - ${date}\n\n- Meeting: ${value.meeting.title}\n- Transcript: \`${nextValue.files.transcript}\`\n- Source transcripts: ${
      Object.entries(nextValue.files)
        .filter(([key]) => key.startsWith("transcriptSource"))
        .map(([, path]) => `\`${path}\``)
        .join(", ") || "none"
    }\n- Summary: \`${nextValue.files.summary}\`\n- Task spec: \`${nextValue.files.taskSpec}\`\n- Infographic provider: ${visual?.provider || "pending Codex, with NotebookLM retained as an alternative"}\n- Infographic PNG: ${nextValue.files.infographicPng ? `\`${nextValue.files.infographicPng}\`` : "not created"}\n- Infographic status: \`${nextValue.files.infographicStatus}\`\n- Email sent: no\n- Jira changed: no\n`
  );
  const finalValue = {
    ...nextValue,
    createdAt: existingPackage?.createdAt || nextValue.createdAt,
    infographic: {
      ...nextValue.infographic,
      generation: {
        preferredProvider: "codex",
        alternateProvider: "notebooklm",
        status: visual ? "verified" : "pending",
        error: generationError,
      },
      ...(visual
        ? {
            saved: {
              id: infographicId,
              file: visual.file,
              provider: visual.provider || "notebooklm",
              width: visual.width,
              height: visual.height,
              bytes: visual.bytes,
              sha256: visual.sha256,
            },
          }
        : {}),
    },
  };
  const finalSummary = summaryMarkdown(finalValue, finalValue.files.transcript, sourceLabel);
  await appendMarkerToSummary(summaryPath, finalSummary, finalValue);

  const digest = createHash("sha256").update(transcriptContext.text.trim()).digest("hex");
  const processedPath = safePath(brainRoot, "_intake", "processed.log");
  const processedMarker = `workbench-meeting-closeout | ${finalValue.id} | sha256:${digest}`;
  await appendOnce(
    processedPath,
    processedMarker,
    `${new Date().toISOString()} | ${processedMarker}\n`
  );
  const changelogPath = safePath(brainRoot, "CHANGELOG.md");
  const changelogMarker = `Workbench meeting closeout stored ${finalValue.id}`;
  const closeoutFiles = Object.values(finalValue.files).filter(Boolean).join("; ");
  await appendOnce(
    changelogPath,
    changelogMarker,
    `\n| ${date} | ${localTime()} ET | Workbench | ${closeoutFiles}; _intake/processed.log; CHANGELOG.md | ${changelogMarker}, review package, and ${visual ? "verified infographic" : "pending infographic status"}. Email and Jira remained review-only. No staged file was left unwritten. |\n`
  );
  const brainCommit = await commitCloseoutFiles({
    brainRoot,
    files: finalValue.files,
    createdSourceFiles: transcriptWrite.createdSourceFiles,
    meetingId: finalValue.id,
    meetingTitle: finalValue.meeting.title,
  });
  return { ...finalValue, brainCommit };
}

/**
 * Commit the closeout's own files, and only its own files.
 *
 * The scheduled NotebookLM job refuses to stage another workflow's
 * uncommitted work, which is correct, and it means a closeout that writes
 * without committing blocks the real infographic for every meeting behind
 * it. That is exactly what happened on 2026-08-13: the 12:10 pass found the
 * 12:01 closeout sitting untracked and stood down without invoking
 * NotebookLM. The standing rule is files, knowledge update, validation, and
 * the commit in the same run.
 *
 * Staging is by explicit path, never `-A`: sweeping up a bystander
 * workflow's files would be the same defect pointed the other way.
 */
export async function commitCloseoutFiles({
  brainRoot,
  files,
  createdSourceFiles = [],
  meetingId,
  meetingTitle,
}) {
  const paths = [
    ...Object.entries(files || {})
      .filter(([key, value]) => !key.startsWith("transcriptSource") && Boolean(value))
      .map(([, value]) => value),
    ...createdSourceFiles,
    "_intake/processed.log",
    "CHANGELOG.md",
  ];
  const git = (args) => execFileAsync("git", args, { cwd: brainRoot });
  try {
    await git(["add", "--", ...paths]);
    const staged = await git(["diff", "--cached", "--name-only"]);
    if (!staged.stdout.trim()) {
      return {
        committed: false,
        detail: "Nothing new to commit; these paths are already recorded.",
      };
    }
    const message =
      `Meeting closeout: ${meetingTitle} (${meetingId})\n\n` +
      `Summary, transcript, task spec, run report, and infographic files\n` +
      `written and committed in the same run by the Workbench closeout, so\n` +
      `the scheduled post-meeting job never finds them as dirty overlap.`;
    await git(["commit", "-m", message]);
    const hash = await git(["log", "-1", "--format=%h"]);
    return { committed: true, commit: hash.stdout.trim() };
  } catch (error) {
    // A failed commit must be visible on the package, never thrown: the
    // files themselves were written and the closeout result is real. The
    // board renders committed:false as work still owed.
    return {
      committed: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
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

function isCompletedInfographicStatus(value) {
  return ["complete", "completed", "generated"].includes(asText(value).toLowerCase());
}

function infographicProvider(status) {
  const provider = asText(status?.generator?.provider).toLowerCase();
  if (provider === "codex" || provider === "openai codex") return "codex";
  if (status?.notebook?.id || provider === "notebooklm") return "notebooklm";
  return null;
}

async function readVerifiedMeetingInfographic(brainRoot, directoryName) {
  const infographicRoot = safePath(brainRoot, "natively", "meeting-infographics");
  const statusPath = safePath(infographicRoot, directoryName, "status.json");
  const status = JSON.parse(await readFile(statusPath, "utf8"));
  if (!isCompletedInfographicStatus(status.status)) return null;
  const provider = infographicProvider(status);
  if (!provider) return null;

  const artifactId = asText(status.artifactId || status.artifact_id);
  const sourceIds = [
    ...new Set(
      (Array.isArray(status.sourceIds) ? status.sourceIds : status.sources || [])
        .map((item) => asText(typeof item === "string" ? item : item?.id))
        .filter(Boolean)
    ),
  ];
  const outputFile = asText(status.output?.file || status.file);
  const recordedHash = asText(status.output?.sha256 || status.sha256).toLowerCase();
  const verification = asText(status.verification);
  if (
    !artifactId ||
    sourceIds.length < 2 ||
    !outputFile ||
    basename(outputFile) !== outputFile ||
    !recordedHash ||
    !verification
  ) {
    return null;
  }

  const outputPath = safePath(infographicRoot, directoryName, outputFile);
  const bytes = await readFile(outputPath);
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== recordedHash) return null;
  const image = inspectPng(bytes);

  return {
    id: directoryName,
    title:
      asText(status.calendarTitle || status.meetingTitle || status.artifactTitle) || directoryName,
    generatedAt: asText(status.verifiedAt || status.generatedAt),
    artifactId,
    provider,
    sourceIds,
    file: outputFile,
    path: relativeToRoot(brainRoot, outputPath),
    outputPath,
    statusPath: relativeToRoot(brainRoot, statusPath),
    sha256: actualHash,
    width: image.width,
    height: image.height,
    bytes: bytes.length,
    warningCount: Array.isArray(status.knownRenderIssues) ? status.knownRenderIssues.length : 0,
  };
}

/**
 * Read only infographics that carry enough proof to be treated as finished.
 * A PNG by itself may be the Workbench preview card, so it never qualifies.
 */
export async function listVerifiedMeetingInfographics(options = {}) {
  const brainRoot = resolve(
    options.brainRoot || process.env.MEETING_CLOSEOUT_BRAIN_ROOT || DEFAULT_BRAIN_ROOT
  );
  const infographicRoot = safePath(brainRoot, "natively", "meeting-infographics");
  let directories = [];
  try {
    directories = await readdir(infographicRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const completions = [];
  for (const directory of directories) {
    if (!directory.isDirectory()) continue;
    try {
      const verified = await readVerifiedMeetingInfographic(brainRoot, directory.name);
      if (verified) {
        const { outputPath: _outputPath, ...publicValue } = verified;
        completions.push(publicValue);
      }
    } catch {
      // One incomplete or malformed folder must not hide verified work in the others.
    }
  }
  return completions.sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)));
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
  const verified = new Map(
    (await listVerifiedMeetingInfographics({ brainRoot })).map((item) => [item.id, item])
  );
  const packages = [];
  for (const name of names.filter((item) => item.endsWith(".md") && !item.startsWith("_"))) {
    try {
      const stored = parsePackageMarker(await readFile(join(summaries, basename(name)), "utf8"));
      if (stored) {
        packages.push({
          ...stored,
          infographic: {
            ...stored.infographic,
            verified: verified.get(stored.id) || null,
          },
        });
      }
    } catch {
      // A single unreadable historical summary must not hide the rest.
    }
  }
  return packages.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function closeoutStepError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

async function validateStoredCloseoutFoundation(value, options = {}) {
  const brainRoot = resolve(
    options.brainRoot || process.env.MEETING_CLOSEOUT_BRAIN_ROOT || DEFAULT_BRAIN_ROOT
  );
  for (const key of ["transcript", "summary", "taskSpec", "runReport", "infographicStatus"]) {
    const relative = value?.files?.[key];
    if (!relative) return false;
    try {
      await readFile(safePath(brainRoot, ...relative.split("/")));
    } catch {
      return false;
    }
  }
  return true;
}

async function validateGeneratedCloseoutVisual(value, options = {}) {
  if (!value?.infographicId || !value?.visual?.sha256) return false;
  const brainRoot = resolve(
    options.brainRoot || process.env.MEETING_CLOSEOUT_BRAIN_ROOT || DEFAULT_BRAIN_ROOT
  );
  try {
    const saved = await readVerifiedMeetingInfographic(brainRoot, value.infographicId);
    return Boolean(saved?.sha256 && saved.sha256 === value.visual.sha256);
  } catch {
    return false;
  }
}

async function inspectMeetingCloseoutDisplay(value, options = {}) {
  const brainRoot = resolve(
    options.brainRoot || process.env.MEETING_CLOSEOUT_BRAIN_ROOT || DEFAULT_BRAIN_ROOT
  );
  const displayRoot = resolve(
    options.infographicsRoot ||
      (options.brainRoot
        ? join(brainRoot, "natively", "meeting-infographics")
        : process.env.IPCORP_MEETING_INFOGRAPHICS_PATH ||
          join(brainRoot, "natively", "meeting-infographics"))
  );
  const saved = value?.infographic?.saved;
  if (!saved?.id || !saved.file || !saved.sha256) {
    return { ready: false, reason: "missing visual association" };
  }
  try {
    const bytes = await readFile(safePath(displayRoot, saved.id, saved.file));
    const image = inspectPng(bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return {
      ready: sha256 === saved.sha256,
      sha256,
      width: image.width,
      height: image.height,
      reason: sha256 === saved.sha256 ? null : "display image hash mismatch",
    };
  } catch (error) {
    return {
      ready: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function createMeetingCloseoutSteps(options = {}) {
  return [
    {
      name: "discover",
      getInput: ({ input }) => input,
      run: async ({ stepInput: payload }) => {
        const meeting = normalizeMeeting(payload.meeting || {});
        if (!asText(meeting.title) || meeting.title === "Untitled meeting") {
          throw closeoutStepError("invalid_meeting", "Select a meeting before processing.");
        }
        const suppliedTranscript = asText(payload.transcript);
        const declaredSource = payload.transcriptSource;
        const source =
          declaredSource === "teams" || declaredSource === "cluely"
            ? declaredSource
            : suppliedTranscript
              ? "cluely"
              : "teams";
        const evidence = suppliedTranscript ? null : await meetingEvidence(meeting, options);
        const transcript = suppliedTranscript || asText(evidence?.transcript);
        if (!transcript || transcriptError(transcript)) {
          throw closeoutStepError(
            "transcript_unavailable",
            "No Teams capture is available for this meeting. Paste the Cluely transcript and add any context notes.",
            { meeting }
          );
        }
        return { meeting, suppliedTranscript, source, evidence, transcript };
      },
      validate: ({ output }) => Boolean(output?.meeting?.title && output?.transcript),
    },
    {
      name: "reconcile_sources",
      getInput: ({ outputs }) => outputs.discover,
      run: async ({ stepInput: discovery }) => {
        let transcript = discovery.transcript;
        if (discovery.suppliedTranscript && transcriptNeedsCleanup(transcript)) {
          try {
            transcript = await cleanupPastedTranscript(
              { meeting: discovery.meeting, transcript },
              options.runModel
            );
          } catch (error) {
            throw closeoutStepError(
              "transcript_cleanup_unavailable",
              `The raw capture could not be cleaned to Teams quality: ${error instanceof Error ? error.message : String(error)} The meeting stays unprocessed and nothing raw was stored.`,
              { meeting: discovery.meeting }
            );
          }
        }
        try {
          const transcriptContext = await prepareTranscriptContext(
            { meeting: discovery.meeting, transcript, source: discovery.source },
            options
          );
          return { ...discovery, transcript: transcriptContext.text, transcriptContext };
        } catch (error) {
          const detail =
            error.code === "transcript_abridged"
              ? "The transcript came back as an excerpt, not the whole conversation, so no line in it can be quoted as verbatim evidence. The meeting stays unprocessed. Fetch the full Teams transcript or paste the capture."
              : error.code === "transcript_partial"
                ? `${error.message} The meeting stays unprocessed. Fetch the full Teams transcript or paste the capture.`
                : error.code === "transcript_consolidation_unavailable"
                  ? `Transcript consolidation failed: ${error.message} The meeting stays unprocessed and no package was written.`
                  : "No usable transcript source is available for this meeting. Paste the Cluely transcript and add any context notes.";
          throw closeoutStepError(error.code || "transcript_unavailable", detail, {
            meeting: discovery.meeting,
          });
        }
      },
      validate: ({ output }) => Boolean(output?.transcriptContext?.text && output?.transcript),
    },
    {
      name: "synthesize",
      getInput: ({ input, outputs }) => ({
        reconciled: outputs.reconcile_sources,
        contextNotes: input.contextNotes,
      }),
      run: async ({ stepInput }) => {
        const { reconciled, contextNotes } = stepInput;
        try {
          return await synthesizeReviewPackage(
            {
              meeting: reconciled.meeting,
              transcript: reconciled.transcript,
              contextNotes,
              recap: reconciled.evidence?.recap || "",
              relatedMaterial: reconciled.evidence?.relatedMaterial || [],
            },
            options.runModel
          );
        } catch (error) {
          throw closeoutStepError(
            "synthesis_unavailable",
            `Meeting review synthesis failed: ${error instanceof Error ? error.message : String(error)} The meeting stays unprocessed; run it again when the model is reachable.`,
            { meeting: reconciled.meeting }
          );
        }
      },
      validate: ({ output }) => Boolean(output?.id && output?.summary),
    },
    {
      name: "store",
      getInput: ({ outputs }) => ({
        synthesis: outputs.synthesize,
        reconciled: outputs.reconcile_sources,
      }),
      run: ({ stepInput }) =>
        persistMeetingPackage(
          stepInput.synthesis,
          stepInput.reconciled.transcript,
          stepInput.reconciled.source,
          {
            ...options,
            transcriptContext: stepInput.reconciled.transcriptContext,
            deferInfographic: true,
          }
        ),
      validate: ({ output }) => validateStoredCloseoutFoundation(output, options),
    },
    {
      name: "generate_visual",
      getInput: ({ outputs }) => ({
        synthesis: outputs.synthesize,
        transcriptContext: outputs.reconcile_sources.transcriptContext,
        stored: outputs.store,
      }),
      run: async ({ stepInput }) => {
        try {
          return await generateMeetingCloseoutVisual(
            stepInput.synthesis,
            stepInput.transcriptContext,
            {
              ...options,
              throwOnInfographicFailure: true,
            }
          );
        } catch (error) {
          error.partialPackage = stepInput.stored;
          error.meeting = stepInput.synthesis.meeting;
          throw error;
        }
      },
      validate: ({ output }) => validateGeneratedCloseoutVisual(output, options),
    },
    {
      name: "associate",
      getInput: ({ outputs }) => ({
        synthesis: outputs.synthesize,
        reconciled: outputs.reconcile_sources,
        stored: outputs.store,
        visual: outputs.generate_visual.visual,
      }),
      run: ({ stepInput }) =>
        persistMeetingPackage(
          stepInput.synthesis,
          stepInput.reconciled.transcript,
          stepInput.reconciled.source,
          {
            ...options,
            transcriptContext: stepInput.reconciled.transcriptContext,
            visual: stepInput.visual,
          }
        ),
      validate: async ({ output }) => {
        const inspection = await inspectStoredMeetingPackage(output, options);
        return Boolean(
          inspection.complete &&
            inspection.associated &&
            inspection.visual?.sha256 === output?.infographic?.saved?.sha256
        );
      },
    },
    {
      name: "verify_display",
      getInput: ({ outputs }) => outputs.associate,
      run: async ({ stepInput: associated }) => {
        const inspection = await inspectStoredMeetingPackage(associated, options);
        const display = await inspectMeetingCloseoutDisplay(associated, options);
        if (!inspection.complete || !display.ready) {
          const missing = [
            ...inspection.missing,
            ...(display.ready ? [] : ["Workbench image response"]),
          ];
          throw closeoutStepError(
            "meeting_package_incomplete",
            `Meeting processing is incomplete: ${missing.join(", ") || "saved association or history"}.`,
            {
              meeting: associated.meeting,
              partialPackage: associated,
              inspection: { ...inspection, display },
            }
          );
        }
        return { ...inspection, display };
      },
      validate: ({ output }) =>
        Boolean(
          output?.complete && output?.associated && output?.visual?.sha256 && output?.display?.ready
        ),
    },
    {
      name: "finalize",
      getInput: ({ outputs }) => ({
        package: outputs.associate,
        inspection: outputs.verify_display,
      }),
      run: async ({ stepInput }) => {
        if (shouldRefreshSnapshot(options)) triggerSnapshotSync();
        return { ok: true, ...stepInput };
      },
      validate: ({ output }) => Boolean(output?.ok && output?.inspection?.complete),
    },
  ];
}

export async function runMeetingCloseoutStages(payload, options = {}) {
  const outputs = {};
  for (const step of createMeetingCloseoutSteps(options)) {
    const stepInput = await step.getInput({ input: payload, outputs });
    const output = await step.run({ stepInput, input: payload, outputs });
    if ((await step.validate({ output })) !== true) {
      throw closeoutStepError(
        "meeting_closeout_step_invalid",
        `Meeting closeout step ${step.name} did not produce a valid saved result.`
      );
    }
    outputs[step.name] = output;
  }
  return outputs.finalize;
}

export async function processMeetingCloseout(payload, options = {}) {
  try {
    return await runMeetingCloseoutStages(payload, options);
  } catch (error) {
    if (error.code === "invalid_meeting") throw error;
    if (error.partialPackage) {
      const inspection =
        error.inspection || (await inspectStoredMeetingPackage(error.partialPackage, options));
      return {
        ok: false,
        code:
          error.code === "meeting_package_incomplete" ? error.code : "meeting_package_incomplete",
        detail:
          error.code === "meeting_package_incomplete"
            ? error.message
            : `Meeting processing is incomplete: ${inspection.missing.join(", ") || "saved association or history"}.`,
        meeting: error.meeting,
        package: error.partialPackage,
        inspection,
      };
    }
    if (
      [
        "transcript_unavailable",
        "transcript_cleanup_unavailable",
        "transcript_abridged",
        "transcript_partial",
        "transcript_consolidation_unavailable",
        "synthesis_unavailable",
      ].includes(error.code)
    ) {
      return {
        ok: false,
        code: error.code,
        detail: error.message,
        meeting: error.meeting || normalizeMeeting(payload.meeting || {}),
      };
    }
    throw error;
  }
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
    const force = url.searchParams.get("force") === "1";
    return { status: 200, body: { ok: true, data: await listTodaysMeetings({ force }) } };
  }
  if (request.method === "GET" && url.pathname === "/api/meeting-closeout/packages") {
    return { status: 200, body: { ok: true, data: await listStoredPackages() } };
  }
  if (request.method === "GET" && url.pathname === "/api/meeting-closeout/jobs") {
    const { listMeetingCloseoutJobs } = await import("./meeting-closeout-job.mjs");
    return { status: 200, body: { ok: true, data: await listMeetingCloseoutJobs() } };
  }
  const jobRoute = url.pathname.match(
    /^\/api\/meeting-closeout\/jobs\/([^/]+)(?:\/(stop|resume))?$/
  );
  if (jobRoute) {
    const workItemId = decodeURIComponent(jobRoute[1]);
    const operation = jobRoute[2] || null;
    const { getMeetingCloseoutJob, resumeMeetingCloseoutJob, stopMeetingCloseoutJob } =
      await import("./meeting-closeout-job.mjs");
    if (request.method === "GET" && !operation) {
      const job = await getMeetingCloseoutJob(workItemId);
      return job
        ? { status: 200, body: { ok: true, job } }
        : {
            status: 404,
            body: {
              ok: false,
              code: "meeting_job_not_found",
              error: "Meeting job not found.",
            },
          };
    }
    if (request.method === "POST" && operation === "stop") {
      const job = await stopMeetingCloseoutJob(workItemId);
      return job
        ? { status: 200, body: { ok: true, job } }
        : {
            status: 404,
            body: {
              ok: false,
              code: "meeting_job_not_found",
              error: "Meeting job not found.",
            },
          };
    }
    if (request.method === "POST" && operation === "resume") {
      const resumed = await resumeMeetingCloseoutJob(workItemId);
      return { status: 202, body: { ok: true, ...resumed } };
    }
  }
  if (request.method === "POST" && url.pathname === "/api/meeting-closeout/process") {
    try {
      const payload = await readJsonBody(request);
      const { startMeetingCloseoutJob } = await import("./meeting-closeout-job.mjs");
      const started = await startMeetingCloseoutJob(payload);
      return { status: started.accepted ? 202 : 200, body: { ok: true, ...started } };
    } catch (error) {
      return {
        status: error.code === "body_too_large" ? 413 : 400,
        body: { ok: false, code: error.code || "closeout_failed", error: error.message },
      };
    }
  }
  return { status: 404, body: { ok: false, error: "Meeting closeout route not found." } };
}
