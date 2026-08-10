import assert from "node:assert/strict";
import test from "node:test";
import { createWorkbenchAdapter } from "./adapters.mjs";

test("Jira agent reads route through the current local API", async () => {
  const urls = [];
  const adapter = createWorkbenchAdapter({
    baseUrl: "http://127.0.0.1:8817",
    fetchImpl: async (url) => {
      urls.push(String(url));
      return { ok: true, json: async () => ({ ok: true, data: [] }) };
    },
  });

  await adapter.readJira("search", {
    jql: "project = MT ORDER BY updated DESC",
    fields: ["summary", "status"],
    limit: 25,
    reconcileIssues: [10001],
  });
  await adapter.readJira("count", { jql: "project = MT" });
  await adapter.readJira("issue-evidence", { issueKey: "MT-42" });

  const searchUrl = new URL(urls[0]);
  assert.equal(searchUrl.pathname, "/api/jira/agent/search");
  assert.equal(searchUrl.searchParams.get("jql"), "project = MT ORDER BY updated DESC");
  assert.equal(searchUrl.searchParams.get("fields"), "summary,status");
  assert.equal(searchUrl.searchParams.get("reconcileIssues"), "10001");
  const countUrl = new URL(urls[1]);
  assert.equal(countUrl.pathname, "/api/jira/agent/count");
  assert.equal(countUrl.searchParams.get("jql"), "project = MT");
  assert.equal(new URL(urls[2]).pathname, "/api/jira/agent/issues/MT-42/evidence");
});

test("Jira evidence rejects an issue outside MT before fetching", async () => {
  let called = false;
  const adapter = createWorkbenchAdapter({
    fetchImpl: async () => {
      called = true;
      return { ok: true, json: async () => ({ ok: true }) };
    },
  });

  await assert.rejects(
    () => adapter.readJira("issue-evidence", { issueKey: "OPS-1" }),
    /valid MT/i
  );
  assert.equal(called, false);
});
