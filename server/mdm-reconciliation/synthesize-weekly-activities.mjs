import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { jsonrepair } from "jsonrepair";
import { classifyEvidenceEligibility, mondayOf } from "./policy.mjs";

const FRONTEND_ROOT = resolve(
  new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
);
const RUN_ROOT = join(FRONTEND_ROOT, "workflow-runs", "mdm-jira-rebuild");
const CLAUDE_CLI =
  process.env.CLAUDE_CODE_EXECUTABLE || "C:\\Users\\snahrup\\.local\\bin\\claude.exe";
const MODEL = process.env.MDM_RECONCILE_MODEL || "claude-sonnet-4-6";
const MAX_WEEK_CHARS = 120_000;
const QUERY_TIMEOUT_MS = 15 * 60 * 1000;

const SYSTEM_PROMPT = `You are the evidence analyst for the IP Corporation MDM/Fabric Jira portfolio.

Your job is to reconstruct actual work from authorized evidence. Return only valid JSON.

Hard truth rules:
1. Never invent work, deliverables, meetings, conversations, participants, approvals, decisions, dates, status, or completion.
2. A user request or queued instruction proves intent only. Completion requires a visible result plus an artifact, commit, test, Jira transition, or another corroborating record.
3. Treat work as Steve's solo work by default. Name another participant only when a calendar, transcript, email, Teams, Jira, or equivalent collaboration record explicitly proves that person participated. List the exact collaboration evidence references.
4. Exclude all personal projects, personal application development, trading work, and non-engagement activity. Prism and Prism v2 are implementation references only and never MDM work evidence.
5. "In Progress" is reserved for work demonstrably active now and still due. Historical unfinished work is not automatically active now.
6. Subtasks are appropriate only for real independently trackable decomposition. Never emit skeleton subtasks.
7. A blocker, dependency, duplicate, supersession, or related-work relationship requires evidence.
8. Team Library and Microsoft guidance artifacts can justify alignment or planned work. They do not prove historical execution by themselves.
9. Hidden reasoning is not evidence. Use only the supplied visible and system records.
10. Exclude building, debugging, operating, or maintaining personal/internal applications and automation, including the Brain frontend, Prism, Cortex, live-brain-assist, connector development, and post-meeting automation. A direct MDM program artifact, decision, or meeting outcome produced through one of those systems may still prove the business activity itself, but the tool operation and its elapsed time are not MDM Jira work.
11. Do not write Jira-ready comments yet. This stage emits neutral factual activity units and exact source references.

Output schema:
{
  "weekOf": "YYYY-MM-DD",
  "activities": [
    {
      "stableId": "week-local-stable-slug",
      "title": "concise factual title",
      "summary": "neutral factual summary",
      "startDate": "YYYY-MM-DD or null",
      "endDate": "YYYY-MM-DD or null",
      "disposition": "completed|active-now|planned|research|blocked|obsolete|unknown",
      "activeNow": false,
      "stillDue": false,
      "solo": true,
      "participants": [],
      "collaborationEvidenceRefs": [],
      "evidenceRefs": [],
      "candidateJiraKeys": [],
      "deliverables": [],
      "validation": [],
      "technicalDetails": [],
      "baselineEffortHours": 0,
      "effortBasis": "observed-session|existing-normalized-worklog|artifact-scope|unknown",
      "microsoftAlignment": [
        {"practice": "specific practice", "reference": "guidance evidence ref"}
      ],
      "subtasks": [
        {
          "stableId": "stable-subtask-slug",
          "title": "independently trackable result",
          "summary": "what was actually done or remains planned",
          "disposition": "completed|active-now|planned|research|blocked|obsolete|unknown",
          "startDate": "YYYY-MM-DD or null",
          "endDate": "YYYY-MM-DD or null",
          "evidenceRefs": [],
          "candidateJiraKeys": []
        }
      ],
      "relationships": [
        {
          "type": "blocks|depends-on|related|duplicate|supersedes",
          "target": "stableId or MT-N",
          "evidenceRefs": []
        }
      ],
      "confidence": "high|medium|low"
    }
  ],
  "unresolved": [
    {"question": "what cannot be safely determined", "evidenceRefs": []}
  ],
  "excluded": [
    {"reason": "personal|reference-only|request-only|duplicate|unrelated", "evidenceRefs": []}
  ]
}`;

