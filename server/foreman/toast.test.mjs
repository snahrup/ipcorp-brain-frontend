import assert from "node:assert/strict";
import { test } from "node:test";
import { buildToastCommand, raiseToast } from "./toast.mjs";

test("the toast command carries the protocol deep link and both text lines", () => {
  const { command, args } = buildToastCommand({
    title: "Patrick Stiller · Weekly 1:1",
    line: "2:00 PM · starts in 30 minutes · prep is ready",
    url: "http://127.0.0.1:5217/briefing/meeting/abc-123",
  });
  assert.equal(command, "powershell");
  const script = args.join(" ");
  assert.ok(script.includes('activationType="protocol"'));
  assert.ok(script.includes("http://127.0.0.1:5217/briefing/meeting/abc-123"));
  assert.ok(script.includes("Weekly 1:1"));
  assert.ok(script.includes("starts in 30 minutes"));
});

test("titles with quotes and ampersands cannot break out of the script", () => {
  const { args } = buildToastCommand({
    title: "O'Brien Q&A <review>",
    line: "It's at 3",
    url: "http://127.0.0.1:5217/briefing/meeting/x",
  });
  const script = args.join(" ");
  assert.ok(script.includes("O''Brien"), "single quotes are doubled for PowerShell");
  assert.ok(script.includes("&amp;"), "ampersands are XML-escaped");
  assert.ok(script.includes("&lt;review&gt;"), "angle brackets are XML-escaped");
  assert.ok(!script.includes("<review>"), "raw angle brackets never reach the XML");
});

test("raiseToast hands the built command to spawn without a shell", () => {
  const calls = [];
  raiseToast(
    { title: "T", line: "L", url: "http://127.0.0.1:5217/briefing" },
    {
      spawner: (command, args, options) => {
        calls.push({ command, args, options });
        return { on: () => {}, unref: () => {} };
      },
    }
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "powershell");
  assert.equal(calls[0].options.shell, undefined, "no shell interpolation");
  assert.equal(calls[0].options.windowsHide, true);
});
