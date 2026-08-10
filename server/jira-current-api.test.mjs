import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMdmJql,
  countJiraIssues,
  getAllIssueWorklogs,
  getIssueWatchers,
  getJiraIssueLinkTypes,
  getJiraPermissions,
  getPriorities,
  getSubtaskTypeId,
  searchJiraFields,
  searchJiraIssues,
  searchJiraProjects,
} from "./jira-gateway.mjs";

test("agent JQL stays inside MT", () => {
  assert.equal(
    assertMdmJql("project = MT AND status = Open ORDER BY updated DESC"),
    "project = MT AND status = Open ORDER BY updated DESC"
  );
  assert.equal(assertMdmJql('project = "MT" AND key = MT-42'), 'project = "MT" AND key = MT-42');
  assert.throws(() => assertMdmJql("project = OPS"), /start with project = MT/i);
  assert.throws(() => assertMdmJql("project = MT OR status = Open"), /remain inside/i);
  assert.throws(() => assertMdmJql("project = MT AND key = OPS-1"), /cannot reference/i);
});

test("subtask metadata uses the current project issue-types route", async () => {
  let requestedPath = "";
  const id = await getSubtaskTypeId(async (path) => {
    requestedPath = path;
    return { issueTypes: [{ id: "10003", name: "Subtask", subtask: true }] };
  });
  assert.equal(id, "10003");
  assert.equal(
    requestedPath,
    "/rest/api/3/issue/createmeta/MT/issuetypes?startAt=0&maxResults=100"
  );
});

test("priority reads use the paginated search route", async () => {
  let requestedPath = "";
  const priorities = await getPriorities(async (path) => {
    requestedPath = path;
    return { values: [{ id: "2", name: "High" }] };
  });
  assert.equal(requestedPath, "/rest/api/3/priority/search?startAt=0&maxResults=100");
  assert.deepEqual(priorities, [{ id: "2", name: "High" }]);
});

test("worklog reads paginate until Jira total is reached", async () => {
  const paths = [];
  const worklogs = await getAllIssueWorklogs("MT-42", async (path) => {
    paths.push(path);
    if (path.includes("startAt=0")) {
      return {
        total: 3,
        worklogs: [
          { id: "1", author: { displayName: "One" }, timeSpentSeconds: 60 },
          { id: "2", author: { displayName: "Two" }, timeSpentSeconds: 120 },
        ],
      };
    }
    return {
      total: 3,
      worklogs: [{ id: "3", author: { displayName: "Three" }, timeSpentSeconds: 180 }],
    };
  });
  assert.equal(worklogs.length, 3);
  assert.match(paths[0], /startAt=0&maxResults=1000$/);
  assert.match(paths[1], /startAt=2&maxResults=1000$/);
});

test("enhanced JQL search uses tokens and read-after-write issue ids", async () => {
  const calls = [];
  const result = await searchJiraIssues(
    {
      jql: "project = MT ORDER BY updated DESC",
      limit: 2,
      reconcileIssues: [10001],
    },
    async (path, init) => {
      calls.push({ path, body: JSON.parse(init.body) });
      if (calls.length === 1) {
        return {
          nextPageToken: "page-2",
          issues: [{ id: "10001", key: "MT-1", fields: { summary: "First" } }],
        };
      }
      return { issues: [{ id: "10002", key: "MT-2", fields: { summary: "Second" } }] };
    }
  );
  assert.equal(result.issues.length, 2);
  assert.equal(calls[0].path, "/rest/api/3/search/jql");
  assert.deepEqual(calls[0].body.reconcileIssues, [10001]);
  assert.equal(calls[1].body.nextPageToken, "page-2");
});

test("issue counts use the current approximate-count route", async () => {
  const result = await countJiraIssues({ jql: "project = MT" }, async (path, options) => {
    assert.equal(path, "/rest/api/3/search/approximate-count");
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), { jql: "project = MT" });
    return { count: 464 };
  });
  assert.equal(result.count, 464);
  assert.equal(result.approximate, true);
});

test("project and field discovery use current paginated routes", async () => {
  const paths = [];
  const projects = await searchJiraProjects({ query: "data" }, async (path) => {
    paths.push(path);
    return { total: 1, values: [{ id: "1", key: "MT", name: "Migration" }] };
  });
  const fields = await searchJiraFields({ query: "start", type: "custom" }, async (path) => {
    paths.push(path);
    return {
      total: 1,
      values: [{ id: "customfield_11915", key: "customfield_11915", name: "Start date" }],
    };
  });
  assert.equal(projects.projects[0].key, "MT");
  assert.equal(fields.fields[0].custom, true);
  assert.match(paths[0], /^\/rest\/api\/3\/project\/search\?/);
  assert.match(paths[1], /^\/rest\/api\/3\/field\/search\?/);
});

test("link types, permissions, and watchers expose read-only agent data", async () => {
  const linkTypes = await getJiraIssueLinkTypes(async () => ({
    issueLinkTypes: [{ id: "1", name: "Blocks", inward: "is blocked by", outward: "blocks" }],
  }));
  const permissions = await getJiraPermissions("MT-42", async (path) => {
    assert.match(path, /^\/rest\/api\/3\/mypermissions\?/);
    assert.match(path, /MANAGE_WATCHERS/);
    assert.doesNotMatch(path, /MANAGE_WATCHER_LIST/);
    return { permissions: { BROWSE_PROJECTS: { havePermission: true } } };
  });
  const watchers = await getIssueWatchers("MT-42", async (path) => {
    assert.equal(path, "/rest/api/3/issue/MT-42/watchers");
    return {
      isWatching: true,
      watchCount: 1,
      watchers: [{ accountId: "abc", active: true, displayName: "Steve" }],
    };
  });
  assert.equal(linkTypes[0].outward, "blocks");
  assert.equal(permissions.BROWSE_PROJECTS, true);
  assert.equal(permissions.EDIT_ISSUES, false);
  assert.equal(watchers.watchCount, 1);
});