function parseJson(value) {
  let text = String(value || "").trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  try {
    return JSON.parse(text);
  } catch {
    let controlSafe = "";
    let inString = false;
    let escaped = false;
    for (const character of text) {
      if (!inString) {
        controlSafe += character;
        if (character === '"') inString = true;
        continue;
      }
      if (escaped) {
        controlSafe += character;
        escaped = false;
        continue;
      }
      if (character === "\\") {
        controlSafe += character;
        escaped = true;
        continue;
      }
      if (character === '"') {
        controlSafe += character;
        inString = false;
        continue;
      }

      const code = character.charCodeAt(0);
      controlSafe += code < 0x20 ? `\\u${code.toString(16).padStart(4, "0")}` : character;
    }
    return JSON.parse(jsonrepair(controlSafe));
  }
}

async function readJsonLines(path) {
  return (await readFile(path, "utf8"))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function priority(record) {
  const ranks = {
    "work-session": 0,
    "repository-commit": 1,
    "jira-comment": 1,
    "jira-worklog": 1,
    "jira-change": 2,
    "meeting-record": 2,
    "jira-issue": 3,
    "brain-document": 4,
    "team-library-artifact": 5,
  };
  return ranks[record.sourceType] ?? 6;
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

function recordText(record) {
  const compact = String(rawRecordBody(record) || "").slice(0, 16_000);
  return [
    `[${record.id}]`,
    `type=${record.sourceType}`,
    `provider=${record.provider}`,
    `eventAt=${record.eventAt || "undated"}`,
    `title=${record.title || ""}`,
    `sourceRef=${record.sourceRef || ""}`,
    `baselineMinutes=${record.baselineMinutes || 0}`,
    `recordedHours=${record.recordedHours || 0}`,
    `completionSignal=${Boolean(record.completionSignal)}`,
    `collaborationEvidence=${Boolean(record.collaborationEvidence)}`,
    `evidenceEligible=${record.evidenceEligible !== false}`,
    `eligibilityReasons=${(record.eligibilityReasons || []).join(",")}`,
    `sourceRecordIds=${(record.sourceRecordIds || [record.id]).join(",")}`,
    compact,
  ].join("\n");
}

function compactIssueIndex(issues) {
  return issues
    .map((issue) =>
      [
        issue.key,
        issue.issueType,
        issue.parentKey || "-",
        issue.status?.name || "Unknown",
        issue.summary,
      ].join(" | ")
    )
    .join("\n");
}

function guidanceContext(records) {
  const preferred = records.filter(
    (record) =>
      record.sourceType === "team-library-artifact" &&
      /(?:adoption|rollout|microsoft guidance|operations migration|purview launch)/i.test(
        `${record.sourceRef} ${record.title}`
      )
  );
  return preferred
    .slice(0, 8)
    .map((record) => `[${record.id}] ${record.title}\n${String(record.text || "").slice(0, 5_000)}`)
    .join("\n\n")
    .slice(0, 25_000);
}

function buildWeekContext(weekOf, records, issues, guidance) {
  const original = records.filter((record) => record.weekOf === weekOf);
  const condensed = condenseWeekRecords(original).sort(
    (left, right) => priority(left) - priority(right)
  );
  const ineligible = condensed.filter((record) => record.evidenceEligible === false);
  const selected = condensed.filter((record) => record.evidenceEligible !== false);
  const blocks = [];
  let used = 0;
  for (const record of selected) {
    const block = recordText(record);
    if (used + block.length > MAX_WEEK_CHARS) continue;
    blocks.push(block);
    used += block.length;
  }
  return {
    selected,
    ineligible,
    originalCount: original.length,
    included: blocks.length,
    omitted: selected.length - blocks.length,
    prompt: `Analyze the evidence for the week of ${weekOf}.

CURRENT DATE: ${new Date().toISOString().slice(0, 10)}

CURRENT JIRA ISSUE INDEX:
${compactIssueIndex(issues)}

MICROSOFT / TEAM LIBRARY GUIDANCE REFERENCES:
${guidance || "(none available)"}

WEEK EVIDENCE:
${blocks.join("\n\n---\n\n")}

Coverage note: ${original.length} source records were condensed into ${
      condensed.length
    } provenance-preserving groups. ${ineligible.length} personal, reference-only, or internal-tool groups were withheld from activity evidence. ${
      blocks.length
    } eligible groups were included and ${
      selected.length - blocks.length
    } omitted by the bounded context budget. Do not infer facts from omitted groups.

Return only the JSON object from the required schema. The weekOf value must be "${weekOf}".`,
  };
}

async function runQuery(prompt) {
  let responseText = "";
  let resultText = "";
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), QUERY_TIMEOUT_MS);
  try {
    for await (const message of query({
      prompt,
      options: {
        model: MODEL,
        systemPrompt: SYSTEM_PROMPT,
        pathToClaudeCodeExecutable: CLAUDE_CLI,
        permissionMode: "bypassPermissions",
        persistSession: false,
        includePartialMessages: false,
        cwd: FRONTEND_ROOT,
        env: { ...process.env },
        tools: [],
        settingSources: [],
        maxTurns: 1,
        abortController,
      },
    })) {
      if (message.type === "assistant") {
        for (const block of message.message?.content || []) {
          if (block.type === "text" && block.text) responseText += block.text;
        }
      }
      if (message.type === "result") {
        if (message.is_error) throw new Error(message.error || "Agent SDK query failed.");
        if (typeof message.result === "string") resultText = message.result;
      }
    }
  } finally {
    clearTimeout(timeout);
  }
  return resultText || responseText;
}

