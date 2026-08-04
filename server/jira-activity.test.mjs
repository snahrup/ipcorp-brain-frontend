import assert from "node:assert/strict";
import test from "node:test";
import { lastActivity, mapIssue } from "./jira-gateway.mjs";

test("importing the gateway module does not start a second server", () => {
  // If the entry-point guard regressed, this import would have thrown EADDRINUSE
  // against the real gateway already running on :8817, or silently stolen the port
  // out from under it. Reaching this line at all is the proof.
  assert.ok(typeof lastActivity === "function");
});

test("a worklog after the last comment and after `updated` wins, with its narrative", () => {
  const result = lastActivity({
    updated: "2026-08-01T09:00:00.000-0500",
    comment: {
      comments: [
        {
          author: { displayName: "Patrick Stiller" },
          created: "2026-08-01T10:00:00.000-0500",
          body: "ok",
        },
      ],
    },
    worklog: {
      worklogs: [
        {
          author: { displayName: "Steve Nahrup" },
          created: "2026-08-02T08:00:00.000-0500",
          timeSpent: "2h",
          comment: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Wrote the migration script." }],
              },
            ],
          },
        },
      ],
    },
  });
  assert.equal(result.lastActivityAt, "2026-08-02T08:00:00.000-0500");
  assert.equal(
    result.lastActivitySummary,
    'Steve Nahrup — logged 2h: "Wrote the migration script."'
  );
});

test("a comment after the last worklog wins, with its text", () => {
  const result = lastActivity({
    updated: "2026-08-01T09:00:00.000-0500",
    comment: {
      comments: [
        {
          author: { displayName: "Patrick Stiller" },
          created: "2026-08-03T10:00:00.000-0500",
          body: "Looks good to me.",
        },
      ],
    },
    worklog: {
      worklogs: [
        {
          author: { displayName: "Steve Nahrup" },
          created: "2026-08-02T08:00:00.000-0500",
          timeSpent: "1h",
        },
      ],
    },
  });
  assert.equal(result.lastActivityAt, "2026-08-03T10:00:00.000-0500");
  assert.equal(result.lastActivitySummary, 'Patrick Stiller commented: "Looks good to me."');
});

test("updated newer than any comment or worklog wins as a plain field change, honestly unattributed", () => {
  // The MT-260 spot check: updated (07-31) sat after the newest comment (07-30) and
  // worklog (07-30). Bulk search carries no author on the bare updated field, so the
  // summary must not invent one.
  const result = lastActivity({
    updated: "2026-07-31T22:07:50.557-0500",
    comment: {
      comments: [
        {
          author: { displayName: "Steve Nahrup" },
          created: "2026-07-30T10:11:22.501-0500",
          body: "x",
        },
      ],
    },
    worklog: {
      worklogs: [
        {
          author: { displayName: "Steve Nahrup" },
          created: "2026-07-30T00:46:44.719-0500",
          timeSpent: "3h 30m",
        },
      ],
    },
  });
  assert.equal(result.lastActivityAt, "2026-07-31T22:07:50.557-0500");
  assert.equal(result.lastActivitySummary, "Updated — no comment or worklog logged");
});

test("an issue with nothing but a bare updated timestamp still resolves", () => {
  const result = lastActivity({ updated: "2026-07-01T00:00:00.000-0500" });
  assert.equal(result.lastActivityAt, "2026-07-01T00:00:00.000-0500");
  assert.equal(result.lastActivitySummary, "Updated — no comment or worklog logged");
});

test("multiple worklogs and comments: the true max across all of them wins, not just the first", () => {
  const result = lastActivity({
    updated: "2026-01-01T00:00:00.000-0500",
    comment: {
      comments: [
        { author: { displayName: "A" }, created: "2026-08-01T01:00:00.000-0500", body: "early" },
        {
          author: { displayName: "B" },
          created: "2026-08-05T01:00:00.000-0500",
          body: "latest comment",
        },
        { author: { displayName: "C" }, created: "2026-08-03T01:00:00.000-0500", body: "middle" },
      ],
    },
    worklog: {
      worklogs: [
        { author: { displayName: "D" }, created: "2026-08-04T01:00:00.000-0500", timeSpent: "1h" },
      ],
    },
  });
  assert.equal(result.lastActivityAt, "2026-08-05T01:00:00.000-0500");
  assert.equal(result.lastActivitySummary, 'B commented: "latest comment"');
});

test("a long worklog or comment body is clipped so the table row stays scannable", () => {
  const long = "x".repeat(200);
  const result = lastActivity({
    updated: "2026-01-01T00:00:00.000-0500",
    worklog: {
      worklogs: [
        {
          author: { displayName: "Steve" },
          created: "2026-08-01T00:00:00.000-0500",
          timeSpent: "1h",
          comment: long,
        },
      ],
    },
  });
  assert.ok(result.lastActivitySummary.length < long.length);
  // The ellipsis sits inside the closing quote, e.g. `Steve — logged 1h: "xxx…"`.
  assert.ok(result.lastActivitySummary.includes('…"'));
});

test("mapIssue exposes worklogs and last activity fields on the normalized issue", () => {
  const issue = mapIssue({
    key: "MT-1",
    fields: {
      summary: "Test",
      status: { id: "1", name: "Backlog", statusCategory: { key: "new" } },
      priority: { id: "1", name: "Priority 1" },
      issuetype: { name: "Task" },
      labels: [],
      timetracking: {},
      updated: "2026-08-01T00:00:00.000-0500",
      created: "2026-01-01T00:00:00.000-0500",
      worklog: {
        worklogs: [
          {
            id: "1",
            author: { displayName: "Steve" },
            created: "2026-08-01T00:00:00.000-0500",
            timeSpent: "1h",
            timeSpentSeconds: 3600,
          },
        ],
      },
      comment: { comments: [] },
    },
  });
  assert.equal(issue.worklogs.length, 1);
  assert.equal(issue.worklogs[0].timeSpentSeconds, 3600);
  assert.equal(issue.lastActivityAt, "2026-08-01T00:00:00.000-0500");
  assert.ok(issue.lastActivitySummary.includes("Steve"));
});
