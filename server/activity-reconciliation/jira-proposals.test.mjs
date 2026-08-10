import assert from "node:assert/strict";
import test from "node:test";
import { buildJiraReview } from "./jira-proposals.mjs";

function evidence(id, overrides = {}) {
  return {
    stableId: id,
    sourceId: "outlook_received",
    title: "Fabric source mapping",
    summary: "The Fabric source mapping is ready for review.",
    status: "current",
    jiraKey: null,
    linkedJiraKey: null,
    jiraReferenceKind: "unknown",
    jiraContextSignals: [],
    sourceReference: "Source mapping thread",
    eventAt: "2026-08-06T13:00:00.000Z",
    firstObservedAt: "2026-08-06T14:00:00.000Z",
    worklogMinutes: 0,
    actionable: true,
    ...overrides,
  };
}

function issue(key, summary, overrides = {}) {
  return {
    key,
    summary,
    description: summary,
    status: { name: "In Progress" },
    updatedAt: "2026-08-06T12:00:00.000Z",
    comments: [],
    worklogs: [],
    ...overrides,
  };
}

test("direct and stored Jira references are exact while quoted keys need target review", () => {
  const review = buildJiraReview(
    [
      evidence("direct", {
        jiraKey: "MT-42",
        jiraReferenceKind: "direct",
        jiraContextSignals: ["Fabric source mapping activity"],
      }),
      evidence("quoted", {
        jiraKey: "MT-42",
        jiraReferenceKind: "quoted",
        jiraContextSignals: [],
        summary: "A quoted earlier note mentions MT-42.",
      }),
      evidence("linked", {
        linkedJiraKey: "MT-50",
        jiraReferenceKind: "stored_link",
      }),
    ],
    [issue("MT-42", "Fabric source mapping"), issue("MT-50", "Fabric policy review")]
  );

  const direct = review.proposals.find((item) => item.evidenceIds.includes("direct"));
  const quoted = review.proposals.find((item) => item.evidenceIds.includes("quoted"));
  const linked = review.proposals.find((item) => item.evidenceIds.includes("linked"));
  assert.equal(direct.confidence, "exact");
  assert.equal(direct.requiresTargetReview, false);
  assert.equal(quoted.confidence, "candidate");
  assert.equal(quoted.requiresTargetReview, true);
  assert.equal(quoted.selectedByDefault, false);
  assert.equal(linked.confidence, "exact");
  assert.equal(linked.requiresTargetReview, false);
});

test("similarity remains review-only, unrelated evidence is skipped, and no-op comments disappear", () => {
  const noOpBody =
    "I reviewed the received message for Fabric source mapping.\n\nThe Fabric source mapping is ready for review.\n\nWhy I am adding this here: The source directly names MT-42 with supporting work context.\n\nSupporting source: Source mapping thread";
  const review = buildJiraReview(
    [
      evidence("strong", {
        title: "Purview customer domain policy review",
        summary: "Purview customer domain policy review is ready.",
      }),
      evidence("unrelated", {
        title: "Lunch order",
        summary: "The lunch order is ready.",
        actionable: false,
      }),
      evidence("noop", {
        jiraKey: "MT-42",
        jiraReferenceKind: "direct",
        jiraContextSignals: ["Fabric source mapping activity"],
      }),
    ],
    [
      issue("MT-42", "Fabric source mapping", { comments: [{ body: noOpBody }] }),
      issue("MT-50", "Purview customer domain policy review"),
    ]
  );

  const strong = review.proposals.find((item) => item.evidenceIds.includes("strong"));
  assert.equal(strong.issueKey, "MT-50");
  assert.equal(strong.confidence, "strong");
  assert.equal(strong.requiresTargetReview, true);
  assert.equal(
    review.proposals.some((item) => item.evidenceIds.includes("unrelated")),
    false
  );
  assert.equal(
    review.proposals.some((item) => item.evidenceIds.includes("noop")),
    false
  );
  assert.equal(
    review.skipped.some((item) => item.evidenceId === "noop"),
    true
  );
});
