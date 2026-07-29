import assert from "node:assert/strict";
import test from "node:test";

import { hasOperationMarker } from "./jira-adf.mjs";
import { executeJiraOperationLedger, JiraLedgerExecutionError } from "./jira-ledger-executor.mjs";
import {
  buildOperationLedger,
  OPERATION_KIND,
  validateOperationLedger,
} from "./operation-ledger.mjs";

const EVIDENCE_REF = "brain:mdm-execution";
const AUTHOR_ACCOUNT_ID = "steve-account";

function clone(value) {
  return structuredClone(value);
}

function assertion(path, expected, operator = "equals") {
  return operator === "absent" ? { path, operator } : { path, operator, expected };
}

function evidenceSources() {
  return [
    {
      ref: EVIDENCE_REF,
      provider: "Architecture Brain",
      sourceRef: "C:\\IPCorp\\brain\\core\\mdm-execution.md",
      workspace: "ipcorp-architecture-brain",
      title: "MDM execution evidence",
      text: "The source records the MDM implementation, reconciliation, and verification work.",
      sourceScope: "engagement",
      evidenceEligible: true,
    },
  ];
}

function completeFields(summary, overrides = {}) {
  return {
    summary,
    descriptionText:
      "I reconciled the MDM delivery evidence, documented the implementation path, and verified the resulting scope.",
    startDate: "2026-07-20",
    dueDate: "2026-07-31",
    priority: "High",
    assigneeAccountId: AUTHOR_ACCOUNT_ID,
    originalEstimate: "12h",
    remainingEstimate: "6h",
    labels: ["mdm", "fabric-rollout"],
    status: "Backlog",
    ...overrides,
  };
}

function issueChecks(entries) {
  return entries.map(([issueRef, expectedJiraVersion]) => ({
    issueRef,
    exists: true,
    expectedJiraVersion,
  }));
}

