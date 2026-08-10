import assert from "node:assert/strict";
import test from "node:test";
import { createOwnerSessionStore, REQUEST_TOKEN_HEADER, SESSION_COOKIE } from "./sessions.mjs";

function requestFor(session, requestToken = session.requestToken) {
  return {
    headers: {
      cookie: `${SESSION_COOKIE}=${encodeURIComponent(session.id)}`,
      [REQUEST_TOKEN_HEADER]: requestToken,
    },
  };
}

test("owner session uses cookie plus request token", () => {
  const store = createOwnerSessionStore({ now: () => 1000 });
  const { session, cookie } = store.createSession("http://127.0.0.1:5217");
  assert.match(cookie, /HttpOnly/);
  assert.equal(store.requireSession(requestFor(session)).id, session.id);
  assert.throws(() => store.requireSession(requestFor(session, "bad")), /Request token/);
});

test("review records expire, reject replay, and match original input", () => {
  let now = 1000;
  const store = createOwnerSessionStore({ now: () => now, reviewTtlMs: 1000 });
  const { session } = store.createSession();
  const review = store.createReview(session, {
    toolName: "jira.issue.update",
    args: { issueKey: "MT-1", body: { summary: "Next" } },
    target: { issueKey: "MT-1" },
    title: "Update MT-1",
    preview: "Change summary",
  });

  assert.throws(
    () =>
      store.consumeReview(
        session,
        review.id,
        "jira.issue.update",
        { issueKey: "MT-1", body: { summary: "Other" } },
        { issueKey: "MT-1" }
      ),
    /no longer matches/
  );

  const consumed = store.consumeReview(
    session,
    review.id,
    "jira.issue.update",
    { issueKey: "MT-1", body: { summary: "Next" } },
    { issueKey: "MT-1" }
  );
  assert.equal(consumed.usedAt, now);
  assert.throws(
    () =>
      store.consumeReview(
        session,
        review.id,
        "jira.issue.update",
        { issueKey: "MT-1", body: { summary: "Next" } },
        { issueKey: "MT-1" }
      ),
    /already used/
  );

  const second = store.createReview(session, {
    toolName: "notebooklm.generate",
    args: { notebookId: "fd6f032c-75b8-4b3c-b037-4e5188f1dc14" },
    target: { notebookId: "fd6f032c-75b8-4b3c-b037-4e5188f1dc14" },
  });
  now = 2501;
  assert.throws(
    () =>
      store.consumeReview(
        session,
        second.id,
        "notebooklm.generate",
        { notebookId: "fd6f032c-75b8-4b3c-b037-4e5188f1dc14" },
        { notebookId: "fd6f032c-75b8-4b3c-b037-4e5188f1dc14" }
      ),
    /expired/
  );
});