function validateResult(result, weekOf, knownRefs, knownRecords) {
  const errors = [];
  if (result?.weekOf !== weekOf) errors.push(`weekOf must equal ${weekOf}.`);
  if (!Array.isArray(result?.activities)) errors.push("activities must be an array.");
  if (!Array.isArray(result?.unresolved)) errors.push("unresolved must be an array.");
  if (!Array.isArray(result?.excluded)) errors.push("excluded must be an array.");
  for (const activity of result?.activities || []) {
    if (!activity.stableId || !activity.title || !activity.disposition) {
      errors.push("Every activity requires stableId, title, and disposition.");
    }
    if (!Array.isArray(activity.evidenceRefs) || !activity.evidenceRefs.length) {
      errors.push(`${activity.stableId || "activity"} has no evidence references.`);
    }
    for (const reference of activity.evidenceRefs || []) {
      if (!knownRefs.has(reference)) {
        errors.push(`${activity.stableId || "activity"} cites unknown evidence ${reference}.`);
      } else if (knownRecords.get(reference)?.evidenceEligible === false) {
        errors.push(
          `${activity.stableId || "activity"} cites personal or reference-only evidence ${reference}.`
        );
      }
    }
    if (activity.participants?.length && !activity.collaborationEvidenceRefs?.length) {
      errors.push(
        `${activity.stableId || "activity"} names participants without collaboration evidence.`
      );
    }
    if (activity.disposition === "active-now" && (!activity.activeNow || !activity.stillDue)) {
      errors.push(
        `${activity.stableId || "activity"} is active-now without activeNow and stillDue.`
      );
    }
  }
  return errors;
}

function canonicalizeEvidenceReferences(value, knownRefs, evidenceAliases) {
  const known = [...knownRefs];
  const canonicalize = (reference) => {
    if (typeof reference !== "string" || knownRefs.has(reference)) return reference;
    if (evidenceAliases.has(reference)) return evidenceAliases.get(reference);
    const candidates = known.filter(
      (candidate) =>
        candidate.replace(/^aggregate:/, "") === reference || candidate.endsWith(`:${reference}`)
    );
    return candidates.length === 1 ? candidates[0] : reference;
  };

  const visit = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      if ((key === "evidenceRefs" || key === "collaborationEvidenceRefs") && Array.isArray(child)) {
        node[key] = child.map(canonicalize);
      } else {
        visit(child);
      }
    }
  };

  visit(value);
  return value;
}

