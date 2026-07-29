import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { classify, parseClaudeEvent, parseCodexEvent } from "./agent-dispatch.mjs";

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
