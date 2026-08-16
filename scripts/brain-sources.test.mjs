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

import { buildMeetings, meetingActionId } from "./brain-sources.mjs";

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
  jiraProposals: [{ operation: "Update", jiraKey: "MT-42", title: "Stand up the MDM RAID log" }],
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
  const jira = (m.followUps ?? []).find((item) => item.kind === "jira-change");
  assert.equal(jira?.jiraKey, "MT-42", "the explicit Jira key survives the export");
  assert.match(jira?.actionId ?? "", /^meeting-action-2026-08-13-mdm-projects-[a-f0-9]{16}$/);
});

test("meeting action identity is stable and changes when the supported action changes", () => {
  const base = {
    kind: "jira-change",
    text: "Stand up the MDM RAID log",
    operation: "Update",
    jiraKey: "MT-42",
  };
  const first = meetingActionId("2026-08-13-mdm-projects", base);
  const repeated = meetingActionId("2026-08-13-mdm-projects", { ...base });
  const changed = meetingActionId("2026-08-13-mdm-projects", {
    ...base,
    jiraKey: "MT-43",
  });
  assert.equal(repeated, first);
  assert.notEqual(changed, first);
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

test("a meeting uses the reviewed infographic named by status instead of the first PNG", () => {
  const brain = makeBrain();
  writeFileSync(
    join(brain, "core", "meetings", "summaries", "2026-08-13-mdm-projects.md"),
    SUMMARY_MD
  );
  const visualDir = join(brain, "natively", "meeting-infographics", "2026-08-13-mdm-projects");
  mkdirSync(visualDir, { recursive: true });
  writeFileSync(join(visualDir, "2026-08-13-mdm-projects.png"), "template card");
  writeFileSync(join(visualDir, "MDM Projects [2026-08-13].png"), "reviewed image");
  writeFileSync(
    join(visualDir, "status.json"),
    JSON.stringify({
      status: "GENERATED",
      artifactId: "real-artifact",
      output: { file: "MDM Projects [2026-08-13].png" },
    })
  );

  const meetings = buildMeetings(brain);
  assert.equal(meetings?.[0]?.infographic?.file, "MDM Projects [2026-08-13].png");
});

test("legacy locally rendered meeting cards are not published as finished infographics", () => {
  const brain = makeBrain();
  writeFileSync(
    join(brain, "core", "meetings", "summaries", "2026-08-13-mdm-projects.md"),
    SUMMARY_MD
  );
  const visualDir = join(brain, "natively", "meeting-infographics", "2026-08-13-mdm-projects");
  mkdirSync(visualDir, { recursive: true });
  writeFileSync(join(visualDir, "MDM Projects [2026-08-13].png"), "local template");
  writeFileSync(
    join(visualDir, "status.json"),
    JSON.stringify({
      status: "complete",
      outputFile: "MDM Projects [2026-08-13].png",
      layoutFamily: "decision_brief",
      sourceSpec: "docs/handoff/2026-07-30-chatgpt-infographic-spec.md",
    })
  );

  const meetings = buildMeetings(brain);
  assert.equal(meetings?.[0]?.infographic, undefined);
});

test("a blocked provider receipt never falls back to the only PNG in its folder", () => {
  const brain = makeBrain();
  writeFileSync(
    join(brain, "core", "meetings", "summaries", "2026-08-13-mdm-projects.md"),
    SUMMARY_MD
  );
  const visualDir = join(brain, "natively", "meeting-infographics", "2026-08-13-mdm-projects");
  mkdirSync(visualDir, { recursive: true });
  writeFileSync(join(visualDir, "MDM Projects [2026-08-13].png"), "unselected history");
  writeFileSync(
    join(visualDir, "status.json"),
    JSON.stringify({
      status: "BLOCKED_MISSING_SOURCE",
      provider: "codex",
      artifactId: null,
      output: null,
      selectedOutput: null,
    })
  );

  const meetings = buildMeetings(brain);
  assert.equal(meetings?.[0]?.infographic, undefined);
});

test("a provider image awaiting visual review stays hidden", () => {
  const brain = makeBrain();
  writeFileSync(
    join(brain, "core", "meetings", "summaries", "2026-08-13-mdm-projects.md"),
    SUMMARY_MD
  );
  const visualDir = join(brain, "natively", "meeting-infographics", "2026-08-13-mdm-projects");
  mkdirSync(visualDir, { recursive: true });
  writeFileSync(join(visualDir, "pending.png"), "unreviewed image");
  writeFileSync(
    join(visualDir, "status.json"),
    JSON.stringify({
      status: "GENERATED_PENDING_VISUAL_REVIEW",
      provider: "codex",
      artifactId: "art-pending",
      output: { file: "pending.png" },
      visualQualityReview: { status: "pending" },
    })
  );

  const meetings = buildMeetings(brain);
  assert.equal(meetings?.[0]?.infographic, undefined);
});

test("known duplicate summaries collapse into the transcript-primary meeting and keep reviewed art", () => {
  const brain = makeBrain();
  writeFileSync(
    join(brain, "core", "meetings", "summaries", "2026-08-03-dev-data-standup.md"),
    `# Dev Data Stand-up - 2026-08-03\n\n## Summary\n\nThe consolidated meeting record.\n`
  );
  writeFileSync(
    join(brain, "core", "meetings", "summaries", "2026-08-03-weekly-dev-data-stand-up.md"),
    `# Weekly Dev Data Stand-up - 2026-08-03\n\n## Summary\n\nThe recap alias.\n`
  );
  const visualDir = join(
    brain,
    "natively",
    "meeting-infographics",
    "2026-08-03-weekly-dev-data-stand-up"
  );
  mkdirSync(visualDir, { recursive: true });
  writeFileSync(join(visualDir, "reviewed.png"), "reviewed image");
  writeFileSync(
    join(visualDir, "status.json"),
    JSON.stringify({ artifactId: "art-1", output: { file: "reviewed.png" } })
  );

  const meetings = buildMeetings(brain);
  assert.equal(meetings?.length, 1);
  assert.equal(meetings?.[0]?.id, "2026-08-03-dev-data-standup");
  assert.equal(meetings?.[0]?.infographic?.file, "reviewed.png");
});

test("a proved non-meeting record does not become a meeting modal", () => {
  const brain = makeBrain();
  writeFileSync(
    join(brain, "core", "meetings", "summaries", "2026-08-05-fabric-bi-weekly-standup.md"),
    `# Fabric Bi-Weekly Stand-Up - 2026-08-05 - DID NOT OCCUR\n\n**No meeting happened.** This record closes the false capture.\n`
  );

  assert.equal(buildMeetings(brain), null);
});

test("explicit interview preparation does not become a meeting modal", () => {
  const brain = makeBrain();
  writeFileSync(
    join(brain, "core", "meetings", "summaries", "2025-10-10-interview-prep.md"),
    `# Interview preparation - 2025-10-10\n\n> Note: This is pre-engagement preparation, not a stakeholder meeting.\n`
  );

  assert.equal(buildMeetings(brain), null);
});
