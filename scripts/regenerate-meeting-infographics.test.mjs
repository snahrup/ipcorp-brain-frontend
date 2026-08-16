import assert from "node:assert/strict";
import test from "node:test";

import {
  extractTranscriptReferences,
  isLegacyVisualStatus,
  isTranscriptEvidenceFile,
  requireReviewedWriteScope,
  transcriptPriority,
} from "./regenerate-meeting-infographics.mjs";

test("legacy report render receipts are selected for replacement", () => {
  assert.equal(
    isLegacyVisualStatus({
      status: "complete",
      sourceSpec: "docs/handoff/2026-07-30-chatgpt-infographic-spec.md",
    }),
    true
  );
  assert.equal(
    isLegacyVisualStatus({ status: "GENERATED", artifactId: "art-1", provider: "codex" }),
    false
  );
});

test("inferred evidence ignores pre-ingestion, empty-capture, run-report, and retired files", () => {
  assert.equal(isTranscriptEvidenceFile("2026-04-30-citrine-working-session.md"), true);
  assert.equal(isTranscriptEvidenceFile("_2026-04-30-citrine-working-session.md"), false);
  assert.equal(
    isTranscriptEvidenceFile("2026-04-30-citrine-working-session.PRE-INGESTION.md"),
    false
  );
  assert.equal(
    isTranscriptEvidenceFile("2026-04-30-citrine-working-session_NO_TRANSCRIPT.md"),
    false
  );
  assert.equal(isTranscriptEvidenceFile("2026-04-30-citrine-working-session_RUN_REPORT.md"), false);
  assert.equal(isTranscriptEvidenceFile("2026-04-30-citrine-working-session-retired.txt"), false);
});

test("all transcript references are retained and Teams sorts first", () => {
  const references = extractTranscriptReferences(`
- \`core/meetings/transcripts/cluely-export/2026-08-13-mdm-projects.md\`
- \`core/meetings/transcripts/teams-export/2026-08-13-mdm-projects.md\`
`);
  assert.equal(references.length, 2);
  references.sort((left, right) => transcriptPriority(left) - transcriptPriority(right));
  assert.match(references[0], /teams-export/);
  assert.match(references[1], /cluely-export/);
});

test("provider writes require an explicit reviewed and scoped batch", () => {
  assert.throws(
    () => requireReviewedWriteScope({ executeReviewedBatch: false, ids: new Set(["meeting-1"]) }),
    /Refusing provider writes/
  );
  assert.throws(
    () => requireReviewedWriteScope({ executeReviewedBatch: true, ids: null }),
    /Refusing an unscoped provider run/
  );
  assert.doesNotThrow(() =>
    requireReviewedWriteScope({ executeReviewedBatch: true, ids: new Set(["meeting-1"]) })
  );
});
