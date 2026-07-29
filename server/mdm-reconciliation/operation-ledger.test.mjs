import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOperationLedger,
  canonicalJson,
  computeLedgerIntegrityHash,
  computePreviewHash,
  createStableIdempotencyKey,
  createStableOperationId,
  createStableRunId,
  getRunnableOperations,
  LEDGER_SCHEMA_VERSION,
  LedgerValidationError,
  OPERATION_KIND,
  OPERATION_KINDS,
  resumeOperationLedger,
  transitionOperationState,
  validateOperationLedger,
} from "./operation-ledger.mjs";

const EVIDENCE_REF = "brain:mdm-rollout";

function evidenceSources() {
  return [
    {
      ref: EVIDENCE_REF,
      provider: "Architecture Brain",
      sourceRef: "C:\\IPCorp\\brain\\core\\mdm-rollout.md",
      workspace: "ipcorp-architecture-brain",
      title: "MDM rollout evidence",
      text: "The rollout artifact records the implementation and validation work.",
      sourceScope: "engagement",
      evidenceEligible: true,
    },
  ];
}

function issueFields(overrides = {}) {
  return {
    summary: "Establish the MDM rollout baseline",
    descriptionText:
      "I established the rollout baseline, reconciled the implementation evidence, and documented the acceptance path.",
    startDate: "2026-07-20",
    dueDate: "2026-07-24",
    priority: "High",
    assigneeAccountId: "steve-account",
    originalEstimate: "60h",
    remainingEstimate: "0h",
    labels: ["mdm", "fabric-rollout"],
    status: "Backlog",
    ...overrides,
  };
}

function assertion(path, expected, operator = "equals") {
  return { path, operator, expected };
}