function createParentOperations() {
  const issueRef = "NEW:parent-baseline";
  const common = {
    groupId: "parent-baseline",
    sourceScope: "engagement",
    evidenceRefs: [EVIDENCE_REF],
  };
  return [
    {
      ...common,
      kind: OPERATION_KIND.ISSUE_CREATE,
      target: { issueRef },
      effect: {
        issueRef,
        issueType: "Task",
        fields: completeFields("Establish the MDM delivery baseline"),
      },
      preconditions: {},
      verification: {
        mode: "effect",
        assertions: [assertion("fields.summary", "Establish the MDM delivery baseline")],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.ISSUE_VERIFY,
      target: { issueRef },
      effect: {
        expectedIssue: {
          "fields.summary": "Establish the MDM delivery baseline",
          "fields.status.name": "Backlog",
          "fields.timetracking.remainingEstimate": "6h",
        },
      },
      preconditions: {},
      verification: {
        mode: "full",
        assertions: [
          assertion("fields.summary", "Establish the MDM delivery baseline"),
          assertion("fields.status.name", "Backlog"),
          assertion("fields.timetracking.remainingEstimate", "6h"),
        ],
      },
    },
  ];
}

function createSubtaskOperations() {
  const issueRef = "NEW:verify-crosswalk";
  const parentRef = "NEW:parent-baseline";
  const common = {
    groupId: "verify-crosswalk",
    parentGroupId: "parent-baseline",
    sourceScope: "engagement",
    evidenceRefs: [EVIDENCE_REF],
  };
  return [
    {
      ...common,
      kind: OPERATION_KIND.ISSUE_CREATE,
      target: { issueRef },
      effect: {
        issueRef,
        issueType: "Subtask",
        parentRef,
        fields: completeFields("Verify the source-to-delivery crosswalk", {
          originalEstimate: "6h",
          remainingEstimate: "2h",
        }),
      },
      preconditions: {},
      verification: {
        mode: "effect",
        assertions: [assertion("fields.summary", "Verify the source-to-delivery crosswalk")],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.COMMENT_CREATE,
      target: { issueRef },
      effect: {
        body: "I traced the source inventory into the delivery crosswalk and recorded the verification boundary.",
      },
      preconditions: { commentAbsentByIdempotencyKey: true },
      verification: {
        mode: "effect",
        assertions: [
          assertion(
            "comment.body",
            "I traced the source inventory into the delivery crosswalk and recorded the verification boundary."
          ),
        ],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.WORKLOG_CREATE,
      target: { issueRef },
      effect: {
        started: "2026-07-22T09:00:00.000Z",
        timeSpentSeconds: 7_200,
        comment: "Verified the source-to-delivery crosswalk against the implementation evidence.",
      },
      preconditions: { worklogAbsentByIdempotencyKey: true },
      verification: {
        mode: "effect",
        assertions: [assertion("worklog.timeSpentSeconds", 7_200)],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.ISSUE_VERIFY,
      target: { issueRef },
      effect: {
        expectedIssue: {
          "fields.summary": "Verify the source-to-delivery crosswalk",
          "fields.parent.key": "__PARENT_KEY__",
          "fields.status.name": "Backlog",
        },
      },
      preconditions: {},
      verification: {
        mode: "full",
        assertions: [
          assertion("fields.summary", "Verify the source-to-delivery crosswalk"),
          assertion("fields.parent.key", "__PARENT_KEY__"),
          assertion("fields.status.name", "Backlog"),
        ],
      },
    },
  ];
}

function existingIssueOperations({
  groupId = "existing-initiative",
  issueRef = "MT-10",
  relatedRef = "MT-20",
  expectedVersion = 7,
  relatedVersion = 2,
  includeSideEffects = true,
  expectedFinalSummary = "Current MDM initiative",
} = {}) {
  const common = {
    groupId,
    sourceScope: "engagement",
    evidenceRefs: [EVIDENCE_REF],
  };
  const issuePreconditions = issueChecks([[issueRef, expectedVersion]]);
  const operations = [
    {
      ...common,
      kind: OPERATION_KIND.ISSUE_UPDATE,
      target: { issueRef },
      effect: {
        fields: {
          summary: expectedFinalSummary,
          startDate: "2026-07-20",
          dueDate: "2026-08-07",
          priority: "Highest",
          assigneeAccountId: AUTHOR_ACCOUNT_ID,
          labels: ["mdm", "portfolio-rebuild"],
          originalEstimate: "18h",
          remainingEstimate: "9h",
          descriptionText:
            "I reconciled the current MDM initiative, tightened the delivery boundary, and documented the verified outcome.",
        },
      },
      preconditions: {
        issues: issuePreconditions,
        expectedFields: { summary: "Legacy MDM initiative" },
      },
      verification: {
        mode: "effect",
        assertions: [
          assertion("fields.summary", expectedFinalSummary),
          assertion("fields.timetracking.remainingEstimate", "9h"),
        ],
      },
    },
  ];

  if (includeSideEffects) {
    operations.push(
      {
        ...common,
        kind: OPERATION_KIND.COMMENT_CREATE,
        target: { issueRef },
        effect: {
          body: "I started with the baseline record, reconciled the evidence gaps, and then documented the current implementation boundary.",
        },
        preconditions: {
          issues: issuePreconditions,
          commentAbsentByIdempotencyKey: true,
        },
        verification: {
          mode: "effect",
          assertions: [
            assertion(
              "comment.body",
              "I started with the baseline record, reconciled the evidence gaps, and then documented the current implementation boundary."
            ),
          ],
        },
      },
      {
        ...common,
        kind: OPERATION_KIND.WORKLOG_CREATE,
        target: { issueRef },
        effect: {
          started: "2026-07-23T09:00:00.000Z",
          timeSpentSeconds: 10_800,
          comment: "Reconciled the current initiative and verified the delivery boundary.",
        },
        preconditions: {
          issues: issuePreconditions,
          worklogAbsentByIdempotencyKey: true,
        },
        verification: {
          mode: "effect",
          assertions: [assertion("worklog.timeSpentSeconds", 10_800)],
        },
      },
      {
        ...common,
        kind: OPERATION_KIND.ISSUE_LINK_CREATE,
        effect: { type: "Blocks", fromRef: issueRef, toRef: relatedRef },
        preconditions: {
          issues: issueChecks([
            [issueRef, expectedVersion],
            [relatedRef, relatedVersion],
          ]),
          linkAbsent: true,
        },
        verification: {
          mode: "effect",
          assertions: [assertion(`links.${issueRef}-blocks-${relatedRef}.type`, "Blocks")],
        },
      },
      {
        ...common,
        kind: OPERATION_KIND.WATCHER_ADD,
        target: { issueRef },
        effect: { accountId: AUTHOR_ACCOUNT_ID },
        preconditions: { issues: issuePreconditions, watcherAbsent: true },
        verification: {
          mode: "effect",
          assertions: [assertion(`watchers.${AUTHOR_ACCOUNT_ID}`, true)],
        },
      },
      {
        ...common,
        kind: OPERATION_KIND.ISSUE_TRANSITION,
        target: { issueRef },
        effect: {
          fromStatus: "Backlog",
          toStatus: "Research / Discovery",
          sequence: 1,
        },
        preconditions: {
          issues: issuePreconditions,
          expectedStatus: "Backlog",
        },
        verification: {
          mode: "effect",
          assertions: [assertion("fields.status.name", "Research / Discovery")],
        },
      }
    );
  }

  const finalStatus = includeSideEffects ? "Research / Discovery" : "Backlog";
  operations.push({
    ...common,
    kind: OPERATION_KIND.ISSUE_VERIFY,
    target: { issueRef },
    effect: {
      expectedIssue: {
        "fields.summary": expectedFinalSummary,
        "fields.status.name": finalStatus,
        "fields.timetracking.remainingEstimate": "9h",
      },
    },
    preconditions: { issues: issuePreconditions },
    verification: {
      mode: "full",
      assertions: [
        assertion("fields.summary", expectedFinalSummary),
        assertion("fields.status.name", finalStatus),
        assertion("fields.timetracking.remainingEstimate", "9h"),
      ],
    },
  });
  return operations;
}

function buildLedger(operations) {
  return buildOperationLedger({
    sourceSnapshotId: "sha256:executor-test-snapshot",
    runKey: "jira-ledger-executor-tests",
    generatedAt: "2026-07-28T18:00:00.000Z",
    scope: { projectKey: "MT", initiative: "MDM" },
    evidenceSources: evidenceSources(),
    weeklySettlements: [],
    operations,
  });
}

function adfParagraphText(document) {
  const values = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "text") values.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(document);
  return values;
}

class FakeJiraClient {
  constructor(issues = [], options = {}) {
    this.issues = new Map(issues.map((issue) => [issue.key, clone(issue)]));
    this.calls = [];
    this.nextIssue = options.nextIssue || 101;
    this.nextComment = 501;
    this.nextWorklog = 701;
    this.nextLink = 901;
    this.failure = options.failure || null;
    this.failureUsed = false;
  }

  #record(method, details = {}) {
    const call = clone({ method, ...details });
    this.calls.push(call);
    if (
      this.failure &&
      !this.failureUsed &&
      this.failure.method === method &&
      (!this.failure.issueKey || this.failure.issueKey === details.issueKey)
    ) {
      this.failureUsed = true;
      throw new Error(this.failure.message || `${method} failed`);
    }
    return call;
  }

  #issue(issueKey) {
    const issue = this.issues.get(issueKey);
    if (!issue) throw new Error(`Issue ${issueKey} does not exist.`);
    return issue;
  }

  #bump(issue) {
    issue.version += 1;
  }

  #create(input, issueType) {
    const key = `MT-${this.nextIssue}`;
    this.nextIssue += 1;
    const issue = {
      id: String(10_000 + this.nextIssue),
      key,
      version: 1,
      fields: {
        ...clone(input.fields),
        summary: input.summary,
        description: clone(input.description),
        issuetype: { name: issueType },
        status: { name: "Backlog" },
        ...(input.parentKey ? { parent: { key: input.parentKey } } : {}),
      },
      comments: [],
      worklogs: [],
      links: [],
      watchers: { watchers: [] },
      changelog: [],
    };
    this.issues.set(key, issue);
    return { id: issue.id, key };
  }

  async createTask(input) {
    this.#record("createTask", { input });
    return this.#create(input, "Task");
  }

  async createSubtask(input) {
    this.#record("createSubtask", { input });
    return this.#create(input, "Sub-task");
  }

  async updateIssueFields(issueKey, fields) {
    this.#record("updateIssueFields", { issueKey, fields });
    const issue = this.#issue(issueKey);
    issue.fields = {
      ...issue.fields,
      ...clone(fields),
      ...(fields.timetracking
        ? {
            timetracking: {
              ...(issue.fields.timetracking || {}),
              ...clone(fields.timetracking),
            },
          }
        : {}),
    };
    this.#bump(issue);
    return {};
  }

  async addComment(issueKey, body) {
    this.#record("addComment", { issueKey, body });
    const issue = this.#issue(issueKey);
    const comment = { id: String(this.nextComment), body: clone(body) };
    this.nextComment += 1;
    issue.comments.push(comment);
    this.#bump(issue);
    return clone(comment);
  }

  async createWorklog(issueKey, input) {
    this.#record("createWorklog", { issueKey, input });
    assert.equal(input.expectedAuthorAccountId, AUTHOR_ACCOUNT_ID);
    const issue = this.#issue(issueKey);
    const worklog = {
      id: String(this.nextWorklog),
      started: input.started,
      timeSpentSeconds: input.timeSpentSeconds,
      comment: clone(input.comment),
      author: { accountId: AUTHOR_ACCOUNT_ID },
    };
    this.nextWorklog += 1;
    issue.worklogs.push(worklog);
    this.#bump(issue);
    return clone(worklog);
  }

  async updateWorklog(issueKey, worklogId, input) {
    this.#record("updateWorklog", { issueKey, worklogId, input });
    assert.equal(input.expectedAuthorAccountId, AUTHOR_ACCOUNT_ID);
    const issue = this.#issue(issueKey);
    const worklog = issue.worklogs.find((entry) => String(entry.id) === String(worklogId));
    if (!worklog) throw new Error(`Worklog ${worklogId} does not exist.`);
    Object.assign(worklog, {
      started: input.started,
      timeSpentSeconds: input.timeSpentSeconds,
      comment: clone(input.comment),
    });
    this.#bump(issue);
    return clone(worklog);
  }

  async deleteWorklog(issueKey, worklogId, options) {
    this.#record("deleteWorklog", { issueKey, worklogId, options });
    assert.equal(options.expectedAuthorAccountId, AUTHOR_ACCOUNT_ID);
    const issue = this.#issue(issueKey);
    issue.worklogs = issue.worklogs.filter((entry) => String(entry.id) !== String(worklogId));
    this.#bump(issue);
    return { deleted: true, worklogId: String(worklogId) };
  }

  async createIssueLink({ type, inwardIssueKey, outwardIssueKey }) {
    this.#record("createIssueLink", {
      type,
      inwardIssueKey,
      outwardIssueKey,
    });
    const inward = this.#issue(inwardIssueKey);
    const outward = this.#issue(outwardIssueKey);
    const id = String(this.nextLink);
    this.nextLink += 1;
    inward.links.push({
      id,
      type: { name: type },
      outwardIssue: { key: outwardIssueKey },
    });
    outward.links.push({
      id,
      type: { name: type },
      inwardIssue: { key: inwardIssueKey },
    });
    this.#bump(inward);
    this.#bump(outward);
    return {};
  }

  async deleteIssueLink(linkId) {
    this.#record("deleteIssueLink", { linkId: String(linkId) });
    for (const issue of this.issues.values()) {
      const before = issue.links.length;
      issue.links = issue.links.filter((link) => String(link.id) !== String(linkId));
      if (issue.links.length !== before) this.#bump(issue);
    }
    return {};
  }

  async addWatcher(issueKey, accountId) {
    this.#record("addWatcher", { issueKey, accountId });
    const issue = this.#issue(issueKey);
    issue.watchers.watchers.push({ accountId });
    this.#bump(issue);
    return {};
  }

  async applyOrderedTransitions(issueKey, steps, options) {
    this.#record("applyOrderedTransitions", { issueKey, steps, options });
    const issue = this.#issue(issueKey);
    for (const step of steps) {
      issue.fields.status = { name: step.toStatus };
      issue.changelog.push({ toStatus: step.toStatus });
      this.#bump(issue);
    }
    return steps.map((step) => ({ step }));
  }

  async readFullIssue(issueKey) {
    this.#record("readFullIssue", { issueKey });
    const issue = this.#issue(issueKey);
    return clone({
      id: issue.id,
      key: issue.key,
      fields: issue.fields,
      comments: issue.comments,
      worklogs: issue.worklogs,
      links: issue.links,
      watchers: issue.watchers,
      changelog: issue.changelog,
      rawIssue: { id: issue.id, key: issue.key, version: issue.version, fields: issue.fields },
    });
  }
}

