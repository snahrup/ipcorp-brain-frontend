import { isDeepStrictEqual } from "node:util";

import {
  adfDoc,
  adfParagraph,
  createOperationMarker,
  hasOperationMarker,
  isNativeAdfDocument,
} from "./jira-adf.mjs";
import {
  assertExactEffect,
  assertReadbackAssertions,
  assertWatcherPresent,
} from "./jira-reconstruction-client.mjs";
import {
  assertValidOperationLedger,
  canonicalize,
  OPERATION_KIND,
  orderOperations,
  transitionOperationState,
} from "./operation-ledger.mjs";

const EXECUTOR_SCHEMA_VERSION = "1.0.0";
const EXISTING_ISSUE_PATTERN = /^MT-\d+$/;
const NEW_ISSUE_PATTERN = /^NEW:[A-Za-z0-9._-]+$/;
const REQUIRED_FIELD_MUTATIONS = new Set([
  OPERATION_KIND.ISSUE_CREATE,
  OPERATION_KIND.ISSUE_UPDATE,
]);
const MUTATION_KINDS = new Set([
  OPERATION_KIND.ISSUE_CREATE,
  OPERATION_KIND.ISSUE_UPDATE,
  OPERATION_KIND.COMMENT_CREATE,
  OPERATION_KIND.WORKLOG_CREATE,
  OPERATION_KIND.WORKLOG_UPDATE,
  OPERATION_KIND.WORKLOG_DELETE,
  OPERATION_KIND.ISSUE_LINK_CREATE,
  OPERATION_KIND.ISSUE_LINK_DELETE,
  OPERATION_KIND.WATCHER_ADD,
  OPERATION_KIND.ISSUE_TRANSITION,
]);
const TERMINAL_SUCCESS_STATES = new Set(["succeeded", "skipped"]);

export class JiraLedgerExecutionError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "JiraLedgerExecutionError";
    this.code = code;
    this.operationId = options.operationId || null;
    this.groupId = options.groupId || null;
    this.retryable = options.retryable !== false;
    if (options.ledger) this.ledger = canonicalize(options.ledger);
  }
}

class OperationFailure extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "OperationFailure";
    this.code = code;
    this.retryable = options.retryable !== false;
    this.partialResult = options.partialResult ? canonicalize(options.partialResult) : undefined;
  }
}

function requireNonEmptyText(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new TypeError(`${label} is required.`);
  return normalized;
}

function requireClientMethod(jiraClient, method, operation) {
  if (typeof jiraClient?.[method] !== "function") {
    throw new JiraLedgerExecutionError(
      "unsupported_client_contract",
      `The injected Jira client does not support ${method} required by ${operation.id}.`,
      { operationId: operation.id, groupId: operation.groupId }
    );
  }
}

function createClock(now) {
  if (typeof now === "function") {
    return () => requireNonEmptyText(now(), "now() result");
  }
  if (now !== undefined && now !== null) {
    const fixed = requireNonEmptyText(now, "now");
    return () => fixed;
  }
  return () => new Date().toISOString();
}

function plainTextAdf(text, markerIdentity = null) {
  const paragraphs = requireNonEmptyText(text, "Jira text")
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.replace(/\s*\r?\n\s*/g, " ").trim())
    .filter(Boolean)
    .map((paragraph) => adfParagraph(paragraph));
  if (markerIdentity) {
    paragraphs.push(adfParagraph(createOperationMarker(markerIdentity, { mode: "invisible" })));
  }
  return adfDoc(paragraphs);
}

function adfText(value) {
  if (!isNativeAdfDocument(value)) return value == null ? "" : String(value);
  const values = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "text" && typeof node.text === "string") values.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  value.content.forEach(visit);
  return values
    .filter((entry) => !entry.includes("\u200b") && !entry.includes("[mdm-op:"))
    .join("\n")
    .trim();
}

function descriptionAdf(fields) {
  const native = fields?.descriptionAdf ?? fields?.description;
  if (native != null) {
    if (!isNativeAdfDocument(native)) {
      throw new TypeError("descriptionAdf/description must be a native ADF v1 document.");
    }
    return native;
  }
  return plainTextAdf(fields?.descriptionText);
}

function toJiraFields(fields, { forCreate = false } = {}) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new TypeError("Issue fields must be an object.");
  }

  const mapped = {};
  const timeTracking = {};
  for (const [name, value] of Object.entries(fields)) {
    switch (name) {
      case "descriptionText":
      case "descriptionAdf":
      case "description":
        if (!forCreate) mapped.description = descriptionAdf(fields);
        break;
      case "startDate":
        mapped.customfield_11915 = value;
        break;
      case "dueDate":
        mapped.duedate = value;
        break;
      case "priority":
        mapped.priority =
          value && typeof value === "object" ? value : value ? { name: String(value) } : null;
        break;
      case "assigneeAccountId":
        mapped.assignee = value ? { accountId: String(value) } : null;
        break;
      case "originalEstimate":
        timeTracking.originalEstimate = value;
        break;
      case "remainingEstimate":
        timeTracking.remainingEstimate = value;
        break;
      case "status":
        // Workflow state is changed only through issue.transition operations.
        break;
      case "summary":
        if (!forCreate) mapped.summary = value;
        break;
      default:
        mapped[name] = value;
    }
  }
  if (Object.keys(timeTracking).length) {
    mapped.timetracking = {
      ...(mapped.timetracking && typeof mapped.timetracking === "object"
        ? mapped.timetracking
        : {}),
      ...timeTracking,
    };
  }
  return mapped;
}

function issueRefFor(operation) {
  if (operation.kind === OPERATION_KIND.ISSUE_CREATE) return operation.effect?.issueRef || null;
  if (
    [OPERATION_KIND.ISSUE_LINK_CREATE, OPERATION_KIND.ISSUE_LINK_DELETE].includes(operation.kind)
  ) {
    return operation.effect?.fromRef || null;
  }
  return operation.target?.issueRef || null;
}

function resolveIssueRef(issueRef, createdKeys) {
  const ref = requireNonEmptyText(issueRef, "issueRef");
  if (EXISTING_ISSUE_PATTERN.test(ref)) return ref;
  if (!NEW_ISSUE_PATTERN.test(ref)) {
    throw new OperationFailure(
      "invalid_issue_ref",
      `${ref} is not an MT issue key or stable NEW reference.`
    );
  }
  const key = createdKeys.get(ref);
  if (!key) {
    throw new OperationFailure(
      "unresolved_issue_ref",
      `${ref} has not been resolved by a verified issue.create operation.`
    );
  }
  return key;
}

