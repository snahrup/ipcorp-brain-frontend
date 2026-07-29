import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCommentExactly,
  assertExactEffect,
  assertIssueFieldsExactly,
  assertIssueLinkExactly,
  assertReadbackAssertions,
  assertStatusExactly,
  assertWatcherPresent,
  assertWorklogExactly,
  JiraReconstructionClient,
  JiraReconstructionError,
  JiraVerificationError,
} from "./jira-reconstruction-client.mjs";

const richAdf = {
  version: 1,
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Objective", marks: [{ type: "strong" }] }],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "inlineCard",
                      attrs: { url: "https://example.invalid/browse/MT-12" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

function fakeRequest(steps) {
  const queue = [...steps];
  const calls = [];
  const request = async (path, options = {}) => {
    calls.push({ path, options });
    const step = queue.shift();
    assert.ok(step, `Unexpected Jira request: ${options.method || "GET"} ${path}`);
    if (step.path) assert.equal(path, step.path);
    if (step.method) assert.equal(options.method || "GET", step.method);
    if (step.assert) step.assert(path, options);
    if (step.error) throw step.error;
    return structuredClone(step.result ?? {});
  };
  request.calls = calls;
  request.remaining = () => queue.length;
  return request;
}

test("creates Tasks and Sub-tasks with parent and lossless native ADF", async () => {
  const request = fakeRequest([
    {
      path: "/rest/api/3/issue",
      method: "POST",
      assert: (_path, options) => {
        const body = JSON.parse(options.body);
        assert.deepEqual(body.fields.description, richAdf);
        assert.deepEqual(body.fields.parent, { key: "MT-12" });
        assert.deepEqual(body.fields.issuetype, { name: "Task" });
        assert.deepEqual(body.fields.labels, ["mdm", "fabric"]);
      },
      result: { id: "20001", key: "MT-201" },
    },
    {
      path: "/rest/api/3/issue",
      method: "POST",
      assert: (_path, options) => {
        const body = JSON.parse(options.body);
        assert.deepEqual(body.fields.description, richAdf);
        assert.deepEqual(body.fields.parent, { key: "MT-201" });
        assert.deepEqual(body.fields.issuetype, { name: "Sub-task" });
      },
      result: { id: "20002", key: "MT-202" },
    },
  ]);
  const client = new JiraReconstructionClient(request);

  await client.createTask({
    projectKey: "MT",
    summary: "Reconcile the MDM architecture record",
    description: richAdf,
    parentKey: "MT-12",
    fields: { labels: ["mdm", "fabric"] },
  });
  await client.createSubtask({
    projectKey: "MT",
    summary: "Verify the evidence crosswalk",
    description: richAdf,
    parentKey: "MT-201",
  });

  assert.equal(request.remaining(), 0);
});

test("updates fields and comments without converting rich ADF to text", async () => {
  const request = fakeRequest([
    {
      path: "/rest/api/3/issue/MT-22",
      method: "PUT",
      assert: (_path, options) => {
        assert.deepEqual(JSON.parse(options.body), {
          fields: {
            description: richAdf,
            timetracking: { originalEstimate: "1d", remainingEstimate: "0h" },
          },
        });
      },
    },
    {
      path: "/rest/api/3/issue/MT-22/comment",
      method: "POST",
      assert: (_path, options) => {
        assert.deepEqual(JSON.parse(options.body), { body: richAdf });
      },
      result: { id: "901" },
    },
  ]);
  const client = new JiraReconstructionClient(request);

  await client.updateIssueFields("MT-22", {
    description: richAdf,
    timetracking: { originalEstimate: "1d", remainingEstimate: "0h" },
  });
  await client.addComment("MT-22", richAdf);

  assert.equal(request.remaining(), 0);
});

test("creates a historical worklog without sending an author override", async () => {
  const request = fakeRequest([
    {
      path: "/rest/api/3/myself",
      result: { accountId: "steve-account" },
    },
    {
      path: "/rest/api/3/issue/MT-22/worklog?adjustEstimate=leave",
      method: "POST",
      assert: (_path, options) => {
        const body = JSON.parse(options.body);
        assert.deepEqual(body, {
          timeSpentSeconds: 14_400,
          started: "2026-02-16T08:00:00.000-0600",
          comment: richAdf,
        });
        assert.equal(Object.hasOwn(body, "author"), false);
        assert.equal(Object.hasOwn(body, "authorAccountId"), false);
      },
      result: {
        id: "7001",
        author: { accountId: "steve-account" },
      },
    },
  ]);
  const client = new JiraReconstructionClient(request);

  await client.createWorklog("MT-22", {
    timeSpentSeconds: 14_400,
    started: "2026-02-16T08:00:00.000-0600",
    comment: richAdf,
    expectedAuthorAccountId: "steve-account",
  });

  assert.equal(request.remaining(), 0);
});

test("preflights worklog ownership before update and delete", async () => {
  const ownedWorklog = {
    id: "7001",
    author: { accountId: "steve-account" },
    started: "2026-02-16T08:00:00.000-0600",
  };
  const request = fakeRequest([
    {
      path: "/rest/api/3/myself",
      result: { accountId: "steve-account" },
    },
    {
      path: "/rest/api/3/issue/MT-22/worklog/7001",
      result: ownedWorklog,
    },
    {
      path: "/rest/api/3/issue/MT-22/worklog/7001?adjustEstimate=leave",
      method: "PUT",
      assert: (_path, options) => {
        assert.deepEqual(JSON.parse(options.body), {
          timeSpentSeconds: 18_000,
          started: "2026-02-17T08:00:00.000-0600",
          comment: richAdf,
        });
      },
      result: { ...ownedWorklog, timeSpentSeconds: 18_000 },
    },
    {
      path: "/rest/api/3/myself",
      result: { accountId: "steve-account" },
    },
    {
      path: "/rest/api/3/issue/MT-22/worklog/7001",
      result: ownedWorklog,
    },
    {
      path: "/rest/api/3/issue/MT-22/worklog/7001?adjustEstimate=leave",
      method: "DELETE",
    },
  ]);
  const client = new JiraReconstructionClient(request);

  await client.updateWorklog("MT-22", "7001", {
    timeSpentSeconds: 18_000,
    started: "2026-02-17T08:00:00.000-0600",
    comment: richAdf,
    expectedAuthorAccountId: "steve-account",
  });
  const deleted = await client.deleteWorklog("MT-22", "7001", {
    expectedAuthorAccountId: "steve-account",
  });

  assert.equal(deleted.deleted, true);
  assert.equal(request.remaining(), 0);
});

test("refuses to mutate a worklog owned by a different Jira author", async () => {
  const request = fakeRequest([
    {
      path: "/rest/api/3/myself",
      result: { accountId: "steve-account" },
    },
    {
      path: "/rest/api/3/issue/MT-22/worklog/7002",
      result: { id: "7002", author: { accountId: "someone-else" } },
    },
  ]);
  const client = new JiraReconstructionClient(request);

  await assert.rejects(
    client.updateWorklog("MT-22", "7002", {
      timeSpentSeconds: 3600,
      started: "2026-02-17T08:00:00.000-0600",
      comment: richAdf,
      expectedAuthorAccountId: "steve-account",
    }),
    JiraVerificationError
  );
  assert.equal(request.calls.length, 2);
});

test("refuses to create a worklog when the authenticated Jira user is not the expected author", async () => {
  const request = fakeRequest([
    {
      path: "/rest/api/3/myself",
      result: { accountId: "someone-else" },
    },
  ]);
  const client = new JiraReconstructionClient(request);

  await assert.rejects(
    client.createWorklog("MT-22", {
      timeSpentSeconds: 3600,
      started: "2026-02-17T08:00:00.000-0600",
      comment: richAdf,
      expectedAuthorAccountId: "steve-account",
    }),
    JiraVerificationError
  );
  assert.equal(request.calls.length, 1);
});

test("rejects any attempt to override Jira worklog authorship", async () => {
  const client = new JiraReconstructionClient(async () => {
    assert.fail("invalid local input must not reach Jira");
  });

  await assert.rejects(
    client.createWorklog("MT-22", {
      timeSpentSeconds: 3600,
      started: "2026-02-17T08:00:00.000-0600",
      comment: richAdf,
      expectedAuthorAccountId: "steve-account",
      author: { accountId: "steve-account" },
    }),
    /cannot be supplied/
  );
});

test("creates and deletes supported Jira link types with exact direction", async () => {
  const request = fakeRequest([
    ...["Blocks", "Relates", "Duplicate"].map((type) => ({
      path: "/rest/api/3/issueLink",
      method: "POST",
      assert: (_path, options) => {
        assert.deepEqual(JSON.parse(options.body), {
          type: { name: type },
          inwardIssue: { key: "MT-10" },
          outwardIssue: { key: "MT-11" },
        });
      },
    })),
    {
      path: "/rest/api/3/issueLink/4401",
      method: "DELETE",
    },
  ]);
  const client = new JiraReconstructionClient(request);

  for (const type of ["Blocks", "Relates", "Duplicate"]) {
    await client.createIssueLink({
      type,
      inwardIssueKey: "MT-10",
      outwardIssueKey: "MT-11",
    });
  }
  await client.deleteIssueLink("4401");
  assert.equal(request.remaining(), 0);
});

test("gets and adds a watcher using Jira's JSON string body", async () => {
  const request = fakeRequest([
    {
      path: "/rest/api/3/issue/MT-22/watchers",
      result: { watchers: [{ accountId: "steve-account" }] },
    },
    {
      path: "/rest/api/3/issue/MT-22/watchers",
      method: "POST",
      assert: (_path, options) => {
        assert.equal(options.body, JSON.stringify("steve-account"));
      },
    },
  ]);
  const client = new JiraReconstructionClient(request);

  await client.getWatchers("MT-22");
  await client.addWatcher("MT-22", "steve-account");
  assert.equal(request.remaining(), 0);
});

test("discovers, applies, and verifies transitions in the requested order", async () => {
  const request = fakeRequest([
    {
      path: "/rest/api/3/issue/MT-22/transitions",
      result: {
        transitions: [
          { id: "101", name: "Start Investigating", to: { name: "Research / Discovery" } },
        ],
      },
    },
    {
      path: "/rest/api/3/issue/MT-22/transitions",
      method: "POST",
      assert: (_path, options) => {
        assert.deepEqual(JSON.parse(options.body), { transition: { id: "101" } });
      },
    },
    {
      path: "/rest/api/3/issue/MT-22?fields=status",
      result: { key: "MT-22", fields: { status: { name: "Research / Discovery" } } },
    },
    {
      path: "/rest/api/3/issue/MT-22/transitions",
      result: {
        transitions: [{ id: "3", name: "Planning", to: { name: "Planning" } }],
      },
    },
    {
      path: "/rest/api/3/issue/MT-22/transitions",
      method: "POST",
      assert: (_path, options) => {
        assert.deepEqual(JSON.parse(options.body), { transition: { id: "3" } });
      },
    },
    {
      path: "/rest/api/3/issue/MT-22?fields=status",
      result: { key: "MT-22", fields: { status: { name: "Planning" } } },
    },
  ]);
  const client = new JiraReconstructionClient(request);

  const applied = await client.applyOrderedTransitions("MT-22", [
    "Research / Discovery",
    "Planning",
  ]);

  assert.deepEqual(
    applied.map((entry) => entry.transition.id),
    ["101", "3"]
  );
  assert.equal(request.remaining(), 0);
});

test("ordered transitions stop immediately when a required next transition is unavailable", async () => {
  const request = fakeRequest([
    {
      path: "/rest/api/3/issue/MT-22/transitions",
      result: { transitions: [{ id: "2", name: "In Progress", to: { name: "In Progress" } }] },
    },
  ]);
  const client = new JiraReconstructionClient(request);

  await assert.rejects(client.applyOrderedTransitions("MT-22", ["Done"]), JiraVerificationError);
  assert.equal(request.calls.length, 1);
});

test("reads every fields, comments, worklogs, links, watchers, and changelog page", async () => {
  const link = {
    id: "4401",
    type: { name: "Blocks" },
    outwardIssue: { key: "MT-23" },
  };
  const request = fakeRequest([
    {
      path: "/rest/api/3/issue/MT-22?fields=*all&expand=names%2Cschema",
      result: {
        id: "10022",
        key: "MT-22",
        fields: {
          status: { name: "Done" },
          description: richAdf,
          issuelinks: [link],
        },
      },
    },
    {
      path: "/rest/api/3/issue/MT-22/comment?startAt=0&maxResults=100",
      result: { startAt: 0, maxResults: 1, total: 2, comments: [{ id: "1", body: richAdf }] },
    },
    {
      path: "/rest/api/3/issue/MT-22/comment?startAt=1&maxResults=100",
      result: {
        startAt: 1,
        maxResults: 1,
        total: 2,
        comments: [{ id: "2", body: richAdf }],
      },
    },
    {
      path: "/rest/api/3/issue/MT-22/worklog?startAt=0&maxResults=1000",
      result: {
        startAt: 0,
        maxResults: 1000,
        total: 1,
        worklogs: [{ id: "7001", comment: richAdf, timeSpentSeconds: 3600 }],
      },
    },
    {
      path: "/rest/api/3/issue/MT-22/watchers",
      result: { watchers: [{ accountId: "steve-account" }], watchCount: 1 },
    },
    {
      path: "/rest/api/3/issue/MT-22/changelog?startAt=0&maxResults=100",
      result: { startAt: 0, maxResults: 100, total: 1, values: [{ id: "change-1" }] },
    },
  ]);
  const client = new JiraReconstructionClient(request);

  const readback = await client.readFullIssue("MT-22");

  assert.equal(readback.comments.length, 2);
  assert.equal(readback.worklogs.length, 1);
  assert.deepEqual(readback.links, [link]);
  assert.equal(readback.watchers.watchCount, 1);
  assert.deepEqual(readback.changelog, [{ id: "change-1" }]);
  assert.equal(request.remaining(), 0);
});

test("full readback throws rather than accepting a prematurely truncated Jira page", async () => {
  const request = fakeRequest([
    {
      path: "/rest/api/3/issue/MT-22?fields=*all&expand=names%2Cschema",
      result: { id: "10022", key: "MT-22", fields: { issuelinks: [] } },
    },
    {
      path: "/rest/api/3/issue/MT-22/comment?startAt=0&maxResults=100",
      result: { startAt: 0, maxResults: 100, total: 2, comments: [] },
    },
  ]);
  const client = new JiraReconstructionClient(request);

  await assert.rejects(client.readFullIssue("MT-22"), JiraReconstructionError);
  assert.equal(request.calls.length, 2);
});

test("exact verification helpers pass exact effects and throw on mismatches", () => {
  const readback = {
    fields: {
      status: { name: "Done" },
      description: richAdf,
      labels: ["mdm", "verified"],
    },
    comments: [{ id: "1", body: richAdf }],
    worklogs: [{ id: "7001", timeSpentSeconds: 3600, comment: richAdf }],
    links: [{ id: "4401", type: { name: "Blocks" } }],
    watchers: { watchers: [{ accountId: "steve-account" }] },
  };

  assertIssueFieldsExactly(readback, { description: richAdf });
  assertCommentExactly(readback, { id: "1", body: richAdf });
  assertWorklogExactly(readback, { id: "7001", timeSpentSeconds: 3600 });
  assertIssueLinkExactly(readback, { id: "4401", type: { name: "Blocks" } });
  assertWatcherPresent(readback, "steve-account");
  assertStatusExactly(readback, "Done");
  assertReadbackAssertions(readback, [
    { path: "fields.status.name", operator: "equals", expected: "Done" },
    { path: "fields.labels", operator: "contains", expected: "verified" },
    { path: "fields.missing", operator: "absent" },
  ]);
  assert.equal(assertExactEffect(richAdf, richAdf), richAdf);

  assert.throws(
    () => assertIssueFieldsExactly(readback, { labels: ["mdm"] }),
    JiraVerificationError
  );
  assert.throws(
    () =>
      assertReadbackAssertions(readback, [
        { path: "fields.status.name", operator: "equals", expected: "In Progress" },
      ]),
    JiraVerificationError
  );
});

test("request failures throw and never continue to a later mutation", async () => {
  const request = fakeRequest([
    {
      path: "/rest/api/3/issue/MT-22/comment",
      method: "POST",
      error: new Error("HTTP 409 conflict"),
    },
  ]);
  const client = new JiraReconstructionClient(request);

  await assert.rejects(client.addComment("MT-22", richAdf), JiraReconstructionError);
  assert.equal(request.calls.length, 1);
});