function existingIssue(
  key,
  { version, summary = "Legacy MDM initiative", status = "Backlog", remainingEstimate = "4h" }
) {
  return {
    id: key.replace("MT-", "100"),
    key,
    version,
    fields: {
      summary,
      description: {
        version: 1,
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Legacy description." }],
          },
        ],
      },
      status: { name: status },
      priority: { name: "High" },
      assignee: { accountId: AUTHOR_ACCOUNT_ID },
      labels: ["mdm", "legacy"],
      timetracking: {
        originalEstimate: "8h",
        remainingEstimate,
      },
      customfield_11915: "2026-07-01",
      duedate: "2026-07-31",
    },
    comments: [],
    worklogs: [],
    links: [],
    watchers: { watchers: [] },
    changelog: [],
  };
}

function patchSubtaskParentExpectation(ledger, parentKey) {
  const copy = clone(ledger);
  const verification = copy.operations.find(
    (operation) =>
      operation.groupId === "verify-crosswalk" && operation.kind === OPERATION_KIND.ISSUE_VERIFY
  );
  verification.effect.expectedIssue["fields.parent.key"] = parentKey;
  verification.verification.assertions.find(
    (entry) => entry.path === "fields.parent.key"
  ).expected = parentKey;
  // The immutable hash changes when the exact expected parent key changes, so
  // rebuild from the raw operations instead of mutating a built ledger.
  return buildLedger(
    copy.operations.map((operation) => {
      const raw = clone(operation);
      delete raw.id;
      delete raw.idempotencyKey;
      delete raw.state;
      return raw;
    })
  );
}

