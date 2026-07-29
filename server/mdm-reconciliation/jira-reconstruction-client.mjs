import { isDeepStrictEqual } from "node:util";

const JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json",
});

const ISSUE_TYPES = Object.freeze({
  TASK: "Task",
  SUBTASK: "Sub-task",
});

const ALLOWED_LINK_TYPES = new Set(["Blocks", "Relates", "Duplicate"]);
const AUTHOR_OVERRIDE_FIELDS = Object.freeze([
  "author",
  "authorAccountId",
  "updateAuthor",
  "updateAuthorAccountId",
]);
const STARTED_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:?\d{2})$/;

export class JiraReconstructionError extends Error {
  constructor(operation, path, cause) {
    const detail = cause instanceof Error ? cause.message : String(cause || "Unknown Jira error.");
    super(`${operation} failed for ${path}: ${detail}`, { cause });
    this.name = "JiraReconstructionError";
    this.operation = operation;
    this.path = path;
  }
}

export class JiraVerificationError extends Error {
  constructor(label, expected, actual) {
    super(`Jira verification failed for ${label}.`);
    this.name = "JiraVerificationError";
    this.label = label;
    this.expected = expected;
    this.actual = actual;
  }
}

function requireText(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new TypeError(`${label} is required.`);
  return normalized;
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function requireAdfDocument(value, label) {
  requirePlainObject(value, label);
  if (value.type !== "doc" || value.version !== 1 || !Array.isArray(value.content)) {
    throw new TypeError(`${label} must be a native Atlassian Document Format document.`);
  }
  return value;
}

function requireIssueKey(value, label = "issueKey") {
  return requireText(value, label);
}

function encodeSegment(value, label) {
  return encodeURIComponent(requireText(value, label));
}

function queryString(entries) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function jsonOptions(method, body) {
  return {
    method,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

function assertNoAuthorOverride(input) {
  for (const field of AUTHOR_OVERRIDE_FIELDS) {
    if (Object.hasOwn(input, field)) {
      throw new TypeError(
        `${field} cannot be supplied. Jira worklogs must remain attributed to the authenticated author.`
      );
    }
  }
}

function requireStarted(value) {
  const started = requireText(value, "started");
  if (!STARTED_PATTERN.test(started)) {
    throw new TypeError(
      "started must be an ISO timestamp with an explicit timezone offset for historical work."
    );
  }
  return started;
}

function buildWorklogBody(input) {
  requirePlainObject(input, "worklog");
  assertNoAuthorOverride(input);

  const hasSeconds = Object.hasOwn(input, "timeSpentSeconds");
  const hasText = Object.hasOwn(input, "timeSpent");
  if (hasSeconds === hasText) {
    throw new TypeError("Provide exactly one of timeSpentSeconds or timeSpent.");
  }

  const body = {
    started: requireStarted(input.started),
    comment: requireAdfDocument(input.comment, "worklog.comment"),
  };

  if (hasSeconds) {
    if (!Number.isInteger(input.timeSpentSeconds) || input.timeSpentSeconds <= 0) {
      throw new TypeError("timeSpentSeconds must be a positive integer.");
    }
    body.timeSpentSeconds = input.timeSpentSeconds;
  } else {
    body.timeSpent = requireText(input.timeSpent, "timeSpent");
  }

  return body;
}

function requireExpectedAuthor(value) {
  return requireText(value, "expectedAuthorAccountId");
}

function worklogAuthorAccountId(worklog) {
  return worklog?.author?.accountId || null;
}

function normalizeTransitionStep(step) {
  if (typeof step === "string") return { toStatus: requireText(step, "transition status") };
  requirePlainObject(step, "transition step");
  const normalized = {
    transitionId: step.transitionId == null ? null : String(step.transitionId),
    transitionName: step.transitionName == null ? null : String(step.transitionName),
    toStatus: step.toStatus == null ? null : String(step.toStatus),
  };
  if (!normalized.transitionId && !normalized.transitionName && !normalized.toStatus) {
    throw new TypeError("Each transition step requires transitionId, transitionName, or toStatus.");
  }
  return normalized;
}

function transitionMatches(transition, step) {
  if (step.transitionId && String(transition?.id) !== step.transitionId) return false;
  if (
    step.transitionName &&
    String(transition?.name || "").toLocaleLowerCase() !== step.transitionName.toLocaleLowerCase()
  ) {
    return false;
  }
  if (
    step.toStatus &&
    String(transition?.to?.name || "").toLocaleLowerCase() !== step.toStatus.toLocaleLowerCase()
  ) {
    return false;
  }
  return true;
}

function valueAtPath(root, path) {
  const segments = Array.isArray(path)
    ? path
    : requireText(path, "assertion path")
        .replace(/\[(\d+)\]/g, ".$1")
        .split(".")
        .filter(Boolean);

  let current = root;
  for (const segment of segments) {
    if (current == null || !Object.hasOwn(Object(current), segment)) return undefined;
    current = current[segment];
  }
  return current;
}

function containsExact(actual, expected) {
  if (typeof actual === "string" && typeof expected === "string") {
    return actual.includes(expected);
  }
  if (Array.isArray(actual)) {
    return actual.some((entry) => isDeepStrictEqual(entry, expected));
  }
  return false;
}

/**
 * Assert one exact value, optionally at a dotted path. This intentionally does
 * not coerce Jira values or flatten ADF.
 */
export function assertExactEffect(actual, expected, options = {}) {
  const label = options.label || options.path || "effect";
  const observed = options.path ? valueAtPath(actual, options.path) : actual;
  if (!isDeepStrictEqual(observed, expected)) {
    throw new JiraVerificationError(label, expected, observed);
  }
  return observed;
}

/**
 * Apply the ledger assertion vocabulary to a full Jira readback. Every
 * mismatch throws immediately, so a caller cannot mark a partial mutation as
 * verified.
 */
export function assertReadbackAssertions(readback, assertions) {
  if (!Array.isArray(assertions) || assertions.length === 0) {
    throw new TypeError("At least one readback assertion is required.");
  }

  for (const assertion of assertions) {
    requirePlainObject(assertion, "assertion");
    const path = requireText(assertion.path, "assertion.path");
    const actual = valueAtPath(readback, path);
    const operator = requireText(assertion.operator, "assertion.operator");

    if (operator === "absent") {
      if (actual !== undefined) {
        throw new JiraVerificationError(path, undefined, actual);
      }
      continue;
    }

    if (!Object.hasOwn(assertion, "expected")) {
      throw new TypeError(`Assertion ${path} requires expected.`);
    }

    if (operator === "equals" || operator === "deepEquals") {
      assertExactEffect(actual, assertion.expected, { label: path });
      continue;
    }

    if (operator === "contains") {
      if (!containsExact(actual, assertion.expected)) {
        throw new JiraVerificationError(path, assertion.expected, actual);
      }
      continue;
    }

    throw new TypeError(`Unsupported assertion operator ${operator}.`);
  }

  return true;
}

export function assertIssueFieldsExactly(readback, expectedFields) {
  requirePlainObject(readback, "readback");
  requirePlainObject(expectedFields, "expectedFields");
  for (const [field, expected] of Object.entries(expectedFields)) {
    assertExactEffect(readback?.fields?.[field], expected, { label: `fields.${field}` });
  }
  return true;
}

export function assertCommentExactly(readback, expectedComment) {
  requirePlainObject(expectedComment, "expectedComment");
  const comments = Array.isArray(readback) ? readback : readback?.comments;
  if (!Array.isArray(comments)) throw new TypeError("readback comments are required.");

  const comment = expectedComment.id
    ? comments.find((entry) => String(entry?.id) === String(expectedComment.id))
    : comments.find((entry) => isDeepStrictEqual(entry?.body, expectedComment.body));
  if (!comment) {
    throw new JiraVerificationError(
      `comment.${expectedComment.id || "body"}`,
      expectedComment,
      undefined
    );
  }

  for (const [field, expected] of Object.entries(expectedComment)) {
    assertExactEffect(comment?.[field], expected, { label: `comment.${field}` });
  }
  return comment;
}

export function assertWorklogExactly(readback, expectedWorklog) {
  requirePlainObject(expectedWorklog, "expectedWorklog");
  const id = requireText(expectedWorklog.id, "expectedWorklog.id");
  const worklogs = Array.isArray(readback) ? readback : readback?.worklogs;
  if (!Array.isArray(worklogs)) throw new TypeError("readback worklogs are required.");
  const worklog = worklogs.find((entry) => String(entry?.id) === id);
  if (!worklog) throw new JiraVerificationError(`worklog.${id}`, expectedWorklog, undefined);

  for (const [field, expected] of Object.entries(expectedWorklog)) {
    assertExactEffect(worklog?.[field], expected, { label: `worklog.${id}.${field}` });
  }
  return worklog;
}

export function assertIssueLinkExactly(readback, expectedLink) {
  requirePlainObject(expectedLink, "expectedLink");
  const links = Array.isArray(readback) ? readback : readback?.links;
  if (!Array.isArray(links)) throw new TypeError("readback links are required.");
  const id = expectedLink.id == null ? null : String(expectedLink.id);
  const link = id
    ? links.find((entry) => String(entry?.id) === id)
    : links.find((entry) =>
        Object.entries(expectedLink).every(([field, expected]) =>
          isDeepStrictEqual(entry?.[field], expected)
        )
      );
  if (!link) {
    throw new JiraVerificationError(`issueLink.${id || "effect"}`, expectedLink, undefined);
  }
  for (const [field, expected] of Object.entries(expectedLink)) {
    assertExactEffect(link?.[field], expected, {
      label: `issueLink.${id || "effect"}.${field}`,
    });
  }
  return link;
}

export function assertWatcherPresent(readback, accountId) {
  const expectedAccountId = requireText(accountId, "accountId");
  const watcherState = readback?.watchers?.watchers ? readback.watchers : readback;
  const watchers = watcherState?.watchers;
  if (!Array.isArray(watchers)) throw new TypeError("watcher readback is required.");
  const watcher = watchers.find((entry) => entry?.accountId === expectedAccountId);
  if (!watcher) {
    throw new JiraVerificationError(`watcher.${expectedAccountId}`, expectedAccountId, undefined);
  }
  return watcher;
}

export function assertStatusExactly(readback, expectedStatus) {
  return assertExactEffect(readback?.fields?.status?.name, expectedStatus, {
    label: "fields.status.name",
  });
}

export class JiraReconstructionClient {
  #request;

  constructor(request) {
    if (typeof request !== "function") {
      throw new TypeError(
        "JiraReconstructionClient requires an async request(path, options) function."
      );
    }
    this.#request = request;
  }

  async #call(operation, path, options = {}) {
    let result;
    try {
      result = await this.#request(path, options);
    } catch (error) {
      if (error instanceof JiraReconstructionError) throw error;
      throw new JiraReconstructionError(operation, path, error);
    }

    if (result && typeof result === "object" && result.ok === false) {
      const reason =
        result.error?.message || result.error || result.message || "Jira returned an error result.";
      throw new JiraReconstructionError(operation, path, new Error(String(reason)));
    }
    return result ?? {};
  }

  async #createIssue(issueType, input) {
    requirePlainObject(input, "issue");
    const projectKey = requireText(input.projectKey, "projectKey");
    const summary = requireText(input.summary, "summary");
    const description = requireAdfDocument(input.description, "description");
    const fields = input.fields == null ? {} : requirePlainObject(input.fields, "fields");
    const reserved = ["project", "summary", "issuetype", "description", "parent"];
    const collision = reserved.find((field) => Object.hasOwn(fields, field));
    if (collision) {
      throw new TypeError(`fields.${collision} is reserved; use the explicit create parameter.`);
    }

    const parentKey =
      input.parentKey == null ? null : requireIssueKey(input.parentKey, "parentKey");
    if (issueType === ISSUE_TYPES.SUBTASK && !parentKey) {
      throw new TypeError("parentKey is required for a Sub-task.");
    }

    const issueFields = {
      ...fields,
      project: { key: projectKey },
      summary,
      issuetype: { name: issueType },
      description,
      ...(parentKey ? { parent: { key: parentKey } } : {}),
    };

    return this.#call(
      `create ${issueType}`,
      "/rest/api/3/issue",
      jsonOptions("POST", { fields: issueFields })
    );
  }

  createTask(input) {
    return this.#createIssue(ISSUE_TYPES.TASK, input);
  }

  createSubtask(input) {
    return this.#createIssue(ISSUE_TYPES.SUBTASK, input);
  }

  updateIssueFields(issueKey, fields) {
    const key = encodeSegment(requireIssueKey(issueKey), "issueKey");
    requirePlainObject(fields, "fields");
    if (!Object.keys(fields).length) throw new TypeError("At least one issue field is required.");
    return this.#call(
      "update issue fields",
      `/rest/api/3/issue/${key}`,
      jsonOptions("PUT", { fields })
    );
  }

  addComment(issueKey, body) {
    const key = encodeSegment(requireIssueKey(issueKey), "issueKey");
    const adf = requireAdfDocument(body, "comment");
    return this.#call(
      "add comment",
      `/rest/api/3/issue/${key}/comment`,
      jsonOptions("POST", { body: adf })
    );
  }

  getWorklog(issueKey, worklogId) {
    const key = encodeSegment(requireIssueKey(issueKey), "issueKey");
    const id = encodeSegment(worklogId, "worklogId");
    return this.#call("get worklog", `/rest/api/3/issue/${key}/worklog/${id}`);
  }

  getCurrentUser() {
    return this.#call("get current Jira user", "/rest/api/3/myself");
  }

  async #assertAuthenticatedAuthor(expectedAuthorAccountId) {
    const currentUser = await this.getCurrentUser();
    assertExactEffect(currentUser?.accountId || null, expectedAuthorAccountId, {
      label: "currentUser.accountId",
    });
    return currentUser;
  }

  async createWorklog(issueKey, input) {
    const key = encodeSegment(requireIssueKey(issueKey), "issueKey");
    const body = buildWorklogBody(input);
    const expectedAuthor = requireExpectedAuthor(input.expectedAuthorAccountId);
    await this.#assertAuthenticatedAuthor(expectedAuthor);
    const adjustEstimate = input.adjustEstimate || "leave";
    const path = `/rest/api/3/issue/${key}/worklog${queryString({ adjustEstimate })}`;
    const created = await this.#call("create worklog", path, jsonOptions("POST", body));
    if (!created?.id) {
      throw new JiraVerificationError("created worklog id", "a Jira worklog id", created?.id);
    }
    const readback = created?.author?.accountId
      ? created
      : await this.getWorklog(issueKey, created.id);
    assertExactEffect(worklogAuthorAccountId(readback), expectedAuthor, {
      label: `worklog.${created.id}.author.accountId`,
    });
    return created;
  }

  async updateWorklog(issueKey, worklogId, input) {
    requirePlainObject(input, "worklog");
    const body = buildWorklogBody(input);
    const expectedAuthor = requireExpectedAuthor(input.expectedAuthorAccountId);
    await this.#assertAuthenticatedAuthor(expectedAuthor);
    const existing = await this.getWorklog(issueKey, worklogId);
    assertExactEffect(worklogAuthorAccountId(existing), expectedAuthor, {
      label: `worklog.${worklogId}.author.accountId`,
    });

    const key = encodeSegment(requireIssueKey(issueKey), "issueKey");
    const id = encodeSegment(worklogId, "worklogId");
    const adjustEstimate = input.adjustEstimate || "leave";
    const path = `/rest/api/3/issue/${key}/worklog/${id}${queryString({ adjustEstimate })}`;
    return this.#call("update worklog", path, jsonOptions("PUT", body));
  }

  async deleteWorklog(issueKey, worklogId, options = {}) {
    requirePlainObject(options, "worklog delete options");
    const expectedAuthor = requireExpectedAuthor(options.expectedAuthorAccountId);
    await this.#assertAuthenticatedAuthor(expectedAuthor);
    const existing = await this.getWorklog(issueKey, worklogId);
    assertExactEffect(worklogAuthorAccountId(existing), expectedAuthor, {
      label: `worklog.${worklogId}.author.accountId`,
    });

    const key = encodeSegment(requireIssueKey(issueKey), "issueKey");
    const id = encodeSegment(worklogId, "worklogId");
    const path = `/rest/api/3/issue/${key}/worklog/${id}${queryString({
      adjustEstimate: options.adjustEstimate || "leave",
    })}`;
    const response = await this.#call("delete worklog", path, { method: "DELETE" });
    return { deleted: true, worklogId: String(worklogId), previous: existing, response };
  }

  createIssueLink({ type, inwardIssueKey, outwardIssueKey }) {
    const linkType = requireText(type, "link type");
    if (!ALLOWED_LINK_TYPES.has(linkType)) {
      throw new TypeError("link type must be Blocks, Relates, or Duplicate.");
    }
    const inward = requireIssueKey(inwardIssueKey, "inwardIssueKey");
    const outward = requireIssueKey(outwardIssueKey, "outwardIssueKey");
    if (inward === outward) throw new TypeError("An issue cannot be linked to itself.");
    return this.#call(
      `create ${linkType} link`,
      "/rest/api/3/issueLink",
      jsonOptions("POST", {
        type: { name: linkType },
        inwardIssue: { key: inward },
        outwardIssue: { key: outward },
      })
    );
  }

  deleteIssueLink(linkId) {
    const id = encodeSegment(linkId, "linkId");
    return this.#call("delete issue link", `/rest/api/3/issueLink/${id}`, {
      method: "DELETE",
    });
  }

  getWatchers(issueKey) {
    const key = encodeSegment(requireIssueKey(issueKey), "issueKey");
    return this.#call("get watchers", `/rest/api/3/issue/${key}/watchers`);
  }

  addWatcher(issueKey, accountId) {
    const key = encodeSegment(requireIssueKey(issueKey), "issueKey");
    const watcherAccountId = requireText(accountId, "accountId");
    return this.#call(
      "add watcher",
      `/rest/api/3/issue/${key}/watchers`,
      jsonOptions("POST", watcherAccountId)
    );
  }

  async discoverTransitions(issueKey) {
    const key = encodeSegment(requireIssueKey(issueKey), "issueKey");
    const data = await this.#call("discover transitions", `/rest/api/3/issue/${key}/transitions`);
    if (!Array.isArray(data.transitions)) {
      throw new JiraReconstructionError(
        "discover transitions",
        `/rest/api/3/issue/${key}/transitions`,
        new Error("Jira did not return a transitions array.")
      );
    }
    return data.transitions;
  }

  applyTransition(issueKey, transitionId, options = {}) {
    const key = encodeSegment(requireIssueKey(issueKey), "issueKey");
    const id = requireText(transitionId, "transitionId");
    requirePlainObject(options, "transition options");
    const body = {
      transition: { id },
      ...(options.fields
        ? { fields: requirePlainObject(options.fields, "transition fields") }
        : {}),
      ...(options.update
        ? { update: requirePlainObject(options.update, "transition update") }
        : {}),
    };
    return this.#call(
      "apply transition",
      `/rest/api/3/issue/${key}/transitions`,
      jsonOptions("POST", body)
    );
  }

  async applyOrderedTransitions(issueKey, orderedSteps, options = {}) {
    if (!Array.isArray(orderedSteps) || orderedSteps.length === 0) {
      throw new TypeError("At least one ordered transition step is required.");
    }
    const verify = options.verify !== false;
    const applied = [];

    for (const rawStep of orderedSteps) {
      const step = normalizeTransitionStep(rawStep);
      const available = await this.discoverTransitions(issueKey);
      const transition = available.find((candidate) => transitionMatches(candidate, step));
      if (!transition) {
        const target = step.toStatus || step.transitionName || step.transitionId;
        throw new JiraVerificationError(`available transition to ${target}`, target, available);
      }

      const response = await this.applyTransition(issueKey, transition.id);
      const expectedStatus = step.toStatus || transition?.to?.name || null;
      let readback = null;
      if (verify && expectedStatus) {
        readback = await this.getIssue(issueKey, { fields: ["status"] });
        assertStatusExactly(readback, expectedStatus);
      }
      applied.push({ step, transition, response, readback });
    }

    return applied;
  }

  getIssue(issueKey, options = {}) {
    const key = encodeSegment(requireIssueKey(issueKey), "issueKey");
    requirePlainObject(options, "issue read options");
    const fields = Array.isArray(options.fields)
      ? options.fields.join(",")
      : options.fields || "*all";
    const expand = Array.isArray(options.expand) ? options.expand.join(",") : options.expand;
    return this.#call("get issue", `/rest/api/3/issue/${key}${queryString({ fields, expand })}`);
  }

  async #collectPages(basePath, collectionKey, pageSize) {
    const collected = [];
    let startAt = 0;
    let complete = false;

    for (let pageNumber = 0; pageNumber < 10_000; pageNumber += 1) {
      const separator = basePath.includes("?") ? "&" : "?";
      const path = `${basePath}${separator}${new URLSearchParams({
        startAt: String(startAt),
        maxResults: String(pageSize),
      })}`;
      const page = await this.#call(`read all ${collectionKey}`, path);
      const values = page?.[collectionKey];
      if (!Array.isArray(values)) {
        throw new JiraReconstructionError(
          `read all ${collectionKey}`,
          path,
          new Error(`Jira did not return a ${collectionKey} array.`)
        );
      }
      collected.push(...values);

      const total = Number(page.total);
      if (page.isLast === true || (Number.isFinite(total) && collected.length >= total)) {
        complete = true;
        break;
      }
      if (values.length === 0) {
        if (Number.isFinite(total) && collected.length < total) {
          throw new JiraReconstructionError(
            `read all ${collectionKey}`,
            path,
            new Error(`Jira returned an empty page before all ${total} ${collectionKey} were read.`)
          );
        }
        complete = true;
        break;
      }
      const reportedPageSize = Number(page.maxResults);
      if (
        !Number.isFinite(total) &&
        values.length < (Number.isFinite(reportedPageSize) ? reportedPageSize : pageSize)
      ) {
        complete = true;
        break;
      }
      startAt += values.length;
    }

    if (!complete) {
      throw new JiraReconstructionError(
        `read all ${collectionKey}`,
        basePath,
        new Error("Jira pagination did not reach a terminal page.")
      );
    }
    return collected;
  }

  /**
   * Read all reconstruction-relevant Jira state. Comments, worklogs, and
   * changelog are fetched from their paginated endpoints instead of trusting
   * the truncated expansions on the issue resource.
   */
  async readFullIssue(issueKey) {
    const key = encodeSegment(requireIssueKey(issueKey), "issueKey");
    const issue = await this.getIssue(issueKey, { fields: "*all", expand: ["names", "schema"] });
    const comments = await this.#collectPages(`/rest/api/3/issue/${key}/comment`, "comments", 100);
    const worklogs = await this.#collectPages(`/rest/api/3/issue/${key}/worklog`, "worklogs", 1000);
    const watchers = await this.getWatchers(issueKey);
    const changelog = await this.#collectPages(`/rest/api/3/issue/${key}/changelog`, "values", 100);

    return {
      id: issue.id ?? null,
      key: issue.key || requireIssueKey(issueKey),
      fields: issue.fields || {},
      comments,
      worklogs,
      links: Array.isArray(issue.fields?.issuelinks) ? issue.fields.issuelinks : [],
      watchers,
      changelog,
      rawIssue: issue,
    };
  }
}
