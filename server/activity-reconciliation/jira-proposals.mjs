import { createHash } from "node:crypto";

const ISSUE_KEY = /^MT-\d+$/;
const DONE_STATES = new Set(["done", "closed", "complete", "completed", "resolved"]);
const RELEVANCE_TERMS = new Set([
  "azure",
  "data",
  "domain",
  "fabric",
  "governance",
  "interplastic",
  "jira",
  "master",
  "mdm",
  "migration",
  "model",
  "onelake",
  "power",
  "purview",
  "semantic",
  "workspace",
]);
const STOP_WORDS = new Set([
  "about",
  "after",
  "before",
  "could",
  "from",
  "have",
  "into",
  "meeting",
  "should",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "through",
  "update",
  "with",
  "work",
  "would",
]);

function digest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function plain(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return new Set(
    plain(value)
      .split(" ")
      .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))
  );
}

function scoreMatch(evidence, issue) {
  const left = tokens(`${evidence.title} ${evidence.summary}`);
  const right = tokens(`${issue.summary} ${issue.description || ""}`);
  if (!left.size || !right.size) return { score: 0, shared: [] };
  const shared = [...left].filter((word) => right.has(word));
  const score = shared.length / Math.max(1, Math.min(left.size, right.size));
  return { score, shared };
}

function isRelevant(evidence) {
  if (ISSUE_KEY.test(evidence.jiraKey || "")) return true;
  const words = tokens(`${evidence.title} ${evidence.summary}`);
  return [...words].some((word) => RELEVANCE_TERMS.has(word));
}

function commentAlreadyExists(issue, body) {
  const proposed = plain(body);
  if (!proposed) return true;
  return (issue.comments || []).some((comment) => {
    const existing = plain(comment.body);
    return existing === proposed || existing.includes(proposed);
  });
}

function worklogAlreadyExists(issue, body, minutes) {
  const proposed = plain(body);
  const seconds = Math.round(minutes * 60);
  return (issue.worklogs || []).some(
    (worklog) =>
      worklog.timeSpentSeconds === seconds &&
      (plain(worklog.comment) === proposed || plain(worklog.comment).includes(proposed))
  );
}

function proposalId(evidence, issueKey, changes) {
  return `jira-${digest(JSON.stringify({ evidence: evidence.stableId, issueKey, changes })).slice(
    0,
    24
  )}`;
}

function statusName(issue) {
  return String(issue?.status?.name || issue?.status || "Unknown");
}

function commentBody(evidence, association = null) {
  const sourceLabels = {
    outlook_received: "received message",
    outlook_replied: "reply",
    outlook_sent: "sent message",
    teams_channel_messages: "Teams channel update",
    teams_group_messages: "Teams group update",
    teams_direct_messages: "Teams direct update",
    teams_meeting_transcripts: "meeting follow-up",
    brain_updates: "Brain update",
  };
  const lines = [
    `I reviewed the ${sourceLabels[evidence.sourceId] || "source update"} for ${evidence.title}.`,
    evidence.summary || evidence.title,
  ];
  if (association?.reason) lines.push(`Why I am adding this here: ${association.reason}`);
  if (evidence.sourceReference) lines.push(`Supporting source: ${evidence.sourceReference}`);
  return lines.filter(Boolean).join("\n\n").slice(0, 4_000);
}

function existingIssueProposal(evidence, issue, association) {
  const changes = [];
  const body = commentBody(evidence, association);
  if (!commentAlreadyExists(issue, body)) {
    changes.push({ kind: "comment", body });
  }

  if (evidence.worklogMinutes > 0 && !worklogAlreadyExists(issue, body, evidence.worklogMinutes)) {
    changes.push({
      kind: "worklog",
      minutes: evidence.worklogMinutes,
      comment: body,
      startedAt: evidence.eventAt || evidence.firstObservedAt,
    });
  }

  const sourceStatus = plain(evidence.status);
  const currentStatus = plain(statusName(issue));
  if (DONE_STATES.has(sourceStatus) && !DONE_STATES.has(currentStatus)) {
    changes.push({ kind: "transition", toStatus: "Done" });
  } else if (sourceStatus === "blocked" && currentStatus !== "blocked") {
    changes.push({ kind: "transition", toStatus: "Blocked" });
  }

  if (!changes.length) return null;
  return {
    id: proposalId(evidence, issue.key, changes),
    destination: "jira",
    issueKey: issue.key,
    title: `${issue.key}: ${issue.summary}`,
    actionLabel: changes.length === 1 ? changes[0].kind : `${changes.length} related changes`,
    reason: association.reason,
    confidence: association.confidence,
    requiresTargetReview: Boolean(association.requiresTargetReview),
    evidenceIds: [evidence.stableId],
    sourceId: evidence.sourceId,
    expectedUpdated: issue.updatedAt || null,
    before: {
      summary: issue.summary,
      status: statusName(issue),
      updatedAt: issue.updatedAt || null,
    },
    after: { changes },
    changes,
    selectedByDefault: false,
  };
}