test("applies create/update/comment/historical worklog/link/watcher/transitions and full verification", async () => {
  const rawOperations = [
    ...createParentOperations(),
    ...createSubtaskOperations(),
    ...existingIssueOperations(),
  ];
  const provisionalLedger = buildLedger(rawOperations);
  const expectedParentKey = "MT-101";
  const ledger = patchSubtaskParentExpectation(provisionalLedger, expectedParentKey);
  const jiraClient = new FakeJiraClient([
    existingIssue("MT-10", { version: 7 }),
    existingIssue("MT-20", {
      version: 2,
      summary: "Dependent MDM delivery",
    }),
  ]);
  const checkpoints = [];

  const result = await executeJiraOperationLedger({
    ledger,
    jiraClient,
    mode: "apply",
    authorized: true,
    allowIndependentGroups: true,
    expectedAuthorAccountId: AUTHOR_ACCOUNT_ID,
    saveCheckpoint: async (checkpoint) => checkpoints.push(clone(checkpoint)),
    now: "2026-07-28T18:30:00.000Z",
  });

  assert.equal(result.failed.length, 0);
  assert.equal(result.blocked.length, 0);
  assert.equal(result.applied.length, ledger.operations.length);
  assert.equal(result.skipped.length, 0);
  assert.equal(result.createdKeys["NEW:parent-baseline"], expectedParentKey);
  assert.match(result.createdKeys["NEW:verify-crosswalk"], /^MT-\d+$/);
  assert.ok(result.groups.every((group) => group.status === "complete"));
  assert.ok(result.groups.every((group) => group.verificationPassed));
  assert.equal(result.previewHash, ledger.preview.hash);
  assert.equal(result.integrityHash, ledger.integrity.hash);
  assert.deepEqual(result.binding, {
    runId: ledger.run.id,
    previewHash: ledger.preview.hash,
    integrityHash: ledger.integrity.hash,
  });
  assert.equal(validateOperationLedger(result.ledger).valid, true);

  const child = jiraClient.issues.get(result.createdKeys["NEW:verify-crosswalk"]);
  assert.equal(child.fields.parent.key, expectedParentKey);
  const childCreateCall = jiraClient.calls.find((call) => call.method === "createSubtask");
  assert.equal(childCreateCall.input.parentKey, expectedParentKey);

  const updateCall = jiraClient.calls.find(
    (call) => call.method === "updateIssueFields" && call.issueKey === "MT-10"
  );
  assert.deepEqual(updateCall.fields.priority, { name: "Highest" });
  assert.deepEqual(updateCall.fields.assignee, { accountId: AUTHOR_ACCOUNT_ID });
  assert.equal(updateCall.fields.customfield_11915, "2026-07-20");
  assert.equal(updateCall.fields.duedate, "2026-08-07");
  assert.deepEqual(updateCall.fields.timetracking, {
    originalEstimate: "18h",
    remainingEstimate: "9h",
  });
  assert.equal(Object.hasOwn(updateCall.fields, "status"), false);

  const updateIndex = jiraClient.calls.findIndex(
    (call) => call.method === "updateIssueFields" && call.issueKey === "MT-10"
  );
  for (const method of [
    "addComment",
    "createWorklog",
    "createIssueLink",
    "addWatcher",
    "applyOrderedTransitions",
  ]) {
    const effectIndex = jiraClient.calls.findIndex(
      (call) =>
        call.method === method && (call.issueKey === "MT-10" || method === "createIssueLink")
    );
    assert.ok(effectIndex > updateIndex, `${method} must follow the required field mutation`);
  }

  const linkCall = jiraClient.calls.find((call) => call.method === "createIssueLink");
  assert.deepEqual(linkCall, {
    method: "createIssueLink",
    type: "Blocks",
    inwardIssueKey: "MT-10",
    outwardIssueKey: "MT-20",
  });
  const transitionCall = jiraClient.calls.find((call) => call.method === "applyOrderedTransitions");
  assert.deepEqual(transitionCall.steps, [{ toStatus: "Research / Discovery" }]);
  assert.deepEqual(transitionCall.options, { verify: true });

  const commentCall = jiraClient.calls.find(
    (call) => call.method === "addComment" && call.issueKey === "MT-10"
  );
  const commentOperation = ledger.operations.find(
    (operation) =>
      operation.groupId === "existing-initiative" &&
      operation.kind === OPERATION_KIND.COMMENT_CREATE
  );
  assert.equal(hasOperationMarker(commentCall.body, commentOperation.idempotencyKey), true);
  const worklogCall = jiraClient.calls.find(
    (call) => call.method === "createWorklog" && call.issueKey === "MT-10"
  );
  assert.equal(
    hasOperationMarker(
      worklogCall.input.comment,
      ledger.operations.find(
        (operation) =>
          operation.groupId === "existing-initiative" &&
          operation.kind === OPERATION_KIND.WORKLOG_CREATE
      ).idempotencyKey
    ),
    true
  );
  assert.equal(worklogCall.input.expectedAuthorAccountId, AUTHOR_ACCOUNT_ID);
  assert.ok(adfParagraphText(worklogCall.input.comment).some((text) => text.includes("\u200b")));

  assert.equal(checkpoints.length, ledger.operations.length);
  assert.ok(
    checkpoints.every(
      (checkpoint) =>
        checkpoint.previewHash === ledger.preview.hash &&
        checkpoint.integrityHash === ledger.integrity.hash
    )
  );
  assert.equal(
    checkpoints
      .at(-1)
      .ledger.operations.every((operation) =>
        ["succeeded", "skipped"].includes(operation.state.status)
      ),
    true
  );
});

