import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildBriefing } from "./briefing.mjs";
import { loadRun } from "./ledger.mjs";
import { buildNarrationPrompt, narrateRun } from "./narration.mjs";

const TODAY = "2026-08-18";

function fixtureSnapshot() {
  return {
    capturedAt: "2026-08-18T12:00:00Z",
    sources: {
      jira: { status: "ok", observedAt: "2026-08-18T12:00:00Z" },
      reconciliation: {
        status: "partial",
        observedAt: "2026-08-15T09:00:00Z",
        detail: "3 days old",
      },
    },
    jira: {
      fetchedAt: "2026-08-18T12:00:00Z",
      issues: [
        {
          key: "MT-1",
          summary: "Overdue architecture recommendation",
          dueDate: "2026-08-17",
          status: { name: "In Progress", category: "indeterminate" },
          priority: { name: "Priority 2" },
          originalEstimateSeconds: 3600,
          updated: "2026-08-18T09:00:00Z",
        },
        {
          key: "MT-2",
          summary: "Ownership list with no estimate yet",
          dueDate: "2026-08-19",
          status: { name: "To Do", category: "new" },
          priority: { name: "Priority 3" },
          originalEstimateSeconds: null,
          updated: "2026-08-16T09:00:00Z",
        },
      ],
    },
    agentBoard: { lanes: [{ id: "waiting", cards: [{}] }] },
  };
}

