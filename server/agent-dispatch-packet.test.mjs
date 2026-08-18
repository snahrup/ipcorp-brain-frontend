// What a dispatched agent is told before it touches a real work item.
//
// The bar Steve set on 2026-08-18: an autonomous agent must be handed
// everything he would hand it if he sat down and briefed it in person. Not a
// ticket title and a hope. The previous prompt carried the summary, the
// description and little else, so an agent could write into the knowledge base
// without reading it, invent an approach with no standard behind it, produce a
// document nobody could reach from the ticket, and report DONE having verified
// nothing.

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAgentPrompt, extractAttachments } from "./agent-dispatch.mjs";

const issue = {
  key: "MT-500",
  summary: "Write the governed domain list",
  status: { name: "In Progress" },
  priority: { name: "Priority 1" },
  dueDate: "2026-08-20",
  labels: ["mdm"],
  description: "Produce the domain list.\nAcceptance: every domain has a named steward.",
  timeTracking: { originalEstimate: "7h", remainingEstimate: "7h" },
  subtasks: [{ key: "MT-501", status: "To Do", summary: "Interview stewards" }],
  links: [{ type: "blocks", direction: "outward", key: "MT-600", summary: "Rollout" }],
  comments: [
    { author: "Patrick Stiller", created: "2026-08-14", body: "Finance owner is still open." },
  ],
  worklogs: [
    { author: "Steve Nahrup", started: "2026-08-12", timeSpent: "2h", comment: "Drafted" },
  ],
  attachments: [{ filename: "domains-draft-v1.xlsx" }],
};

test("the ticket's own conversation and history reach the agent", () => {
  const prompt = buildAgentPrompt(issue, "");
  assert.match(prompt, /Patrick Stiller/, "comments carry decisions the description never states");
  assert.match(prompt, /Finance owner is still open/);
  assert.match(prompt, /domains-draft-v1\.xlsx/, "it must know what is already attached");
  assert.match(prompt, /2h/, "prior logged work says how far along this already is");
});

test("it is required to read the knowledge base before writing to it", () => {
  const prompt = buildAgentPrompt(issue, "");
  assert.match(prompt, /AGENTS\.md/, "the brain's own house rules");
  assert.match(prompt, /CHANGELOG/, "a brain write without a changelog row breaks the protocol");
  assert.match(prompt, /search|read/i);
});

// The prompt is hard-wrapped prose, so assertions match across line breaks.
// A test that fails because a sentence wrapped is testing the wrapping.
const flat = (over = {}) => buildAgentPrompt({ ...issue, ...over }, "").replace(/\s+/g, " ");

test("platform practice is a check on itself, never citation theater", () => {
  const prompt = flat();
  assert.match(prompt, /Fabric, Power BI, Purview/);
  assert.match(prompt, /not something that merely sounds right/i, "the actual failure to avoid");
  assert.match(prompt, /not a citation exercise/i);
  // Asserting the prohibition itself, rather than the absence of the word:
  // the prompt legitimately contains "do not cite Learn articles", and a
  // naive absence check fails on the very rule it is meant to confirm.
  assert.match(prompt, /do not cite/i, "citing documentation is explicitly forbidden");
});

test("a Jira comment can never carry a local file path", () => {
  const prompt = flat();
  assert.match(prompt, /NEVER put a local or relative file path/i);
  assert.match(prompt, /SharePoint web\s*URL/i, "brain files are referenced by their live URL");
  assert.match(prompt, /attached to\s*the ticket itself/i, "one-offs become real file objects");
});

test("deliverables have to reach the ticket, not just the disk", () => {
  const prompt = buildAgentPrompt(issue, "");
  assert.match(prompt, /ATTACH:/, "the block dispatch reads to attach files");
});

test("it must state what it verified and what it could not", () => {
  const prompt = buildAgentPrompt(issue, "");
  assert.match(prompt, /verif/i);
  assert.match(prompt, /acceptance/i, "restate the criteria and say which are met");
});

test("missing information is a question, never an invention", () => {
  const prompt = buildAgentPrompt(issue, "").replace(/\s+/g, " ");
  assert.match(prompt, /BLOCKED/);
  assert.match(
    prompt,
    /do not (invent|guess|fabricate)/i,
    "the whole point: no plausible-looking filler"
  );
});

test("the attachment block is parsed back out of the run", () => {
  const output = `Some prose about the work.

ATTACH:
C:\\Users\\snahrup\\OneDrive - IP-Corporation\\ipcorp-architecture-brain\\core\\domains.md
C:\\Users\\snahrup\\Documents\\domain-list.xlsx
END ATTACH

COMMENT:
Wrote the list.
END COMMENT
RESULT: DONE it is written
TIME: 3h`;
  assert.deepEqual(extractAttachments(output), [
    "C:\\Users\\snahrup\\OneDrive - IP-Corporation\\ipcorp-architecture-brain\\core\\domains.md",
    "C:\\Users\\snahrup\\Documents\\domain-list.xlsx",
  ]);
});

test("no attachment block means no attachments, never a guess", () => {
  assert.deepEqual(extractAttachments("COMMENT:\nnothing\nEND COMMENT\nRESULT: DONE ok"), []);
});