test("resumes a completed checkpoint without replaying Jira operations", async () => {
  const ledger = buildLedger(createParentOperations());
  const jiraClient = new FakeJiraClient([], { nextIssue: 301 });
  const firstCheckpoints = [];
  const first = await executeJiraOperationLedger({
    ledger,
    jiraClient,
    mode: "apply",
    authorized: true,
    expectedAuthorAccountId: AUTHOR_ACCOUNT_ID,
    saveCheckpoint: async (checkpoint) => firstCheckpoints.push(clone(checkpoint)),
    now: "2026-07-28T18:35:00.000Z",
  });
  assert.equal(first.groups[0].status, "complete");
  const createdKey = first.createdKeys["NEW:parent-baseline"];

  jiraClient.calls.length = 0;
  const resumeCheckpoints = [];
  const resumed = await executeJiraOperationLedger({
    ledger: first.ledger,
    jiraClient,
    mode: "apply",
    authorized: true,
    expectedAuthorAccountId: AUTHOR_ACCOUNT_ID,
    saveCheckpoint: async (checkpoint) => resumeCheckpoints.push(clone(checkpoint)),
    now: "2026-07-28T18:40:00.000Z",
  });

  assert.equal(jiraClient.calls.length, 0);
  assert.equal(resumeCheckpoints.length, 0);
  assert.equal(resumed.applied.length, 0);
  assert.equal(resumed.skipped.length, first.ledger.operations.length);
  assert.equal(resumed.createdKeys["NEW:parent-baseline"], createdKey);
  assert.equal(resumed.groups[0].status, "complete");
  assert.deepEqual(resumed.ledger, first.ledger);
});

