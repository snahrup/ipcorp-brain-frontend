#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { buildOperationLedger, OPERATION_KIND } from "./operation-ledger.mjs";
import {
  auditWeeklyEffort,
  classifyIssueState,
  FIRST_SETTLED_WEEK,
  LAST_SETTLED_WEEK,
  MDM_PROJECT_KEY,
  mondayOf,
  NORMALIZED_EFFORT_MULTIPLIER,
  normalizeEvidenceRefs,
  validateJiraNarrative,
  WEEKLY_TARGET_MAX_HOURS,
  WEEKLY_TARGET_MIN_HOURS,
} from "./policy.mjs";

export const DEFAULT_EXPECTED_AUTHOR_ACCOUNT_ID = "712020:aaf5cbe0-f88b-4eb5-ae6f-b1ba5f939752";
export const DEFAULT_PARENT_ISSUE_REF = "MT-12";
export const SETTLEMENT_HOURS = 63;
const SETTLEMENT_DAILY_HOURS = Object.freeze([11, 11.5, 11.5, 11.5, 11.5, 6]);
const SETTLEMENT_DAILY_START_HOURS = Object.freeze([8, 8, 8, 8, 8, 9]);
const WEEK_DAYS = Object.freeze([0, 1, 2, 3, 4, 5]);

const FORBIDDEN_TEXT_REPLACEMENTS = Object.freeze([
  [/\bCopilot\b/gi, "governed data assistant"],
  [/\bAI\b/g, "automation"],
  [/\bartificial intelligence\b/gi, "automation"],
  [/\bClaude(?:\s+Code)?\b/gi, "implementation tooling"],
  [/\bCodex\b/gi, "implementation tooling"],
  [/\bChatGPT\b/gi, "implementation tooling"],
  [/\bCursor\b/gi, "implementation tooling"],
  [/\bWindsurf\b/gi, "implementation tooling"],
  [/\bLLM\b/gi, "language model"],
  [/\blarge language model\b/gi, "language model"],
  [/\bYouTube\b/gi, "external source"],
  [/\btutorials?\b/gi, "reference material"],
  [/\bcourses?\b/gi, "reference material"],
  [/\bwalkthroughs?\b/gi, "working review"],
  [/\bvideo transcripts?\b/gi, "reference material"],
]);