function rebuildCreatedKeys(ledger) {
  const createdKeys = new Map();
  for (const operation of ledger.operations || []) {
    if (operation.kind !== OPERATION_KIND.ISSUE_CREATE) continue;
    const issueRef = operation.effect?.issueRef;
    const issueKey =
      operation.state?.result?.createdIssueKey ||
      operation.state?.result?.issueKey ||
      operation.state?.result?.key;
    if (!issueKey) continue;
    if (!EXISTING_ISSUE_PATTERN.test(String(issueKey))) {
      throw new JiraLedgerExecutionError(
        "invalid_checkpoint_mapping",
        `Checkpointed create operation ${operation.id} contains invalid Jira key ${issueKey}.`,
        { operationId: operation.id, groupId: operation.groupId }
      );
    }
    const existing = createdKeys.get(issueRef);
    if (existing && existing !== issueKey) {
      throw new JiraLedgerExecutionError(
        "conflicting_checkpoint_mapping",
        `Checkpointed reference ${issueRef} maps to both ${existing} and ${issueKey}.`,
        { operationId: operation.id, groupId: operation.groupId }
      );
    }
    createdKeys.set(issueRef, String(issueKey));
  }
  return createdKeys;
}

function createdKeysObject(createdKeys) {
  return Object.fromEntries(
    [...createdKeys.entries()].sort(([left], [right]) => left.localeCompare(right))
  );
}

function operationPriority(operation) {
  if (operation.kind === OPERATION_KIND.ISSUE_CREATE) return 10;
  if (operation.kind === OPERATION_KIND.ISSUE_UPDATE) return 15;
  if (operation.kind === OPERATION_KIND.ISSUE_VERIFY) return 1000;
  if (operation.kind === OPERATION_KIND.ISSUE_TRANSITION) {
    return 100 + Number(operation.effect?.sequence || 0);
  }
  return 20;
}

function buildExecutionOrder(operations) {
  const canonicalOrder = orderOperations(operations);
  const byId = new Map(canonicalOrder.map((operation) => [operation.id, operation]));
  const originalIndex = new Map(canonicalOrder.map((operation, index) => [operation.id, index]));
  const requiredByGroup = new Map();
  for (const operation of canonicalOrder) {
    if (!REQUIRED_FIELD_MUTATIONS.has(operation.kind)) continue;
    const ids = requiredByGroup.get(operation.groupId) || [];
    ids.push(operation.id);
    requiredByGroup.set(operation.groupId, ids);
  }

  const dependencies = new Map();
  for (const operation of canonicalOrder) {
    const values = new Set(operation.dependsOn || []);
    if (!REQUIRED_FIELD_MUTATIONS.has(operation.kind)) {
      for (const requiredId of requiredByGroup.get(operation.groupId) || []) {
        if (requiredId !== operation.id) values.add(requiredId);
      }
    }
    dependencies.set(operation.id, values);
  }

  const remaining = new Set(byId.keys());
  const ordered = [];
  while (remaining.size) {
    const ready = [...remaining]
      .filter((id) => [...dependencies.get(id)].every((dependency) => !remaining.has(dependency)))
      .map((id) => byId.get(id))
      .sort(
        (left, right) =>
          operationPriority(left) - operationPriority(right) ||
          String(left.groupId).localeCompare(String(right.groupId)) ||
          originalIndex.get(left.id) - originalIndex.get(right.id)
      );
    if (!ready.length) {
      throw new JiraLedgerExecutionError(
        "unsafe_execution_order",
        "Required-field-first execution introduces a dependency cycle; no Jira calls were made."
      );
    }
    for (const operation of ready) {
      ordered.push(operation);
      remaining.delete(operation.id);
    }
  }
  return ordered;
}

function validateClientContract(jiraClient, operations) {
  if (!jiraClient || typeof jiraClient !== "object") {
    throw new JiraLedgerExecutionError(
      "missing_jira_client",
      "An injected Jira client is required."
    );
  }
  for (const operation of operations) {
    if (operation.state?.status !== "pending") continue;
    requireClientMethod(jiraClient, "readFullIssue", operation);
    switch (operation.kind) {
      case OPERATION_KIND.ISSUE_CREATE:
        if (operation.effect?.issueType === "Subtask") {
          requireClientMethod(jiraClient, "createSubtask", operation);
        } else if (operation.effect?.issueType === "Task") {
          requireClientMethod(jiraClient, "createTask", operation);
        } else if (operation.effect?.issueType === "Epic") {
          requireClientMethod(jiraClient, "createEpic", operation);
        }
        break;
      case OPERATION_KIND.ISSUE_UPDATE:
        requireClientMethod(jiraClient, "updateIssueFields", operation);
        break;
      case OPERATION_KIND.COMMENT_CREATE:
        requireClientMethod(jiraClient, "addComment", operation);
        break;
      case OPERATION_KIND.WORKLOG_CREATE:
        requireClientMethod(jiraClient, "createWorklog", operation);
        break;
      case OPERATION_KIND.WORKLOG_UPDATE:
        requireClientMethod(jiraClient, "updateWorklog", operation);
        break;
      case OPERATION_KIND.WORKLOG_DELETE:
        requireClientMethod(jiraClient, "deleteWorklog", operation);
        break;
      case OPERATION_KIND.ISSUE_LINK_CREATE:
        requireClientMethod(jiraClient, "createIssueLink", operation);
        break;
      case OPERATION_KIND.ISSUE_LINK_DELETE:
        requireClientMethod(jiraClient, "deleteIssueLink", operation);
        break;
      case OPERATION_KIND.WATCHER_ADD:
        requireClientMethod(jiraClient, "addWatcher", operation);
        break;
      case OPERATION_KIND.ISSUE_TRANSITION:
        requireClientMethod(jiraClient, "applyOrderedTransitions", operation);
        break;
      case OPERATION_KIND.ISSUE_VERIFY:
        break;
      default:
        throw new JiraLedgerExecutionError(
          "unsupported_operation_kind",
          `Unsupported operation kind ${operation.kind}.`,
          { operationId: operation.id, groupId: operation.groupId }
        );
    }
  }
}

function operationExpectedAuthor(operation, configuredAccountId) {
  return (
    operation.effect?.expectedAuthorAccountId ||
    operation.preconditions?.expectedAuthorAccountId ||
    configuredAccountId ||
    null
  );
}

