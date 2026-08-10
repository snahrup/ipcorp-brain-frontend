import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BRAIN_ROOT =
  process.env.IPCORP_BRAIN_ROOT ||
  "C:\\Users\\snahrup\\OneDrive - IP-Corporation\\ipcorp-architecture-brain";
const DEFAULT_SEED_PATH = path.resolve("data/frontend-seed.json");
const DEFAULT_GATEWAY = "http://127.0.0.1:8817/api";

export const AUDIT_CATEGORIES = {
  missingDisplayOnly: "missing-display-only",
  missingSavedArtifactOnly: "missing-saved-artifact-only",
  missingAssociationOnly: "missing-association-only",
  fullyMissing: "fully-missing",
};

const NOISE_TOKENS = new Set([
  "a",
  "an",
  "and",
  "biweekly",
  "call",
  "daily",
  "for",
  "from",
  "in",
  "meeting",
  "monthly",
  "of",
  "on",
  "session",
  "the",
  "to",
  "up",
  "weekly",
  "with",
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function dayForMeeting(meeting) {
  return (meeting.day || meeting.startsAt || meeting.date || "").slice(0, 10);
}

function normalizeWords(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(?:one|1)[\s_-]*on[\s_-]*(?:one|1)\b/g, " oneonone ")
    .replace(/\b1on1\b/g, " oneonone ")
    .replace(/\bstand[\s_-]*up\b/g, " standup ")
    .replace(/\bcheck[\s_-]*in\b/g, " checkin ")
    .replace(/\btouch[\s_-]*base\b/g, " touchbase ")
    .replace(/\b\d{4}[\s_-]\d{2}[\s_-]\d{2}\b/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compact(value) {
  return normalizeWords(value).replace(/\s+/g, "");
}

function cleanAuditText(value) {
  return String(value || "").replace(/[\u2013\u2014]/g, " - ");
}

function meaningfulTokens(value) {
  return new Set(
    normalizeWords(value)
      .split(/\s+/)
      .filter((token) => token.length > 1 && !NOISE_TOKENS.has(token))
  );
}

function overlapScore(left, right) {
  const a = meaningfulTokens(left);
  const b = meaningfulTokens(right);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  return shared / Math.min(a.size, b.size);
}

function nameScore(left, right) {
  const a = compact(left);
  const b = compact(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (Math.min(a.length, b.length) >= 10 && (a.includes(b) || b.includes(a))) return 0.94;
  return overlapScore(left, right);
}

function meetingNames(meeting) {
  return [
    meeting.id,
    String(meeting.id || "").replace(/^\d{4}-\d{2}-\d{2}-/, ""),
    meeting.title,
  ].filter(Boolean);
}

function packageNames(pkg) {
  const status = pkg.status || {};
  return [
    pkg.id,
    String(pkg.id || "").replace(/^\d{4}-\d{2}-\d{2}-/, ""),
    status.title,
    status.calendarTitle,
    status.meeting,
    status.artifactName,
    ...pkg.files.map((file) => file.replace(/\.(png|html)$/i, "")),
  ].filter(Boolean);
}

function packageScore(meeting, pkg) {
  let best = 0;
  for (const left of meetingNames(meeting)) {
    for (const right of packageNames(pkg)) {
      best = Math.max(best, nameScore(left, right));
    }
  }
  return best;
}

function walkFiles(root, accept) {
  const found = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (accept(entry.name)) found.push(full);
    }
  };
  visit(root);
  return found;
}

function readSummaryIndex(brainRoot) {
  const root = path.join(brainRoot, "core", "meetings", "summaries");
  if (!fs.existsSync(root)) {
    return { state: "unavailable", root, entries: new Map(), count: 0 };
  }
  try {
    const entries = new Map();
    for (const file of fs.readdirSync(root)) {
      const match = file.match(/^(\d{4}-\d{2}-\d{2}-.*)\.md$/i);
      if (!match || /PRE-INGESTION|_RUN_REPORT|^_/.test(file)) continue;
      const full = path.join(root, file);
      entries.set(match[1], fs.readFileSync(full, "utf8"));
    }
    return { state: "available", root, entries, count: entries.size };
  } catch (error) {
    return {
      state: "unavailable",
      root,
      entries: new Map(),
      count: 0,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function readInfographicPackages(brainRoot) {
  const root = path.join(brainRoot, "natively", "meeting-infographics");
  if (!fs.existsSync(root)) {
    return { state: "unavailable", root, packages: [], unreadable: 0 };
  }

  try {
    const packages = [];
    let unreadable = 0;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const day = entry.name.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
      if (!day) continue;
      const dir = path.join(root, entry.name);
      const files = fs.readdirSync(dir).filter((file) => file.toLowerCase().endsWith(".png"));
      let status = null;
      let statusState = "missing";
      const statusFile = path.join(dir, "status.json");
      if (fs.existsSync(statusFile)) {
        try {
          status = readJson(statusFile);
          statusState = "available";
        } catch {
          statusState = "unavailable";
          unreadable += 1;
        }
      }
      packages.push({
        kind: "png",
        id: entry.name,
        day,
        dir,
        files,
        status,
        statusState,
      });
    }
    return { state: "available", root, packages, unreadable };
  } catch (error) {
    return {
      state: "unavailable",
      root,
      packages: [],
      unreadable: 0,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function readCloseoutPackages(brainRoot) {
  const root = path.join(brainRoot, "core", "deliverables", "meeting-closeouts");
  if (!fs.existsSync(root)) {
    return { state: "available", root, packages: [], unreadable: 0 };
  }

  try {
    const packages = walkFiles(root, (name) => /-infographic\.html$/i.test(name)).map((file) => {
      const name = path.basename(file);
      const id = name.replace(/-infographic\.html$/i, "");
      return {
        kind: "html",
        id,
        day: id.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "",
        dir: path.dirname(file),
        files: [name],
        status: null,
        statusState: "missing",
      };
    });
    return { state: "available", root, packages, unreadable: 0 };
  } catch (error) {
    return {
      state: "unavailable",
      root,
      packages: [],
      unreadable: 0,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function statusSourceIds(status) {
  const sources = Array.isArray(status?.sources) ? status.sources : [];
  return sources
    .map(
      (source) =>
        String(source)
          .replace(/\\/g, "/")
          .match(/core\/meetings\/summaries\/([^/]+)\.md$/i)?.[1]
    )
    .filter(Boolean);
}

function explicitAssociation(pkg, meeting, summaryText) {
  if (pkg.day !== dayForMeeting(meeting)) return null;
  if (pkg.id === meeting.id) return "brain-package-id";
  if (pkg.kind === "html" && String(pkg.id) === meeting.id) return "closeout-package";
  if (pkg.status?.meetingId === meeting.id) return "brain-status";
  if (statusSourceIds(pkg.status).includes(meeting.id)) return "brain-status";
  const infographicLines = String(summaryText || "")
    .split(/\r?\n/)
    .filter((line) => /infographic|visual summary/i.test(line));
  if (
    infographicLines.some(
      (line) => line.includes(pkg.id) || pkg.files.some((file) => line.includes(file))
    )
  ) {
    return "brain-summary";
  }
  return null;
}

function chooseSemanticPackage(meeting, packages) {
  const sameDay = packages
    .filter((pkg) => pkg.day === dayForMeeting(meeting) && pkg.files.length > 0)
    .map((pkg) => ({ pkg, score: packageScore(meeting, pkg) }))
    .sort((a, b) => b.score - a.score);

  const best = sameDay[0];
  const next = sameDay[1];
  if (!best || best.score < 0.72) return null;
  if (best.score < 0.95 && next && best.score - next.score < 0.12) return null;
  return best;
}

function findFile(pkg, wanted) {
  if (!pkg) return null;
  if (wanted && pkg.files.includes(wanted)) return wanted;
  return pkg.files[0] || null;
}

export function classifyAuditState({ display, saved, association }) {
  if ([display, saved, association].includes("unavailable")) return null;
  if (display === "present" && saved === "present" && association === "present") return null;
  if (saved === "present" && association === "present") {
    return AUDIT_CATEGORIES.missingDisplayOnly;
  }
  if (saved === "missing" && association === "present") {
    return AUDIT_CATEGORIES.missingSavedArtifactOnly;
  }
  if (saved === "present" && association === "missing") {
    return AUDIT_CATEGORIES.missingAssociationOnly;
  }
  return AUDIT_CATEGORIES.fullyMissing;
}

function evidenceFor(entry) {
  if (entry.category === AUDIT_CATEGORIES.missingDisplayOnly) {
    if (entry.displayDetail) {
      return (
        "The saved file and meeting association exist, but the Workbench image path returned " +
        entry.displayDetail +
        "."
      );
    }
    return "The saved file and meeting association exist, but the meeting has no Workbench image link.";
  }
  if (entry.category === AUDIT_CATEGORIES.missingSavedArtifactOnly) {
    return "The meeting has an infographic association, but no saved infographic file was found.";
  }
  if (entry.category === AUDIT_CATEGORIES.missingAssociationOnly) {
    if (entry.linkedElsewhere) {
      return "A matching saved infographic is linked to another prepared meeting record, not this one.";
    }
    return "A matching saved infographic exists, but no meeting or package record points to it.";
  }
  return "No saved infographic or recorded association was found for this meeting.";
}

function friendlyArtifact(pkg, file) {
  if (!pkg || !file) return null;
  return {
    kind: pkg.kind,
    file,
    label:
      cleanAuditText(
        pkg.status?.artifactName || pkg.status?.title || pkg.status?.calendarTitle || ""
      ) || null,
  };
}

async function defaultDisplayProbe(art, gateway = DEFAULT_GATEWAY) {
  const url = new URL(`${gateway.replace(/\/$/, "")}/meetings/infographic`);
  url.searchParams.set("id", art.id);
  url.searchParams.set("file", art.file);
  try {
    const response = await fetch(url, {
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(5_000),
    });
    const contentType = response.headers.get("content-type") || "";
    await response.body?.cancel();
    if (response.ok && contentType.startsWith("image/")) {
      return { state: "present", detail: `HTTP ${response.status}` };
    }
    return { state: "missing", detail: `HTTP ${response.status}` };
  } catch (error) {
    return {
      state: "unavailable",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runMeetingInfographicAudit({
  seedPath = DEFAULT_SEED_PATH,
  brainRoot = DEFAULT_BRAIN_ROOT,
  gateway = DEFAULT_GATEWAY,
  displayProbe,
  checkedAt = new Date().toISOString(),
} = {}) {
  const seed = readJson(seedPath);
  const meetings =
    seed.meetingIndex?.meetings?.length > 0
      ? seed.meetingIndex.meetings
      : [
          ...(seed.meetingIndex?.upcoming || []),
          ...(seed.meetingIndex?.active || []),
          ...(seed.meetingIndex?.recent || []),
        ];

  const summaries = readSummaryIndex(brainRoot);
  const pngIndex = readInfographicPackages(brainRoot);
  const closeoutIndex = readCloseoutPackages(brainRoot);
  const packageSourcesAvailable =
    pngIndex.state === "available" && closeoutIndex.state === "available";
  const packages = [...pngIndex.packages, ...closeoutIndex.packages];

  const referencedOwners = new Map();
  for (const meeting of meetings) {
    if (!meeting.infographic?.id) continue;
    const owners = referencedOwners.get(meeting.infographic.id) || [];
    owners.push(meeting.id);
    referencedOwners.set(meeting.infographic.id, owners);
  }

  const probe = displayProbe || ((art) => defaultDisplayProbe(art, gateway));
  const entries = [];

  for (const meeting of meetings) {
    const summaryText = summaries.entries.get(meeting.id) || "";
    const recordArt = meeting.infographic || null;
    const exactPackage = recordArt ? packages.find((pkg) => pkg.id === recordArt.id) : null;
    const explicitPackages = packages
      .map((pkg) => ({
        pkg,
        source: explicitAssociation(pkg, meeting, summaryText),
      }))
      .filter((item) => item.source);

    let matched = exactPackage || explicitPackages[0]?.pkg || null;
    const associationSource = recordArt
      ? "prepared-meeting-record"
      : explicitPackages[0]?.source || null;
    let semanticMatch = null;

    if (!matched) {
      semanticMatch = chooseSemanticPackage(meeting, packages);
      matched = semanticMatch?.pkg || null;
    }

    const linkedElsewhere = Boolean(
      matched && (referencedOwners.get(matched.id) || []).some((owner) => owner !== meeting.id)
    );
    const savedFile = findFile(matched, recordArt?.file);
    let saved = packageSourcesAvailable ? (savedFile ? "present" : "missing") : "unavailable";
    if (recordArt && exactPackage && exactPackage.files.length === 0) saved = "missing";

    let association = associationSource ? "present" : "missing";
    const associationCouldBeUnreadable =
      summaries.state === "unavailable" ||
      (matched?.statusState === "unavailable" && !recordArt && !associationSource);
    if (associationCouldBeUnreadable) association = "unavailable";

    let display = "missing";
    let displayDetail = null;
    if (recordArt) {
      const result = await probe(recordArt, meeting);
      display = result.state;
      displayDetail = result.detail || null;
    }

    const category = classifyAuditState({ display, saved, association });
    entries.push({
      meetingId: meeting.id,
      title: cleanAuditText(meeting.title),
      day: dayForMeeting(meeting),
      display,
      saved,
      association,
      category,
      displayDetail,
      associationSource,
      linkedElsewhere,
      artifact: friendlyArtifact(matched, savedFile),
      matchScore: semanticMatch?.score ?? null,
    });
  }

  const findings = entries
    .filter((entry) => entry.category)
    .map((entry) => ({
      meetingId: entry.meetingId,
      title: entry.title,
      day: entry.day,
      category: entry.category,
      display: entry.display,
      saved: entry.saved,
      association: entry.association,
      evidence: evidenceFor(entry),
      artifact: entry.artifact,
    }))
    .sort((a, b) => b.day.localeCompare(a.day) || a.title.localeCompare(b.title));

  const unavailableMeetings = entries
    .filter(
      (entry) =>
        !entry.category && [entry.display, entry.saved, entry.association].includes("unavailable")
    )
    .map((entry) => ({
      meetingId: entry.meetingId,
      title: entry.title,
      day: entry.day,
      display: entry.display,
      saved: entry.saved,
      association: entry.association,
    }));

  const categoryCounts = Object.values(AUDIT_CATEGORIES).reduce((counts, category) => {
    counts[category] = findings.filter((finding) => finding.category === category).length;
    return counts;
  }, {});

  const scopeIds = meetings.map((meeting) => meeting.id).sort();
  const displayed = entries.filter((entry) => entry.display === "present").length;
  const complete = entries.filter(
    (entry) =>
      entry.display === "present" && entry.saved === "present" && entry.association === "present"
  ).length;
  const displayUnavailable = entries.filter((entry) => entry.display === "unavailable").length;
  const attempted = meetings.filter((meeting) => Boolean(meeting.infographic)).length;

  const snapshot = {
    schemaVersion: 1,
    checkedAt,
    source: {
      seedUpdatedAt: seed.meetingIndex?.updatedAt || null,
      brain: {
        state:
          summaries.state === "available" && packageSourcesAvailable ? "available" : "unavailable",
        meetingSummaryCount: summaries.count,
        infographicPackageCount: packages.length,
        unreadablePackageRecords: pngIndex.unreadable + closeoutIndex.unreadable,
      },
      displayProbe: {
        state: displayUnavailable === 0 ? "available" : displayed > 0 ? "partial" : "unavailable",
        attempted,
        displayed,
        unavailable: displayUnavailable,
      },
    },
    scope: {
      meetingCount: meetings.length,
      meetingIdsSha256: crypto.createHash("sha256").update(scopeIds.join("\n")).digest("hex"),
    },
    totals: {
      audited: entries.length,
      complete,
      needsAttention: findings.length,
      unavailable: unavailableMeetings.length,
    },
    categories: categoryCounts,
    findings,
    unavailableMeetings,
  };

  return { snapshot, entries };
}

export function comparableSnapshot(snapshot) {
  const clone = structuredClone(snapshot);
  delete clone.checkedAt;
  return clone;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const seedPath = path.resolve(argumentValue("--seed") || DEFAULT_SEED_PATH);
  const brainRoot = path.resolve(argumentValue("--brain") || DEFAULT_BRAIN_ROOT);
  const gateway = argumentValue("--gateway") || DEFAULT_GATEWAY;
  const checkPath = argumentValue("--check");
  const { snapshot } = await runMeetingInfographicAudit({ seedPath, brainRoot, gateway });

  if (checkPath) {
    const expected = readJson(path.resolve(checkPath));
    const actualText = JSON.stringify(comparableSnapshot(snapshot));
    const expectedText = JSON.stringify(comparableSnapshot(expected));
    if (actualText !== expectedText) {
      console.error("Meeting infographic audit snapshot is out of date.");
      process.exitCode = 1;
      return;
    }
    console.log(
      "Meeting infographic audit matches: " +
        snapshot.totals.audited +
        " reviewed, " +
        snapshot.totals.needsAttention +
        " need attention."
    );
    return;
  }

  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
