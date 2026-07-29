import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { classifyEvidenceEligibility, mondayOf } from "./policy.mjs";

const FRONTEND_ROOT = resolve(
  new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
);
const RUN_ROOT = join(FRONTEND_ROOT, "workflow-runs", "mdm-jira-rebuild");
const DEFAULT_MAX_ACTIVITIES = 10;

const PRIORITY = Object.freeze({
  "work-session": 0,
  "repository-commit": 1,
  "jira-comment": 1,
  "jira-worklog": 1,
  "jira-change": 2,
  "meeting-record": 2,
  "jira-issue": 3,
  "brain-document": 4,
  "team-library-artifact": 5,
});

function usage() {
  return [
    "Usage:",
    "  node server/mdm-reconciliation/recover-weekly-activities-from-evidence.mjs --week YYYY-MM-DD",
    "",
    "Options:",
    "  --run-dir <path>        Run directory. Defaults to workflow-runs/mdm-jira-rebuild/latest.json.",
    "  --week <date>           Required. Any date in the target week; normalized to Monday.",
    "  --output <path>         Optional output JSON path.",
    "  --max-activities <n>    Defaults to 10.",
    "  --overwrite             Replace an existing weekly activity file.",
  ].join("\n");
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = { maxActivities: DEFAULT_MAX_ACTIVITIES, overwrite: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value.`);
      return argv[index];
    };
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--run-dir") options.runDir = next();
    else if (arg === "--week") options.week = next();
    else if (arg === "--output") options.output = next();
    else if (arg === "--max-activities") options.maxActivities = Number.parseInt(next(), 10);
    else if (arg === "--overwrite") options.overwrite = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function resolveRunDirectory(explicitRunDir) {
  if (explicitRunDir) return resolve(explicitRunDir);
  const latest = JSON.parse(await readFile(join(RUN_ROOT, "latest.json"), "utf8"));
  if (!latest?.runDirectory) throw new Error("latest.json does not contain runDirectory.");
  return resolve(latest.runDirectory);
}

async function readJsonLines(path) {
  return (await readFile(path, "utf8"))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function priority(record) {
  return PRIORITY[record.sourceType] ?? 6;
}

function recordDay(record) {
  return String(record.eventAt || "undated").slice(0, 10);
}

function normalizedMeetingTitle(record) {
  return String(record.title || "")
    .toLowerCase()
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, "")
    .replace(/\b(?:summary|transcript|recap|meeting)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 80);
}

function aggregationKey(record) {
  const day = recordDay(record);
  if (record.sourceType === "work-session") {
    return `work-session:${day}:${record.workspace || record.provider}`;
  }
  if (["jira-change", "jira-comment", "jira-worklog"].includes(record.sourceType)) {
    return `${record.sourceType}:${day}:${record.jiraKey || "unknown"}`;
  }
  if (record.sourceType === "repository-commit") {
    return `repository-commit:${day}:${String(record.sourceRef || "").split("@")[0]}`;
  }
  if (record.sourceType === "meeting-record") {
    return `meeting-record:${day}:${normalizedMeetingTitle(record)}`;
  }
  if (record.sourceType === "brain-document") {
    return `brain-document:${day}:${String(record.sourceRef || "").split("/")[0]}`;
  }
  return record.id;
}

function rawRecordBody(record) {
  return (
    record.visibleText ||
    record.text ||
    [...(record.requests || []), ...(record.visibleResults || [])].join("\n")
  );
}

function condenseWeekRecords(records) {
  const groups = new Map();
  for (const record of records) {
    if (record.sourceType === "team-library-artifact") continue;
    const key = aggregationKey(record);
    const group = groups.get(key) || {
      id: `aggregate:${key}`,
      sourceType: record.sourceType,
      provider: record.provider,
      sourceRef: key,
      sourceRecordIds: [],
      eventAt: record.eventAt,
      weekOf: record.weekOf,
      titles: [],
      bodies: [],
      baselineMinutes: 0,
      recordedHours: 0,
      completionSignal: false,
      collaborationEvidence: false,
      evidenceEligible: true,
      eligibilityReasons: [],
    };
    const eligibility = classifyEvidenceEligibility(record);
    group.sourceRecordIds.push(record.id);
    if (record.title && !group.titles.includes(record.title) && group.titles.length < 8) {
      group.titles.push(record.title);
    }
    const body = String(rawRecordBody(record) || "").trim();
    if (body && group.bodies.join("\n").length < 16_000) {
      group.bodies.push(body.slice(0, 2_500));
    }
    group.baselineMinutes += Number(record.baselineMinutes || 0);
    group.recordedHours += Number(record.recordedHours || 0);
    group.completionSignal ||= Boolean(record.completionSignal);
    group.collaborationEvidence ||= Boolean(record.collaborationEvidence);
    group.evidenceEligible &&= eligibility.eligible;
    if (!eligibility.eligible && !group.eligibilityReasons.includes(eligibility.reason)) {
      group.eligibilityReasons.push(eligibility.reason);
    }
    if (String(record.eventAt || "") > String(group.eventAt || "")) {
      group.eventAt = record.eventAt;
    }
    groups.set(key, group);
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    title: group.titles.join(" | "),
    text: group.bodies.join("\n\n"),
  }));
}

function cleanText(value, limit = 900) {
  return String(value || "")
    .replace(/\b(?:Claude|Codex|ChatGPT|Cursor|Windsurf|Copilot)\b/gi, "workstream tooling")
    .replace(
      /\b(?:youtube|tutorial|course|walkthrough|video transcript|video)\b/gi,
      "reference material"
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function slugify(value) {
  return (
    String(value || "activity")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "activity"
  );
}

function titleFor(group) {
  const title = cleanText(group.title || group.sourceRef, 120);
  if (title) return title;
  return `${group.sourceType || "Evidence"} activity on ${recordDay(group)}`;
}

function summaryFor(group) {
  const text = cleanText(group.text, 1000);
  if (text) {
    return `Evidence-backed MDM/Fabric activity from ${recordDay(group)}: ${text}`;
  }
  return `Evidence-backed MDM/Fabric activity captured from ${group.sourceType || "source"} records for ${recordDay(group)}.`;
}

function microsoftAlignmentFor(group) {
  const text = `${group.title || ""} ${group.text || ""}`.toLowerCase();
  const alignment = [];
  if (text.includes("purview") || text.includes("governance")) {
    alignment.push({
      practice:
        "Use governed cataloging, ownership, classification, and stewardship conventions for Fabric and Purview rollout.",
      reference: "Team Library Microsoft guidance and IP Corp rollout materials",
    });
  }
  if (text.includes("gold") || text.includes("semantic") || text.includes("power bi")) {
    alignment.push({
      practice:
        "Model curated Gold-layer and semantic assets around governed business domains and validated reporting needs.",
      reference: "Team Library Fabric best-practice workbooks",
    });
  }
  if (
    text.includes("pipeline") ||
    text.includes("bronze") ||
    text.includes("silver") ||
    text.includes("load")
  ) {
    alignment.push({
      practice:
        "Keep medallion pipeline work evidence-backed, recoverable, monitored, and aligned to Fabric operational readiness.",
      reference: "Team Library Fabric operations and migration guidance",
    });
  }
  if (!alignment.length) {
    alignment.push({
      practice:
        "Maintain evidence-backed rollout planning with clear ownership, source traceability, and current-state reconciliation.",
      reference: "Team Library adoption and rollout guidance",
    });
  }
  return alignment;
}

function isRecoveryEligibleGroup(group) {
  const text = `${group.title || ""} ${group.sourceRef || ""} ${group.text || ""}`;
  return !/\b(?:brain[-\s]?intake|post[-\s]?meeting automation|workflow[-\s]?runs?|codex|claude|prism|cortex|frontend|dashboard qa|playwright)\b/i.test(
    text
  );
}

function activityFor(group) {
  const title = titleFor(group);
  const startDate = recordDay(group);
  const baselineEffortHours = Math.max(
    1,
    Math.round(
      Math.max(Number(group.recordedHours || 0), Number(group.baselineMinutes || 0) / 60 || 0) * 2
    ) / 2
  );
  return {
    stableId: slugify(`${startDate}-${title}`),
    title,
    summary: summaryFor(group),
    startDate,
    endDate: startDate,
    disposition: "completed",
    activeNow: false,
    stillDue: false,
    solo: !group.collaborationEvidence,
    participants: [],
    collaborationEvidenceRefs: group.collaborationEvidence ? [group.id] : [],
    evidenceRefs: [group.id],
    candidateJiraKeys: [],
    deliverables: group.completionSignal ? ["Evidence record includes a completion signal."] : [],
    validation: [
      "Recovered from eligible project evidence without using internal app or personal-project activity.",
    ],
    technicalDetails: [cleanText(group.sourceRef, 160)].filter(Boolean),
    baselineEffortHours,
    effortBasis:
      group.recordedHours > 0
        ? "existing-normalized-worklog"
        : group.baselineMinutes > 0
          ? "observed-session"
          : "artifact-scope",
    microsoftAlignment: microsoftAlignmentFor(group),
    subtasks: [],
    relationships: [],
    confidence: group.completionSignal || group.collaborationEvidence ? "high" : "medium",
  };
}

export async function recoverWeeklyActivitiesFromEvidence({
  runDir,
  week,
  output,
  maxActivities = DEFAULT_MAX_ACTIVITIES,
  overwrite = false,
} = {}) {
  const runDirectory = await resolveRunDirectory(runDir);
  const weekOf = mondayOf(week);
  if (!weekOf) throw new Error("--week is required.");
  if (!Number.isInteger(maxActivities) || maxActivities < 1 || maxActivities > 25) {
    throw new Error("--max-activities must be an integer from 1 through 25.");
  }
  const outputRoot = join(runDirectory, "weekly-activities");
  await mkdir(outputRoot, { recursive: true });
  const outputPath = resolve(output || join(outputRoot, `${weekOf}.json`));

  if (!overwrite) {
    try {
      const existing = JSON.parse(await readFile(outputPath, "utf8"));
      if (
        existing?.weekOf === weekOf &&
        Array.isArray(existing.activities) &&
        existing.activities.length
      ) {
        return { outputPath, state: "existing", activities: existing.activities.length };
      }
    } catch {
      // Missing or invalid output can be recovered.
    }
  }

  const evidence = await readJsonLines(join(runDirectory, "evidence.jsonl"));
  const original = evidence.filter((record) => record.weekOf === weekOf);
  const condensed = condenseWeekRecords(original).sort(
    (left, right) =>
      priority(left) - priority(right) || String(left.id).localeCompare(String(right.id))
  );
  const ineligible = condensed.filter((record) => record.evidenceEligible === false);
  const recoveryFiltered = [];
  const selected = condensed.filter((record) => {
    if (record.evidenceEligible === false) return false;
    if (isRecoveryEligibleGroup(record)) return true;
    recoveryFiltered.push(record);
    return false;
  });
  if (!selected.length) throw new Error(`${weekOf} has no eligible evidence groups to recover.`);

  const included = selected.slice(0, maxActivities);
  const omitted = selected.slice(maxActivities);
  const recovered = {
    weekOf,
    activities: included.map(activityFor),
    unresolved: omitted.map((group) => ({
      question: `Eligible evidence group was withheld from deterministic recovery because the max-activities bound was reached: ${titleFor(group)}`,
      evidenceRefs: [group.id],
    })),
    excluded: ineligible
      .map((record) => ({
        reason: record.eligibilityReasons?.[0] || "personal",
        evidenceRefs: [record.id],
      }))
      .concat(
        recoveryFiltered.map((record) => ({
          reason: "internal-tooling",
          evidenceRefs: [record.id],
        }))
      ),
    coverage: {
      sourceRecords: original.length,
      condensedGroups: selected.length,
      ineligibleGroupsWithheld: ineligible.length + recoveryFiltered.length,
      includedGroups: included.length,
      omittedGroups: omitted.length,
      bounded: omitted.length > 0,
      deterministicRecovery: true,
    },
    policy: {
      personalWorkExcluded: true,
      soloByDefault: true,
      activeNowRequiresCurrentEvidence: true,
      hiddenReasoningExcluded: true,
      deterministicRecovery: true,
    },
  };
  await writeFile(outputPath, `${JSON.stringify(recovered, null, 2)}\n`, "utf8");
  return {
    outputPath,
    state: "recovered",
    activities: recovered.activities.length,
    unresolved: recovered.unresolved.length,
    coverage: recovered.coverage,
  };
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.week) throw new Error("--week is required.");
  const result = await recoverWeeklyActivitiesFromEvidence(options);
  console.log(JSON.stringify(result));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename);
if (isMain) {
  main().catch((error) => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}