function validateWorklogAuthors(operations, configuredAccountId) {
  for (const operation of operations) {
    if (
      operation.state?.status === "pending" &&
      [
        OPERATION_KIND.WORKLOG_CREATE,
        OPERATION_KIND.WORKLOG_UPDATE,
        OPERATION_KIND.WORKLOG_DELETE,
      ].includes(operation.kind) &&
      !String(operationExpectedAuthor(operation, configuredAccountId) || "").trim()
    ) {
      throw new JiraLedgerExecutionError(
        "missing_expected_worklog_author",
        `Operation ${operation.id} requires expectedAuthorAccountId before any Jira call.`,
        { operationId: operation.id, groupId: operation.groupId }
      );
    }
  }
}

function extractIssueVersion(readback) {
  const candidates = [
    readback?.rawIssue?.version,
    readback?.rawIssue?.fields?.version,
    readback?.version,
    readback?.fields?.version,
  ];
  const value = candidates.find((candidate) => Number.isInteger(Number(candidate)));
  return value === undefined ? null : Number(value);
}

function ensureFullReadback(readback, issueKey) {
  if (!readback || typeof readback !== "object" || Array.isArray(readback)) {
    throw new OperationFailure(
      "invalid_readback",
      `Jira did not return a full readback for ${issueKey}.`
    );
  }
  if (String(readback.key || "") !== issueKey) {
    throw new OperationFailure(
      "readback_key_mismatch",
      `Jira readback key ${readback.key || "<missing>"} does not match ${issueKey}.`
    );
  }
  if (!readback.fields || typeof readback.fields !== "object") {
    throw new OperationFailure(
      "invalid_readback",
      `Jira readback for ${issueKey} is missing fields.`
    );
  }
  return readback;
}

async function readFullIssue(jiraClient, issueKey) {
  return ensureFullReadback(await jiraClient.readFullIssue(issueKey), issueKey);
}

function observedSemanticField(readback, field) {
  switch (field) {
    case "descriptionText":
      return adfText(readback?.fields?.description);
    case "startDate":
      return readback?.fields?.customfield_11915;
    case "dueDate":
      return readback?.fields?.duedate;
    case "priority":
      return readback?.fields?.priority?.name;
    case "assigneeAccountId":
      return readback?.fields?.assignee?.accountId;
    case "originalEstimate":
      return readback?.fields?.timetracking?.originalEstimate;
    case "remainingEstimate":
      return readback?.fields?.timetracking?.remainingEstimate;
    case "status":
      return readback?.fields?.status?.name;
    default:
      return readback?.fields?.[field];
  }
}

function assertExpectedIssueFields(readback, expectedFields, label) {
  for (const [field, expected] of Object.entries(expectedFields || {})) {
    assertExactEffect(observedSemanticField(readback, field), expected, {
      label: `${label}.${field}`,
    });
  }
}

