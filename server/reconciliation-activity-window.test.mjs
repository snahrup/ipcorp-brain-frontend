import assert from "node:assert/strict";
import test from "node:test";
import {
  evidenceActivityAt,
  makePortfolioProposals,
  partitionByActivityWindow,
  startOfReconciliationWindow,
} from "./jira-gateway.mjs";

// The records that made the Work page unusable: a 2025 Team Library meeting summary
// whose local file was rewritten by a resync today, an undated brain open question,
// and one thing that actually happened this week.
const wednesday = new Date("2026-08-05T09:00:00");
const libraryBacklog = {
  id: "lib-2025-10-10",
  kind: "Team Library artifact",
  title: "2025-10-10 - IP Corp MDM Transformation Interview Prep",
  text: "Library controls",
  status: "published",
  updatedAt: "2026-08-05T14:02:00.000Z",
  reference:
    "03 - Engagement Updates/Meeting Summaries/2025/10 - October/2025-10-10 - IP Corp MDM Transformation Interview Prep.md",
};
const undatedQuestion = {
  id: "DQ-001",
  kind: "Brain open question",
  title: "Exact mechanism for MES-M3 sync",
  text: "high unresolved",
  status: "open",
  updatedAt: null,
  reference: "Brain open question DQ-001",
};
const thisWeek = {
  id: "m365-1",
  kind: "Microsoft 365 evidence",
  title: "Fabric capacity follow-up",
  text: "Steve owes a capacity number",
  status: "open",
  updatedAt: "2026-08-05T13:00:00.000Z",
  reference: "Outlook message",
};

test("the week window starts on Monday and a rolling count is honoured", () => {
  assert.equal(
    startOfReconciliationWindow(null, wednesday).toDateString(),
    new Date("2026-08-03T00:00:00").toDateString()
  );
  // Sunday still belongs to the week that began the previous Monday.
  assert.equal(
    startOfReconciliationWindow(null, new Date("2026-08-09T23:00:00")).toDateString(),
    new Date("2026-08-03T00:00:00").toDateString()
  );
  assert.equal(startOfReconciliationWindow("all", wednesday), null);
  assert.equal(
    Math.round((wednesday - startOfReconciliationWindow(30, wednesday)) / 86_400_000),
    30
  );
});

test("an artifact's own date beats a resync-refreshed file timestamp", () => {
  assert.equal(
    new Date(evidenceActivityAt(libraryBacklog)).toISOString().slice(0, 10),
    "2025-10-10"
  );
  assert.equal(evidenceActivityAt(undatedQuestion), null);
  assert.equal(new Date(evidenceActivityAt(thisWeek)).toISOString().slice(0, 10), "2026-08-05");
});

test("older and undated evidence is partitioned out of the window", () => {
  const windowStart = startOfReconciliationWindow(null, wednesday);
  const split = partitionByActivityWindow([libraryBacklog, undatedQuestion, thisWeek], windowStart);
  assert.deepEqual(
    split.inWindow.map((record) => record.id),
    ["m365-1"]
  );
  assert.deepEqual(
    split.olderThanWindow.map((record) => record.id),
    ["lib-2025-10-10"]
  );
  assert.deepEqual(
    split.undated.map((record) => record.id),
    ["DQ-001"]
  );
});

test("no window means nothing is held back", () => {
  const split = partitionByActivityWindow([libraryBacklog, undatedQuestion, thisWeek], null);
  assert.equal(split.inWindow.length, 3);
  assert.equal(split.olderThanWindow.length, 0);
  assert.equal(split.undated.length, 0);
});

test("only in-window evidence becomes a candidate", () => {
  const issues = [
    {
      key: "MT-100",
      summary: "Unrelated open work",
      status: { category: "indeterminate" },
      updatedAt: "2026-08-04T10:00:00.000Z",
    },
  ];
  const windowStart = startOfReconciliationWindow(null, wednesday);
  const { inWindow } = partitionByActivityWindow(
    [libraryBacklog, undatedQuestion, thisWeek],
    windowStart
  );

  const withoutWindow = makePortfolioProposals(issues, [libraryBacklog, undatedQuestion, thisWeek]);
  assert.equal(
    withoutWindow.proposals.length,
    3,
    "the old behaviour proposed every record on every scan"
  );

  const windowed = makePortfolioProposals(issues, inWindow);
  assert.equal(windowed.proposals.length, 1);
  assert.equal(windowed.proposals[0].title, "Fabric capacity follow-up");
});