// The await inside the try is the whole point: an async test body must hold
// the state-dir override until it RESOLVES, not until its first suspension.
// Returning the bare promise released the override mid-test and leaked reads
// and writes into the real %LOCALAPPDATA% foreman dir.
async function withTempStateDir(run) {
  const dir = mkdtempSync(join(tmpdir(), "foreman-narration-"));
  const previous = process.env.FOREMAN_STATE_DIR;
  process.env.FOREMAN_STATE_DIR = dir;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.FOREMAN_STATE_DIR;
    else process.env.FOREMAN_STATE_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

const GOOD_DRAFT = JSON.stringify({
  arrival: "Two things need you and one of them is already late.",
  orientation:
    "Yesterday closed clean, reconciliation is running stale, and one item changed today.",
  changes: { "MT-1": "The overdue recommendation changed status this morning." },
  items: {
    "MT-1": { whyNow: "It was due yesterday and the workshop depends on it." },
    "MT-2": { whyNow: "It cannot be planned until it has a ballpark." },
  },
  clear: "Answer the two and the rest keeps running without you.",
});

test("the prompt carries the evidence, the no-dash rule, and the banned words", () =>
  withTempStateDir(() => {
    const run = buildBriefing({ snapshot: fixtureSnapshot(), today: TODAY });
    const prompt = buildNarrationPrompt(run);
    assert.ok(prompt.includes("MT-1"), "item ids are the evidence");
    assert.ok(prompt.includes("Overdue architecture recommendation"));
    assert.ok(/em dash/i.test(prompt), "the dash rule is stated");
    assert.ok(prompt.includes("gate"), "the banned-word list is stated");
    assert.ok(/JSON/i.test(prompt), "the output shape is demanded");
  }));

test("a valid draft attaches narration, persists it, and marks the run ok", () =>
  withTempStateDir(async () => {
    buildBriefing({ snapshot: fixtureSnapshot(), today: TODAY });
    let calls = 0;
    const run = await narrateRun({
      today: TODAY,
      draft: async () => {
        calls += 1;
        return "```json\n" + GOOD_DRAFT + "\n```";
      },
    });
    assert.equal(run.narrationStatus, "ok");
    assert.equal(run.narration.arrival, "Two things need you and one of them is already late.");
    assert.equal(
      run.narration.items["MT-2"].whyNow,
      "It cannot be planned until it has a ballpark."
    );
    assert.equal(calls, 1);
    const reloaded = loadRun(TODAY);
    assert.equal(reloaded.narrationStatus, "ok", "narration survives a reload");
  }));

test("check 3: a drafter failure yields the un-narrated run with no placeholder prose", () =>
  withTempStateDir(async () => {
    buildBriefing({ snapshot: fixtureSnapshot(), today: TODAY });
    const run = await narrateRun({
      today: TODAY,
      draft: async () => {
        throw new Error("model unavailable");
      },
    });
    assert.equal(run.narrationStatus, "failed");
    assert.equal(run.narration, undefined, "no narration object exists after a failure");
    const serialized = JSON.stringify(loadRun(TODAY));
    for (const placeholder of ["TBD", "Lorem", "placeholder", "As an AI", "Here is"]) {
      assert.ok(!serialized.includes(placeholder), `no canned text: ${placeholder}`);
    }
  }));

test("check 3: a non-JSON draft fails closed the same way", () =>
  withTempStateDir(async () => {
    buildBriefing({ snapshot: fixtureSnapshot(), today: TODAY });
    const run = await narrateRun({
      today: TODAY,
      draft: async () => "Good morning! Here is your briefing.",
    });
    assert.equal(run.narrationStatus, "failed");
    assert.equal(run.narration, undefined);
  }));

test("a draft that breaks the voice rules is rejected, not cleaned up", () =>
  withTempStateDir(async () => {
    buildBriefing({ snapshot: fixtureSnapshot(), today: TODAY });
    const bad = JSON.stringify({
      arrival: "We leverage the gating items to streamline your morning.",
      orientation: "",
      changes: {},
      items: {},
      clear: "",
    });
    const run = await narrateRun({ today: TODAY, draft: async () => bad });
    assert.equal(run.narrationStatus, "failed");
    assert.match(run.narrationError, /voice/i);
    assert.equal(run.narration, undefined);
  }));

test("unknown item keys are dropped and the drop is recorded", () =>
  withTempStateDir(async () => {
    buildBriefing({ snapshot: fixtureSnapshot(), today: TODAY });
    const draft = JSON.stringify({
      arrival: "Two things need you.",
      orientation: "The signals are quiet.",
      changes: {},
      items: {
        "MT-1": { whyNow: "It was due yesterday." },
        "MT-999": { whyNow: "This item does not exist in the run." },
      },
      clear: "Go work.",
    });
    const run = await narrateRun({ today: TODAY, draft: async () => draft });
    assert.equal(run.narrationStatus, "ok");
    assert.ok(run.narration.items["MT-1"]);
    assert.equal(run.narration.items["MT-999"], undefined);
    assert.deepEqual(run.narrationDrops, ["MT-999"]);
  }));

test("narration never clobbers an answer written while the draft was running", () =>
  withTempStateDir(async () => {
    const { answerItem } = await import("./briefing.mjs");
    buildBriefing({ snapshot: fixtureSnapshot(), today: TODAY });
    let releaseDraft;
    const drafting = new Promise((resolve) => {
      releaseDraft = resolve;
    });
    const pending = narrateRun({
      today: TODAY,
      draft: async () => {
        await drafting;
        return GOOD_DRAFT;
      },
    });
    // An answer lands while the model is still writing.
    answerItem({ today: TODAY, itemId: "MT-1", verb: "done" });
    releaseDraft();
    const run = await pending;
    assert.equal(run.narrationStatus, "ok");
    const answered = run.items.find((item) => item.id === "MT-1");
    assert.equal(answered.answer?.verb, "done", "the mid-draft answer survives the narration save");
    assert.equal(run.receipts.length, 1, "the receipt survives too");
  }));

test("narration is single-flight per day: a second call never re-drafts", () =>
  withTempStateDir(async () => {
    buildBriefing({ snapshot: fixtureSnapshot(), today: TODAY });
    let calls = 0;
    const draft = async () => {
      calls += 1;
      return GOOD_DRAFT;
    };
    await narrateRun({ today: TODAY, draft });
    const second = await narrateRun({ today: TODAY, draft });
    assert.equal(calls, 1, "the drafter ran once");
    assert.equal(second.narrationStatus, "ok");
  }));
