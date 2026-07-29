import assert from "node:assert/strict";
import test from "node:test";

import {
  adfBulletList,
  adfCodeBlock,
  adfEmphasis,
  adfInlineCard,
  adfOrderedList,
  adfParagraph,
  adfStrong,
  adfTable,
  buildIssueDescription,
  buildSteveComment,
  createOperationMarker,
  hasOperationMarker,
  isNativeAdfDocument,
  isPlainOperationMarker,
  preserveNativeAdf,
} from "./jira-adf.mjs";

const MT_12 = "https://ip-corporation.atlassian.net/browse/MT-12";
const MT_39 = "https://ip-corporation.atlassian.net/browse/MT-39";

function collectNodes(node, type, result = []) {
  if (!node || typeof node !== "object") return result;
  if (node.type === type) result.push(node);
  if (Array.isArray(node.content)) {
    for (const child of node.content) collectNodes(child, type, result);
  }
  return result;
}

test("buildIssueDescription emits a native rich ADF v1 document with all required sections", () => {
  const description = buildIssueDescription({
    objective: adfParagraph(
      adfStrong("Establish a trusted MDM baseline"),
      " for the current Fabric rollout."
    ),
    context: [
      adfParagraph("The current Jira board does not reflect the complete evidence trail."),
      adfBulletList(["Retain the historical record", "Separate current work from stale work"]),
    ],
    approachActivities: [
      adfOrderedList([
        "Inventory the authorized evidence",
        "Cross-reference each activity to the existing MT issue set",
      ]),
      adfCodeBlock("project = MT AND status != Done", { language: "jql" }),
    ],
    decisionOutcome: [
      adfParagraph("Use ", adfEmphasis("evidence-backed"), " operations only."),
      adfTable({
        headers: ["Decision", "Outcome"],
        rows: [
          ["Historical activity", "Represent only when supported"],
          ["Current status", "Keep only genuinely active work in progress"],
        ],
      }),
    ],
    acceptanceCriteria: adfBulletList([
      adfParagraph("Every mutation has a readback verification."),
      adfParagraph("Every created subtask is complete, not a placeholder."),
    ]),
  });

  assert.equal(isNativeAdfDocument(description), true);
  assert.deepEqual(
    collectNodes(description, "heading").map((node) => node.content[0].text),
    ["Objective", "Context", "Approach/Activities", "Decision/Outcome", "Acceptance Criteria"]
  );
  assert.equal(collectNodes(description, "bulletList").length, 2);
  assert.equal(collectNodes(description, "orderedList").length, 1);
  assert.equal(collectNodes(description, "table").length, 1);
  assert.equal(collectNodes(description, "codeBlock")[0].attrs.language, "jql");
  assert.deepEqual(collectNodes(description, "text").find((node) => node.marks)?.marks, [
    { type: "strong" },
  ]);
  assert.ok(
    collectNodes(description, "text").some((node) => node.marks?.some((mark) => mark.type === "em"))
  );
});

test("inlineCard builders retain native Jira links in descriptions and comments", () => {
  const description = buildIssueDescription({
    objective: adfParagraph("Bring ", adfInlineCard(MT_12), " up to date."),
    context: "The epic is the MDM portfolio anchor.",
    approachActivities: "Reconcile the issue hierarchy against the evidence.",
    decisionOutcome: "Retain explicit related-work links.",
    acceptanceCriteria: "The relationship is represented as a native inline card.",
  });
  const comment = buildSteveComment({
    narrative:
      "I traced the dependency chain and confirmed the existing research is still the right architectural starting point.",
    relatedIssueUrls: [MT_12, MT_39],
    operationIdentity: { kind: "comment.create", issueKey: "MT-40", evidence: "ev-42" },
  });

  assert.deepEqual(
    collectNodes(description, "inlineCard").map((node) => node.attrs.url),
    [MT_12]
  );
  assert.deepEqual(
    collectNodes(comment, "inlineCard").map((node) => node.attrs.url),
    [MT_12, MT_39]
  );
  assert.ok(comment.content.every((node) => node.type === "paragraph"));
  assert.equal(collectNodes(comment, "heading").length, 0);
  assert.equal(collectNodes(comment, "bulletList").length, 0);
  assert.equal(collectNodes(comment, "orderedList").length, 0);
});

