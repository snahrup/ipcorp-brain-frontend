import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_PREP_ROOT = path.join(
  process.env.USERPROFILE || "C:\\Users\\snahrup",
  "OneDrive - IP-Corporation",
  "Documents",
  "Aperture",
  "Meeting Artifacts",
  "Prepared",
  "Next Day"
);

const VISIBLE_EXTENSIONS = new Set([".md", ".pdf", ".html", ".xlsx", ".csv", ".docx"]);
const HIDDEN_FILES = new Set(["SESSION-JOURNAL.md"]);

const MIME_TYPES = {
  ".csv": "text/csv; charset=utf-8",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".html": "text/html; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function assertDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
    throw httpError(400, "INVALID_PREP_DATE", "Date must use YYYY-MM-DD.");
  }
}

function cleanMarkdown(value) {
  return value
    .replace(/\r/g, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readField(markdown, labels) {
  const lines = markdown.replace(/\r/g, "").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*\*\*([^*]+):\*\*\s*(.*)$/);
    if (!match || !labels.some((label) => match[1].trim().toLowerCase() === label)) continue;
    const parts = [match[2].trim()];
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next].trim();
      if (!line || /^#{1,6}\s/.test(line) || /^\*\*[^*]+:\*\*/.test(line)) break;
      parts.push(line.replace(/^[-*]\s+/, ""));
    }
    return cleanMarkdown(parts.filter(Boolean).join("\n"));
  }
  return "";
}

function readTitle(markdown, fallback) {
  const explicit = readField(markdown, ["meeting", "meeting title"]);
  if (explicit) return explicit;
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return (heading || fallback)
    .replace(/^(cluely\s+)?prep(?:aration)?\s+(sheet|pack|package)\s*[:|-]\s*/i, "")
    .trim();
}

