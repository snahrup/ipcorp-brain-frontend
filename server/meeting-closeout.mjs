import { execFile, spawn } from "node:child_process";
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

const SPEAKER_TURN = /^[^\n:]{1,60}:\s*\S/m;

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
// Model synthesis. The review package is written by an actual model reading
// the whole transcript, not by keyword patterns. Pattern matching produced
// review items like "Well, I'll drive you up the wall" as a commitment, which
// poisons everything downstream. There is deliberately NO heuristic fallback:
// if synthesis fails, the meeting stays unprocessed rather than storing junk.
// ---------------------------------------------------------------------------

const SYNTHESIS_TIMEOUT_MS = 10 * 60_000;

function synthesisPromptFile() {
  return join(
    process.env.LOCALAPPDATA || join(process.env.USERPROFILE || ".", "AppData", "Local"),
    "IPCorpBrain",
    "meeting-closeout",
    `synthesis-prompt.${process.pid}.${Date.now()}.md`
  );
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
          "claude",
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
  let value;
  try {
    value = await synthesizeReviewPackage(
      {
        meeting,
        transcript,
        contextNotes: payload.contextNotes,
        recap: evidence?.recap || "",
        relatedMaterial: evidence?.relatedMaterial || [],
      },
      options.runModel
    );
  } catch (error) {
    // Fail closed. A meeting with no package is recoverable; a stored package
    // full of pattern-matched junk poisons every downstream review.
    return {
      ok: false,
      code: "synthesis_unavailable",
      detail: `Meeting review synthesis failed: ${error instanceof Error ? error.message : String(error)} The meeting stays unprocessed; run it again when the model is reachable.`,
      meeting,
    };
  }
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
    const force = url.searchParams.get("force") === "1";
    return { status: 200, body: { ok: true, data: await listTodaysMeetings({ force }) } };
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