function parentOperations() {
  const issueRef = "NEW:mdm-rollout-baseline";
  const common = {
    groupId: "mdm-rollout-baseline",
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
        fields: issueFields(),
      },
      preconditions: {},
      verification: {
        mode: "effect",
        assertions: [assertion("fields.summary", "Establish the MDM rollout baseline")],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.COMMENT_CREATE,
      target: { issueRef },
      effect: {
        body: "I started with the source inventory, tightened the rollout boundary, and then validated the resulting work against the implementation evidence.",
      },
      preconditions: { commentAbsentByIdempotencyKey: true },
      verification: {
        mode: "effect",
        assertions: [
          assertion(
            "comment.body",
            "I started with the source inventory, tightened the rollout boundary, and then validated the resulting work against the implementation evidence."
          ),
        ],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.WORKLOG_CREATE,
      target: { issueRef },
      effect: {
        started: "2026-07-20T09:00:00.000Z",
        timeSpentSeconds: 43_200,
        comment: "Established the source inventory and reconciled the rollout baseline.",
      },
      preconditions: { worklogAbsentByIdempotencyKey: true },
      verification: {
        mode: "effect",
        assertions: [assertion("worklog.timeSpentSeconds", 43_200)],
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
      preconditions: { expectedStatus: "Backlog" },
      verification: {
        mode: "effect",
        assertions: [assertion("fields.status.name", "Research / Discovery")],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.ISSUE_TRANSITION,
      target: { issueRef },
      effect: {
        fromStatus: "Research / Discovery",
        toStatus: "In Progress",
        sequence: 2,
      },
      preconditions: { expectedStatus: "Research / Discovery" },
      verification: {
        mode: "effect",
        assertions: [assertion("fields.status.name", "In Progress")],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.ISSUE_TRANSITION,
      target: { issueRef },
      effect: {
        fromStatus: "In Progress",
        toStatus: "Done",
        sequence: 3,
      },
      preconditions: { expectedStatus: "In Progress" },
      verification: {
        mode: "effect",
        assertions: [assertion("fields.status.name", "Done")],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.ISSUE_VERIFY,
      target: { issueRef },
      effect: {
        expectedIssue: {
          "fields.summary": "Establish the MDM rollout baseline",
          "fields.status.name": "Done",
          "fields.timetracking.remainingEstimate": "0h",
        },
      },
      preconditions: {},
      verification: {
        mode: "full",
        assertions: [
          assertion("fields.summary", "Establish the MDM rollout baseline"),
          assertion("fields.status.name", "Done"),
          assertion("fields.timetracking.remainingEstimate", "0h"),
        ],
      },
    },
  ];
}

function existingIssueOperations() {
  const issueRef = "MT-12";
  const relatedRef = "MT-13";
  const common = {
    groupId: "existing-mt-12",
    sourceScope: "engagement",
    evidenceRefs: [EVIDENCE_REF],
  };
  const issueChecks = (refs = [issueRef]) =>
    refs.map((ref) => ({
      issueRef: ref,
      exists: true,
      expectedJiraVersion: ref === issueRef ? 7 : 4,
    }));
  return [
    {
      ...common,
      kind: OPERATION_KIND.ISSUE_UPDATE,
      target: { issueRef },
      effect: {
        fields: {
          summary: "Current MDM initiative",
          remainingEstimate: "0h",
        },
      },
      preconditions: {
        issues: issueChecks(),
        expectedFields: { summary: "Legacy MDM initiative" },
      },
      verification: {
        mode: "effect",
        assertions: [assertion("fields.summary", "Current MDM initiative")],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.COMMENT_CREATE,
      target: { issueRef },
      effect: { body: "I reconciled the current scope against the delivery evidence." },
      preconditions: {
        issues: issueChecks(),
        commentAbsentByIdempotencyKey: true,
      },
      verification: {
        mode: "effect",
        assertions: [
          assertion(
            "comment.body",
            "I reconciled the current scope against the delivery evidence."
          ),
        ],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.WORKLOG_CREATE,
      target: { issueRef },
      effect: {
        started: "2026-07-20T09:00:00.000Z",
        timeSpentSeconds: 3_600,
        comment: "Reconciled the current scope and delivery evidence.",
      },
      preconditions: {
        issues: issueChecks(),
        worklogAbsentByIdempotencyKey: true,
      },
      verification: {
        mode: "effect",
        assertions: [assertion("worklog.timeSpentSeconds", 3_600)],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.WORKLOG_UPDATE,
      target: { issueRef },
      effect: {
        worklogId: "2001",
        started: "2026-07-21T09:00:00.000Z",
        timeSpentSeconds: 7_200,
        comment: "Refined the dependency mapping and validation path.",
      },
      preconditions: {
        issues: issueChecks(),
        worklog: {
          exists: true,
          expected: {
            started: "2026-07-21T09:00:00.000Z",
            timeSpentSeconds: 3_600,
          },
        },
      },
      verification: {
        mode: "effect",
        assertions: [assertion("worklog.timeSpentSeconds", 7_200)],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.WORKLOG_DELETE,
      target: { issueRef },
      effect: {
        worklogId: "2002",
        previous: {
          started: "2026-07-22T09:00:00.000Z",
          timeSpentSeconds: 3_600,
          comment: "Duplicate allocation.",
        },
      },
      preconditions: {
        issues: issueChecks(),
        worklog: {
          exists: true,
          expected: {
            started: "2026-07-22T09:00:00.000Z",
            timeSpentSeconds: 3_600,
            comment: "Duplicate allocation.",
          },
        },
      },
      verification: {
        mode: "effect",
        assertions: [{ path: "worklogs.2002", operator: "absent" }],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.ISSUE_LINK_CREATE,
      effect: { type: "Blocks", fromRef: issueRef, toRef: relatedRef },
      preconditions: {
        issues: issueChecks([issueRef, relatedRef]),
        linkAbsent: true,
      },
      verification: {
        mode: "effect",
        assertions: [assertion("links.MT-12-blocks-MT-13.type", "Blocks")],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.ISSUE_LINK_DELETE,
      effect: {
        linkId: "3001",
        type: "Relates",
        fromRef: issueRef,
        toRef: relatedRef,
      },
      preconditions: {
        issues: issueChecks([issueRef, relatedRef]),
        link: {
          exists: true,
          expected: { type: "Relates", fromRef: issueRef, toRef: relatedRef },
        },
      },
      verification: {
        mode: "effect",
        assertions: [{ path: "links.3001", operator: "absent" }],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.WATCHER_ADD,
      target: { issueRef },
      effect: { accountId: "steve-account" },
      preconditions: {
        issues: issueChecks(),
        watcherAbsent: true,
      },
      verification: {
        mode: "effect",
        assertions: [assertion("watchers.steve-account", true)],
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
        issues: issueChecks(),
        expectedStatus: "Backlog",
      },
      verification: {
        mode: "effect",
        assertions: [assertion("fields.status.name", "Research / Discovery")],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.ISSUE_TRANSITION,
      target: { issueRef },
      effect: {
        fromStatus: "Research / Discovery",
        toStatus: "In Progress",
        sequence: 2,
      },
      preconditions: {
        issues: issueChecks(),
        expectedStatus: "Research / Discovery",
      },
      verification: {
        mode: "effect",
        assertions: [assertion("fields.status.name", "In Progress")],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.ISSUE_TRANSITION,
      target: { issueRef },
      effect: { fromStatus: "In Progress", toStatus: "Done", sequence: 3 },
      preconditions: {
        issues: issueChecks(),
        expectedStatus: "In Progress",
      },
      verification: {
        mode: "effect",
        assertions: [assertion("fields.status.name", "Done")],
      },
    },
    {
      ...common,
      kind: OPERATION_KIND.ISSUE_VERIFY,
      target: { issueRef },
      effect: {
        expectedIssue: {
          "fields.summary": "Current MDM initiative",
          "fields.status.name": "Done",
          "fields.timetracking.remainingEstimate": "0h",
        },
      },
      preconditions: { issues: issueChecks() },
      verification: {
        mode: "full",
        assertions: [
          assertion("fields.summary", "Current MDM initiative"),
          assertion("fields.status.name", "Done"),
          assertion("fields.timetracking.remainingEstimate", "0h"),
        ],
      },
    },
  ];
}

function settledWeek(totalHours = 60) {
  const weekdayHours = totalHours <= 60 ? totalHours / 5 : 12;
  const days = ["20", "21", "22", "23", "24"].map((day, index) => ({
    id: `settled-worklog-${index + 1}`,
    issueRef: "NEW:mdm-rollout-baseline",
    started: `2026-07-${day}T09:00:00.000Z`,
    hours: weekdayHours,
    evidenceRefs: [EVIDENCE_REF],
  }));
  if (totalHours > 60) {
    days.push({
      id: "settled-worklog-6",
      issueRef: "NEW:mdm-rollout-baseline",
      started: "2026-07-25T09:00:00.000Z",
      hours: totalHours - 60,
      evidenceRefs: [EVIDENCE_REF],
    });
  }
  return {
    weekOf: "2026-07-20",
    status: "settled",
    expectedTotalHours: totalHours,
    worklogs: days,
  };
}

function validInput(overrides = {}) {
  return {
    sourceSnapshotId: "sha256:evidence-snapshot-001",
    runKey: "mdm-rebuild",
    generatedAt: "2026-07-28T17:00:00.000Z",
    scope: { projectKey: "MT", initiative: "MDM" },
    evidenceSources: evidenceSources(),
    operations: parentOperations(),
    weeklySettlements: [settledWeek()],
    ...overrides,
  };
}

function clone(value) {
  return structuredClone(value);
}

test("builds a versioned, MT-scoped ledger with deterministic IDs and canonical preview hash", () => {
  const first = buildOperationLedger(validInput());
  const shuffledInput = validInput();
  shuffledInput.operations.reverse();
  const second = buildOperationLedger(shuffledInput);

  assert.equal(first.schemaVersion, LEDGER_SCHEMA_VERSION);
  assert.deepEqual(first.scope, { initiative: "MDM", projectKey: "MT" });
  assert.equal(first.run.id, second.run.id);
  assert.deepEqual(
    first.operations.map(({ id }) => id),
    second.operations.map(({ id }) => id)
  );
  assert.equal(first.preview.hash, second.preview.hash);
  assert.equal(first.preview.hash, computePreviewHash(first));
  assert.equal(first.integrity.hash, computeLedgerIntegrityHash(first));
  assert.equal(validateOperationLedger(first).valid, true);

  for (const operation of first.operations) {
    assert.equal(operation.idempotencyKey, createStableIdempotencyKey(operation));
    assert.equal(operation.id, createStableOperationId(first.run.id, operation));
    assert.equal(operation.state.status, "pending");
  }
});

test("canonical JSON and run IDs are stable across object key order", () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
  assert.equal(
    createStableRunId({
      sourceSnapshotId: "snapshot",
      runKey: "rebuild",
      scope: { initiative: "MDM", projectKey: "MT" },
    }),
    createStableRunId({
      runKey: "rebuild",
      scope: { projectKey: "MT", initiative: "MDM" },
      sourceSnapshotId: "snapshot",
    })
  );
});

test("enforces dependency order: issue creation, mutations, ordered transitions, then full verify", () => {
  const ledger = buildOperationLedger(validInput());
  const byKind = new Map();
  ledger.operations.forEach((operation, index) => {
    const entries = byKind.get(operation.kind) || [];
    entries.push({ operation, index });
    byKind.set(operation.kind, entries);
  });

  const create = byKind.get(OPERATION_KIND.ISSUE_CREATE)[0];
  const comment = byKind.get(OPERATION_KIND.COMMENT_CREATE)[0];
  const worklog = byKind.get(OPERATION_KIND.WORKLOG_CREATE)[0];
  const transitions = byKind.get(OPERATION_KIND.ISSUE_TRANSITION);
  const verify = byKind.get(OPERATION_KIND.ISSUE_VERIFY)[0];

  assert.ok(create.index < comment.index);
  assert.ok(create.index < worklog.index);
  assert.ok(comment.index < transitions[0].index);
  assert.ok(worklog.index < transitions[0].index);
  assert.deepEqual(
    transitions.map(({ operation }) => operation.effect.sequence),
    [1, 2, 3]
  );
  assert.ok(transitions[2].index < verify.index);
  assert.ok(verify.operation.dependsOn.includes(transitions[2].operation.id));
});

test("validates a no-network ledger containing every required Jira reconstruction operation kind", () => {
  assert.deepEqual(
    [...OPERATION_KINDS].sort(),
    [
      "comment.create",
      "issue-link.create",
      "issue-link.delete",
      "issue.create",
      "issue.transition",
      "issue.update",
      "issue.verify",
      "watcher.add",
      "worklog.create",
      "worklog.delete",
      "worklog.update",
    ].sort()
  );
  const ledger = buildOperationLedger(
    validInput({
      operations: [...parentOperations(), ...existingIssueOperations()],
      weeklySettlements: [],
    })
  );
  assert.deepEqual(
    [...new Set(ledger.operations.map(({ kind }) => kind))].sort(),
    [...OPERATION_KINDS].sort()
  );
  assert.equal(validateOperationLedger(ledger).valid, true);
});

test("rejects duplicate operation IDs and duplicate idempotency keys", () => {
  const repeatedInput = validInput();
  repeatedInput.operations.push(clone(repeatedInput.operations[0]));
  assert.throws(
    () => buildOperationLedger(repeatedInput),
    (error) =>
      error instanceof LedgerValidationError &&
      error.errors.some((entry) => entry.includes("Duplicate operation ID"))
  );

  const ledger = buildOperationLedger(validInput());
  const duplicateId = clone(ledger);
  duplicateId.operations[1].id = duplicateId.operations[0].id;
  let result = validateOperationLedger(duplicateId);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("Duplicate operation ID")));

  const duplicateKey = clone(ledger);
  duplicateKey.operations[1].idempotencyKey = duplicateKey.operations[0].idempotencyKey;
  result = validateOperationLedger(duplicateKey);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("Duplicate idempotency key")));
});

test("rejects missing, personal, and Prism reference-only evidence", () => {
  const missing = validInput();
  missing.operations[0].evidenceRefs = ["brain:missing"];
  assert.throws(
    () => buildOperationLedger(missing),
    (error) =>
      error instanceof LedgerValidationError &&
      error.errors.some((entry) => entry.includes("missing evidence source"))
  );

  const personal = validInput();
  personal.evidenceSources[0].title = "PhantomX personal app development";
  assert.throws(
    () => buildOperationLedger(personal),
    (error) =>
      error instanceof LedgerValidationError &&
      error.errors.some((entry) => entry.includes("cannot support MT work"))
  );

  const prism = validInput();
  prism.evidenceSources[0].sourceRef = "D:\\CascadeProjects\\Prism\\jira-connector.ts";
  assert.throws(
    () => buildOperationLedger(prism),
    (error) =>
      error instanceof LedgerValidationError &&
      error.errors.some((entry) => entry.includes("reference-only"))
  );
});

test("rejects unsupported or discontinuous Jira transitions", () => {
  const unsupported = validInput();
  const transition = unsupported.operations.find(
    (operation) => operation.kind === OPERATION_KIND.ISSUE_TRANSITION
  );
  transition.effect.toStatus = "Done";
  transition.verification.assertions[0].expected = "Done";
  assert.throws(
    () => buildOperationLedger(unsupported),
    (error) =>
      error instanceof LedgerValidationError &&
      error.errors.some((entry) => entry.includes("Unsupported Jira transition"))
  );

  const discontinuous = validInput();
  const transitions = discontinuous.operations.filter(
    (operation) => operation.kind === OPERATION_KIND.ISSUE_TRANSITION
  );
  transitions[1].effect.fromStatus = "Planning";
  transitions[1].preconditions.expectedStatus = "Planning";
  assert.throws(
    () => buildOperationLedger(discontinuous),
    (error) =>
      error instanceof LedgerValidationError &&
      error.errors.some((entry) => entry.includes("status chain is discontinuous"))
  );
});

test("rejects a skeleton subtask and orders a complete subtask behind its parent", () => {
  const skeleton = validInput({ weeklySettlements: [] });
  skeleton.operations.push(
    {
      groupId: "mdm-validation-subtask",
      parentGroupId: "mdm-rollout-baseline",
      sourceScope: "engagement",
      evidenceRefs: [EVIDENCE_REF],
      kind: OPERATION_KIND.ISSUE_CREATE,
      target: { issueRef: "NEW:mdm-validation-subtask" },
      effect: {
        issueRef: "NEW:mdm-validation-subtask",
        parentRef: "NEW:mdm-rollout-baseline",
        issueType: "Subtask",
        fields: issueFields({ summary: "Validate the MDM rollout" }),
      },
      preconditions: {},
      verification: {
        mode: "effect",
        assertions: [assertion("fields.summary", "Validate the MDM rollout")],
      },
    },
    {
      groupId: "mdm-validation-subtask",
      parentGroupId: "mdm-rollout-baseline",
      sourceScope: "engagement",
      evidenceRefs: [EVIDENCE_REF],
      kind: OPERATION_KIND.ISSUE_VERIFY,
      target: { issueRef: "NEW:mdm-validation-subtask" },
      effect: {
        expectedIssue: { "fields.summary": "Validate the MDM rollout" },
      },
      preconditions: {},
      verification: {
        mode: "full",
        assertions: [assertion("fields.summary", "Validate the MDM rollout")],
      },
    }
  );
  assert.throws(
    () => buildOperationLedger(skeleton),
    (error) =>
      error instanceof LedgerValidationError &&
      error.errors.some(
        (entry) =>
          entry.includes("Subtask group mdm-validation-subtask") &&
          (entry.includes("comment") || entry.includes("worklog"))
      )
  );

  const complete = clone(skeleton);
  complete.operations.push(
    {
      groupId: "mdm-validation-subtask",
      parentGroupId: "mdm-rollout-baseline",
      sourceScope: "engagement",
      evidenceRefs: [EVIDENCE_REF],
      kind: OPERATION_KIND.COMMENT_CREATE,
      target: { issueRef: "NEW:mdm-validation-subtask" },
      effect: { body: "I validated the rollout result and closed the remaining evidence gaps." },
      preconditions: { commentAbsentByIdempotencyKey: true },
      verification: {
        mode: "effect",
        assertions: [
          assertion(
            "comment.body",
            "I validated the rollout result and closed the remaining evidence gaps."
          ),
        ],
      },
    },
    {
      groupId: "mdm-validation-subtask",
      parentGroupId: "mdm-rollout-baseline",
      sourceScope: "engagement",
      evidenceRefs: [EVIDENCE_REF],
      kind: OPERATION_KIND.WORKLOG_CREATE,
      target: { issueRef: "NEW:mdm-validation-subtask" },
      effect: {
        started: "2026-07-24T09:00:00.000Z",
        timeSpentSeconds: 7_200,
        comment: "Validated the rollout result and acceptance evidence.",
      },
      preconditions: { worklogAbsentByIdempotencyKey: true },
      verification: {
        mode: "effect",
        assertions: [assertion("worklog.timeSpentSeconds", 7_200)],
      },
    }
  );
  const ledger = buildOperationLedger(complete);
  const parentCreateIndex = ledger.operations.findIndex(
    (operation) => operation.effect?.issueRef === "NEW:mdm-rollout-baseline"
  );
  const childCreateIndex = ledger.operations.findIndex(
    (operation) => operation.effect?.issueRef === "NEW:mdm-validation-subtask"
  );
  assert.ok(parentCreateIndex >= 0 && parentCreateIndex < childCreateIndex);
});

test("rejects settled weeks outside 60 to 65 hours and accepts both boundaries", () => {
  for (const hours of [59, 66]) {
    const input = validInput({ weeklySettlements: [settledWeek(hours)] });
    assert.throws(
      () => buildOperationLedger(input),
      (error) =>
        error instanceof LedgerValidationError &&
        error.errors.some((entry) => entry.includes("Settled week"))
    );
  }
  assert.equal(validateOperationLedger(buildOperationLedger(validInput())).valid, true);
  assert.equal(
    validateOperationLedger(
      buildOperationLedger(validInput({ weeklySettlements: [settledWeek(65)] }))
    ).valid,
    true
  );
});

test("requires exact Jira versions and previous-field preconditions for existing issues", () => {
  const operations = [
    {
      groupId: "existing-mt-12",
      sourceScope: "engagement",
      evidenceRefs: [EVIDENCE_REF],
      kind: OPERATION_KIND.ISSUE_UPDATE,
      target: { issueRef: "MT-12" },
      effect: { fields: { summary: "Current MDM initiative" } },
      preconditions: {
        issues: [{ issueRef: "MT-12", exists: true, expectedJiraVersion: 7 }],
        expectedFields: { summary: "Legacy MDM initiative" },
      },
      verification: {
        mode: "effect",
        assertions: [assertion("fields.summary", "Current MDM initiative")],
      },
    },
    {
      groupId: "existing-mt-12",
      sourceScope: "engagement",
      evidenceRefs: [EVIDENCE_REF],
      kind: OPERATION_KIND.ISSUE_VERIFY,
      target: { issueRef: "MT-12" },
      effect: {
        expectedIssue: { "fields.summary": "Current MDM initiative" },
      },
      preconditions: {
        issues: [{ issueRef: "MT-12", exists: true, expectedJiraVersion: 7 }],
      },
      verification: {
        mode: "full",
        assertions: [assertion("fields.summary", "Current MDM initiative")],
      },
    },
  ];
  const valid = buildOperationLedger(validInput({ operations, weeklySettlements: [] }));
  assert.equal(validateOperationLedger(valid).valid, true);

  const missingVersion = clone(operations);
  delete missingVersion[0].preconditions.issues[0].expectedJiraVersion;
  assert.throws(
    () => buildOperationLedger(validInput({ operations: missingVersion, weeklySettlements: [] })),
    (error) =>
      error instanceof LedgerValidationError &&
      error.errors.some((entry) => entry.includes("expected Jira version"))
  );

  const missingPrevious = clone(operations);
  delete missingPrevious[0].preconditions.expectedFields;
  assert.throws(
    () => buildOperationLedger(validInput({ operations: missingPrevious, weeklySettlements: [] })),
    (error) =>
      error instanceof LedgerValidationError &&
      error.errors.some((entry) => entry.includes("existing field preconditions"))
  );
});

test("requires exact full verification and one final verifier per mutation group", () => {
  const partial = validInput();
  const verifier = partial.operations.find(
    (operation) => operation.kind === OPERATION_KIND.ISSUE_VERIFY
  );
  verifier.verification.assertions[0].operator = "contains";
  assert.throws(
    () => buildOperationLedger(partial),
    (error) =>
      error instanceof LedgerValidationError &&
      error.errors.some((entry) => entry.includes("cannot use a partial contains assertion"))
  );

  const missing = validInput();
  missing.operations = missing.operations.filter(
    (operation) => operation.kind !== OPERATION_KIND.ISSUE_VERIFY
  );
  assert.throws(
    () => buildOperationLedger(missing),
    (error) =>
      error instanceof LedgerValidationError &&
      error.errors.some((entry) => entry.includes("exactly one final full verification"))
  );
});

test("operation state helpers are resume-safe and do not change the preview hash", () => {
  const ledger = buildOperationLedger(validInput());
  const create = ledger.operations.find(
    (operation) => operation.kind === OPERATION_KIND.ISSUE_CREATE
  );
  assert.deepEqual(
    getRunnableOperations(ledger).map(({ id }) => id),
    [create.id]
  );

  let progressed = transitionOperationState(ledger, create.id, "running", {
    at: "2026-07-28T17:01:00.000Z",
  });
  assert.equal(progressed.operations.find(({ id }) => id === create.id).state.attempts, 1);
  progressed = transitionOperationState(progressed, create.id, "succeeded", {
    at: "2026-07-28T17:02:00.000Z",
    result: { verificationStatus: "passed", issueKey: "MT-155" },
  });
  assert.equal(validateOperationLedger(progressed).valid, true);
  assert.equal(progressed.preview.hash, ledger.preview.hash);
  assert.ok(
    getRunnableOperations(progressed).some(
      (operation) => operation.kind === OPERATION_KIND.COMMENT_CREATE
    )
  );

  const comment = progressed.operations.find(
    (operation) => operation.kind === OPERATION_KIND.COMMENT_CREATE
  );
  let failed = transitionOperationState(progressed, comment.id, "running");
  failed = transitionOperationState(failed, comment.id, "failed", {
    error: { message: "Temporary Jira response failure" },
    retryable: true,
  });
  const resumed = resumeOperationLedger(failed, {
    at: "2026-07-28T17:03:00.000Z",
  });
  assert.equal(resumed.operations.find(({ id }) => id === create.id).state.status, "succeeded");
  assert.equal(resumed.operations.find(({ id }) => id === comment.id).state.status, "pending");
  assert.equal(resumed.operations.find(({ id }) => id === comment.id).state.attempts, 1);
  assert.equal(resumed.preview.hash, ledger.preview.hash);

  assert.throws(
    () => transitionOperationState(ledger, create.id, "skipped"),
    /passed verification/
  );
  const safelySkipped = transitionOperationState(ledger, create.id, "skipped", {
    result: {
      verificationStatus: "passed",
      skipReason: "The exact intended effect was already present.",
    },
  });
  assert.equal(validateOperationLedger(safelySkipped).valid, true);
  assert.ok(getRunnableOperations(safelySkipped).length > 0);

  const runningThenSkipped = transitionOperationState(
    transitionOperationState(ledger, create.id, "running"),
    create.id,
    "skipped",
    {
      result: {
        verificationStatus: "passed",
        skipReason: "The exact intended effect was already present.",
      },
    }
  );
  assert.equal(validateOperationLedger(runningThenSkipped).valid, true);
});

test("tampering with a canonicalized effect invalidates both stable identity and preview", () => {
  const ledger = buildOperationLedger(validInput());
  const tampered = clone(ledger);
  tampered.operations[0].effect.fields.summary = "Tampered summary";
  const result = validateOperationLedger(tampered);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("non-stable idempotency key")));
  assert.ok(result.errors.some((error) => error.includes("Preview hash")));
});

test("immutable ledger integrity detects provenance and precondition tampering without changing effect preview", () => {
  const ledger = buildOperationLedger(
    validInput({
      operations: existingIssueOperations(),
      weeklySettlements: [],
    })
  );

  const provenanceTamper = clone(ledger);
  provenanceTamper.evidenceSources[0].sourceRef = "C:\\different\\unreviewed-source.md";
  assert.equal(computePreviewHash(provenanceTamper), ledger.preview.hash);
  let result = validateOperationLedger(provenanceTamper);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("Ledger integrity hash")));

  const preconditionTamper = clone(ledger);
  preconditionTamper.operations[0].preconditions.issues[0].expectedJiraVersion = 999;
  assert.equal(computePreviewHash(preconditionTamper), ledger.preview.hash);
  result = validateOperationLedger(preconditionTamper);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("Ledger integrity hash")));
});