test("a required field mutation failure blocks its group and independent groups only continue when enabled", async () => {
  const operations = [
    ...existingIssueOperations({
      groupId: "a-failing-group",
      issueRef: "MT-10",
      relatedRef: "MT-20",
    }),
    ...existingIssueOperations({
      groupId: "b-independent-group",
      issueRef: "MT-30",
      relatedRef: "MT-40",
      expectedVersion: 3,
      relatedVersion: 4,
      includeSideEffects: false,
      expectedFinalSummary: "Independent MDM initiative",
    }),
  ];
  const ledger = buildLedger(operations);
  const issueFixtures = [
    existingIssue("MT-10", { version: 7 }),
    existingIssue("MT-20", { version: 2, summary: "Related initiative" }),
    existingIssue("MT-30", { version: 3 }),
    existingIssue("MT-40", { version: 4, summary: "Independent dependency" }),
  ];

  const failClosedClient = new FakeJiraClient(issueFixtures, {
    failure: {
      method: "updateIssueFields",
      issueKey: "MT-10",
      message: "required fields rejected",
    },
  });
  const failClosed = await executeJiraOperationLedger({
    ledger,
    jiraClient: failClosedClient,
    mode: "apply",
    authorized: true,
    expectedAuthorAccountId: AUTHOR_ACCOUNT_ID,
    saveCheckpoint: async () => {},
    now: "2026-07-28T18:45:00.000Z",
  });

  assert.equal(failClosed.failed.length, 1);
  assert.ok(failClosed.blocked.length > 0);
  assert.equal(
    failClosedClient.calls.some(
      (call) => call.method === "updateIssueFields" && call.issueKey === "MT-30"
    ),
    false
  );
  for (const method of [
    "addComment",
    "createWorklog",
    "createIssueLink",
    "addWatcher",
    "applyOrderedTransitions",
  ]) {
    assert.equal(
      failClosedClient.calls.some(
        (call) =>
          call.method === method && (call.issueKey === "MT-10" || method === "createIssueLink")
      ),
      false,
      `${method} must not continue after the required field mutation fails`
    );
  }

  const independentClient = new FakeJiraClient(issueFixtures, {
    failure: {
      method: "updateIssueFields",
      issueKey: "MT-10",
      message: "required fields rejected",
    },
  });
  const independent = await executeJiraOperationLedger({
    ledger,
    jiraClient: independentClient,
    mode: "apply",
    authorized: true,
    allowIndependentGroups: true,
    expectedAuthorAccountId: AUTHOR_ACCOUNT_ID,
    saveCheckpoint: async () => {},
    now: "2026-07-28T18:50:00.000Z",
  });

  assert.equal(independent.failed.length, 1);
  assert.equal(
    independentClient.calls.some(
      (call) => call.method === "updateIssueFields" && call.issueKey === "MT-30"
    ),
    true
  );
  assert.equal(
    independent.groups.find((group) => group.groupId === "a-failing-group").status,
    "failed"
  );
  assert.equal(
    independent.groups.find((group) => group.groupId === "b-independent-group").status,
    "complete"
  );
});