function addDays(iso, days) {
  const value = new Date(iso);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function newIssueProposal(evidence) {
  const startDate = (evidence.eventAt || evidence.firstObservedAt).slice(0, 10);
  const changes = [
    {
      kind: "create_issue",
      projectKey: "MT",
      issueType: "Task",
      summary: evidence.title.slice(0, 240),
      description: commentBody(evidence),
      fields: {
        labels: ["activity-reconciliation", "mdm-workbench"],
        priority: { name: "Medium" },
        timetracking: { originalEstimate: "1h", remainingEstimate: "1h" },
        customfield_11915: startDate,
        duedate: addDays(evidence.firstObservedAt, 14),
      },
    },
  ];
  return {
    id: proposalId(evidence, null, changes),
    destination: "jira",
    issueKey: null,
    title: `Create: ${evidence.title}`,
    actionLabel: "create work item",
    reason: "No existing MT item had enough matching evidence.",
    confidence: "unmatched",
    requiresTargetReview: false,
    evidenceIds: [evidence.stableId],
    sourceId: evidence.sourceId,
    expectedUpdated: null,
    before: null,
    after: { changes },
    changes,
    selectedByDefault: false,
  };
}

function findAssociation(evidence, issues) {
  const linkedJiraKey = ISSUE_KEY.test(evidence.linkedJiraKey || "")
    ? evidence.linkedJiraKey
    : null;
  if (linkedJiraKey) {
    const issue = issues.find((candidate) => candidate.key === linkedJiraKey);
    return issue
      ? {
          issue,
          confidence: "exact",
          reason: `The source identity already links to ${linkedJiraKey}.`,
          signals: [`Stored Jira link ${linkedJiraKey}`],
          requiresTargetReview: false,
        }
      : {
          issue: null,
          confidence: "unmatched",
          reason: `The source identity links to ${linkedJiraKey}, but that item was not found in MT.`,
          signals: [`Stored Jira link ${linkedJiraKey}`],
          requiresTargetReview: true,
        };
  }

  if (ISSUE_KEY.test(evidence.jiraKey || "")) {
    const issue = issues.find((candidate) => candidate.key === evidence.jiraKey);
    const contextSignals = Array.isArray(evidence.jiraContextSignals)
      ? evidence.jiraContextSignals.filter(Boolean)
      : [];
    const directWithContext = evidence.jiraReferenceKind === "direct" && contextSignals.length > 0;
    return issue
      ? {
          issue,
          confidence: directWithContext ? "exact" : "candidate",
          reason: directWithContext
            ? `The source directly names ${evidence.jiraKey} with supporting work context.`
            : `${evidence.jiraKey} needs target review because its source context is ${evidence.jiraReferenceKind || "unknown"}.`,
          signals: [`Jira key ${evidence.jiraKey}`, ...contextSignals].slice(0, 8),
          requiresTargetReview: !directWithContext,
        }
      : {
          issue: null,
          confidence: "unmatched",
          reason: `The source names ${evidence.jiraKey}, but that item was not found in MT.`,
          signals: [`Jira key ${evidence.jiraKey}`, ...contextSignals].slice(0, 8),
          requiresTargetReview: true,
        };
  }

  const ranked = issues
    .map((issue) => ({ issue, ...scoreMatch(evidence, issue) }))
    .sort((left, right) => right.score - left.score);
  const first = ranked[0];
  const second = ranked[1];
  const clearLead = first && first.score >= 0.62 && first.shared.length >= 3;
  const uniqueLead = !second || first.score - second.score >= 0.12;
  if (clearLead && uniqueLead) {
    return {
      issue: first.issue,
      confidence: "strong",
      reason: `The title and detail share ${first.shared.length} specific terms with ${first.issue.key}.`,
      signals: first.shared.slice(0, 8),
      requiresTargetReview: true,
    };
  }
  return {
    issue: null,
    confidence: "unmatched",
    reason: "No existing MT item had a unique, strong evidence match.",
    signals: first?.shared?.slice(0, 8) || [],
    requiresTargetReview: false,
  };
}

export function buildJiraReview(evidenceItems, issues) {
  const associations = [];
  const proposals = [];
  const skipped = [];
  const safeIssues = Array.isArray(issues)
    ? issues.filter((item) => ISSUE_KEY.test(item?.key))
    : [];

  for (const evidence of evidenceItems) {
    if (!evidence.actionable || !isRelevant(evidence)) {
      skipped.push({ evidenceId: evidence.stableId, reason: "Not related to the MT initiative." });
      continue;
    }
    const association = findAssociation(evidence, safeIssues);
    associations.push({
      evidenceId: evidence.stableId,
      issueKey: association.issue?.key || null,
      confidence: association.confidence,
      reason: association.reason,
      signals: association.signals,
      requiresTargetReview: Boolean(association.requiresTargetReview),
    });
    const proposal = association.issue
      ? existingIssueProposal(evidence, association.issue, association)
      : newIssueProposal(evidence);
    if (proposal) proposals.push(proposal);
    else
      skipped.push({
        evidenceId: evidence.stableId,
        reason: "The related Jira item is already current.",
      });
  }

  return { associations, proposals, skipped };
}

export function proposalConfirmation(proposals) {
  const count = Array.isArray(proposals) ? proposals.length : 0;
  return `APPLY ${count} JIRA ${count === 1 ? "PROPOSAL" : "PROPOSALS"}`;
}
