import { createHash } from "node:crypto";

const SOURCE_STATES = new Set([
  "loading",
  "current",
  "empty",
  "partial",
  "unavailable",
  "not_authorized",
  "timed_out",
  "malformed",
  "failed",
  "canceled",
]);

function text(value, max = 1_200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function iso(value) {
  const candidate = text(value, 80);
  if (!candidate) return null;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function cleanReference(value) {
  return text(value, 320)
    .replace(/([?&](?:token|sig|key|code|auth|password|secret)=)[^&\s]+/gi, "$1[removed]")
    .replace(/\s+/g, " ");
}

function safeLink(value) {
  const candidate = text(value, 1_000);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:") return null;
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function meetingRecord(value, fallback) {
  const input = value && typeof value === "object" ? value : {};
  const start = iso(input.start || input.startDate || fallback.eventAt);
  return {
    id: text(input.id || input.meetingId || fallback.providerItemId, 240) || fallback.stableId,
    title: text(input.title || input.subject || fallback.title, 240) || "Untitled meeting",
    start,
    end: iso(input.end || input.endDate),
    organizer: text(input.organizer?.name || input.organizer, 160) || null,
    attendees: Array.isArray(input.attendees)
      ? input.attendees
          .map((item) => text(item?.name || item?.displayName || item, 160))
          .filter(Boolean)
          .slice(0, 50)
      : [],
  };
}

function jiraReferenceKind(value) {
  const normalized = text(value, 40).toLowerCase().replace(/[ -]+/g, "_");
  return new Set(["direct", "quoted", "forwarded", "copied", "attachment", "stored_link"]).has(
    normalized
  )
    ? normalized
    : "unknown";
}

export function normalizeSourceState(value, itemCount = 0) {
  const normalized = text(value, 40).toLowerCase().replace(/[ -]+/g, "_");
  if (SOURCE_STATES.has(normalized)) return normalized;
  return itemCount > 0 ? "current" : "empty";
}

export function evidenceIdentity(sourceId, input) {
  const providerItemId = text(
    input?.providerItemId || input?.itemId || input?.messageId || input?.id,
    320
  );
  if (providerItemId) return `${sourceId}:${providerItemId}`;
  const participantValues = [
    ...(Array.isArray(input?.participants) ? input.participants : []),
    ...(Array.isArray(input?.attendees) ? input.attendees : []),
    ...(Array.isArray(input?.meeting?.attendees) ? input.meeting.attendees : []),
  ]
    .map((item) => text(item?.name || item?.displayName || item, 120).toLowerCase())
    .filter(Boolean)
    .sort();
  const derived = [
    sourceId,
    iso(input?.eventAt || input?.date || input?.createdAt) || "",
    cleanReference(input?.sourceReference || input?.reference),
    text(input?.title || input?.subject, 240).toLowerCase(),
    participantValues.join(","),
  ].join("|");
  return `${sourceId}:derived:${digest(derived)}`;
}

export function normalizeEvidence(sourceId, input, observedAt) {
  const source = input && typeof input === "object" ? input : {};
  const stableId = evidenceIdentity(sourceId, source);
  const providerItemId =
    text(source.providerItemId || source.itemId || source.messageId || source.id, 320) || null;
  const eventAt = iso(source.eventAt || source.date || source.createdAt || source.sentAt);
  const updatedAt = iso(source.updatedAt || source.modifiedAt || source.receivedAt);
  const title = text(source.title || source.subject, 240) || "Untitled activity";
  const summary = text(source.summary || source.detail || source.bodyPreview, 1_200);
  const status = text(source.status, 80) || "unclear";
  const jiraKey = text(source.jiraKey, 20).toUpperCase() || null;
  const linkedJiraKey = text(source.linkedJiraKey, 20).toUpperCase() || null;
  const referenceKind = jiraReferenceKind(source.jiraReferenceKind);
  const jiraContextSignals = Array.isArray(source.jiraContextSignals)
    ? source.jiraContextSignals
        .map((item) => text(item, 160))
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const sourceReference = cleanReference(source.sourceReference || source.reference);
  const transcript = text(source.transcript || source.verbatimTranscript, 2_000_000);
  const meeting =
    sourceId === "teams_meeting_transcripts"
      ? meetingRecord(source.meeting, { stableId, providerItemId, eventAt, title })
      : null;
  const contentHash = digest(
    JSON.stringify({
      sourceId,
      title,
      summary,
      status,
      jiraKey,
      linkedJiraKey,
      jiraReferenceKind: referenceKind,
      jiraContextSignals,
      sourceReference,
      eventAt,
      updatedAt,
      transcriptHash: transcript ? digest(transcript) : null,
      worklogMinutes: Number(source.worklogMinutes) || 0,
      email: source.suggestedEmail || null,
      meeting,
      contentDigest: text(source.contentDigest, 128) || null,
    })
  );
  const base = {
    stableId,
    providerItemId,
    sourceId,
    title,
    summary,
    status,
    jiraKey,
    linkedJiraKey,
    jiraReferenceKind: referenceKind,
    jiraContextSignals,
    sourceReference,
    link: safeLink(source.link || source.webUrl),
    eventAt,
    updatedAt,
    firstObservedAt: observedAt,
    contentHash,
    worklogMinutes: Math.max(0, Math.min(1_440, Number(source.worklogMinutes) || 0)),
    actionable: source.actionable !== false,
    transcriptReady: Boolean(source.transcriptReady ?? transcript),
    meeting,
    suggestedEmail: null,
  };
  if (source.suggestedEmail && typeof source.suggestedEmail === "object") {
    const email = source.suggestedEmail;
    base.suggestedEmail = {
      to: text(email.to, 240) || null,
      subject: text(email.subject, 240) || `${title} follow-up`,
      body: text(email.body, 4_000),
    };
  }
  return {
    record: base,
    runtime: {
      ...base,
      transcript,
      rawMeeting: source.meeting && typeof source.meeting === "object" ? source.meeting : null,
    },
  };
}

export function classifyEvidence(previous, current) {
  if (!previous) return "new";
  return previous.contentHash === current.contentHash ? "unchanged" : "changed";
}

export function displaySourceState(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}
