import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { ACTIVITY_SOURCES } from "./activity-reconciliation.mjs";

const execFileAsync = promisify(execFile);
const M365_SOURCE_IDS = ACTIVITY_SOURCES.map((source) => source.id).filter(
  (sourceId) => sourceId !== "brain_updates"
);
const DEFAULT_BRAIN_ROOT =
  "C:\\Users\\snahrup\\OneDrive - IP-Corporation\\ipcorp-architecture-brain";
const BRAIN_FILE_ROOTS = [
  ["core", "meetings", "summaries"],
  ["core", "deliverables", "meeting-closeouts"],
  ["core", "deliverables", "mdm-program-planning"],
  ["core", "project-memory"],
  ["natively", "meeting-infographics"],
];
const BRAIN_EXTENSIONS = new Set([
  ".csv",
  ".html",
  ".json",
  ".jsonl",
  ".md",
  ".pdf",
  ".png",
  ".xlsx",
]);
const BRAIN_SKIP_DIRECTORIES = new Set([
  ".git",
  "_retired",
  "charts",
  "presentation-ui",
  "transcripts",
]);
const STRUCTURED_BRAIN_FILES = [
  ["core", "project-memory", "learnings", "decisions.json"],
  ["core", "project-memory", "learnings", "discoveries.json"],
  ["core", "project-memory", "learnings", "gotchas.json"],
];

function parseJson(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const candidates = [text, ...text.split(/\r?\n/).reverse()];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Try the next contained JSON value.
    }
  }
  return null;
}

function sourceFailure(code, detail) {
  const normalized = String(code || "").toLowerCase();
  const state = /cancel|abort/.test(normalized)
    ? "canceled"
    : /auth|sign.?in|login|permission/.test(normalized)
      ? "not_authorized"
      : /timeout|timed.?out/.test(normalized)
        ? "timed_out"
        : /unavailable|bridge|disabled|not.?configured/.test(normalized)
          ? "unavailable"
          : /malformed|unstructured/.test(normalized)
            ? "malformed"
            : "failed";
  return M365_SOURCE_IDS.map((id) => ({ id, state, items: [], detail }));
}

function normalizeStreams(payload, windows) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const streams = data?.streams;
  if (!streams || typeof streams !== "object") {
    return sourceFailure("malformed", "Microsoft 365 did not return the required source streams.");
  }
  return M365_SOURCE_IDS.map((id) => {
    const stream = Array.isArray(streams) ? streams.find((item) => item?.id === id) : streams[id];
    if (!stream || typeof stream !== "object") {
      return {
        id,
        state: "malformed",
        items: [],
        detail: "Microsoft 365 omitted this source stream.",
      };
    }
    return {
      id,
      state: stream.state,
      items: Array.isArray(stream.items) ? stream.items : [],
      confirmedThrough: stream.confirmedThrough || windows[id]?.to || null,
      detail: String(stream.detail || stream.limitation || "").slice(0, 500),
    };
  });
}

async function runMicrosoft365(windows, options = {}) {
  if (typeof options.m365Runner === "function") {
    return options.m365Runner(windows, { signal: options.signal });
  }
  const scriptPath = options.scriptPath || resolve(process.cwd(), "server", "m365-reconcile.py");
  try {
    const { stdout } = await execFileAsync(options.python || "python", [scriptPath], {
      cwd: process.cwd(),
      timeout: options.timeoutMs || 900_000,
      windowsHide: true,
      maxBuffer: 12_000_000,
      signal: options.signal,
      env: {
        ...process.env,
        M365_RECONCILE_MODE: "activity",
        M365_RECONCILE_WINDOWS: JSON.stringify(windows),
      },
    });
    const parsed = parseJson(stdout);
    if (!parsed)
      return { ok: false, code: "malformed", error: "Microsoft 365 returned unreadable data." };
    return parsed;
  } catch (error) {
    const canceled = error?.name === "AbortError" || error?.code === "ABORT_ERR";
    return {
      ok: false,
      code: canceled
        ? "m365_canceled"
        : error?.killed || error?.code === "ETIMEDOUT"
          ? "m365_timeout"
          : "m365_unavailable",
      error: canceled
        ? "Microsoft 365 read stopped by the user."
        : error instanceof Error
          ? error.message
          : "Microsoft 365 is unavailable.",
    };
  }
}

