import assert from "node:assert/strict";
import test from "node:test";
import {
  generateWeeklyStatus,
  normalizeFields,
  parseDraft,
  partitionWeek,
  renderWeeklyStatusHtml,
  reportingPeriod,
  scrubDashes,
  weeklyStatusSubject,
} from "./build-weekly-status.mjs";

const issues = [
  {
    key: "MT-10",
    summary: "Confirm the governance domains against Fabric",
    status: { name: "Done", category: "done" },
    updatedAt: "2026-08-04T15:00:00.000Z",
    assignee: { displayName: "Steve Nahrup" },
    labels: [],
  },
  {
    key: "MT-11",
    summary: "Purview account upgrade",
    status: { name: "Blocked", category: "indeterminate" },
    updatedAt: "2026-08-05T09:00:00.000Z",
    labels: [],
  },
  {
    key: "MT-12",
    summary: "Domain rollout order",
    status: { name: "In Progress", category: "indeterminate" },
    updatedAt: "2026-08-05T11:00:00.000Z",
    labels: [],
  },
  {
    key: "MT-13",
    summary: "Something from months ago",
    status: { name: "In Progress", category: "indeterminate" },
    updatedAt: "2026-05-01T11:00:00.000Z",
    labels: [],
  },
];

test("the period is the seven days ending on the report date", () => {
  const period = reportingPeriod("2026-08-06");
  assert.equal(period.start.getFullYear(), 2026);
  assert.equal(period.start.getMonth(), 6); // July
  assert.equal(period.start.getDate(), 31);
  assert.equal(period.end.getDate(), 6);
});

test("only issues that moved inside the period count, split by state", () => {
  const week = partitionWeek(issues, reportingPeriod("2026-08-06"));
  assert.deepEqual(
    week.completed.map((issue) => issue.key),
    ["MT-10"]
  );
  assert.deepEqual(
    week.blocked.map((issue) => issue.key),
    ["MT-11"]
  );
  assert.deepEqual(
    week.inProgress.map((issue) => issue.key),
    ["MT-12"]
  );
  assert.equal(week.touched.length, 3, "the May issue is not this week's news");
});

test("dashes never survive into sendable text", () => {
  assert.equal(
    scrubDashes("stewards not named — this is the critical path"),
    "stewards not named, this is the critical path"
  );
  const fields = normalizeFields({
    bottomLine: "On track — mostly.",
    highlights: ["Shipped the map – finally"],
    risks: [{ title: "Upgrade blocked", severity: "High", detail: "Rights failed — ticket open" }],
  });
  const text = JSON.stringify(fields);
  assert.ok(!text.includes("—"), "an em dash reached the output");
  assert.ok(!text.includes("–"), "an en dash reached the output");
});

test("a malformed severity or status falls back rather than reaching the email", () => {
  const fields = normalizeFields({
    overallStatus: "Great",
    risks: [{ title: "x", severity: "Nope" }],
  });
  assert.equal(fields.overallStatus, "On Track");
  assert.equal(fields.risks[0].severity, "Medium");
});

test("the draft is read out of fenced or surrounded model output", () => {
  assert.deepEqual(parseDraft('Here you go:\n```json\n{"bottomLine":"ok"}\n```\nDone.'), {
    bottomLine: "ok",
  });
  assert.equal(parseDraft("no json at all"), null);
});

test("the rendered email carries the real content and no stray dashes", () => {
  const fields = normalizeFields({
    overallStatus: "At Risk",
    bottomLine: "Stewards are still not named.",
    highlights: ["Confirmed the domains map to Fabric."],
    needsFromBusiness: ["Name the stewards for the first domain."],
    risks: [
      { title: "Stewards not named", severity: "High", detail: "This is the critical path." },
    ],
  });
  const html = renderWeeklyStatusHtml({ reportDate: "2026-08-06", fields });
  assert.ok(html.includes("Project Status Report"));
  assert.ok(html.includes("At Risk"));
  assert.ok(html.includes("Report Date: 8/6/2026"));
  assert.ok(html.includes("Confirmed the domains map to Fabric."));
  assert.ok(html.includes("What We Need From the Business"));
  assert.ok(html.includes("<b>1. Stewards not named</b> (High)"));
  assert.ok(html.includes("Steve Nahrup"));
  assert.ok(!html.includes("—"));
});

test("a partial field set renders instead of throwing, and long lists are not truncated", () => {
  const html = renderWeeklyStatusHtml({
    reportDate: "2026-08-06",
    fields: { bottomLine: "Only this was sent." },
  });
  assert.ok(html.includes("Only this was sent."));
  assert.ok(html.includes("On Track"));

  const many = renderWeeklyStatusHtml({
    reportDate: "2026-08-06",
    fields: {
      bottomLine: "Busy week.",
      highlights: Array.from({ length: 9 }, (_, index) => `Highlight ${index + 1}`),
    },
  });
  assert.ok(many.includes("Highlight 9"), "an added bullet must not vanish from the email");
});

test("an empty section is left out of the email entirely", () => {
  const html = renderWeeklyStatusHtml({
    reportDate: "2026-08-06",
    fields: normalizeFields({ bottomLine: "Quiet week." }),
  });
  assert.ok(!html.includes("Highlights"));
  assert.ok(!html.includes("Risks / Issues"));
  assert.ok(html.includes("Quiet week."));
});

test("generate passes the week's evidence to the writer and returns rendered fields", async () => {
  let seenPrompt = "";
  const draft = await generateWeeklyStatus({
    reportDate: "2026-08-06",
    issues,
    guidance: "lead with the Purview block",
    draftWithClaude: async (prompt) => {
      seenPrompt = prompt;
      return JSON.stringify({
        overallStatus: "At Risk",
        bottomLine: "Purview is blocked.",
        highlights: ["Domains confirmed against Fabric."],
        needsFromBusiness: [],
        risks: [],
      });
    },
  });
  assert.ok(seenPrompt.includes("MT-10"), "completed work reached the prompt");
  assert.ok(seenPrompt.includes("MT-11"), "blocked work reached the prompt");
  assert.ok(!seenPrompt.includes("MT-13"), "out-of-period work stayed out of the prompt");
  assert.ok(seenPrompt.includes("lead with the Purview block"));
  assert.equal(draft.counts.completed, 1);
  assert.equal(draft.counts.blocked, 1);
  assert.equal(draft.fields.overallStatus, "At Risk");
  assert.deepEqual(draft.period, { start: "2026-07-31", end: "2026-08-06" });
});

test("a writer that returns prose fails loudly instead of sending an empty email", async () => {
  await assert.rejects(
    generateWeeklyStatus({
      reportDate: "2026-08-06",
      issues,
      draftWithClaude: async () => "I could not do that.",
    }),
    /shape that could not be read/
  );
});

test("the subject names the report date", () => {
  assert.equal(weeklyStatusSubject("2026-08-06"), "MDM / Data Governance Weekly Status, 8/6/2026");
});