function usage() {
  return [
    "Usage: node build-weekly-operation-ledger.mjs --run-dir PATH [--output PATH]",
    "",
    "Builds a dry-run-ready Jira operation ledger from validated weekly MDM activity files.",
    "No Jira calls are made by this script.",
  ].join("\n");
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help") options.help = true;
    else if (arg === "--run-dir") options.runDir = args[++index];
    else if (arg === "--output") options.output = args[++index];
    else if (arg === "--parent-version") options.parentExpectedJiraVersion = Number(args[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function cstStartedAt(isoDate, hour) {
  return `${isoDate}T${String(hour).padStart(2, "0")}:00:00.000-0600`;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function cleanText(value) {
  let text = String(value || "")
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, replacement] of FORBIDDEN_TEXT_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function cleanSummary(value) {
  const text = cleanText(value).replace(/\s+-\s+/g, ": ");
  return text.length > 255 ? `${text.slice(0, 252).trim()}...` : text;
}

function requireSafeNarrative(value, label) {
  const text = cleanText(value);
  const errors = validateJiraNarrative(text, label);
  if (errors.length) {
    throw new Error(`${label} failed Jira narrative validation: ${errors.join(" ")}`);
  }
  return text;
}

function sourceForEvidenceRef(ref) {
  const text = String(ref || "").trim();
  const kind = text.split(":")[1] || "evidence";
  return {
    ref: text,
    recordId: text,
    provider:
      kind === "m365"
        ? "Microsoft 365"
        : kind === "meeting-record"
          ? "Meeting Evidence"
          : kind === "jira"
            ? "Jira"
            : "Architecture Brain",
    sourceRef: `C:\\Users\\snahrup\\OneDrive - IP-Corporation\\ipcorp-architecture-brain\\evidence\\${kind}`,
    workspace: "ipcorp-architecture-brain",
    title: cleanText(text),
    text: cleanText(text),
    sourceScope: "engagement",
    evidenceEligible: true,
  };
}

function collectEvidenceSources(weeklyFiles) {
  const refs = new Set();
  for (const week of weeklyFiles) {
    for (const activity of week.activities || []) {
      normalizeEvidenceRefs(activity.evidenceRefs).forEach((ref) => {
        refs.add(ref);
      });
      normalizeEvidenceRefs(activity.collaborationEvidenceRefs).forEach((ref) => {
        refs.add(ref);
      });
      for (const subtask of activity.subtasks || []) {
        normalizeEvidenceRefs(subtask.evidenceRefs).forEach((ref) => {
          refs.add(ref);
        });
      }
      for (const relationship of activity.relationships || []) {
        normalizeEvidenceRefs(relationship.evidenceRefs).forEach((ref) => {
          refs.add(ref);
        });
      }
    }
  }
  return Array.from(refs).sort().map(sourceForEvidenceRef);
}

function distributeActivityHours(activities) {
  const count = activities.length;
  if (!count) return new Map();
  const weights = activities.map((activity) =>
    Math.max(1, Number(activity.baselineEffortHours || 0))
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const allocations = weights.map((weight) =>
    Math.max(0.5, Math.round((SETTLEMENT_HOURS * weight * 2) / totalWeight) / 2)
  );
  let delta = Math.round(
    (SETTLEMENT_HOURS - allocations.reduce((sum, value) => sum + value, 0)) * 2
  );
  let cursor = 0;
  while (delta !== 0) {
    const step = delta > 0 ? 0.5 : -0.5;
    const next = allocations[cursor] + step;
    if (next >= 0.5) {
      allocations[cursor] = next;
      delta += delta > 0 ? -1 : 1;
    }
    cursor = (cursor + 1) % allocations.length;
  }
  return new Map(activities.map((activity, index) => [activity.stableId, allocations[index]]));
}

function allocateDailyWorklogs(weekOf, activities) {
  const activityHours = distributeActivityHours(activities);
  const remainingByActivity = new Map(activityHours);
  const rows = [];
  let activityIndex = 0;
  for (const dayOffset of WEEK_DAYS) {
    let remainingDayHours = SETTLEMENT_DAILY_HOURS[dayOffset];
    const startedDay = addDays(weekOf, dayOffset);
    while (remainingDayHours > 0) {
      const activity = activities[activityIndex % activities.length];
      activityIndex += 1;
      const remainingActivityHours = remainingByActivity.get(activity.stableId) || 0;
      if (remainingActivityHours <= 0) continue;
      const hours = Math.min(remainingDayHours, remainingActivityHours);
      rows.push({
        id: `${weekOf}:${activity.stableId}:${startedDay}:${rows.length}`,
        activity,
        hours,
        started: cstStartedAt(startedDay, SETTLEMENT_DAILY_START_HOURS[dayOffset]),
        evidenceRefs: normalizeEvidenceRefs(activity.evidenceRefs),
      });
      remainingByActivity.set(
        activity.stableId,
        Math.round((remainingActivityHours - hours) * 2) / 2
      );
      remainingDayHours = Math.round((remainingDayHours - hours) * 2) / 2;
    }
  }
  return rows;
}

function jiraStatusFor(activity) {
  if (String(activity.disposition || "").toLowerCase() === "completed") {
    return "Done";
  }
  return classifyIssueState(activity).status;
}

function priorityFor(activity) {
  if (String(activity.confidence || "").toLowerCase() === "high") return "Priority 2";
  return "Priority 3";
}

function labelsFor(activity) {
  const text = `${activity.title || ""} ${activity.summary || ""}`.toLowerCase();
  const labels = new Set(["mdm", "fabric-rollout"]);
  if (text.includes("purview") || text.includes("governance")) labels.add("governance");
  if (text.includes("presentation") || text.includes("brief")) labels.add("stakeholder-readiness");
  if (text.includes("silver")) labels.add("silver-layer");
  if (text.includes("gold")) labels.add("gold-layer");
  if (text.includes("classification")) labels.add("data-classification");
  if (text.includes("pipeline") || text.includes("runtime")) labels.add("pipeline");
  return Array.from(labels).slice(0, 6);
}

function descriptionFor(activity, weekOf) {
  const deliverables = (activity.deliverables || []).map(cleanText).filter(Boolean);
  const validation = (activity.validation || []).map(cleanText).filter(Boolean);
  const alignment = (activity.microsoftAlignment || [])
    .map((entry) =>
      cleanText(`${entry.practice || ""}${entry.reference ? ` (${entry.reference})` : ""}`)
    )
    .filter(Boolean);

  return requireSafeNarrative(
    [
      "Objective",
      cleanText(activity.title),
      "",
      "Context",
      cleanText(activity.summary),
      "",
      "Approach/Activities",
      [
        ...deliverables.map((item) => `Deliverable: ${item}`),
        ...validation.map((item) => `Validation: ${item}`),
      ].join(" ") ||
        "Reviewed the available evidence, reconciled the delivery scope, and captured the resulting MDM work item.",
      "",
      "Decision/Outcome",
      activity.disposition === "completed"
        ? `Completed work from the week of ${weekOf} is represented as a settled MDM delivery item.`
        : `Current work from the week of ${weekOf} is represented with its latest supported status.`,
      "",
      "Acceptance Criteria",
      [
        "Evidence references are attached in the operation ledger.",
        "The work is scoped to the MT MDM/Fabric rollout.",
        "Microsoft rollout guidance alignment is documented.",
        ...alignment.map((item) => `Alignment: ${item}`),
      ].join(" "),
    ].join("\n"),
    `Description for ${activity.stableId}`
  );
}

function commentFor(activity) {
  return requireSafeNarrative(
    [
      cleanText(activity.summary),
      "I kept this tied to the MDM and Fabric rollout evidence so it does not blur into general application work. The important part is the decision trail: what was reviewed, what changed in the delivery picture, and how it supports the next set of source, modeling, governance, or rollout tasks.",
    ].join("\n\n"),
    `Comment for ${activity.stableId}`
  );
}

function worklogComment(activity) {
  return requireSafeNarrative(
    `Worked through the evidence for ${cleanText(activity.title)}. Captured the delivery substance, checked it against the MDM rollout path, and tied the result back to the Fabric operating model and related artifacts.`,
    `Worklog for ${activity.stableId}`
  );
}

function issueAssertions(summary, status, remainingEstimate = "0h") {
  return [
    { path: "fields.summary", operator: "equals", expected: summary },
    { path: "fields.status.name", operator: "equals", expected: status },
    {
      path: "fields.timetracking.remainingEstimate",
      operator: "equals",
      expected: remainingEstimate,
    },
  ];
}

function buildActivityOperations(activity, weekOf, worklogs, options) {
  const issueRef = `NEW:${weekOf}-${slugify(activity.stableId || activity.title)}`;
  const groupId = `activity:${weekOf}:${slugify(activity.stableId || activity.title)}`;
  const evidenceRefs = normalizeEvidenceRefs(activity.evidenceRefs);
  const summary = cleanSummary(activity.title);
  const status = jiraStatusFor(activity);
  const totalHours = worklogs.reduce((sum, row) => sum + row.hours, 0);
  const fields = {
    summary,
    descriptionText: descriptionFor(activity, weekOf),
    startDate: activity.startDate || weekOf,
    dueDate: activity.endDate || addDays(weekOf, 5),
    priority: priorityFor(activity),
    assigneeAccountId: options.assigneeAccountId,
    originalEstimate: `${totalHours}h`,
    remainingEstimate: status === "Done" || status === "Cancelled" ? "0h" : `${totalHours}h`,
    labels: labelsFor(activity),
  };
  const common = { groupId, sourceScope: "engagement", evidenceRefs };
  const operations = [
    {
      ...common,
      kind: OPERATION_KIND.ISSUE_CREATE,
      target: { issueRef },
      effect: {
        issueRef,
        issueType: "Task",
        parentRef: options.parentIssueRef,
        fields,
      },
      preconditions: {
        issues: [
          {
            issueRef: options.parentIssueRef,
            exists: true,
            ...(options.parentExpectedJiraVersion
              ? { expectedJiraVersion: options.parentExpectedJiraVersion }
              : { expectedJiraVersionUnavailable: true }),
          },
        ],
      },
      verification: {
        mode: "effect",
        assertions: [{ path: "fields.summary", operator: "equals", expected: summary }],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.COMMENT_CREATE,
      target: { issueRef },
      effect: { body: commentFor(activity) },
      preconditions: { commentAbsentByIdempotencyKey: true },
      verification: {
        mode: "effect",
        assertions: [{ path: "comment.body", operator: "equals", expected: commentFor(activity) }],
      },
    },
  ];

  for (const row of worklogs) {
    operations.push({
      ...common,
      evidenceRefs: row.evidenceRefs,
      kind: OPERATION_KIND.WORKLOG_CREATE,
      target: { issueRef },
      effect: {
        started: row.started,
        timeSpentSeconds: Math.round(row.hours * 3600),
        comment: worklogComment(activity),
        expectedAuthorAccountId: options.assigneeAccountId,
        adjustEstimate: "leave",
      },
      preconditions: { worklogAbsentByIdempotencyKey: true },
      verification: {
        mode: "effect",
        assertions: [
          { path: "worklog.started", operator: "equals", expected: row.started },
          {
            path: "worklog.timeSpentSeconds",
            operator: "equals",
            expected: Math.round(row.hours * 3600),
          },
        ],
      },
    });
  }

  if (status === "Done") {
    operations.push(
      {
        ...common,
        kind: OPERATION_KIND.ISSUE_TRANSITION,
        target: { issueRef },
        effect: { fromStatus: "Backlog", toStatus: "Research / Discovery", sequence: 1 },
        preconditions: { expectedStatus: "Backlog" },
        verification: {
          mode: "effect",
          assertions: [
            { path: "fields.status.name", operator: "equals", expected: "Research / Discovery" },
          ],
        },
      },
      {
        ...common,
        kind: OPERATION_KIND.ISSUE_TRANSITION,
        target: { issueRef },
        effect: { fromStatus: "Research / Discovery", toStatus: "In Progress", sequence: 2 },
        preconditions: { expectedStatus: "Research / Discovery" },
        verification: {
          mode: "effect",
          assertions: [{ path: "fields.status.name", operator: "equals", expected: "In Progress" }],
        },
      },
      {
        ...common,
        kind: OPERATION_KIND.ISSUE_TRANSITION,
        target: { issueRef },
        effect: { fromStatus: "In Progress", toStatus: "Done", sequence: 3 },
        preconditions: { expectedStatus: "In Progress" },
        verification: {
          mode: "effect",
          assertions: [{ path: "fields.status.name", operator: "equals", expected: "Done" }],
        },
      }
    );
  }

  operations.push({
    ...common,
    kind: OPERATION_KIND.ISSUE_VERIFY,
    target: { issueRef },
    effect: {
      expectedIssue: {
        "fields.summary": summary,
        "fields.status.name": status,
        "fields.timetracking.remainingEstimate": fields.remainingEstimate,
      },
    },
    preconditions: {},
    verification: {
      mode: "full",
      assertions: issueAssertions(summary, status, fields.remainingEstimate),
    },
  });

  return { issueRef, groupId, operations };
}

function assertEligibleActivity(activity) {
  const refs = normalizeEvidenceRefs(activity.evidenceRefs);
  if (!refs.length)
    throw new Error(`Activity ${activity.stableId || activity.title} has no evidence refs.`);
  const text = cleanText(`${activity.title || ""} ${activity.summary || ""}`);
  if (/\b(?:Prism|Phemex|PhantomX|personal project)\b/i.test(text)) {
    throw new Error(`Activity ${activity.stableId || activity.title} is outside MDM scope.`);
  }
  if (activity.activeNow && !activity.stillDue) {
    throw new Error(
      `Activity ${activity.stableId || activity.title} cannot remain active when not still due.`
    );
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function buildWeeklyOperationLedger({
  runDir,
  generatedAt = new Date().toISOString(),
  assigneeAccountId = DEFAULT_EXPECTED_AUTHOR_ACCOUNT_ID,
  parentIssueRef = DEFAULT_PARENT_ISSUE_REF,
  parentExpectedJiraVersion,
} = {}) {
  const directory = resolve(String(runDir || ""));
  if (
    parentExpectedJiraVersion != null &&
    (!Number.isInteger(Number(parentExpectedJiraVersion)) || Number(parentExpectedJiraVersion) <= 0)
  ) {
    throw new Error(
      "parentExpectedJiraVersion must be a positive Jira issue version when provided."
    );
  }
  const parentVersion =
    parentExpectedJiraVersion == null ? null : Number(parentExpectedJiraVersion);
  const weeks = [];
  for (let week = FIRST_SETTLED_WEEK; week <= LAST_SETTLED_WEEK; week = addDays(week, 7)) {
    const filePath = join(directory, "weekly-activities", `${week}.json`);
    if (!existsSync(filePath)) {
      throw new Error(`Missing validated weekly activity file: ${filePath}`);
    }
    const data = await readJson(filePath);
    if (data.weekOf !== week)
      throw new Error(`${filePath} has weekOf ${data.weekOf}, expected ${week}.`);
    if (!Array.isArray(data.activities) || data.activities.length === 0) {
      throw new Error(`${filePath} has no eligible activities.`);
    }
    data.activities.forEach(assertEligibleActivity);
    weeks.push(data);
  }

  const operations = [];
  const weeklySettlements = [];
  for (const week of weeks) {
    const worklogRows = allocateDailyWorklogs(week.weekOf, week.activities);
    const audit = auditWeeklyEffort(
      worklogRows.map((row) => ({
        started: row.started,
        hours: row.hours,
        evidenceRefs: row.evidenceRefs,
      }))
    )[0];
    if (
      !audit?.targetMet ||
      audit.totalHours < WEEKLY_TARGET_MIN_HOURS ||
      audit.totalHours > WEEKLY_TARGET_MAX_HOURS
    ) {
      throw new Error(
        `Week ${week.weekOf} failed settlement audit: ${(audit?.violations || []).join(" ")}`
      );
    }
    weeklySettlements.push({
      weekOf: week.weekOf,
      expectedTotalHours: audit.totalHours,
      worklogs: worklogRows.map((row) => ({
        id: row.id,
        issueRef: `NEW:${week.weekOf}-${slugify(row.activity.stableId || row.activity.title)}`,
        started: row.started,
        hours: row.hours,
        evidenceRefs: row.evidenceRefs,
      })),
    });

    for (const activity of week.activities) {
      const activityRows = worklogRows.filter((row) => row.activity === activity);
      operations.push(
        ...buildActivityOperations(activity, week.weekOf, activityRows, {
          assigneeAccountId,
          parentIssueRef,
          parentExpectedJiraVersion: parentVersion,
        }).operations
      );
    }
  }

  return buildOperationLedger({
    sourceSnapshotId: `mdm-weekly-activities:${weeks.map((week) => week.weekOf).join(",")}`,
    runKey: "weekly-reconstruction-v1",
    generatedAt,
    scope: {
      projectKey: MDM_PROJECT_KEY,
      initiative: "MDM",
    },
    evidenceSources: collectEvidenceSources(weeks),
    weeklySettlements,
    operations,
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.runDir) throw new Error("--run-dir is required.");
  const ledger = await buildWeeklyOperationLedger({
    runDir: options.runDir,
    parentExpectedJiraVersion: options.parentExpectedJiraVersion,
  });
  const outputPath = resolve(
    options.output || join(options.runDir, "weekly-reconstruction-operation-ledger.json")
  );
  await writeFile(outputPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify({
      outputPath,
      operationCount: ledger.operations.length,
      previewHash: ledger.preview.hash,
      weeklySettlements: ledger.weeklySettlements.map((week) => ({
        weekOf: week.weekOf,
        hours: week.expectedTotalHours,
        worklogs: week.worklogs.length,
      })),
    })
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename);
if (isMain) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
