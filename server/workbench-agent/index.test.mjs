import assert from "node:assert/strict";
import test from "node:test";
import {
  __test,
  classifyToolPermission,
  createConfirmation,
  createSession,
  hashArgs,
  normalizeDestination,
  normalizeRepoPath,
  normalizeSection,
  stableJson,
  validateSession,
  verifyConfirmation,
} from "./index.mjs";

function request({ sid, token, method = "POST" } = {}) {
  return {
    method,
    headers: {
      cookie: sid ? `${__test.SESSION_COOKIE}=${encodeURIComponent(sid)}` : "",
      "x-workbench-agent-token": token,
    },
  };
}

test("destination lookup accepts labels and aliases", () => {
  const library = normalizeDestination("Team Library");
  assert.equal(library.view, "library");
  assert.equal(normalizeDestination("closeout").view, "meeting-wrap-up");
  assert.equal(normalizeDestination("not a view"), null);
});

test("section lookup rejects unregistered sections", () => {
  const destination = normalizeDestination("meetings");
  assert.equal(normalizeSection(destination, "prep-coverage"), "prep-coverage");
  assert.equal(normalizeSection(destination, "made-up"), null);
});

test("repo path check stays inside frontend checkout", () => {
  assert.ok(normalizeRepoPath("src/App.tsx")?.endsWith("src\\App.tsx"));
  assert.equal(normalizeRepoPath("..\\ipcorp-architecture-brain\\AGENTS.md"), null);
  assert.equal(normalizeRepoPath("C:\\Windows\\System32\\drivers\\etc\\hosts"), null);
});

test("stable JSON hashes ignore object key order", () => {
  assert.equal(stableJson({ b: 2, a: 1 }), stableJson({ a: 1, b: 2 }));
  assert.equal(hashArgs({ b: 2, a: 1 }), hashArgs({ a: 1, b: 2 }));
});

test("session requires matching request token for POST", () => {
  const session = createSession(1000);
  assert.equal(validateSession(request({ sid: session.id, token: "wrong" }), 1100), null);
  assert.equal(
    validateSession(request({ sid: session.id, token: session.requestToken }), 1100)?.id,
    session.id
  );
});

test("confirmation is single-use and argument-bound", () => {
  const session = createSession(2000);
  const args = { issueKey: "MT-1", comment: "Reviewed." };
  const proposal = createConfirmation(session, "jira.update_issue", args, "Update MT-1", []);
  assert.equal(
    verifyConfirmation(session, proposal.id, "jira.update_issue", { issueKey: "MT-1" }).code,
    "confirmation_mismatch"
  );
  assert.equal(verifyConfirmation(session, proposal.id, "jira.update_issue", args).ok, true);
  assert.equal(
    verifyConfirmation(session, proposal.id, "jira.update_issue", args).code,
    "confirmation_replayed"
  );
});

test("confirmation expires", () => {
  const session = createSession(3000);
  const args = { commandKey: "typecheck" };
  const proposal = createConfirmation(
    session,
    "maintenance.run_command",
    args,
    "Run typecheck",
    []
  );
  assert.equal(
    verifyConfirmation(
      session,
      proposal.id,
      "maintenance.run_command",
      args,
      Date.now() + __test.CONFIRMATION_TTL_MS + 1
    ).code,
    "confirmation_expired"
  );
});

test("tool permission allows Workbench and Microsoft read tools only", () => {
  assert.equal(classifyToolPermission("mcp__workbench__search_workbench").behavior, "allow");
  assert.equal(
    classifyToolPermission("mcp__microsoft365__outlook_calendar_search").behavior,
    "allow"
  );
  assert.equal(classifyToolPermission("mcp__microsoft365__outlook_email_send").behavior, "deny");
  assert.equal(classifyToolPermission("Bash").behavior, "deny");
});