function watchCancellation(isCancellationRequested, controller, intervalMs = 250) {
  if (typeof isCancellationRequested !== "function") return () => undefined;
  let checking = false;
  const check = async () => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    try {
      if (await isCancellationRequested()) controller.abort();
    } catch {
      // A transient state read should not stop the source request.
    } finally {
      checking = false;
    }
  };
  void check();
  const timer = setInterval(() => void check(), intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

function insideBrainWindow(value, window) {
  const time = new Date(value).getTime();
  const lower = new Date(window.lateSweepFrom || window.from).getTime();
  const upper = new Date(window.to).getTime();
  return [time, lower, upper].every(Number.isFinite) && time >= lower && time <= upper;
}

function easternOffset(date) {
  const month = Number(date.slice(5, 7));
  return month >= 3 && month <= 10 ? "-04:00" : "-05:00";
}

function changelogTime(date, time) {
  const match = String(time || "").match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !match) return null;
  let hour = Number(match[1]);
  if (match[3]?.toUpperCase() === "PM" && hour < 12) hour += 12;
  if (match[3]?.toUpperCase() === "AM" && hour === 12) hour = 0;
  const parsed = new Date(
    `${date}T${String(hour).padStart(2, "0")}:${match[2]}:00${easternOffset(date)}`
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function cleanPathList(value) {
  return String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim().replaceAll("\\", "/"))
    .filter(Boolean)
    .slice(0, 8);
}

function jiraKeyFrom(...values) {
  return (
    values
      .join(" ")
      .toUpperCase()
      .match(/\bMT-\d+\b/)?.[0] || null
  );
}

function actionableBrainPath(relativePath, jiraKey) {
  return (
    Boolean(jiraKey) ||
    /(^|\/)(actions?|decisions?|open-questions|risk-register)(\/|\.|$)|task-spec|jira/i.test(
      relativePath
    )
  );
}

async function changelogRecords(brainRoot, window) {
  const content = await readFile(join(brainRoot, "CHANGELOG.md"), "utf8").catch(() => "");
  const records = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    const [date, time, , altered] = cells;
    const eventAt = changelogTime(date, time);
    if (!eventAt || !insideBrainWindow(eventAt, window)) continue;
    const paths = cleanPathList(altered);
    const locator = `${date}|${time}|${paths[0] || "entry"}`;
    records.push({
      providerItemId: `CHANGELOG.md|${locator}`,
      eventAt,
      updatedAt: eventAt,
      title: `Brain change recorded ${date} ${time}`,
      summary: paths.length
        ? `Recorded changes for ${paths.join(", ")}.`
        : "Recorded a Work-related Brain change.",
      status: "current",
      sourceReference: `CHANGELOG.md row ${date} ${time}`,
      actionable: false,
    });
  }
  return records;
}

async function processedRecords(brainRoot, window) {
  const content = await readFile(join(brainRoot, "_intake", "processed.log"), "utf8").catch(
    () => ""
  );
  const records = [];
  for (const line of content.split(/\r?\n/)) {
    const timestamp = line.match(/^(\S+)/)?.[1] || "";
    if (!timestamp || !insideBrainWindow(timestamp, window)) continue;
    const pipeParts = line.split("|").map((part) => part.trim());
    const bracketKind = line.match(/^\S+\s+\[([^\]]+)\]/)?.[1] || "";
    const kind = pipeParts.length >= 2 ? pipeParts[1] : bracketKind || "processed intake";
    const identity = pipeParts.length >= 3 ? pipeParts[2] : timestamp;
    const eventAt = new Date(timestamp).toISOString();
    const safeIdentity = String(identity || kind).slice(0, 160);
    records.push({
      providerItemId: `_intake/processed.log|${kind}|${safeIdentity}`,
      eventAt,
      updatedAt: eventAt,
      title: `Processed Brain intake: ${safeIdentity}`,
      summary: `Recorded a completed ${kind.replaceAll("-", " ")} intake item.`,
      status: "completed",
      sourceReference: `_intake/processed.log entry ${safeIdentity}`,
      actionable: false,
    });
  }
  return records;
}

function relevantBrainFile(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  const name = basename(normalized).toLowerCase();
  if (name === "readme.md" || name.startsWith("~$") || name.endsWith(".tmp")) return false;
  if (normalized.startsWith("natively/meeting-infographics/") && name !== "status.json") {
    return false;
  }
  if (STRUCTURED_BRAIN_FILES.some((segments) => normalized === segments.join("/"))) {
    return false;
  }
  return BRAIN_EXTENSIONS.has(extname(name));
}

function structuredItems(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap((item) => (Array.isArray(item) ? item : []));
}

async function structuredBrainRecords(brainRoot, window) {
  const records = [];
  for (const segments of STRUCTURED_BRAIN_FILES) {
    const path = join(brainRoot, ...segments);
    try {
      const details = await stat(path);
      if (!insideBrainWindow(details.mtime, window)) continue;
      const relativePath = segments.join("/");
      const items = structuredItems(JSON.parse(await readFile(path, "utf8")));
      for (const item of items.slice(0, 2_000)) {
        if (!item || typeof item !== "object" || !item.id) continue;
        const id = String(item.id).slice(0, 160);
        const title = String(item.title || item.topic || id).slice(0, 240);
        const itemDate = String(item.date || "");
        const date = /^\d{4}-\d{2}-\d{2}$/.test(itemDate)
          ? `${itemDate}T12:00:00${easternOffset(itemDate)}`
          : details.mtime.toISOString();
        const jiraKey = jiraKeyFrom(item.jiraKey, item.source, item.title, item.topic);
        records.push({
          providerItemId: `${relativePath}|${id}`,
          eventAt: new Date(date).toISOString(),
          updatedAt: details.mtime.toISOString(),
          title,
          summary: `Updated structured Brain record ${id}.`,
          status: String(item.status || item.confidence || "current").slice(0, 80),
          sourceReference: `${relativePath}#${id}`,
          contentDigest: createHash("sha256").update(JSON.stringify(item)).digest("hex"),
          jiraKey,
          jiraReferenceKind: jiraKey ? "direct" : "unknown",
          jiraContextSignals: jiraKey ? [`Structured Brain record ${id}`] : [],
          actionable: actionableBrainPath(relativePath, jiraKey),
        });
      }
    } catch {
      // Missing or invalid optional structured files are reported through the remaining records.
    }
  }
  return records;
}

