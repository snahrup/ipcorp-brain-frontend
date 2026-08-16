import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Reads the authoritative Brain markdown and produces the JSON the Workbench renders.
 *
 * Before this existed, four datasets were never refreshed:
 *   - meeting-index came from natively/, a capture lane that stopped producing on
 *     2026-06-11, so the app showed 7 meetings when the Brain held 217.
 *   - open-questions, risks and adrs were read back out of the app's own data/
 *     directory, so `sync:data` copied stale files onto themselves forever.
 *
 * Everything here parses the same markdown a person would read, so the app cannot
 * drift from the Brain again.
 */

const readText = (p) => fs.readFileSync(p, "utf8");

/** Split a GitHub-style markdown table into row objects keyed by header. */
export function parseTables(md) {
  const tables = [];
  const lines = md.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim().startsWith("|")) {
      i += 1;
      continue;
    }
    const sep = lines[i + 1] || "";
    if (!/^\s*\|[\s:|-]+\|\s*$/.test(sep)) {
      i += 1;
      continue;
    }
    const cells = (s) =>
      s
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());
    const headers = cells(line);
    const rows = [];
    let j = i + 2;
    while (j < lines.length && lines[j].trim().startsWith("|")) {
      const values = cells(lines[j]);
      if (values.length === headers.length) {
        rows.push(Object.fromEntries(headers.map((h, k) => [h, values[k]])));
      }
      j += 1;
    }
    tables.push({ headers, rows, startLine: i });
    i = j;
  }
  return tables;
}

