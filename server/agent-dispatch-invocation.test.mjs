// How a dispatched agent receives its instructions.
//
// This is the third place the same defect turned up on 2026-08-17/18, so it
// gets a test of its own. Passing the prompt as an "@file" argument fails two
// different ways on this machine: the run directory is a backslash Windows
// path, which the CLI does not resolve (the model then answers the session's
// startup context instead of the prompt), and when it DOES resolve, a current
// model treats instructions living in file data as an injection attempt and
// refuses to act on them. Either way a run can write status, comments and
// worklogs onto a live Jira issue while having done nothing that was asked.
//
// The prompt therefore travels on stdin, where it is the turn itself.

import assert from "node:assert/strict";
import { test } from "node:test";
import { AGENT_INVOCATIONS } from "./agent-dispatch.mjs";

test("no dispatched agent takes its prompt as a file argument", () => {
  for (const [name, config] of Object.entries(AGENT_INVOCATIONS)) {
    const args = config.args();
    for (const arg of args) {
      assert.ok(
        !String(arg).includes("@"),
        `${name} still references the prompt as a file argument: ${arg}`
      );
    }
  }
});

test("every agent is spawned with a writable stdin", () => {
  for (const [name, config] of Object.entries(AGENT_INVOCATIONS)) {
    assert.equal(config.stdio?.[0], "pipe", `${name} cannot receive a prompt on stdin`);
  }
});

test("the pinned model and structured output survive", () => {
  const claude = AGENT_INVOCATIONS.claude.args();
  assert.ok(claude.includes("-p"));
  assert.ok(claude.includes("opus"), "the model stays pinned, never inherited");
  assert.ok(claude.includes("stream-json"), "structured events make the transcript readable");

  const codex = AGENT_INVOCATIONS.codex.args();
  assert.equal(codex[0], "exec");
  assert.ok(codex.includes("--json"));
  assert.ok(
    codex.includes("gpt-5.6-sol"),
    "pinned so ambient config cannot point it at a dead local endpoint"
  );
});