function readSections(markdown) {
  const matches = [...markdown.matchAll(/^##\s+(.+)$/gm)];
  return matches
    .map((match, index) => {
      const start = (match.index || 0) + match[0].length;
      const end = matches[index + 1]?.index ?? markdown.length;
      return {
        heading: cleanMarkdown(match[1]),
        content: cleanMarkdown(markdown.slice(start, end)).slice(0, 2800),
      };
    })
    .filter((section) => section.content)
    .slice(0, 8);
}

function readSummary(indexMarkdown) {
  const count = (...labels) => {
    for (const label of labels) {
      const match = indexMarkdown.match(new RegExp(`${label}[^0-9]*(\\d+)`, "i"));
      if (match) return Number(match[1]);
    }
    return 0;
  };
  return {
    checked: count("events? checked", "calendar events?"),
    built: count("packages? built", "packages? prepared"),
    skipped: count("events? skipped", "skipped"),
    blocked: count("events? blocked", "blocked"),
  };
}

function readExpectedPackages(indexMarkdown) {
  const lines = indexMarkdown.replace(/\r/g, "").split("\n");
  const packages = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^###\s+(?:\d+[.)]?\s+)?(.+)$/);
    if (!heading) continue;
    let folder = "";
    for (let next = index + 1; next < Math.min(index + 6, lines.length); next += 1) {
      const code = lines[next].match(/`([^`]+)`/);
      if (code && !path.extname(code[1])) {
        folder = code[1].replace(/[\\/]+$/, "");
        break;
      }
    }
    if (folder) packages.push({ folder, title: cleanMarkdown(heading[1]) });
  }
  return packages;
}

function readSkipped(indexMarkdown) {
  const skippedHeading = indexMarkdown.match(/^##\s+Skipped[^\n]*$/im);
  let section = "";
  if (skippedHeading?.index !== undefined) {
    const remainder = indexMarkdown.slice(skippedHeading.index + skippedHeading[0].length);
    const nextHeading = remainder.search(/^##\s+/m);
    section = nextHeading >= 0 ? remainder.slice(0, nextHeading) : remainder;
  }
  const bullets = section
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*[-*]\s+(.+?)(?:\s*[:|-]\s+)(.+)$/))
    .filter(Boolean)
    .map((match) => ({ title: cleanMarkdown(match[1]), reason: cleanMarkdown(match[2]) }));
  const tableRows = indexMarkdown
    .split(/\r?\n/)
    .filter((line) => /^\s*\|/.test(line) && /\bSKIPPED\b/i.test(line))
    .map((line) =>
      line
        .split("|")
        .map((cell) => cleanMarkdown(cell))
        .filter(Boolean)
    )
    .filter((cells) => cells.length >= 3)
    .map((cells) => ({ title: cells[1], reason: cells.at(-1) || "Skipped by the prep run." }));
  return [...bullets, ...tableRows].filter(
    (item, index, items) => items.findIndex((candidate) => candidate.title === item.title) === index
  );
}

function artifactDetails(name, size, updatedAt) {
  const lower = name.toLowerCase();
  let role = "Source file";
  if (lower.includes("prep_pack") && lower.endsWith(".pdf")) role = "Print-ready prep pack";
  else if (lower.includes("prep_pack") && lower.endsWith(".html")) role = "Browser version";
  else if (lower.includes("cluely_prep")) role = "Meeting context";
  else if (lower.includes("runofshow")) role = "Run of show";
  else if (lower.includes("evidence_matrix")) role = "Evidence matrix";
  return {
    name,
    role,
    type: path.extname(name).slice(1).toUpperCase(),
    size,
    updatedAt,
  };
}

function startSortValue(when) {
  const first = when.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
  if (!first) return 24 * 60;
  const later = when.slice((first.index || 0) + first[0].length).match(/\b(AM|PM)\b/i);
  const marker = (first[3] || later?.[1] || "AM").toUpperCase();
  let hour = Number(first[1]) % 12;
  if (marker === "PM") hour += 12;
  return hour * 60 + Number(first[2]);
}

async function readPackage(dayPath, folder, fallbackTitle, exists) {
  if (!exists) {
    return {
      id: folder,
      title: fallbackTitle || folder.replace(/-/g, " "),
      status: "missing",
      missing: ["Package folder"],
      artifacts: [],
      sections: [],
      startSort: 24 * 60,
    };
  }

  const packagePath = path.join(dayPath, folder);
  const entries = await fs.readdir(packagePath, { withFileTypes: true });
  const visible = entries.filter(
    (entry) =>
      entry.isFile() &&
      VISIBLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) &&
      !HIDDEN_FILES.has(entry.name)
  );
  const artifacts = await Promise.all(
    visible.map(async (entry) => {
      const stats = await fs.stat(path.join(packagePath, entry.name));
      return artifactDetails(entry.name, stats.size, stats.mtime.toISOString());
    })
  );
  artifacts.sort(
    (left, right) => left.role.localeCompare(right.role) || left.name.localeCompare(right.name)
  );

  const contextArtifact = artifacts.find(
    (artifact) =>
      artifact.name.toLowerCase().includes("cluely_prep") &&
      artifact.name.toLowerCase().endsWith(".md")
  );
  let markdown = "";
  if (contextArtifact)
    markdown = await fs.readFile(path.join(packagePath, contextArtifact.name), "utf8");

  const title = readTitle(markdown, fallbackTitle || folder.replace(/-/g, " "));
  const when = readField(markdown, ["when", "date and time", "time"]);
  const hasPdf = artifacts.some(
    (artifact) => artifact.name.toLowerCase().includes("prep_pack") && artifact.type === "PDF"
  );
  const hasRunOfShow = artifacts.some(
    (artifact) => artifact.name.toLowerCase().includes("runofshow") && artifact.type === "MD"
  );
  const missing = [];
  if (!contextArtifact) missing.push("Meeting context");
  if (!hasPdf) missing.push("Print-ready prep pack");
  if (!hasRunOfShow) missing.push("Run of show");
  const packageStats = await fs.stat(packagePath);
  const updatedAt = artifacts.reduce(
    (latest, artifact) => (artifact.updatedAt > latest ? artifact.updatedAt : latest),
    packageStats.mtime.toISOString()
  );

  return {
    id: folder,
    title,
    when,
    organizer: readField(markdown, ["organizer", "owner"]),
    invited: readField(markdown, ["invited", "invited attendees", "attendees"]),
    preparedAt: readField(markdown, ["prepared", "prepared at"]),
    evidenceState: readField(markdown, ["evidence state", "source state"]),
    status: missing.length ? "partial" : "ready",
    missing,
    updatedAt,
    artifacts,
    sections: readSections(markdown),
    startSort: startSortValue(when),
  };
}

export async function getDailyMeetingPrep(date, options = {}) {
  assertDate(date);
  const root = options.root || process.env.IPCORP_DAILY_MEETING_PREP_PATH || DEFAULT_PREP_ROOT;
  const dayPath = path.join(root, date);
  let dayEntries;
  try {
    dayEntries = await fs.readdir(dayPath, { withFileTypes: true });
  } catch (error) {
    if (["ENOENT", "EACCES", "EPERM"].includes(error.code)) {
      return {
        date,
        state: "unavailable",
        reason:
          error.code === "ENOENT"
            ? "No dated prep output is available."
            : "The dated prep output cannot be read.",
        sourceLabel: `Prepared / Next Day / ${date}`,
        summary: { checked: 0, built: 0, skipped: 0, blocked: 0 },
        packages: [],
        skipped: [],
      };
    }
    throw error;
  }

  const indexEntry = dayEntries.find((entry) => entry.isFile() && entry.name === "00_INDEX.md");
  const indexMarkdown = indexEntry
    ? await fs.readFile(path.join(dayPath, indexEntry.name), "utf8")
    : "";
  const expected = readExpectedPackages(indexMarkdown);
  const directories = new Set(
    dayEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  );
  const packageSpecs = [...expected];
  for (const folder of directories) {
    if (!packageSpecs.some((item) => item.folder === folder))
      packageSpecs.push({ folder, title: "" });
  }
  const packages = await Promise.all(
    packageSpecs.map((item) =>
      readPackage(dayPath, item.folder, item.title, directories.has(item.folder))
    )
  );
  packages.sort(
    (left, right) => left.startSort - right.startSort || left.title.localeCompare(right.title)
  );
  const summary = readSummary(indexMarkdown);
  if (!summary.built) summary.built = packages.filter((item) => item.status !== "missing").length;
  if (!summary.checked) summary.checked = summary.built + summary.skipped + summary.blocked;
  let state = packages.length ? "ready" : "empty";
  if (packages.some((item) => item.status !== "ready")) state = "partial";
  const dayStats = await fs.stat(dayPath);

  return {
    date,
    state,
    reason: indexEntry
      ? ""
      : "The daily index is missing. Packages shown were found from the dated folder.",
    sourceLabel: `Prepared / Next Day / ${date}`,
    updatedAt: dayStats.mtime.toISOString(),
    summary,
    packages,
    skipped: readSkipped(indexMarkdown),
  };
}

async function findExactDirectory(dayPath, requestedName) {
  const entries = await fs.readdir(dayPath, { withFileTypes: true });
  const match = entries.find((entry) => entry.isDirectory() && entry.name === requestedName);
  if (!match) throw httpError(404, "PREP_PACKAGE_NOT_FOUND", "Prep package was not found.");
  return path.join(dayPath, match.name);
}

export async function readDailyMeetingPrepFile({ date, packageId, fileName, print = false, root }) {
  assertDate(date);
  if (!packageId || !fileName)
    throw httpError(400, "INVALID_PREP_FILE", "Package and file are required.");
  const prepRoot = root || process.env.IPCORP_DAILY_MEETING_PREP_PATH || DEFAULT_PREP_ROOT;
  const packagePath = await findExactDirectory(path.join(prepRoot, date), packageId);
  const entries = await fs.readdir(packagePath, { withFileTypes: true });
  let match = entries.find(
    (entry) =>
      entry.isFile() &&
      entry.name === fileName &&
      VISIBLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
  );
  if (!match) throw httpError(404, "PREP_FILE_NOT_FOUND", "Prep file was not found.");
  if (print && path.extname(match.name).toLowerCase() === ".pdf") {
    const html = entries.find(
      (entry) =>
        entry.isFile() &&
        entry.name.toLowerCase().includes("prep_pack") &&
        path.extname(entry.name).toLowerCase() === ".html"
    );
    if (html) match = html;
  }
  const extension = path.extname(match.name).toLowerCase();
  let data = await fs.readFile(path.join(packagePath, match.name));
  if (print && extension === ".html") {
    const html = data.toString("utf8");
    const printScript = '<script>window.addEventListener("load",()=>window.print())</script>';
    data = Buffer.from(
      html.includes("</body>")
        ? html.replace("</body>", `${printScript}</body>`)
        : `${html}${printScript}`
    );
  }
  return {
    data,
    contentType: MIME_TYPES[extension] || "application/octet-stream",
    fileName: match.name.replace(/[\r\n"]/g, ""),
  };
}