/** Which `##` / `###` heading a line falls under. */
function headingAt(md, lineIndex) {
  const lines = md.split(/\r?\n/);
  let h2 = "";
  let h3 = "";
  for (let i = 0; i <= lineIndex && i < lines.length; i += 1) {
    const m2 = lines[i].match(/^##\s+(.*)$/);
    const m3 = lines[i].match(/^###\s+(.*)$/);
    if (m2 && !lines[i].startsWith("###")) {
      h2 = m2[1].trim();
      h3 = "";
    } else if (m3) {
      h3 = m3[1].trim();
    }
  }
  return { h2, h3 };
}

const strip = (s) =>
  (s || "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim();

export function buildOpenQuestions(brain) {
  const file = path.join(brain, "core/project-memory/open-questions.md");
  if (!fs.existsSync(file)) return null;
  const md = readText(file);
  const out = [];
  for (const t of parseTables(md)) {
    if (!t.headers.includes("ID") || !t.headers.includes("Question")) continue;
    const { h2, h3 } = headingAt(md, t.startLine);
    if (!/^open$/i.test(h2)) continue; // Resolved questions stay out of the app
    for (const r of t.rows) {
      if (!/^DQ-/i.test(r.ID || "")) continue;
      out.push({
        id: strip(r.ID),
        priority: h3 || "Open",
        question: strip(r.Question),
        answerOwner: strip(r["Answer-owner"] || r.Owner || ""),
        target: strip(r.Target || ""),
        status: strip(r.Status || "open"),
      });
    }
  }
  return out.length ? out : null;
}

export function buildRisks(brain) {
  const file = path.join(brain, "core/project-memory/risk-register.md");
  if (!fs.existsSync(file)) return null;
  const md = readText(file);
  const out = [];
  for (const t of parseTables(md)) {
    if (!t.headers.includes("ID") || !t.headers.includes("Risk")) continue;
    const { h2 } = headingAt(md, t.startLine);
    if (/retired|closed|resolved/i.test(h2)) continue;
    for (const r of t.rows) {
      if (!/^R-/i.test(r.ID || "")) continue;
      out.push({
        id: strip(r.ID),
        risk: strip(r.Risk),
        severity: strip(r.Severity || ""),
        likelihood: strip(r.Likelihood || ""),
        exposed: strip(r.Exposed || ""),
        mitigation: strip(r.Mitigation || ""),
        owner: strip(r.Owner || ""),
        lastReviewed: strip(r["Last reviewed"] || ""),
      });
    }
  }
  return out.length ? out : null;
}

export function buildAdrs(brain) {
  const dir = path.join(brain, "core/project-memory/decisions");
  if (!fs.existsSync(dir)) return null;
  const adrs = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const m = name.match(/^ADR-(\d{4})-(.*)\.md$/);
    if (!m) continue;
    const md = readText(path.join(dir, name));
    const title = (md.match(/^#\s*ADR-\d+\s*[—:-]\s*(.*)$/m) || [])[1] || m[2];

    // Two header styles are in use:
    //   **Status**: proposed          (ADR-0001..0003)
    //   > **Status:** proposed        (ADR-0004..0009, inside a blockquote)
    const field = (...labels) => {
      for (const label of labels) {
        const re = new RegExp(`^>?\\s*\\*\\*${label}\\s*:?\\*\\*\\s*:?\\s*(.*?)\\s*$`, "im");
        const hit = (md.match(re) || [])[1];
        if (hit) return strip(hit);
      }
      return "";
    };

    const supersedes = field("Supersedes");
    adrs.push({
      // App renders ADR-{number.slice(-4)}, so the 4-digit id must end the string.
      number: `${m[1]}${m[1]}`,
      title: strip(title),
      status: field("Status") || "proposed",
      date: field("Date"),
      decider: field("Decider", "Decision-makers \\(pending\\)", "Decision-makers", "Author"),
      supersedes: supersedes && !/^none$/i.test(supersedes) ? supersedes : "—",
      slug: name.replace(/\.md$/, ""),
    });
  }

  const candidates = [];
  const candFile = path.join(dir, "_ADR_CANDIDATES.md");
  if (fs.existsSync(candFile)) {
    const md = readText(candFile);
    for (const t of parseTables(md)) {
      if (!t.headers.some((h) => /date flagged/i.test(h))) continue;
      for (const r of t.rows) {
        const dateKey = t.headers.find((h) => /date flagged/i.test(h));
        const srcKey = t.headers.find((h) => /source/i.test(h));
        candidates.push({
          dateFlagged: strip(r[dateKey]),
          topic: strip(r.Topic || ""),
          source: strip(r[srcKey] || ""),
          status: strip(r.Status || "candidate"),
        });
      }
    }
  }
  return adrs.length ? { adrs, candidates } : null;
}

/**
 * Index the meeting infographics so a meeting record can carry its own picture.
 *
 * Folder names mostly match the summary slug exactly. The older capture lane appended a
 * short hash, so anything that does not match exactly falls back to same-day matching
 * with a token-overlap check, which is strict enough not to attach the wrong picture.
 */
function indexInfographics(brain) {
  const root = path.join(brain, "natively/meeting-infographics");
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const folder of fs.readdirSync(root)) {
    const dir = path.join(root, folder);
    if (!fs.statSync(dir).isDirectory()) continue;
    const pngs = fs
      .readdirSync(dir)
      .filter((file) => file.toLowerCase().endsWith(".png"))
      .sort((left, right) => left.localeCompare(right));
    let status = null;
    try {
      status = JSON.parse(fs.readFileSync(path.join(dir, "status.json"), "utf8"));
    } catch {
      // An image without a readable receipt is not reviewable and must stay hidden.
    }
    const legacyLocalCard =
      status?.sourceSpec === "docs/handoff/2026-07-30-chatgpt-infographic-spec.md" ||
      (status?.status === "generated_review_pending" && Boolean(status?.sourceHtml));
    const statusName = String(status?.status || status?.verification?.artifactStatus || "")
      .trim()
      .toLowerCase();
    const reviewName = String(status?.visualQualityReview?.status || "")
      .trim()
      .toLowerCase();
    const rejectedStatus = /blocked|pending|failed|error|rejected|placeholder/.test(statusName);
    const rejectedReview = /pending|failed|error|rejected|blocked/.test(reviewName);
    const explicitlyUnselected = ["output", "outputFile", "selectedOutput"].some(
      (key) => Object.hasOwn(status || {}, key) && status[key] === null
    );
    const generatedArtifact = Boolean(
      status?.artifactId || status?.notebookId || status?.provider === "codex"
    );
    if (
      !status ||
      legacyLocalCard ||
      !generatedArtifact ||
      rejectedStatus ||
      rejectedReview ||
      explicitlyUnselected
    ) {
      continue;
    }
    const candidates = [
      status?.output?.file,
      status?.outputFile,
      status?.pngFile,
      status?.infographicPath ? path.basename(status.infographicPath) : null,
      status?.file,
    ].filter((file) => typeof file === "string" && path.basename(file) === file);
    const png =
      candidates.find((file) => pngs.includes(file)) || (pngs.length === 1 ? pngs[0] : null);
    if (!png) continue;
    const day = (folder.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1];
    if (!day) continue;
    // Drop the trailing hash the old lane appended so slugs compare cleanly.
    const slug = folder.slice(11).replace(/-[0-9a-f]{6,}$/i, "");
    out.push({ folder, file: png, day, tokens: new Set(slug.split("-").filter(Boolean)) });
  }
  return out;
}

function matchInfographic(index, day, slug) {
  const sameDay = index.filter((entry) => entry.day === day);
  if (sameDay.length === 0) return null;

  const exact = sameDay.find(
    (entry) => `${entry.day}-${entry.folder.slice(11)}` === `${day}-${slug}`
  );
  if (exact) return exact;

  const wanted = new Set(slug.split("-").filter(Boolean));
  let best = null;
  let bestScore = 0;
  for (const entry of sameDay) {
    let shared = 0;
    for (const token of wanted) if (entry.tokens.has(token)) shared += 1;
    const score = shared / Math.min(wanted.size, entry.tokens.size || 1);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return bestScore >= 0.5 && best ? best : null;
}

/**
 * Second pass over whatever the name match could not place.
 *
 * The infographic folders were named from calendar subjects while the summaries use our
 * own slugs, so the same meeting frequently shares no words at all between the two. When
 * a day has exactly one unclaimed infographic and exactly one meeting still without one,
 * the pairing is unambiguous regardless of wording.
 */
// Words that say nothing about which meeting this is, plus the trailing capture hash.
const PAIR_NOISE = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "up",
  "weekly",
  "biweekly",
  "bi",
  "monthly",
  "daily",
  "meeting",
  "session",
  "call",
]);

const DUPLICATE_MEETING_ALIASES = new Map([
  [
    "2026-08-04-purview-subscription-decision-and-owner-steward-confirmation",
    "2026-08-04-purview-subscription-decision",
  ],
  ["2026-08-03-weekly-dev-data-stand-up", "2026-08-03-dev-data-standup"],
  ["2026-05-07-weekly-fabric-check-in", "2026-05-07-weekly-fabric-checkin"],
  ["2026-05-06-fabric-weekly-stand-up", "2026-05-06-fabric-weekly-standup"],
  ["2026-04-28-bi-weekly-demand-management-meeting", "2026-04-28-biweekly-demand-management"],
  ["2026-04-27-nahrup-1-on-1", "2026-04-27-nahrup-1on1-with-patrick"],
]);

function consolidateDuplicateMeetings(meetings) {
  const byId = new Map(meetings.map((meeting) => [meeting.id, meeting]));
  const removed = new Set();
  for (const [aliasId, preferredId] of DUPLICATE_MEETING_ALIASES) {
    const alias = byId.get(aliasId);
    const preferred = byId.get(preferredId);
    if (!alias || !preferred) continue;
    preferred.infographic ||= alias.infographic;
    preferred.attendees ||= alias.attendees;
    preferred.duration ||= alias.duration;
    preferred.summary ||= alias.summary;
    preferred.followUps ||= alias.followUps;
    removed.add(aliasId);
  }
  return meetings.filter((meeting) => !removed.has(meeting.id));
}

function pairTokens(slug) {
  return new Set(
    slug
      .replace(/^\d{4}-\d{2}-\d{2}-/, "")
      .replace(/-[0-9a-f]{8}$/, "")
      .split("-")
      .filter((t) => t.length > 2 && !PAIR_NOISE.has(t))
  );
}

/**
 * Same day and nothing else is not enough to say two records are the same meeting.
 * Requires the two names to share at least one meaningful word, because attaching one
 * meeting's picture to another meeting's record is worse than attaching none.
 */
function looksLikeSameMeeting(meetingId, folder) {
  const a = pairTokens(meetingId);
  const b = pairTokens(folder);
  for (const t of a) if (b.has(t)) return true;
  return false;
}

function pairLeftoversByDay(meetings, infographics, claimed) {
  const freeByDay = new Map();
  for (const entry of infographics) {
    if (claimed.has(entry.folder)) continue;
    freeByDay.set(entry.day, [...(freeByDay.get(entry.day) ?? []), entry]);
  }
  const needByDay = new Map();
  for (const meeting of meetings) {
    if (meeting.infographic) continue;
    needByDay.set(meeting.day, [...(needByDay.get(meeting.day) ?? []), meeting]);
  }
  let paired = 0;
  const rejected = [];
  for (const [day, free] of freeByDay) {
    const need = needByDay.get(day) ?? [];
    if (free.length !== 1 || need.length !== 1) continue;
    if (!looksLikeSameMeeting(need[0].id, free[0].folder)) {
      rejected.push(`${need[0].id} !~ ${free[0].folder}`);
      continue;
    }
    need[0].infographic = { id: free[0].folder, file: free[0].file };
    claimed.add(free[0].folder);
    paired += 1;
  }
  if (rejected.length) {
    // Say what was dropped. A silent skip reads as "nothing matched that day".
    console.log(`  same-day pairs rejected as different meetings: ${rejected.length}`);
    for (const r of rejected) console.log(`    ${r}`);
  }
  return paired;
}

/**
 * Decode the closeout package embedded in a summary and flatten the promised
 * work into short, typed follow-up entries. Anything malformed yields [] —
 * a card with no follow-ups beats a card with invented ones.
 */
export function extractFollowUps(md) {
  const markers = [...md.matchAll(/<!--\s*WORKBENCH_CLOSEOUT_JSON\s+([A-Za-z0-9+/=]+)\s*-->/g)];
  if (!markers.length) return [];
  let pkg;
  try {
    pkg = JSON.parse(Buffer.from(markers[markers.length - 1][1], "base64").toString("utf8"));
  } catch {
    return [];
  }
  const out = [];
  for (const c of pkg.commitments ?? []) {
    const text = strip(String(c.text ?? c.title ?? ""));
    if (text) out.push({ kind: "commitment", text, owner: c.owner || "Steve" });
  }
  for (const d of pkg.documentRequests ?? []) {
    const text = strip(String(d.text ?? ""));
    if (text) out.push({ kind: "document-request", text, owner: d.owner || undefined });
  }
  for (const r of pkg.reminderCandidates ?? []) {
    const text = strip(String(r.text ?? ""));
    if (text) out.push({ kind: "reminder", text, when: r.timing || undefined });
  }
  for (const j of pkg.jiraProposals ?? []) {
    const text = strip(String(j.title ?? ""));
    const jiraKey = /^(?:MT|IPC)-\d+$/i.test(String(j.jiraKey ?? "").trim())
      ? String(j.jiraKey).trim().toUpperCase()
      : undefined;
    if (text) {
      out.push({
        kind: "jira-change",
        text,
        operation: j.operation || undefined,
        jiraKey,
      });
    }
  }
  return out.slice(0, 16);
}

function normalizedActionText(value) {
  return strip(String(value ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function meetingActionId(meetingId, item) {
  const identity = [
    meetingId,
    item?.kind,
    normalizedActionText(item?.text),
    normalizedActionText(item?.owner),
    normalizedActionText(item?.when),
    normalizedActionText(item?.operation),
    String(item?.jiraKey ?? "").toUpperCase(),
  ].join("\n");
  const suffix = createHash("sha256").update(identity).digest("hex").slice(0, 16);
  return `meeting-action-${meetingId}-${suffix}`;
}

/** One entry per file in core/meetings/summaries. */
export function buildMeetings(brain) {
  const infographics = indexInfographics(brain);
  // A folder may only ever be claimed by one meeting, so a day with two meetings and
  // one picture cannot attach the same image to both.
  const claimed = new Set();
  const dir = path.join(brain, "core/meetings/summaries");
  if (!fs.existsSync(dir)) return null;
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const m = name.match(/^(\d{4}-\d{2}-\d{2})-(.*)\.md$/);
    if (!m) continue;
    if (/PRE-INGESTION|_RUN_REPORT|^_/.test(name)) continue;
    const md = readText(path.join(dir, name));

    let title = (md.match(/^#\s+(.*)$/m) || [])[1] || m[2].replace(/-/g, " ");
    // Titles end with the date in several shapes: " - 2026-07-28", " (2026-07-29)",
    // " — 2026-07-28". None of that belongs in a card title next to a date chip.
    title = strip(title)
      .replace(/\s*[([]\s*\d{4}-\d{2}-\d{2}\s*[)\]]\s*$/, "")
      .replace(/\s*[—–-]\s*\d{4}-\d{2}-\d{2}\s*$/, "")
      .replace(/\s*[([]\s*[)\]]\s*$/, "")
      .replace(/\s*[—–-]\s*$/, "")
      .trim();

    if (
      /DID NOT OCCUR/i.test(title) ||
      /^\*\*No meeting happened\.\*\*/im.test(md) ||
      /^>\s*Note:\s*.*not a stakeholder meeting\b/im.test(md)
    ) {
      continue;
    }

    const meta = (md.match(/^>\s*Source:\s*(.*)$/m) || [])[1] || "";
    // Two summary generations exist. The old pipeline wrote a `> Source:`
    // meta line; the Workbench closeout writes bold labels. Read both, or the
    // Meetings Overview shows a card with nobody in the room.
    const attendees =
      (meta.match(/Attendees:\s*([^·]+)/) || [])[1] ||
      (md.match(/^\*\*Attendees:\*\*\s*(.*)$/m) || [])[1];
    const duration = (meta.match(/Duration:\s*~?\s*([^·]+)/) || [])[1];

    const summaryBlock =
      md.split(/^##\s+Summary\s*$/m)[1] || md.split(/^##\s+Executive readout\s*$/m)[1] || "";
    const summary = summaryBlock
      .split(/^##\s+/m)[0]
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith(">") && !s.startsWith("<!--"))[0];

    // The closeout embeds its whole review package as base64 JSON. That is
    // where the promised work lives: what Steve owes, to whom, and the Jira
    // changes recommended from the room. Decode the LAST marker (a re-run
    // appends a fresher one) and fail closed to an empty list.
    const meetingId = `${m[1]}-${m[2]}`;
    const followUps = extractFollowUps(md).map((item) => ({
      ...item,
      actionId: meetingActionId(meetingId, item),
    }));

    const art = matchInfographic(
      infographics.filter((entry) => !claimed.has(entry.folder)),
      m[1],
      m[2]
    );
    if (art) claimed.add(art.folder);

    out.push({
      id: meetingId,
      title,
      date: `${m[1]}T12:00:00.000Z`,
      day: m[1],
      duration: duration ? duration.trim() : undefined,
      attendees: attendees ? attendees.trim() : undefined,
      summary: summary ? strip(summary).slice(0, 600) : undefined,
      source: "Meeting notes",
      readinessStatus: "captured",
      infographic: art ? { id: art.folder, file: art.file } : undefined,
      followUps: followUps.length ? followUps : undefined,
      feedsPackets: [],
      feedsInsights: [],
    });
  }
  const meetings = consolidateDuplicateMeetings(out);
  pairLeftoversByDay(meetings, infographics, claimed);
  meetings.sort((a, b) => (a.day < b.day ? 1 : -1));
  return meetings.length ? meetings : null;
}

/**
 * Rebuild the meeting index the Workbench renders, keeping the shape the views expect
 * (`upcoming`, `active`, `recent`, `meetings`, `updatedAt`).
 */
export function buildMeetingIndex(brain, previous, today = new Date()) {
  const meetings = buildMeetings(brain);
  if (!meetings) return previous;
  const iso = today.toISOString().slice(0, 10);

  // Only keep prepared items that are genuinely still ahead of today. Showing a June
  // prep packet as "upcoming" on 2026-07-29 would be a plain factual error.
  const upcoming = (previous?.upcoming ?? []).filter((m) => {
    const when = (m.startsAt || m.date || "").slice(0, 10);
    return when && when >= iso;
  });

  return {
    ...previous,
    updatedAt: today.toISOString(),
    upcoming,
    active: [],
    recent: meetings.slice(0, 60),
    meetings,
    missingOrStalePackets: previous?.missingOrStalePackets ?? [],
    readinessSummary: {
      ...(previous?.readinessSummary ?? {}),
      status: "rebuilt-from-brain-summaries",
      meetingCount: meetings.length,
      newestMeeting: meetings[0]?.day,
      oldestMeeting: meetings[meetings.length - 1]?.day,
      droppedStalePrepared: (previous?.upcoming ?? []).length - upcoming.length,
    },
  };
}