test("existing native ADF is returned unchanged unless replacement is explicit", () => {
  const existing = {
    version: 1,
    type: "doc",
    content: [
      {
        type: "expand",
        attrs: { title: "Existing detail" },
        content: [
          adfParagraph(adfStrong("Preserve this mark"), " and the nested structure."),
          adfCodeBlock("SELECT 1", { language: "sql" }),
        ],
      },
      adfTable({
        headers: ["Source", "State"],
        rows: [["IPC_PowerData", "Verified"]],
      }),
    ],
  };
  const before = structuredClone(existing);

  const fromDescriptionBuilder = buildIssueDescription({ existingAdf: existing });
  const fromCommentBuilder = buildSteveComment({ existingAdf: existing });
  assert.strictEqual(fromDescriptionBuilder, existing);
  assert.strictEqual(fromCommentBuilder, existing);
  assert.deepEqual(existing, before);

  const replacement = buildIssueDescription({
    objective: "Replace only when explicitly requested.",
    context: "The caller supplied a complete replacement.",
    approachActivities: "Build a fresh native ADF document.",
    decisionOutcome: "Use the replacement without flattening it.",
    acceptanceCriteria: "The returned object is the replacement document.",
  });
  assert.strictEqual(preserveNativeAdf(existing, replacement), existing);
  assert.strictEqual(preserveNativeAdf(existing, replacement, { replace: true }), replacement);
});

test("Steve comment builder rejects forbidden tool wording, em dashes, and markdown structure", () => {
  const base = {
    operationIdentity: "MT-15:comment:2026-07-28",
  };
  assert.throws(
    () =>
      buildSteveComment({
        ...base,
        narrative: "I used Codex to generate the implementation detail.",
      }),
    /cannot mention AI, private tools/i
  );
  assert.throws(
    () =>
      buildSteveComment({
        ...base,
        narrative: "I verified the source path — then updated the mapping.",
      }),
    /em dashes/i
  );
  assert.throws(
    () =>
      buildSteveComment({
        ...base,
        narrative: "I completed the review.\n\n- Updated the mapping",
      }),
    /not headers or lists/i
  );
});

test("meeting and participant claims fail closed unless their evidence is explicitly verified", () => {
  const operationIdentity = "MT-22:comment:source-8";
  const meetingNarrative =
    "I met with Pat and worked through the source-system boundary before I finalized the mapping.";

  assert.throws(
    () => buildSteveComment({ narrative: meetingNarrative, operationIdentity }),
    /Meeting claims require explicit/i
  );
  assert.throws(
    () =>
      buildSteveComment({
        narrative: meetingNarrative,
        operationIdentity,
        evidence: { meetingVerified: true },
      }),
    /Participant or collaborative claims require explicit/i
  );
  assert.doesNotThrow(() =>
    buildSteveComment({
      narrative: meetingNarrative,
      operationIdentity,
      evidence: { meetingVerified: true, participantClaimsVerified: true },
    })
  );
});

test("operation markers are deterministic, canonical, and available in plain or invisible form", () => {
  const leftIdentity = {
    kind: "comment.create",
    target: { key: "MT-17", commentDate: "2026-07-28" },
    evidenceRefs: ["brain:42", "jira:17"],
  };
  const rightIdentity = {
    evidenceRefs: ["brain:42", "jira:17"],
    target: { commentDate: "2026-07-28", key: "MT-17" },
    kind: "comment.create",
  };

  const plainLeft = createOperationMarker(leftIdentity);
  const plainRight = createOperationMarker(rightIdentity);
  const invisibleLeft = createOperationMarker(leftIdentity, { mode: "invisible" });
  assert.equal(plainLeft, plainRight);
  assert.equal(isPlainOperationMarker(plainLeft), true);
  assert.notEqual(invisibleLeft, plainLeft);
  assert.doesNotMatch(invisibleLeft, /mdm-op/);
  assert.notEqual(plainLeft, createOperationMarker({ ...leftIdentity, target: { key: "MT-18" } }));

  const comment = buildSteveComment({
    narrative:
      "I worked through the metadata mapping, found the stale branch, and kept the verified path.",
    operationIdentity: leftIdentity,
    markerMode: "invisible",
  });
  assert.equal(hasOperationMarker(comment, leftIdentity), true);
  assert.equal(hasOperationMarker(comment, leftIdentity, { mode: "invisible" }), true);
  assert.equal(hasOperationMarker(comment, { ...leftIdentity, evidenceRefs: ["other"] }), false);
});

test("rich section blocks remain native ADF nodes without lossy text flattening", () => {
  const markedParagraph = adfParagraph(
    adfStrong("Key finding: "),
    adfEmphasis("the native marks must survive.")
  );
  const description = buildIssueDescription({
    objective: markedParagraph,
    context: adfParagraph("Keep the source detail intact."),
    approachActivities: adfCodeBlock("SELECT BatchID FROM Silver.Batch", { language: "sql" }),
    decisionOutcome: adfTable({
      headers: ["Field", "Rule"],
      rows: [["BatchID", adfParagraph(adfStrong("Universal cross-system key"))]],
    }),
    acceptanceCriteria: adfBulletList(["No plain-text flattening"]),
  });

  assert.strictEqual(description.content[1], markedParagraph);
  assert.deepEqual(description.content[1], markedParagraph);
  assert.equal(
    collectNodes(description, "codeBlock")[0].content[0].text,
    "SELECT BatchID FROM Silver.Batch"
  );
  assert.deepEqual(
    collectNodes(description, "table")[0].content[1].content[1].content[0].content[0].marks,
    [{ type: "strong" }]
  );
});