async function main() {
  const argumentsList = process.argv.slice(2);
  const requestedWeekIndex = argumentsList.indexOf("--week");
  const requestedWeek = requestedWeekIndex >= 0 ? argumentsList[requestedWeekIndex + 1] : null;
  const latest = JSON.parse(await readFile(join(RUN_ROOT, "latest.json"), "utf8"));
  const evidence = await readJsonLines(join(latest.runDirectory, "evidence.jsonl"));
  const jiraPayload = JSON.parse(
    await readFile(join(latest.runDirectory, "jira-export-response.json"), "utf8")
  );
  const issues = jiraPayload.data?.issues || [];
  const guidance = guidanceContext(evidence);
  const outputRoot = join(latest.runDirectory, "weekly-activities");
  const rawOutputRoot = join(outputRoot, "raw");
  await mkdir(outputRoot, { recursive: true });
  await mkdir(rawOutputRoot, { recursive: true });

  const weeks = Array.from(
    new Set(
      evidence.map((record) => record.weekOf).filter((week) => week && week.startsWith("2026-"))
    )
  )
    .filter((week) => !requestedWeek || week === mondayOf(requestedWeek))
    .sort();

  const index = [];
  for (const weekOf of weeks) {
    const outputPath = join(outputRoot, `${weekOf}.json`);
    try {
      const existing = JSON.parse(await readFile(outputPath, "utf8"));
      if (existing?.weekOf === weekOf && Array.isArray(existing.activities)) {
        index.push({
          weekOf,
          state: "existing",
          activities: existing.activities.length,
          outputPath,
        });
        continue;
      }
    } catch {
      // Synthesize a missing or invalid checkpoint.
    }

    const context = buildWeekContext(weekOf, evidence, issues, guidance);
    const knownRefs = new Set(context.selected.map((record) => record.id));
    const knownRecords = new Map(context.selected.map((record) => [record.id, record]));
    const evidenceAliases = new Map();
    const ambiguousAliases = new Set();
    for (const record of context.selected) {
      for (const sourceRecordId of record.sourceRecordIds || []) {
        if (evidenceAliases.has(sourceRecordId)) {
          ambiguousAliases.add(sourceRecordId);
        } else {
          evidenceAliases.set(sourceRecordId, record.id);
        }
      }
    }
    for (const sourceRecordId of ambiguousAliases) evidenceAliases.delete(sourceRecordId);
    let parsed = null;
    let errors = [];
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const raw = await runQuery(
        attempt === 1
          ? context.prompt
          : `${context.prompt}\n\nThe previous response was invalid: ${errors.join(
              " "
            )}\nReturn corrected JSON only.`
      );
      await writeFile(join(rawOutputRoot, `${weekOf}-attempt-${attempt}.txt`), raw, "utf8");
      try {
        parsed = canonicalizeEvidenceReferences(parseJson(raw), knownRefs, evidenceAliases);
        errors = validateResult(parsed, weekOf, knownRefs, knownRecords);
      } catch (error) {
        errors = [error instanceof Error ? error.message : String(error)];
      }
      if (!errors.length) break;
    }
    if (!parsed || errors.length) {
      throw new Error(`${weekOf} synthesis failed validation: ${errors.join(" ")}`);
    }
    parsed.coverage = {
      sourceRecords: context.originalCount,
      condensedGroups: context.selected.length,
      ineligibleGroupsWithheld: context.ineligible.length,
      includedGroups: context.included,
      omittedGroups: context.omitted,
      bounded: context.omitted > 0,
    };
    parsed.excluded = [
      ...(parsed.excluded || []),
      ...context.ineligible.map((record) => ({
        reason: record.eligibilityReasons?.[0] || "personal",
        evidenceRefs: [record.id],
      })),
    ];
    parsed.policy = {
      personalWorkExcluded: true,
      soloByDefault: true,
      activeNowRequiresCurrentEvidence: true,
      hiddenReasoningExcluded: true,
    };
    await writeFile(outputPath, JSON.stringify(parsed, null, 2), "utf8");
    index.push({
      weekOf,
      state: "generated",
      activities: parsed.activities.length,
      outputPath,
      coverage: parsed.coverage,
    });
    console.log(
      JSON.stringify({
        weekOf,
        activities: parsed.activities.length,
        unresolved: parsed.unresolved.length,
        coverage: parsed.coverage,
      })
    );
  }
  await writeFile(
    join(latest.runDirectory, "weekly-activities-index.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), weeks: index }, null, 2),
    "utf8"
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })
  );
  process.exitCode = 1;
});
