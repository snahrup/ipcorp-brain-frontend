import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  classify,
  extractComment,
  parseClaudeActivity,
  parseClaudeEvent,
  parseCodexActivity,
  parseCodexEvent,
} from "./agent-dispatch.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Replay a JSONL stream through a parser the way the child process handler does. */
function replay(file, parse) {
  return fs
    .readFileSync(path.join(here, "__fixtures__", file), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("{"))
    .flatMap((line) => parse(JSON.parse(line)));
}

test("claude stream-json yields the agent's prose and nothing else", () => {
  // Captured from a real `claude -p --output-format stream-json --verbose` run, so this
  // fails if the CLI ever changes its event shape rather than silently going quiet.
  const messages = replay("claude-stream.jsonl", parseClaudeEvent);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, "agent");
  assert.equal(messages[0].text, "RESULT: DONE nothing to do");
});

test("system, result and rate-limit events never become messages", () => {
  for (const event of [
    { type: "system", subtype: "init", tools: ["Read", "Edit"] },
    { type: "result", subtype: "success", result: "RESULT: DONE" },
    { type: "rate_limit_event", rate_limit: {} },
  ]) {
    assert.deepEqual(parseClaudeEvent(event), []);
  }
});

test("tool calls and their results are dropped, text in the same turn is kept", () => {
  const messages = parseClaudeEvent({
    type: "assistant",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "Reading the description first." },
        { type: "tool_use", name: "Read", input: { file_path: "C:/secrets.env" } },
      ],
    },
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, "Reading the description first.");
  // A tool call must never leak into a view labelled as the conversation.
  assert.ok(!JSON.stringify(messages).includes("secrets.env"));

  assert.deepEqual(
    parseClaudeEvent({
      type: "user",
      message: { role: "user", content: [{ type: "tool_result", content: "file body" }] },
    }),
    []
  );
});

test("every codex event spelling of an agent message is understood", () => {
  const shapes = [
    { type: "item.completed", item: { type: "agent_message", text: "one" } },
    { msg: { type: "agent_message", message: "two" } },
    { type: "agent_message", message: "three" },
  ];
  assert.deepEqual(
    shapes.flatMap((event) => parseCodexEvent(event)).map((m) => m.text),
    ["one", "two", "three"]
  );
});

test("codex reasoning and command events are not conversation", () => {
  for (const event of [
    { type: "item.completed", item: { type: "reasoning", text: "thinking" } },
    { msg: { type: "exec_command_begin", command: "rm -rf ." } },
    { type: "token_count", info: {} },
  ]) {
    assert.deepEqual(parseCodexEvent(event), []);
  }
});

test("the verdict is found in the prose, not in the raw JSON stream", () => {
  const raw = fs.readFileSync(path.join(here, "__fixtures__", "claude-stream.jsonl"), "utf8");
  // The whole point of classifying prose: the RESULT line is inside a JSON string here,
  // so scanning the raw stream finds no verdict and everything would come back REVIEW.
  assert.equal(classify(raw).verdict, "REVIEW");

  const prose = replay("claude-stream.jsonl", parseClaudeEvent)
    .map((m) => m.text)
    .join("\n\n");
  assert.equal(classify(prose).verdict, "DONE");
});

test("activity is read from tool calls, so a silent run still reports movement", () => {
  // The MT-260 run went 43 assistant turns with zero text blocks. The conversation was
  // legitimately empty; only tool calls proved it was alive.
  const events = replay("claude-stream.jsonl", parseClaudeEvent);
  assert.equal(events.length, 1); // prose exists in the fixture

  assert.equal(
    parseClaudeActivity({
      type: "assistant",
      message: { content: [{ type: "tool_use", name: "Read" }] },
    }),
    "Read"
  );
  // Text-only turns are not activity; they are conversation.
  assert.equal(
    parseClaudeActivity({
      type: "assistant",
      message: { content: [{ type: "text", text: "hi" }] },
    }),
    null
  );
  assert.equal(parseClaudeActivity({ type: "system", subtype: "init" }), null);
  assert.equal(parseCodexActivity({ msg: { type: "exec_command_begin" } }), "Shell");
  assert.equal(parseCodexActivity({ item: { type: "file_change" } }), "Edit");
  assert.equal(parseCodexActivity({ type: "token_count" }), null);
});

test("only the marked comment block reaches Jira, never the working narration", () => {
  // This is the shape that actually got posted to MT-260: process narration stapled in
  // front of the real content, with markdown that Jira renders as literal punctuation.
  const prose = [
    "Now the follow-up email draft that has been sitting with placeholders:",
    "Now the mandatory CHANGELOG row:",
    "COMMENT:",
    "The remaining work is the leadership confirmation in **MT-365**.",
    "",
    "Wrote `core/deliverables/sheet.md` with the ranked picks.",
    "END COMMENT",
    "RESULT: REVIEW Built the confirmation sheet.",
  ].join("\n");

  const comment = extractComment(prose);
  assert.ok(comment, "a marked block must be found");
  assert.ok(!comment.includes("Now the follow-up email"), "narration must not survive");
  assert.ok(!comment.includes("Now the mandatory CHANGELOG"), "narration must not survive");
  assert.ok(!comment.includes("RESULT:"), "the verdict line must not survive");
  assert.ok(!comment.includes("**"), "markdown bold must be stripped");
  assert.ok(!comment.includes("`"), "code ticks must be stripped");
  assert.ok(comment.includes("MT-365"), "real content is kept");
  assert.ok(comment.includes("core/deliverables/sheet.md"), "paths are kept");
});

test("no comment block means the fallback is used, never the raw stream", () => {
  assert.equal(extractComment("I did some work.\nRESULT: DONE Finished."), null);
  assert.equal(extractComment(""), null);
});

test("dashes Steve never uses are removed from the published comment", () => {
  const comment = extractComment("COMMENT:\nThe sheet is ready — it needs review.\nEND COMMENT");
  assert.ok(!comment.includes("—"));
  assert.ok(!comment.includes("–"));
});
