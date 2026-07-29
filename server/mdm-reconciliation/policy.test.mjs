import assert from "node:assert/strict";
import test from "node:test";
import {
  auditWeeklyEffort,
  classifyEvidenceEligibility,
  classifyIssueState,
  validateJiraNarrative,
  validateOperation,
  validateParticipantClaims,
} from "./policy.mjs";

test("reference-only Prism work cannot enter the engagement ledger", () => {
  assert.deepEqual(
    classifyEvidenceEligibility({
      provider: "Codex",
      sourceRef: "D:\\CascadeProjects\\Prism\\session.jsonl",
      title: "Connector pattern review",
    }),
    {
      eligible: false,
      reason: "reference-only",
      detail: "Prism and Prism v2 are connector implementation references only.",
    }
  );
});

test("personal Jira work is recognized without hiding the existing record", () => {
  const result = classifyEvidenceEligibility({
    provider: "Jira",
    sourceRef: "Jira MT-91",
    title: "Prism Orchestrator three-pillar architecture",
  });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "personal");
});

test("internal application and Brain automation work cannot support MDM Jira activity", () => {
  const records = [
    {
      provider: "Codex",
      sourceType: "work-session",
      workspace: "C:\\Users\\snahrup\\OneDrive - IP-Corporation\\ipcorp-architecture-brain",
      title: "Post-meeting automation pass",
    },
    {
      provider: "Claude Code",
      sourceType: "work-session",
      workspace: "C:\\Users\\snahrup\\CascadeProjects\\live-brain-assist",
      title: "Suggestion overlay debugging",
    },
    {
      provider: "Architecture Brain",
      sourceType: "brain-document",
      sourceRef: "cortex/journal/2026-07-28/run-001.md",
      title: "Cortex scheduled run",
    },
  ];

  for (const record of records) {
    const result = classifyEvidenceEligibility(record);
    assert.equal(result.eligible, false);
    assert.equal(result.reason, "personal");
  }
});

test("In Progress requires current active evidence and a still-due date", () => {
  const result = classifyIssueState(
    {
      evidenceRefs: ["session:1"],
      activeNow: true,
      dueDate: "2026-06-01",
    },
    new Date("2026-07-28T12:00:00-04:00")
  );
  assert.equal(result.status, "Backlog");
  assert.match(result.reason, /past due/i);
});

test("participants require an explicit collaboration source", () => {
  assert.deepEqual(validateParticipantClaims({ participants: ["Pat"] }), [
    "Named participants require calendar, transcript, email, Teams, Jira, or equivalent collaboration evidence.",
  ]);
});

test("Jira narrative rejects AI wording and em dashes", () => {
  const errors = validateJiraNarrative("Codex completed this — verified.");
  assert.equal(errors.length, 2);
});

test("operation validation rejects personal or unknown source scope", () => {
  const errors = validateOperation({
    projectKey: "MT",
    operation: "update",
    issueKey: "MT-91",
    sourceScope: "personal",
    evidenceRefs: ["jira:issue:MT-91"],
    labels: ["mdm", "scope-review"],
    assigneeAccountId: "steve",
    status: "Cancelled",
    comments: [],
  });
  assert.ok(errors.some((error) => error.includes("sourceScope")));
});

test("weekly audit accepts a truthful 63-hour Monday through Saturday allocation", () => {
  const audit = auditWeeklyEffort([
    { started: "2026-03-02", hours: 12 },
    { started: "2026-03-03", hours: 12 },
    { started: "2026-03-04", hours: 11 },
    { started: "2026-03-05", hours: 11 },
    { started: "2026-03-06", hours: 11 },
    { started: "2026-03-07", hours: 6 },
  ]);
  assert.equal(audit[0].totalHours, 63);
  assert.equal(audit[0].targetMet, true);
});
