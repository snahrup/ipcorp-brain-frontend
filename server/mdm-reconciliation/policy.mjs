export const MDM_PROJECT_KEY = "MT";
export const POLICY_VERSION = "2026-07-28.4";
export const NORMALIZED_EFFORT_MULTIPLIER = 3;
export const WEEKLY_TARGET_MIN_HOURS = 60;
export const WEEKLY_TARGET_MAX_HOURS = 65;
export const MAX_WEEKDAY_HOURS = 12;
export const MAX_SATURDAY_HOURS = 6;
export const RETROACTIVE_WINDOW_START = "2026-05-01";
export const RETROACTIVE_WINDOW_END = "2026-07-28";
export const FIRST_SETTLED_WEEK = "2026-05-04";
export const LAST_SETTLED_WEEK = "2026-07-20";

export const ACTIVE_STATUS_NAMES = new Set(["In Progress"]);
export const TERMINAL_STATUS_NAMES = new Set(["Done", "Cancelled"]);
export const CURRENT_NON_ACTIVE_STATUS_NAMES = new Set([
  "Backlog",
  "Research / Discovery",
  "Planning",
  "In Review",
  "Blocked",
]);

const jiraNarrativeProhibitions = [
  /\b(?:claude|codex|chatgpt|copilot|cursor|windsurf)\b/i,
  /\b(?:artificial intelligence|large language model|llm)\b/i,
  /\b(?:youtube|tutorial|course|walkthrough|video transcript)\b/i,
  /—/,
];

const personalWorkSignals = [
  /\bPrism Orchestrator\b/i,
  /\bPhemex\b/i,
  /\bPhantomX\b/i,
  /\bOutlier App\b/i,
  /\b(?:personal project|personal app(?:lication)? development)\b/i,
];

export function classifyEvidenceEligibility(record) {
  const source = `${record?.sourceRef || ""} ${record?.workspace || ""}`;
  const text = `${record?.title || ""} ${record?.text || ""} ${record?.visibleText || ""}`;
  if (/\\(?:Prism|prism-v2)(?:\\|$)/i.test(source) && record?.provider !== "Jira") {
    return {
      eligible: false,
      reason: "reference-only",
      detail: "Prism and Prism v2 are connector implementation references only.",
    };
  }
  if (
    record?.provider !== "Jira" &&
    (/(?:^|[\\/])cortex(?:[\\/]|$)/i.test(source) ||
      /[\\/](?:ipcorp-brain-frontend|live-brain-assist|copilot_cowork_mcp)(?:[\\/]|$)/i.test(
        source
      ) ||
      (record?.sourceType === "work-session" &&
        /[\\/]ipcorp-architecture-brain(?:[\\/]|$)/i.test(source)))
  ) {
    return {
      eligible: false,
      reason: "personal",
      detail:
        "Internal application, connector, Brain-automation, and personal-tool operation cannot support MDM Jira work or hours.",
    };
  }
  if (personalWorkSignals.some((pattern) => pattern.test(text))) {
    return {
      eligible: false,
      reason: "personal",
      detail: "The evidence describes personal or non-engagement application work.",
    };
  }
  return { eligible: true, reason: "engagement", detail: "The source is eligible for MDM review." };
}

function asDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDay(value) {
  const date = asDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

export function mondayOf(value) {
  const date = asDate(value);
  if (!date) return null;
  const day = date.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function normalizeEvidenceRefs(refs) {
  return Array.from(
    new Set(
      (Array.isArray(refs) ? refs : []).map((value) => String(value || "").trim()).filter(Boolean)
    )
  );
}

export function classifyIssueState(activity, now = new Date()) {
  const evidenceRefs = normalizeEvidenceRefs(activity?.evidenceRefs);
  if (!evidenceRefs.length) {
    return {
      status: "unresolved",
      applicable: false,
      reason: "No evidence supports a Jira workflow disposition.",
    };
  }

  if (activity?.superseded || activity?.obsolete || activity?.cancelled) {
    return {
      status: "Cancelled",
      applicable: true,
      reason: activity?.superseded
        ? "Current evidence identifies the work as superseded."
        : "Current evidence identifies the work as obsolete or cancelled.",
    };
  }

  if (activity?.completed) {
    return {
      status: "Done",
      applicable: true,
      reason:
        "Completion is supported by an artifact, repository change, test, or explicit source record.",
    };
  }

  if (activity?.blocked) {
    return {
      status: "Blocked",
      applicable: true,
      reason: "A current unresolved blocker is supported by the evidence.",
    };
  }

  const due = asDate(activity?.dueDate);
  const activeNow = activity?.activeNow === true;
  const stillDue = !due || due.getTime() >= new Date(isoDay(now)).getTime();
  if (activeNow && stillDue) {
    return {
      status: "In Progress",
      applicable: true,
      reason: "The work is demonstrably active now and remains due.",
    };
  }

  if (activity?.inReview) {
    return {
      status: "In Review",
      applicable: true,
      reason:
        "The implementation is complete enough for a current review, but completion is not yet proven.",
    };
  }

  if (activity?.planning) {
    return {
      status: "Planning",
      applicable: true,
      reason: "The work is current and scoped, but active implementation is not proven.",
    };
  }

  if (activity?.researching) {
    return {
      status: "Research / Discovery",
      applicable: true,
      reason: "The work is current discovery, but active implementation is not proven.",
    };
  }

  return {
    status: "Backlog",
    applicable: true,
    reason:
      activeNow && !stillDue
        ? "The activity signal is stale or past due, so it cannot remain In Progress."
        : "The work is supported as current or planned, but active execution is not proven.",
  };
}

export function validateParticipantClaims(activity) {
  const participants = Array.isArray(activity?.participants)
    ? activity.participants.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  if (!participants.length) return [];

  const collaborationRefs = normalizeEvidenceRefs(activity?.collaborationEvidenceRefs);
  if (!collaborationRefs.length) {
    return [
      "Named participants require calendar, transcript, email, Teams, Jira, or equivalent collaboration evidence.",
    ];
  }
  return [];
}

export function validateSubtask(subtask) {
  const errors = [];
  const requiredText = ["summary", "description", "startDate", "dueDate", "priority"];
  for (const field of requiredText) {
    if (!String(subtask?.[field] || "").trim()) {
      errors.push(`Subtask is missing ${field}.`);
    }
  }
  if (!Array.isArray(subtask?.labels) || subtask.labels.length < 2) {
    errors.push("Subtask requires at least two labels.");
  }
  if (!normalizeEvidenceRefs(subtask?.evidenceRefs).length) {
    errors.push("Subtask requires evidence references.");
  }
  if (!Array.isArray(subtask?.comments) || !subtask.comments.length) {
    errors.push("Subtask requires at least one evidence-backed comment.");
  }
  if (!Array.isArray(subtask?.worklogs) || !subtask.worklogs.length) {
    errors.push("Subtask requires worklog handling.");
  }
  errors.push(...validateParticipantClaims(subtask));
  return errors;
}

export function validateLink(link) {
  const errors = [];
  if (!["Blocks", "Relates", "Duplicate"].includes(link?.type)) {
    errors.push(`Unsupported Jira link type: ${link?.type || "missing"}.`);
  }
  if (!String(link?.from || "").match(/^(?:MT-\d+|NEW:[A-Za-z0-9._-]+)$/)) {
    errors.push("Link source must be an MT issue or a stable new-issue reference.");
  }
  if (!String(link?.to || "").match(/^(?:MT-\d+|NEW:[A-Za-z0-9._-]+)$/)) {
    errors.push("Link target must be an MT issue or a stable new-issue reference.");
  }
  if (!normalizeEvidenceRefs(link?.evidenceRefs).length) {
    errors.push("Jira links require evidence references.");
  }
  return errors;
}

export function validateJiraNarrative(value, label = "Jira narrative") {
  const text = String(value || "");
  const errors = [];
  for (const pattern of jiraNarrativeProhibitions) {
    if (pattern.test(text)) {
      errors.push(`${label} contains prohibited wording: ${pattern}.`);
    }
  }
  if (/\b(?:we met|met with|spoke with|talked with|discussed with)\b/i.test(text)) {
    errors.push(
      `${label} contains a collaboration claim that must be backed by an explicit collaboration reference.`
    );
  }
  return errors;
}

export function validateOperation(operation) {
  const errors = [];
  if (operation?.projectKey !== MDM_PROJECT_KEY) {
    errors.push("Operation is outside the MT initiative.");
  }
  if (!["create", "update", "skip"].includes(operation?.operation)) {
    errors.push("Operation must be create, update, or skip.");
  }
  if (!normalizeEvidenceRefs(operation?.evidenceRefs).length) {
    errors.push("Operation requires evidence references.");
  }
  if (operation?.sourceScope !== "engagement") {
    errors.push(
      "Operation sourceScope must be engagement; personal and reference-only work is forbidden."
    );
  }
  if (operation?.operation === "create" && !String(operation?.stableRef || "").trim()) {
    errors.push("Create operations require a stable idempotency reference.");
  }
  if (operation?.operation === "update" && !/^MT-\d+$/.test(operation?.issueKey || "")) {
    errors.push("Update operations require an MT issue key.");
  }
  if (operation?.status === "In Progress") {
    if (!operation?.activeNow || !operation?.stillDue) {
      errors.push("In Progress requires evidence that the work is active now and still due.");
    }
  }
  if (operation?.status === "Done" && operation?.remainingEstimate !== "0h") {
    errors.push("Done operations require a zero remaining estimate.");
  }
  if (!Array.isArray(operation?.labels) || operation.labels.length < 2) {
    errors.push("Every Jira issue requires at least two labels.");
  }
  if (!String(operation?.assigneeAccountId || "").trim()) {
    errors.push("Every Jira issue requires an assignee.");
  }
  errors.push(...validateParticipantClaims(operation));
  for (const comment of operation?.comments || []) {
    errors.push(...validateJiraNarrative(comment?.body, "Jira comment"));
    if (!normalizeEvidenceRefs(comment?.evidenceRefs).length) {
      errors.push("Every Jira comment requires evidence references.");
    }
  }
  errors.push(...validateJiraNarrative(operation?.descriptionText, "Jira description"));
  for (const subtask of operation?.subtasks || []) {
    errors.push(...validateSubtask(subtask));
  }
  for (const link of operation?.links || []) {
    errors.push(...validateLink(link));
  }
  return errors;
}

export function normalizedEffortHours(baselineHours) {
  const value = Number(baselineHours);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * NORMALIZED_EFFORT_MULTIPLIER * 2) / 2;
}

export function auditWeeklyEffort(worklogs) {
  const weeks = new Map();
  for (const worklog of Array.isArray(worklogs) ? worklogs : []) {
    const date = isoDay(worklog?.started);
    const hours = Number(worklog?.hours);
    if (!date || !Number.isFinite(hours) || hours <= 0) continue;
    const week = mondayOf(date);
    const current = weeks.get(week) || { total: 0, days: new Map(), entries: [] };
    current.total += hours;
    current.days.set(date, (current.days.get(date) || 0) + hours);
    current.entries.push(worklog);
    weeks.set(week, current);
  }

  return Array.from(weeks.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekOf, values]) => {
      const violations = [];
      for (const [date, hours] of values.days) {
        const day = asDate(date)?.getUTCDay();
        const cap = day === 6 ? MAX_SATURDAY_HOURS : MAX_WEEKDAY_HOURS;
        if (day === 0 && hours > 0) {
          violations.push(`${date} has ${hours}h on Sunday.`);
        } else if (hours > cap) {
          violations.push(`${date} has ${hours}h, above the ${cap}h daily cap.`);
        }
      }
      if (values.total < WEEKLY_TARGET_MIN_HOURS) {
        violations.push(
          `${weekOf} totals ${values.total}h, below the ${WEEKLY_TARGET_MIN_HOURS}h evidence target. Do not add filler.`
        );
      }
      if (values.total > WEEKLY_TARGET_MAX_HOURS) {
        violations.push(
          `${weekOf} totals ${values.total}h, above the ${WEEKLY_TARGET_MAX_HOURS}h maximum. Reconcile duplicates or allocation.`
        );
      }
      return {
        weekOf,
        totalHours: Math.round(values.total * 100) / 100,
        days: Object.fromEntries(Array.from(values.days.entries()).sort()),
        targetMet:
          values.total >= WEEKLY_TARGET_MIN_HOURS &&
          values.total <= WEEKLY_TARGET_MAX_HOURS &&
          violations.length === 0,
        violations,
      };
    });
}
