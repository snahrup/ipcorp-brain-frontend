import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  activityIssueDescription,
  addIssueAttachment,
  lastActivity,
  mapIssue,
} from "./jira-gateway.mjs";

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

test("a pickup-style process comment is never selected as the most recent activity", () => {
  // The exact residue left on MT-260 and IPC-2648 before the dispatch pipeline stopped
  // posting this comment: it is the newest comment on the issue, but it announces work
  // starting, not work done, and must not be quoted as if it were the real update.
  const result = lastActivity({
    updated: "2026-08-04T09:00:00.000-0500",
    comment: {
      comments: [
        {
          author: { displayName: "Steve Nahrup" },
          created: "2026-08-01T10:00:00.000-0500",
          body: "Reviewed the approach and it looks right.",
        },
        {
          author: { displayName: "Steve Nahrup" },
          created: "2026-08-04T09:00:00.000-0500",
          body: "Picked this up to work on it now. Starting from the description and the linked items above. I will come back with what landed, what still needs a look, or what stopped me.",
        },
      ],
    },
  });
  // Falls through to the real comment underneath the noise, not the noise itself.
  assert.equal(
    result.lastActivitySummary,
    'Steve Nahrup commented: "Reviewed the approach and it looks right."'
  );
});

test("when the pickup comment is the only comment, the honest field fallback is used, never the noise text", () => {
  const result = lastActivity({
    updated: "2026-08-04T09:00:00.000-0500",
    comment: {
      comments: [
        {
          author: { displayName: "Steve Nahrup" },
          created: "2026-08-04T09:00:00.000-0500",
          body: "Picked this up to work on it now. Starting from the description and the linked items above. I will come back with what landed, what still needs a look, or what stopped me.",
        },
      ],
    },
  });
  assert.equal(result.lastActivitySummary, "Updated — no comment or worklog logged");
  // The timestamp still reflects reality (posting the comment bumped `updated`) even
  // though its text is excluded.
  assert.equal(result.lastActivityAt, "2026-08-04T09:00:00.000-0500");
});

test("a real worklog still wins over a newer pickup comment sitting on top of it", () => {
  const result = lastActivity({
    updated: "2026-08-04T09:00:00.000-0500",
    comment: {
      comments: [
        {
          author: { displayName: "Steve Nahrup" },
          created: "2026-08-04T09:00:00.000-0500",
          body: "Picked this up to work on it now.",
        },
      ],
    },
    worklog: {
      worklogs: [
        {
          author: { displayName: "Steve Nahrup" },
          created: "2026-08-03T00:00:00.000-0500",
          timeSpent: "2h",
          comment: "Built the first draft of the migration.",
        },
      ],
    },
  });
  assert.equal(result.lastActivityAt, "2026-08-03T00:00:00.000-0500");
  assert.ok(result.lastActivitySummary.includes("Built the first draft"));
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

function adfText(node) {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  return (node.content || []).map(adfText).join("");
}

test("a created issue carries the written description, not canned section text", () => {
  // The voice writer already returns a full Objective / Context / Approach /
  // Acceptance document in Steve's words. The builder used to drop that whole
  // document into a single Context paragraph and stamp identical Approach,
  // Decision and Acceptance bullets on every issue it made.
  const description = [
    "Objective",
    "Rework the breakdown so governance stands on its own.",
    "Context",
    "Patrick said governance is sprinkled through the waves today.",
    "Approach",
    "Split the pre-wave into a governance project and renumber security to M0.",
    "Acceptance",
    "Patrick agrees the top tier reads portfolio, program, project, task.",
  ].join("\n\n");

  const document = activityIssueDescription({
    summary: "Restructure the MDM breakdown",
    description,
  });
  const rendered = (document.content || []).map(adfText).join("\n");

  assert.match(rendered, /governance stands on its own/);
  assert.match(rendered, /renumber security to M0/);
  assert.match(rendered, /portfolio, program, project, task/);
  assert.doesNotMatch(rendered, /Review the supporting source and confirm the current owner/);
  assert.doesNotMatch(rendered, /The reviewed activity supports creating this work item/);
  assert.doesNotMatch(rendered, /Track and complete/);
});

test("an issue with no written description is refused instead of templated", () => {
  assert.throws(
    () => activityIssueDescription({ summary: "Something nobody wrote wording for" }),
    /description/i
  );
});

test("attachments upload as real multipart files and verify the readback", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jira-attach-"));
  const file = join(dir, "walkthrough-infographic.png");
  await writeFile(file, Buffer.from("png-bytes-here"));

  let captured = null;
  const fakeFetch = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      json: async () => [{ id: "10001", filename: "walkthrough-infographic.png", size: 14 }],
    };
  };

  const saved = await addIssueAttachment("MT-474", file, fakeFetch);
  assert.equal(saved.id, "10001");
  assert.equal(saved.filename, "walkthrough-infographic.png");

  assert.match(captured.url, /\/rest\/api\/3\/issue\/MT-474\/attachments$/);
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers["X-Atlassian-Token"], "no-check");
  assert.ok(captured.options.headers.Authorization, "auth header present");
  assert.equal(captured.options.headers["Content-Type"], undefined);
  const entry = captured.options.body.get("file");
  assert.ok(entry, "FormData carries the file field");

  // A readback that does not match the file we sent is a refusal, not a pass.
  const wrongReadback = async () => ({
    ok: true,
    json: async () => [{ id: "10002", filename: "something-else.bin" }],
  });
  await assert.rejects(
    () => addIssueAttachment("MT-474", file, wrongReadback),
    /did not confirm the attachment/
  );

  // Non-MT issues stay out of scope.
  await assert.rejects(() => addIssueAttachment("OTHER-1", file, fakeFetch), /MT initiative/);
});