function timestampMillis(value) {
  const normalized = String(value || "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const millis = Date.parse(normalized);
  return Number.isNaN(millis) ? null : millis;
}

function assertEquivalentStarted(actual, expected, label) {
  const actualMillis = timestampMillis(actual);
  const expectedMillis = timestampMillis(expected);
  if (actualMillis == null || expectedMillis == null || actualMillis !== expectedMillis) {
    assertExactEffect(actual, expected, { label });
  }
}

function watcherEntries(readback) {
  const container = readback?.watchers?.watchers ? readback.watchers : readback?.watchers;
  return Array.isArray(container?.watchers) ? container.watchers : [];
}

function worklogEntries(readback) {
  return Array.isArray(readback?.worklogs) ? readback.worklogs : [];
}

function commentEntries(readback) {
  return Array.isArray(readback?.comments) ? readback.comments : [];
}

function normalizeIssueLinks(readback, currentIssueKey) {
  const normalized = [];
  for (const link of Array.isArray(readback?.links) ? readback.links : []) {
    const type =
      typeof link?.type === "string" ? link.type : link?.type?.name || link?.name || null;
    const fromRef =
      link?.fromRef || link?.inwardIssue?.key || (link?.outwardIssue?.key ? currentIssueKey : null);
    const toRef =
      link?.toRef || link?.outwardIssue?.key || (link?.inwardIssue?.key ? currentIssueKey : null);
    normalized.push({
      id: link?.id == null ? null : String(link.id),
      type,
      fromRef,
      toRef,
      raw: link,
    });
  }
  return normalized;
}

function linkMap(readback, currentIssueKey) {
  const result = {};
  for (const link of normalizeIssueLinks(readback, currentIssueKey)) {
    if (link.id) result[link.id] = link;
    const stableKey = `${link.fromRef}-${String(link.type || "").toLowerCase()}-${link.toRef}`;
    result[stableKey] = link;
  }
  return result;
}

function worklogMap(readback) {
  return Object.fromEntries(
    worklogEntries(readback)
      .filter((worklog) => worklog?.id != null)
      .map((worklog) => [String(worklog.id), worklog])
  );
}

function watcherMap(readback) {
  return Object.fromEntries(
    watcherEntries(readback)
      .filter((watcher) => watcher?.accountId)
      .map((watcher) => [String(watcher.accountId), true])
  );
}

function findExactLink(readback, currentIssueKey, expected) {
  return normalizeIssueLinks(readback, currentIssueKey).find(
    (link) =>
      link.type === expected.type &&
      link.fromRef === expected.fromRef &&
      link.toRef === expected.toRef &&
      (expected.linkId == null || link.id === String(expected.linkId))
  );
}

function assertWorklogPrevious(worklog, expected, label) {
  if (!worklog) {
    throw new OperationFailure("precondition_failed", `${label} does not exist.`);
  }
  for (const [field, value] of Object.entries(expected || {})) {
    const actual =
      field === "comment" && typeof value === "string" ? adfText(worklog.comment) : worklog[field];
    if (!isDeepStrictEqual(actual, value)) {
      throw new OperationFailure(
        "precondition_failed",
        `${label}.${field} no longer matches the reviewed value.`
      );
    }
  }
}

function adaptOperationReadback(operation, readback, observed = {}) {
  const issueKey = readback.key;
  switch (operation.kind) {
    case OPERATION_KIND.COMMENT_CREATE:
      return {
        ...readback,
        comment: observed.comment
          ? { ...observed.comment, body: operation.effect.body }
          : undefined,
      };
    case OPERATION_KIND.WORKLOG_CREATE:
    case OPERATION_KIND.WORKLOG_UPDATE:
      return {
        ...readback,
        worklog: observed.worklog
          ? { ...observed.worklog, comment: operation.effect.comment }
          : undefined,
        worklogs: worklogMap(readback),
      };
    case OPERATION_KIND.WORKLOG_DELETE:
      return { ...readback, worklogs: worklogMap(readback) };
    case OPERATION_KIND.ISSUE_LINK_CREATE:
    case OPERATION_KIND.ISSUE_LINK_DELETE:
      return { ...readback, links: linkMap(readback, issueKey) };
    case OPERATION_KIND.WATCHER_ADD:
      return { ...readback, watchers: watcherMap(readback) };
    default:
      return readback;
  }
}

function assertOperationAssertions(operation, readback, observed = {}) {
  assertReadbackAssertions(
    adaptOperationReadback(operation, readback, observed),
    operation.verification.assertions
  );
}

function hasCompletedProgress(groupOperations) {
  return groupOperations.some((operation) => TERMINAL_SUCCESS_STATES.has(operation.state?.status));
}

async function preflightGroup({ groupOperations, jiraClient, createdKeys }) {
  const issuePreconditions = new Map();
  for (const operation of groupOperations) {
    for (const precondition of operation.preconditions?.issues || []) {
      const entries = issuePreconditions.get(precondition.issueRef) || [];
      entries.push(precondition);
      issuePreconditions.set(precondition.issueRef, entries);
    }
  }

  const progressed = hasCompletedProgress(groupOperations);
  for (const [issueRef, preconditions] of issuePreconditions) {
    if (NEW_ISSUE_PATTERN.test(issueRef)) {
      const ownCreate = groupOperations.find(
        (operation) =>
          operation.kind === OPERATION_KIND.ISSUE_CREATE && operation.effect?.issueRef === issueRef
      );
      if (!ownCreate && !createdKeys.has(issueRef)) {
        throw new OperationFailure(
          "precondition_failed",
          `${issueRef} has no verified created-key mapping.`
        );
      }
      continue;
    }

    const issueKey = resolveIssueRef(issueRef, createdKeys);
    const readback = await readFullIssue(jiraClient, issueKey);
    if (progressed) continue;

    const expectedVersions = new Set(
      preconditions
        .map((precondition) => precondition.expectedJiraVersion)
        .filter((version) => version != null)
        .map(Number)
    );
    if (expectedVersions.size > 1) {
      throw new OperationFailure(
        "precondition_failed",
        `${issueKey} has conflicting reviewed Jira versions in one group.`
      );
    }
    if (expectedVersions.size === 1) {
      const expectedVersion = [...expectedVersions][0];
      const actualVersion = extractIssueVersion(readback);
      if (actualVersion !== expectedVersion) {
        throw new OperationFailure(
          "precondition_failed",
          `${issueKey} Jira version is ${actualVersion ?? "<unavailable>"}, expected ${expectedVersion}.`
        );
      }
    }
  }
}

async function checkOperationPreconditions({ operation, jiraClient, createdKeys }) {
  const effect = operation.effect || {};
  switch (operation.kind) {
    case OPERATION_KIND.ISSUE_CREATE: {
      const issueRef = effect.issueRef;
      if (createdKeys.has(issueRef)) {
        throw new OperationFailure(
          "precondition_failed",
          `${issueRef} already has a checkpointed Jira key.`
        );
      }
      if (effect.parentRef) resolveIssueRef(effect.parentRef, createdKeys);
      return {};
    }
    case OPERATION_KIND.ISSUE_UPDATE: {
      const issueKey = resolveIssueRef(operation.target.issueRef, createdKeys);
      const readback = await readFullIssue(jiraClient, issueKey);
      assertExpectedIssueFields(
        readback,
        operation.preconditions.expectedFields,
        `${issueKey}.precondition`
      );
      return { issueKey, readback };
    }
    case OPERATION_KIND.COMMENT_CREATE: {
      const issueKey = resolveIssueRef(operation.target.issueRef, createdKeys);
      const readback = await readFullIssue(jiraClient, issueKey);
      const existing = commentEntries(readback).find((comment) =>
        hasOperationMarker(comment?.body, operation.idempotencyKey)
      );
      return { issueKey, readback, existing };
    }
    case OPERATION_KIND.WORKLOG_CREATE: {
      const issueKey = resolveIssueRef(operation.target.issueRef, createdKeys);
      const readback = await readFullIssue(jiraClient, issueKey);
      const existing = worklogEntries(readback).find((worklog) =>
        hasOperationMarker(worklog?.comment, operation.idempotencyKey)
      );
      return { issueKey, readback, existing };
    }
    case OPERATION_KIND.WORKLOG_UPDATE:
    case OPERATION_KIND.WORKLOG_DELETE: {
      const issueKey = resolveIssueRef(operation.target.issueRef, createdKeys);
      const readback = await readFullIssue(jiraClient, issueKey);
      const worklogId = String(effect.worklogId);
      const existing = worklogEntries(readback).find(
        (worklog) => String(worklog?.id) === worklogId
      );
      assertWorklogPrevious(
        existing,
        operation.preconditions.worklog.expected,
        `${issueKey}.worklog.${worklogId}`
      );
      return { issueKey, readback, existing };
    }
    case OPERATION_KIND.ISSUE_LINK_CREATE:
    case OPERATION_KIND.ISSUE_LINK_DELETE: {
      const fromKey = resolveIssueRef(effect.fromRef, createdKeys);
      const toKey = resolveIssueRef(effect.toRef, createdKeys);
      const readback = await readFullIssue(jiraClient, fromKey);
      const expected = {
        type: effect.type,
        fromRef: fromKey,
        toRef: toKey,
        ...(effect.linkId ? { linkId: String(effect.linkId) } : {}),
      };
      const existing = findExactLink(readback, fromKey, expected);
      if (operation.kind === OPERATION_KIND.ISSUE_LINK_CREATE && existing) {
        throw new OperationFailure(
          "precondition_failed",
          `Reviewed link ${fromKey} ${effect.type} ${toKey} is no longer absent.`
        );
      }
      if (operation.kind === OPERATION_KIND.ISSUE_LINK_DELETE && !existing) {
        throw new OperationFailure(
          "precondition_failed",
          `Reviewed link ${effect.linkId} no longer exists exactly as expected.`
        );
      }
      return { issueKey: fromKey, fromKey, toKey, readback, existing };
    }
    case OPERATION_KIND.WATCHER_ADD: {
      const issueKey = resolveIssueRef(operation.target.issueRef, createdKeys);
      const readback = await readFullIssue(jiraClient, issueKey);
      const existing = watcherEntries(readback).find(
        (watcher) => watcher?.accountId === effect.accountId
      );
      if (existing) {
        throw new OperationFailure(
          "precondition_failed",
          `Watcher ${effect.accountId} is no longer absent on ${issueKey}.`
        );
      }
      return { issueKey, readback };
    }
    case OPERATION_KIND.ISSUE_TRANSITION: {
      const issueKey = resolveIssueRef(operation.target.issueRef, createdKeys);
      const readback = await readFullIssue(jiraClient, issueKey);
      const actualStatus = readback.fields?.status?.name;
      if (actualStatus !== operation.preconditions.expectedStatus) {
        throw new OperationFailure(
          "precondition_failed",
          `${issueKey} status is ${actualStatus || "<missing>"}, expected ${operation.preconditions.expectedStatus}.`
        );
      }
      return { issueKey, readback };
    }
    case OPERATION_KIND.ISSUE_VERIFY:
      return { issueKey: resolveIssueRef(operation.target.issueRef, createdKeys) };
    default:
      throw new OperationFailure(
        "unsupported_operation_kind",
        `Unsupported operation kind ${operation.kind}.`
      );
  }
}

function mutationFailure(error, partialResult = {}) {
  if (error instanceof OperationFailure) return error;
  return new OperationFailure("jira_mutation_or_readback_failed", error.message, {
    cause: error,
    retryable: false,
    partialResult,
  });
}

async function executeOperation({
  operation,
  jiraClient,
  createdKeys,
  expectedAuthorAccountId,
  precondition,
}) {
  const effect = operation.effect || {};
  const commonResult = {
    verificationStatus: "passed",
    issueKey: precondition.issueKey || null,
  };

  switch (operation.kind) {
    case OPERATION_KIND.ISSUE_CREATE: {
      const fields = effect.fields || {};
      const input = {
        projectKey: "MT",
        summary: fields.summary,
        description: descriptionAdf(fields),
        fields: toJiraFields(fields, { forCreate: true }),
        ...(effect.parentRef ? { parentKey: resolveIssueRef(effect.parentRef, createdKeys) } : {}),
      };
      let created;
      try {
        if (effect.issueType === "Subtask") created = await jiraClient.createSubtask(input);
        else if (effect.issueType === "Epic") created = await jiraClient.createEpic(input);
        else created = await jiraClient.createTask(input);
      } catch (error) {
        throw mutationFailure(error);
      }
      const issueKey = String(created?.key || "");
      if (!EXISTING_ISSUE_PATTERN.test(issueKey)) {
        throw mutationFailure(new Error(`Jira create response did not include an MT issue key.`));
      }
      createdKeys.set(effect.issueRef, issueKey);
      const partialResult = { createdIssueKey: issueKey, issueKey };
      try {
        const readback = await readFullIssue(jiraClient, issueKey);
        assertOperationAssertions(operation, readback);
      } catch (error) {
        throw mutationFailure(error, partialResult);
      }
      return {
        status: "succeeded",
        result: { ...commonResult, ...partialResult },
      };
    }
    case OPERATION_KIND.ISSUE_UPDATE: {
      const issueKey = precondition.issueKey;
      try {
        await jiraClient.updateIssueFields(issueKey, toJiraFields(effect.fields));
        const readback = await readFullIssue(jiraClient, issueKey);
        assertOperationAssertions(operation, readback);
      } catch (error) {
        throw mutationFailure(error, { issueKey });
      }
      return { status: "succeeded", result: { ...commonResult, issueKey } };
    }
    case OPERATION_KIND.COMMENT_CREATE: {
      const issueKey = precondition.issueKey;
      const body = plainTextAdf(effect.body, operation.idempotencyKey);
      if (precondition.existing) {
        assertExactEffect(precondition.existing.body, body, {
          label: `${issueKey}.comment.${precondition.existing.id || "marker"}.body`,
        });
        assertOperationAssertions(operation, precondition.readback, {
          comment: precondition.existing,
        });
        return {
          status: "skipped",
          result: {
            ...commonResult,
            issueKey,
            commentId: precondition.existing.id || null,
            skipReason: "The exact idempotency-marked comment already exists.",
          },
        };
      }
      let created;
      try {
        created = await jiraClient.addComment(issueKey, body);
        const readback = await readFullIssue(jiraClient, issueKey);
        const comment = commentEntries(readback).find(
          (entry) =>
            (created?.id != null && String(entry?.id) === String(created.id)) ||
            hasOperationMarker(entry?.body, operation.idempotencyKey)
        );
        if (!comment) throw new Error("Created comment was not present in full Jira readback.");
        assertExactEffect(comment.body, body, { label: `${issueKey}.comment.${comment.id}.body` });
        assertOperationAssertions(operation, readback, { comment });
        return {
          status: "succeeded",
          result: { ...commonResult, issueKey, commentId: String(comment.id) },
        };
      } catch (error) {
        throw mutationFailure(error, {
          issueKey,
          ...(created?.id == null ? {} : { commentId: String(created.id) }),
        });
      }
    }
    case OPERATION_KIND.WORKLOG_CREATE: {
      const issueKey = precondition.issueKey;
      const comment = plainTextAdf(effect.comment, operation.idempotencyKey);
      if (precondition.existing) {
        assertEquivalentStarted(
          precondition.existing.started,
          effect.started,
          `${issueKey}.worklog.${precondition.existing.id}.started`
        );
        assertExactEffect(precondition.existing.timeSpentSeconds, effect.timeSpentSeconds, {
          label: `${issueKey}.worklog.${precondition.existing.id}.timeSpentSeconds`,
        });
        assertExactEffect(precondition.existing.comment, comment, {
          label: `${issueKey}.worklog.${precondition.existing.id}.comment`,
        });
        assertOperationAssertions(operation, precondition.readback, {
          worklog: { ...precondition.existing, started: effect.started },
        });
        return {
          status: "skipped",
          result: {
            ...commonResult,
            issueKey,
            worklogId: String(precondition.existing.id),
            skipReason: "The exact idempotency-marked worklog already exists.",
          },
        };
      }
      let created;
      try {
        created = await jiraClient.createWorklog(issueKey, {
          started: effect.started,
          timeSpentSeconds: effect.timeSpentSeconds,
          comment,
          expectedAuthorAccountId: operationExpectedAuthor(operation, expectedAuthorAccountId),
          adjustEstimate: effect.adjustEstimate || "leave",
        });
        const readback = await readFullIssue(jiraClient, issueKey);
        const worklog = worklogEntries(readback).find(
          (entry) =>
            (created?.id != null && String(entry?.id) === String(created.id)) ||
            hasOperationMarker(entry?.comment, operation.idempotencyKey)
        );
        if (!worklog) throw new Error("Created worklog was not present in full Jira readback.");
        assertEquivalentStarted(
          worklog.started,
          effect.started,
          `${issueKey}.worklog.${worklog.id}.started`
        );
        assertExactEffect(worklog.timeSpentSeconds, effect.timeSpentSeconds, {
          label: `${issueKey}.worklog.${worklog.id}.timeSpentSeconds`,
        });
        assertExactEffect(worklog.comment, comment, {
          label: `${issueKey}.worklog.${worklog.id}.comment`,
        });
        assertOperationAssertions(operation, readback, {
          worklog: { ...worklog, started: effect.started },
        });
        return {
          status: "succeeded",
          result: { ...commonResult, issueKey, worklogId: String(worklog.id) },
        };
      } catch (error) {
        throw mutationFailure(error, {
          issueKey,
          ...(created?.id == null ? {} : { worklogId: String(created.id) }),
        });
      }
    }
    case OPERATION_KIND.WORKLOG_UPDATE: {
      const issueKey = precondition.issueKey;
      const worklogId = String(effect.worklogId);
      const comment = plainTextAdf(effect.comment, operation.idempotencyKey);
      try {
        await jiraClient.updateWorklog(issueKey, worklogId, {
          started: effect.started,
          timeSpentSeconds: effect.timeSpentSeconds,
          comment,
          expectedAuthorAccountId: operationExpectedAuthor(operation, expectedAuthorAccountId),
          adjustEstimate: effect.adjustEstimate || "leave",
        });
        const readback = await readFullIssue(jiraClient, issueKey);
        const worklog = worklogEntries(readback).find((entry) => String(entry?.id) === worklogId);
        if (!worklog) throw new Error(`Updated worklog ${worklogId} is absent from readback.`);
        assertEquivalentStarted(
          worklog.started,
          effect.started,
          `${issueKey}.worklog.${worklogId}.started`
        );
        assertExactEffect(worklog.timeSpentSeconds, effect.timeSpentSeconds, {
          label: `${issueKey}.worklog.${worklogId}.timeSpentSeconds`,
        });
        assertExactEffect(worklog.comment, comment, {
          label: `${issueKey}.worklog.${worklogId}.comment`,
        });
        assertOperationAssertions(operation, readback, {
          worklog: { ...worklog, started: effect.started },
        });
      } catch (error) {
        throw mutationFailure(error, { issueKey, worklogId });
      }
      return {
        status: "succeeded",
        result: { ...commonResult, issueKey, worklogId },
      };
    }
    case OPERATION_KIND.WORKLOG_DELETE: {
      const issueKey = precondition.issueKey;
      const worklogId = String(effect.worklogId);
      try {
        await jiraClient.deleteWorklog(issueKey, worklogId, {
          expectedAuthorAccountId: operationExpectedAuthor(operation, expectedAuthorAccountId),
          adjustEstimate: effect.adjustEstimate || "leave",
        });
        const readback = await readFullIssue(jiraClient, issueKey);
        if (worklogEntries(readback).some((entry) => String(entry?.id) === worklogId)) {
          throw new Error(`Deleted worklog ${worklogId} remains present in full readback.`);
        }
        assertOperationAssertions(operation, readback);
      } catch (error) {
        throw mutationFailure(error, { issueKey, worklogId });
      }
      return {
        status: "succeeded",
        result: { ...commonResult, issueKey, worklogId },
      };
    }
    case OPERATION_KIND.ISSUE_LINK_CREATE: {
      const { fromKey, toKey } = precondition;
      try {
        await jiraClient.createIssueLink({
          type: effect.type,
          inwardIssueKey: fromKey,
          outwardIssueKey: toKey,
        });
        const readback = await readFullIssue(jiraClient, fromKey);
        const link = findExactLink(readback, fromKey, {
          type: effect.type,
          fromRef: fromKey,
          toRef: toKey,
        });
        if (!link) throw new Error("Created issue link was not present in full Jira readback.");
        assertOperationAssertions(operation, readback, { link });
        return {
          status: "succeeded",
          result: {
            ...commonResult,
            issueKey: fromKey,
            linkId: link.id,
            inwardIssueKey: fromKey,
            outwardIssueKey: toKey,
          },
        };
      } catch (error) {
        throw mutationFailure(error, {
          issueKey: fromKey,
          inwardIssueKey: fromKey,
          outwardIssueKey: toKey,
        });
      }
    }
    case OPERATION_KIND.ISSUE_LINK_DELETE: {
      const { fromKey } = precondition;
      const linkId = String(effect.linkId);
      try {
        await jiraClient.deleteIssueLink(linkId);
        const readback = await readFullIssue(jiraClient, fromKey);
        if (normalizeIssueLinks(readback, fromKey).some((link) => link.id === linkId)) {
          throw new Error(`Deleted issue link ${linkId} remains present in full readback.`);
        }
        assertOperationAssertions(operation, readback);
      } catch (error) {
        throw mutationFailure(error, { issueKey: fromKey, linkId });
      }
      return {
        status: "succeeded",
        result: { ...commonResult, issueKey: fromKey, linkId },
      };
    }
    case OPERATION_KIND.WATCHER_ADD: {
      const issueKey = precondition.issueKey;
      try {
        await jiraClient.addWatcher(issueKey, effect.accountId);
        const readback = await readFullIssue(jiraClient, issueKey);
        assertWatcherPresent(readback, effect.accountId);
        assertOperationAssertions(operation, readback);
      } catch (error) {
        throw mutationFailure(error, { issueKey, accountId: effect.accountId });
      }
      return {
        status: "succeeded",
        result: { ...commonResult, issueKey, accountId: effect.accountId },
      };
    }
    case OPERATION_KIND.ISSUE_TRANSITION: {
      const issueKey = precondition.issueKey;
      try {
        await jiraClient.applyOrderedTransitions(issueKey, [{ toStatus: effect.toStatus }], {
          verify: true,
        });
        const readback = await readFullIssue(jiraClient, issueKey);
        assertOperationAssertions(operation, readback);
      } catch (error) {
        throw mutationFailure(error, {
          issueKey,
          fromStatus: effect.fromStatus,
          toStatus: effect.toStatus,
          sequence: effect.sequence,
        });
      }
      return {
        status: "succeeded",
        result: {
          ...commonResult,
          issueKey,
          fromStatus: effect.fromStatus,
          toStatus: effect.toStatus,
          sequence: effect.sequence,
        },
      };
    }
    case OPERATION_KIND.ISSUE_VERIFY: {
      const issueKey = precondition.issueKey;
      const readback = await readFullIssue(jiraClient, issueKey);
      assertOperationAssertions(operation, readback);
      return {
        status: "succeeded",
        result: {
          ...commonResult,
          issueKey,
          fullReadbackVerified: true,
          assertionCount: operation.verification.assertions.length,
        },
      };
    }
    default:
      throw new OperationFailure(
        "unsupported_operation_kind",
        `Unsupported operation kind ${operation.kind}.`
      );
  }
}

function serializeError(error) {
  const serialized = {
    name: error?.name || "Error",
    code: error?.code || "operation_failed",
    message: error?.message || String(error),
  };
  if (error?.label) serialized.label = error.label;
  if (error?.expected !== undefined) serialized.expected = error.expected;
  if (error?.actual !== undefined) serialized.actual = error.actual;
  return canonicalize(serialized);
}

function operationEntry(operation, status, extras = {}) {
  return canonicalize({
    operationId: operation.id,
    idempotencyKey: operation.idempotencyKey,
    kind: operation.kind,
    groupId: operation.groupId,
    issueRef: issueRefFor(operation),
    status,
    ...extras,
  });
}

function bindingFor(ledger) {
  return Object.freeze({
    runId: ledger.run.id,
    previewHash: ledger.preview.hash,
    integrityHash: ledger.integrity.hash,
  });
}

function summarizeGroups(ledger, mode) {
  const groups = new Map();
  for (const operation of ledger.operations || []) {
    const group = groups.get(operation.groupId) || {
      groupId: operation.groupId,
      parentGroupId: operation.parentGroupId || null,
      operations: [],
    };
    group.operations.push(operation);
    groups.set(operation.groupId, group);
  }

  return [...groups.values()]
    .sort((left, right) => left.groupId.localeCompare(right.groupId))
    .map((group) => {
      const states = group.operations.map((operation) => operation.state.status);
      const verification = group.operations.find(
        (operation) => operation.kind === OPERATION_KIND.ISSUE_VERIFY
      );
      const verificationPassed =
        TERMINAL_SUCCESS_STATES.has(verification?.state?.status) &&
        verification?.state?.result?.verificationStatus === "passed";
      let status = "incomplete";
      if (mode === "dry-run") status = "planned";
      else if (states.includes("failed")) status = "failed";
      else if (states.includes("blocked") || states.includes("running")) status = "blocked";
      else if (states.every((state) => TERMINAL_SUCCESS_STATES.has(state)) && verificationPassed) {
        status = "complete";
      }
      return canonicalize({
        groupId: group.groupId,
        parentGroupId: group.parentGroupId,
        status,
        verificationPassed,
        verificationOperationId: verification?.id || null,
        operationStates: Object.fromEntries(
          group.operations.map((operation) => [operation.id, operation.state.status])
        ),
      });
    });
}

function dryRunResult(ledger, executionOrder, createdKeys) {
  const skipped = executionOrder.map((operation) =>
    operationEntry(operation, "skipped", {
      reason: TERMINAL_SUCCESS_STATES.has(operation.state.status)
        ? `Checkpoint state ${operation.state.status} would not be replayed.`
        : "Dry-run performs no Jira read or mutation.",
      ledgerState: operation.state.status,
    })
  );
  return canonicalize({
    schemaVersion: EXECUTOR_SCHEMA_VERSION,
    mode: "dry-run",
    authorized: false,
    runId: ledger.run.id,
    previewHash: ledger.preview.hash,
    integrityHash: ledger.integrity.hash,
    binding: bindingFor(ledger),
    ledger,
    createdKeys: createdKeysObject(createdKeys),
    planned: executionOrder.map((operation) =>
      operationEntry(operation, "planned", {
        dependencyIds: operation.dependsOn,
      })
    ),
    applied: [],
    skipped,
    failed: [],
    blocked: [],
    groups: summarizeGroups(ledger, "dry-run"),
    summary: {
      applied: 0,
      skipped: skipped.length,
      failed: 0,
      blocked: 0,
    },
  });
}

function groupParents(operations) {
  const parents = new Map();
  for (const operation of operations) {
    if (operation.parentGroupId) parents.set(operation.groupId, operation.parentGroupId);
  }
  return parents;
}

function ancestorHalt(groupId, haltedGroups, parents) {
  const seen = new Set();
  let current = groupId;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (haltedGroups.has(current)) return haltedGroups.get(current);
    current = parents.get(current);
  }
  return null;
}