test("failed exact preconditions make no mutation and block later group effects", async () => {
  const ledger = buildLedger(existingIssueOperations());
  const jiraClient = new FakeJiraClient([
    existingIssue("MT-10", { version: 8 }),
    existingIssue("MT-20", { version: 2, summary: "Related initiative" }),
  ]);
  const checkpoints = [];

  const result = await executeJiraOperationLedger({
    ledger,
    jiraClient,
    mode: "apply",
    authorized: true,
    allowIndependentGroups: true,
    expectedAuthorAccountId: AUTHOR_ACCOUNT_ID,
    saveCheckpoint: async (checkpoint) => checkpoints.push(clone(checkpoint)),
    now: "2026-07-28T18:55:00.000Z",
  });

  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0].error.message, /expected 7/);
  assert.equal(
    jiraClient.calls.some((call) => call.method === "updateIssueFields"),
    false
  );
  assert.equal(
    jiraClient.calls.some((call) =>
      [
        "addComment",
        "createWorklog",
        "createIssueLink",
        "addWatcher",
        "applyOrderedTransitions",
      ].includes(call.method)
    ),
    false
  );
  assert.equal(result.groups[0].status, "failed");
  assert.equal(checkpoints.length, ledger.operations.length);
});

test("full exact readback failure prevents a group from being reported complete", async () => {
  const operations = existingIssueOperations({
    includeSideEffects: false,
    expectedFinalSummary: "Current MDM initiative",
  });
  const verify = operations.find((operation) => operation.kind === OPERATION_KIND.ISSUE_VERIFY);
  verify.effect.expectedIssue["fields.priority.name"] = "Impossible";
  verify.verification.assertions.push(assertion("fields.priority.name", "Impossible"));
  const ledger = buildLedger(operations);
  const jiraClient = new FakeJiraClient([existingIssue("MT-10", { version: 7 })]);

  const result = await executeJiraOperationLedger({
    ledger,
    jiraClient,
    mode: "apply",
    authorized: true,
    allowIndependentGroups: true,
    expectedAuthorAccountId: AUTHOR_ACCOUNT_ID,
    saveCheckpoint: async () => {},
    now: "2026-07-28T19:00:00.000Z",
  });

  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].kind, OPERATION_KIND.ISSUE_VERIFY);
  assert.equal(result.groups[0].status, "failed");
  assert.equal(result.groups[0].verificationPassed, false);
});

