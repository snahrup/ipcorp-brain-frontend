/**
 * The Meetings Overview showed a meeting card with no attendees, no summary,
 * and no follow-ups while every one of those sat in the brain. Steve,
 * 2026-08-13: "where are all of the takeaways from the meetings, the
 * deliverables or promised followups that were agreed to during the meeting,
 * who was in the meeting."
 *
 * Two extraction gaps caused it. The closeout writes `**Attendees:** ...` and
 * `## Executive readout`, while the extractor looked only for a `> Source:`
 * meta line and `## Summary`. And the closeout embeds the whole review
 * package as base64 JSON in a WORKBENCH_CLOSEOUT_JSON marker that the
 * extractor never decoded, which is where the follow-ups live.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildMeetings } from "./brain-sources.mjs";

function makeBrain() {
  const root = mkdtempSync(join(tmpdir(), "brain-src-"));
  mkdirSync(join(root, "core", "meetings", "summaries"), { recursive: true });
  return root;
}

const PACKAGE = {
  id: "2026-08-13-mdm-projects",
  meeting: { attendees: ["Robin Virginia", "Steve Nahrup", "Patrick Stiller"] },
  summary: "Steve walked Robin and Patrick through the workbook.",
  commitments: [],
  jiraProposals: [{ operation: "Create", title: "Stand up the MDM RAID log" }],
  documentRequests: [
    { text: "A written role packet for the business analyst", owner: "Robin Virginia" },
  ],
  reminderCandidates: [{ text: "Give Robin the date for the dates", timing: "This week" }],
};

const SUMMARY_MD = `# MDM Projects - 2026-08-13

**Date:** 2026-08-13
**Attendees:** Robin Virginia, Steve Nahrup, Patrick Stiller
**Source:** Cluely transcript supplied in Workbench

## Executive readout

Steve walked Robin and Patrick through the workbook. Robin gave direction on dates and the RAID log.

## Steve's commitments

- None identified.

<!-- WORKBENCH_CLOSEOUT_JSON ${Buffer.from(JSON.stringify(PACKAGE), "utf8").toString("base64")} -->
`;

test("a closeout-shaped summary yields attendees, readout, and follow-ups", () => {
  const brain = makeBrain();
  writeFileSync(
    join(brain, "core", "meetings", "summaries", "2026-08-13-mdm-projects.md"),
    SUMMARY_MD
  );

  const meetings = buildMeetings(brain);
  assert.ok(meetings && meetings.length === 1, "one meeting expected");
  const m = meetings[0];

  assert.match(m.attendees ?? "", /Robin Virginia/, "attendees from the bold label line");
  assert.match(m.summary ?? "", /walked Robin and Patrick/, "summary from Executive readout");

  const kinds = (m.followUps ?? []).map((f) => f.kind);
  assert.ok(
    kinds.includes("document-request") &&
      kinds.includes("reminder") &&
      kinds.includes("jira-change"),
    `follow-ups must carry the package's promised work, got kinds: ${kinds.join(", ") || "(none)"}`
  );
  const texts = (m.followUps ?? []).map((f) => f.text).join(" | ");
  assert.match(texts, /business analyst/, "the document request text survives");
  assert.match(texts, /RAID log/, "the recommended Jira change survives");
});

test("the old summary shape still extracts exactly as before", () => {
  const brain = makeBrain();
  writeFileSync(
    join(brain, "core", "meetings", "summaries", "2026-07-01-old-shape.md"),
    `# Old Shape - 2026-07-01

> Source: Teams · Attendees: Patrick Stiller, Steve Nahrup · Duration: ~30 min

## Summary

The old pipeline wrote summaries in this shape.
`
  );
  const meetings = buildMeetings(brain);
  const m = meetings[0];
  assert.match(m.attendees ?? "", /Patrick Stiller/);
  assert.match(m.summary ?? "", /old pipeline/);
});