async function walkBrainFiles(root, directory, output, limit = 5_000) {
  if (output.length >= limit) return;
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (output.length >= limit) return;
    if (entry.name.startsWith(".") || BRAIN_SKIP_DIRECTORIES.has(entry.name.toLowerCase()))
      continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walkBrainFiles(root, path, output, limit);
    else if (entry.isFile() && relevantBrainFile(relative(root, path))) output.push(path);
  }
}

async function brainFileRecords(brainRoot, window) {
  const paths = [];
  for (const segments of BRAIN_FILE_ROOTS) {
    await walkBrainFiles(brainRoot, join(brainRoot, ...segments), paths);
  }
  const records = [];
  for (const path of paths) {
    try {
      const details = await stat(path);
      if (!insideBrainWindow(details.mtime, window)) continue;
      const eventAt = details.mtime.toISOString();
      const relativePath = relative(brainRoot, path).replaceAll("\\", "/");
      const jiraKey = jiraKeyFrom(relativePath);
      records.push({
        providerItemId: `file|${relativePath.toLowerCase()}`,
        eventAt,
        updatedAt: eventAt,
        title: basename(relativePath, extname(relativePath)).replace(/[-_]+/g, " "),
        summary: `Updated Work-related Brain record ${relativePath}.`,
        status: "current",
        sourceReference: relativePath,
        jiraKey,
        jiraReferenceKind: jiraKey ? "direct" : "unknown",
        jiraContextSignals: jiraKey ? ["Brain work artifact path"] : [],
        actionable: actionableBrainPath(relativePath, jiraKey),
      });
    } catch {
      // A file can disappear during a OneDrive sync. The next run can inspect it again.
    }
  }
  return records;
}

async function readBrainUpdates(window, options = {}) {
  const brainRoot = resolve(
    options.brainRoot || process.env.IPCORP_BRAIN_REPO || DEFAULT_BRAIN_ROOT
  );
  try {
    const items = [
      ...(await changelogRecords(brainRoot, window)),
      ...(await processedRecords(brainRoot, window)),
      ...(await structuredBrainRecords(brainRoot, window)),
      ...(await brainFileRecords(brainRoot, window)),
    ];
    const unique = [...new Map(items.map((item) => [item.providerItemId, item])).values()];
    return {
      id: "brain_updates",
      state: unique.length > 1_000 ? "partial" : unique.length ? "current" : "empty",
      items: unique,
      confirmedThrough: window.to,
      detail: unique.length
        ? `${unique.length} dated history rows, processed entries, and Work-related Brain records found in this period.`
        : "No dated history rows, processed entries, or Work-related Brain records were found in this period.",
    };
  } catch (error) {
    return {
      id: "brain_updates",
      state: "unavailable",
      items: [],
      detail:
        error instanceof Error ? error.message.slice(0, 500) : "Brain history is unavailable.",
    };
  }
}

export async function collectActivitySources(
  { windows, onActivity, isCancellationRequested },
  options = {}
) {
  const fixturePath = options.fixturePath || process.env.ACTIVITY_RECONCILIATION_FIXTURE;
  if (fixturePath) {
    const fixture = JSON.parse(await readFile(resolve(fixturePath), "utf8"));
    return fixture.data || fixture;
  }

  await onActivity?.("Microsoft 365 is reading the requested Outlook and Teams streams.");
  const controller = new AbortController();
  const stopWatching = watchCancellation(isCancellationRequested, controller, options.cancelPollMs);
  let m365;
  let brain;
  try {
    [m365, brain] = await Promise.all([
      runMicrosoft365(windows, { ...options, signal: controller.signal }),
      readBrainUpdates(windows.brain_updates, options),
    ]);
  } finally {
    stopWatching();
  }
  const microsoftSources =
    m365?.ok === false
      ? sourceFailure(
          m365.code,
          String(m365.error || "Microsoft 365 is unavailable.").slice(0, 500)
        )
      : normalizeStreams(m365, windows);
  await onActivity?.("Source reads finished. Saving each result and its position.");
  return { sources: [...microsoftSources, brain], asOf: m365?.data?.asOf || null };
}