test("dry-run validates the ledger but makes zero Jira or checkpoint mutations", async () => {
  const ledger = buildLedger([
    ...createParentOperations(),
    ...existingIssueOperations({ includeSideEffects: false }),
  ]);
  const original = clone(ledger);
  const jiraClient = new FakeJiraClient([existingIssue("MT-10", { version: 7 })]);
  let checkpointCalls = 0;

  const result = await executeJiraOperationLedger({
    ledger,
    jiraClient,
    mode: "dry-run",
    authorized: false,
    expectedAuthorAccountId: AUTHOR_ACCOUNT_ID,
    saveCheckpoint: async () => {
      checkpointCalls += 1;
    },
  });

  assert.equal(jiraClient.calls.length, 0);
  assert.equal(checkpointCalls, 0);
  assert.deepEqual(ledger, original);
  assert.deepEqual(result.ledger, original);
  assert.equal(result.applied.length, 0);
  assert.equal(result.failed.length, 0);
  assert.equal(result.blocked.length, 0);
  assert.equal(result.skipped.length, ledger.operations.length);
  assert.equal(result.planned.length, ledger.operations.length);
  assert.equal(result.previewHash, ledger.preview.hash);
  assert.equal(result.integrityHash, ledger.integrity.hash);
  assert.ok(result.groups.every((group) => group.status === "planned"));
});

test("apply fails closed before Jira access without authorization, checkpointing, or worklog author", async () => {
  const ledger = buildLedger(
    createSubtaskOperations().map((operation) => ({
      ...operation,
      parentGroupId: null,
      ...(operation.kind === OPERATION_KIND.ISSUE_CREATE
        ? {
            effect: { ...operation.effect, parentRef: "MT-10" },
            preconditions: {
              issues: [{ issueRef: "MT-10", exists: true, expectedJiraVersion: 7 }],
            },
          }
        : {}),
    }))
  );
  const jiraClient = new FakeJiraClient([existingIssue("MT-10", { version: 7 })]);

  await assert.rejects(
    executeJiraOperationLedger({
      ledger,
      jiraClient,
      mode: "apply",
      authorized: false,
      saveCheckpoint: async () => {},
    }),
    (error) => error instanceof JiraLedgerExecutionError && error.code === "authorization_required"
  );
  assert.equal(jiraClient.calls.length, 0);

  await assert.rejects(
    executeJiraOperationLedger({
      ledger,
      jiraClient,
      mode: "apply",
      authorized: true,
    }),
    (error) => error instanceof JiraLedgerExecutionError && error.code === "checkpoint_required"
  );
  assert.equal(jiraClient.calls.length, 0);

  await assert.rejects(
    executeJiraOperationLedger({
      ledger,
      jiraClient,
      mode: "apply",
      authorized: true,
      saveCheckpoint: async () => {},
    }),
    (error) =>
      error instanceof JiraLedgerExecutionError && error.code === "missing_expected_worklog_author"
  );
  assert.equal(jiraClient.calls.length, 0);
});