async function saveOperationCheckpoint({
  saveCheckpoint,
  ledger,
  createdKeys,
  binding,
  operation,
}) {
  const checkpoint = canonicalize({
    schemaVersion: EXECUTOR_SCHEMA_VERSION,
    runId: binding.runId,
    previewHash: binding.previewHash,
    integrityHash: binding.integrityHash,
    operationId: operation.id,
    operationStatus: ledger.operations.find((entry) => entry.id === operation.id)?.state?.status,
    createdKeys: createdKeysObject(createdKeys),
    ledger,
  });
  try {
    await saveCheckpoint(checkpoint);
  } catch (error) {
    throw new JiraLedgerExecutionError(
      "checkpoint_failed",
      `Checkpoint persistence failed after ${operation.id}: ${error.message}`,
      {
        cause: error,
        operationId: operation.id,
        groupId: operation.groupId,
        ledger,
        retryable: false,
      }
    );
  }
}

/**
 * Execute one validated Jira reconstruction ledger.
 *
 * The function is intentionally transport-free: the Jira client and checkpoint
 * persistence are injected, and dry-run never invokes either one. Apply mode
 * requires an explicit boolean authorization bound to the ledger's immutable
 * preview and integrity hashes returned in `binding`.
 */
export async function executeJiraOperationLedger({
  ledger,
  jiraClient,
  mode = "dry-run",
  authorized = false,
  saveCheckpoint,
  allowIndependentGroups = false,
  expectedAuthorAccountId = null,
  now,
} = {}) {
  assertValidOperationLedger(ledger);
  const workingLedger = canonicalize(ledger);
  const executionOrder = buildExecutionOrder(workingLedger.operations);
  const createdKeys = rebuildCreatedKeys(workingLedger);
  const binding = bindingFor(workingLedger);

  if (!["dry-run", "apply"].includes(mode)) {
    throw new JiraLedgerExecutionError("invalid_mode", 'mode must be either "dry-run" or "apply".');
  }
  if (mode === "dry-run") {
    if (!jiraClient || typeof jiraClient !== "object") {
      throw new JiraLedgerExecutionError(
        "missing_jira_client",
        "An injected Jira client is required."
      );
    }
    return dryRunResult(workingLedger, executionOrder, createdKeys);
  }
  if (authorized !== true) {
    throw new JiraLedgerExecutionError(
      "authorization_required",
      "Apply mode requires authorized === true; no Jira calls were made."
    );
  }
  if (typeof saveCheckpoint !== "function") {
    throw new JiraLedgerExecutionError(
      "checkpoint_required",
      "Apply mode requires an injected saveCheckpoint callback; no Jira calls were made."
    );
  }

  validateClientContract(jiraClient, executionOrder);
  validateWorklogAuthors(executionOrder, expectedAuthorAccountId);

  const clock = createClock(now);
  const operationsByGroup = new Map();
  for (const operation of workingLedger.operations) {
    const group = operationsByGroup.get(operation.groupId) || [];
    group.push(operation);
    operationsByGroup.set(operation.groupId, group);
  }
  const parents = groupParents(workingLedger.operations);
  const preflightedGroups = new Set();
  const haltedGroups = new Map();
  let globalHalt = null;
  let currentLedger = workingLedger;
  const applied = [];
  const skipped = [];
  const failed = [];
  const blocked = [];

  for (const orderedOperation of executionOrder) {
    const operation = currentLedger.operations.find((entry) => entry.id === orderedOperation.id);
    const state = operation.state.status;

    if (state === "succeeded" || state === "skipped") {
      skipped.push(
        operationEntry(operation, "skipped", {
          reason: `Checkpoint state ${state} was not replayed.`,
          ledgerState: state,
          result: operation.state.result,
        })
      );
      continue;
    }
    if (state === "failed") {
      const entry = operationEntry(operation, "failed", {
        reason: "Checkpoint already records this operation as failed.",
        error: operation.state.error,
      });
      failed.push(entry);
      haltedGroups.set(operation.groupId, {
        operationId: operation.id,
        reason: entry.reason,
      });
      if (!allowIndependentGroups && !globalHalt) globalHalt = haltedGroups.get(operation.groupId);
      continue;
    }
    if (state === "blocked" || state === "running") {
      const entry = operationEntry(operation, "blocked", {
        reason:
          state === "running"
            ? "A running checkpoint requires explicit resumeOperationLedger reconciliation."
            : "Checkpoint already records this operation as blocked.",
        ledgerState: state,
      });
      blocked.push(entry);
      haltedGroups.set(operation.groupId, {
        operationId: operation.id,
        reason: entry.reason,
      });
      if (!allowIndependentGroups && !globalHalt) globalHalt = haltedGroups.get(operation.groupId);
      continue;
    }

    const dependencyFailure = (operation.dependsOn || [])
      .map((dependencyId) => currentLedger.operations.find((entry) => entry.id === dependencyId))
      .find((dependency) => !TERMINAL_SUCCESS_STATES.has(dependency?.state?.status));
    const groupHalt = ancestorHalt(operation.groupId, haltedGroups, parents);
    const halt = dependencyFailure
      ? {
          operationId: dependencyFailure.id,
          reason: `Dependency ${dependencyFailure.id} is ${dependencyFailure.state.status}.`,
        }
      : groupHalt || (!allowIndependentGroups ? globalHalt : null);

    if (halt) {
      const result = {
        blockedByOperationId: halt.operationId || null,
        blockedReason: halt.reason,
      };
      currentLedger = transitionOperationState(currentLedger, operation.id, "blocked", {
        at: clock(),
        result,
        retryable: true,
      });
      const entry = operationEntry(operation, "blocked", {
        reason: halt.reason,
        blockedByOperationId: halt.operationId || null,
      });
      blocked.push(entry);
      haltedGroups.set(operation.groupId, halt);
      await saveOperationCheckpoint({
        saveCheckpoint,
        ledger: currentLedger,
        createdKeys,
        binding,
        operation,
      });
      continue;
    }

    currentLedger = transitionOperationState(currentLedger, operation.id, "running", {
      at: clock(),
    });

    try {
      if (!preflightedGroups.has(operation.groupId)) {
        await preflightGroup({
          groupOperations: operationsByGroup.get(operation.groupId),
          jiraClient,
          createdKeys,
        });
        preflightedGroups.add(operation.groupId);
      }
      const precondition = await checkOperationPreconditions({
        operation,
        jiraClient,
        createdKeys,
      });
      const outcome = await executeOperation({
        operation,
        jiraClient,
        createdKeys,
        expectedAuthorAccountId,
        precondition,
      });
      currentLedger = transitionOperationState(currentLedger, operation.id, outcome.status, {
        at: clock(),
        result: outcome.result,
        retryable: true,
      });
      const entry = operationEntry(
        operation,
        outcome.status === "skipped" ? "skipped" : "applied",
        {
          result: outcome.result,
          mutation: MUTATION_KINDS.has(operation.kind),
        }
      );
      if (outcome.status === "skipped") skipped.push(entry);
      else applied.push(entry);
    } catch (rawError) {
      const error =
        rawError instanceof OperationFailure
          ? rawError
          : new OperationFailure("operation_failed", rawError.message, {
              cause: rawError,
            });
      const errorDetails = serializeError(error);
      currentLedger = transitionOperationState(currentLedger, operation.id, "failed", {
        at: clock(),
        error: errorDetails,
        result: error.partialResult,
        retryable: error.retryable,
      });
      const entry = operationEntry(operation, "failed", {
        error: errorDetails,
        retryable: error.retryable,
        result: error.partialResult,
      });
      failed.push(entry);
      const halt = {
        operationId: operation.id,
        reason: `${operation.id} failed: ${error.message}`,
      };
      haltedGroups.set(operation.groupId, halt);
      if (!allowIndependentGroups && !globalHalt) globalHalt = halt;
    }

    await saveOperationCheckpoint({
      saveCheckpoint,
      ledger: currentLedger,
      createdKeys,
      binding,
      operation,
    });
  }

  const result = canonicalize({
    schemaVersion: EXECUTOR_SCHEMA_VERSION,
    mode: "apply",
    authorized: true,
    runId: currentLedger.run.id,
    previewHash: currentLedger.preview.hash,
    integrityHash: currentLedger.integrity.hash,
    binding,
    ledger: currentLedger,
    createdKeys: createdKeysObject(createdKeys),
    planned: [],
    applied,
    skipped,
    failed,
    blocked,
    groups: summarizeGroups(currentLedger, "apply"),
    summary: {
      applied: applied.length,
      skipped: skipped.length,
      failed: failed.length,
      blocked: blocked.length,
    },
  });

  return result;
}
