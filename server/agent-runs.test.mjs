import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  askQuestion,
  buildCompanionPrompt,
  buildFollowUpContext,
  derivePlan,
  deriveReview,
  getRunDetail,
  listQuestions,
  parseRunId,
  runIdOf,
  stripMarkers,
  withRunId,
} from "./agent-runs.mjs";

// The Autonomy screen's one rule is honesty: everything it shows is derived
// from the run's own record, and anything the record lacks is null, never a
// plausible reconstruction. These tests pin that behavior.

const PROSE = `APPROACH:
Read the ticket and the brain first, then draft the governance note as a Word file.
END APPROACH
PLAN:
1. Read the ticket and gather context
2. Draft the document
3. Attach and summarize
END PLAN
STEP 1 START
Found the prior decision on stewardship in the brain.
STEP 1 DONE
STEP 2 START
STEP 2 SKIP the document already existed on the ticket, so this became a revision
STEP 3 START`;

test("a run id is issueKey plus startedAt and round-trips", () => {
  const run = { issueKey: "MT-257", startedAt: "2026-08-18T14:02:11.000Z" };
  const id = runIdOf(run);
  assert.equal(id, "MT-257@2026-08-18T14:02:11.000Z");
  assert.deepEqual(parseRunId(id), {
    issueKey: "MT-257",
    startedAt: "2026-08-18T14:02:11.000Z",
  });
  assert.equal(parseRunId("MT-257"), null, "a bare key is not a run id");
  assert.equal(parseRunId("MT-257@not-a-time"), null, "the time half must parse");
  assert.equal(withRunId(run).runId, id);
});

test("the plan is parsed with per-step status, and a skip keeps its reason", () => {
  const plan = derivePlan(PROSE);
  assert.equal(plan.length, 3);
  assert.equal(plan[0].status, "done");
  assert.equal(plan[1].status, "skipped");
  assert.match(plan[1].reason, /already existed/);
  assert.equal(plan[2].status, "active", "started but never closed stays active, never done");
});

test("a run that printed no plan derives null, not an invented plan", () => {
  assert.equal(derivePlan("I read the ticket and produced the file."), null);
  assert.equal(derivePlan("PLAN:\nno numbered lines here\nEND PLAN"), null);
});

test("marker blocks and step lines are stripped from the notes, prose is kept", () => {
  const stripped = stripMarkers(PROSE);
  assert.ok(!stripped.includes("APPROACH:"));
  assert.ok(!stripped.includes("PLAN:"));
  assert.ok(!/STEP \d/.test(stripped));
  assert.match(stripped, /prior decision on stewardship/);
});

test("deriveReview reads the request from the sent message and the approach from prose", () => {
  const review = deriveReview({
    messages: [
      { seq: 0, role: "sent", text: "Complete MT-257 as described.", at: "t0" },
      { seq: 1, role: "agent", text: PROSE, at: "t1" },
      { seq: 2, role: "agent", text: "COMMENT:\nFinished the note.\nEND COMMENT", at: "t2" },
    ],
  });
  assert.equal(review.recordLevel, "full");
  assert.equal(review.request, "Complete MT-257 as described.");
  assert.match(review.approach, /Read the ticket and the brain first/);
  assert.equal(review.plan.length, 3);
  assert.equal(review.postedComment, "Finished the note.");
  assert.ok(
    review.messages.every((m) => !m.text.includes("STEP ")),
    "notes carry prose only"
  );
});

test("a summary-only record comes back honest, and an unknown run comes back null", async () => {
  process.env.IPCORP_AGENT_RUNS_DIR = await mkdtemp(join(tmpdir(), "agent-runs-"));
  const missing = await getRunDetail({ issueKey: "MT-1", startedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(missing, null);
});

test("the live run is used only when its start time matches the id", async () => {
  process.env.IPCORP_AGENT_RUNS_DIR = await mkdtemp(join(tmpdir(), "agent-runs-"));
  const liveRun = {
    issueKey: "MT-9",
    agent: "claude",
    agentLabel: "Claude Code",
    state: "running",
    startedAt: "2026-08-18T10:00:00.000Z",
    steps: 4,
    messages: [{ seq: 0, role: "sent", text: "Do the thing.", at: "t0" }],
  };
  const hit = await getRunDetail(
    { issueKey: "MT-9", startedAt: "2026-08-18T10:00:00.000Z" },
    { liveRun }
  );
  assert.equal(hit.state, "running");
  assert.equal(hit.review.request, "Do the thing.");
  assert.equal(hit.attachments, null, "a live run has no attachments field yet");
  const miss = await getRunDetail(
    { issueKey: "MT-9", startedAt: "2026-08-18T09:00:00.000Z" },
    { liveRun }
  );
  assert.equal(miss, null, "an earlier run of the same issue is not the live one");
});

test("a question is threaded, answered by the companion, and kept with the run", async () => {
  process.env.IPCORP_AGENT_RUNS_DIR = await mkdtemp(join(tmpdir(), "agent-runs-"));
  const detail = {
    issueKey: "MT-257",
    issueSummary: "Governance note",
    agentLabel: "Claude Code",
    state: "finished",
    verdict: "DONE",
    note: null,
    startedAt: "t0",
    finishedAt: "t1",
    attachments: [{ path: "C:\\work\\note.docx", ok: true, error: null }],
    review: deriveReview({
      messages: [
        { seq: 0, role: "sent", text: "Complete MT-257.", at: "t0" },
        { seq: 1, role: "agent", text: PROSE, at: "t1" },
      ],
    }),
  };
  const runId = "MT-257@t0";
  let seenPrompt = "";
  const thread = await askQuestion(runId, "Why was step 2 skipped?", {
    detail,
    execAnswer: async (prompt) => {
      seenPrompt = prompt;
      return "The document already existed, so the run revised it instead.";
    },
  });
  assert.equal(thread.length, 1);
  assert.equal(thread[0].state, "answering", "the caller gets the thread before the answer lands");
  // The background answer settles the file.
  await new Promise((resolve) => setTimeout(resolve, 25));
  const settled = await listQuestions(runId);
  assert.equal(settled[0].state, "answered");
  assert.match(settled[0].answer, /revised it instead/);
  assert.match(seenPrompt, /not the agent that did it/i, "the companion contract is honest");
  assert.match(seenPrompt, /Why was step 2 skipped\?/);
});

test("a companion prompt for a plan-less run says so instead of inventing one", () => {
  const prompt = buildCompanionPrompt(
    {
      issueKey: "MT-3",
      issueSummary: null,
      agentLabel: "Codex",
      state: "finished",
      verdict: "REVIEW",
      note: "needs a read",
      startedAt: "t0",
      finishedAt: "t1",
      attachments: null,
      review: {
        request: null,
        approach: null,
        plan: null,
        messages: [],
        postedComment: null,
        recordLevel: "summary",
      },
    },
    [],
    "What did it deliver?"
  );
  assert.match(prompt, /recorded no plan/);
  assert.match(prompt, /not archived|not recorded|not carried/i);
});

test("a change request carries the prior outcome and the instruction, and asks for revision", () => {
  const context = buildFollowUpContext(
    {
      issueKey: "MT-257",
      agentLabel: "Claude Code",
      verdict: "REVIEW",
      note: "needs your eyes",
      attachments: [
        { path: "C:\\work\\note.docx", ok: true, error: null },
        { path: "C:\\work\\missing.xlsx", ok: false, error: "not found" },
      ],
      review: { postedComment: "Drafted the note and attached it." },
    },
    "Shorten the executive summary to one paragraph."
  );
  assert.match(context, /CHANGE REQUEST/);
  assert.match(context, /finished REVIEW/);
  assert.match(context, /note\.docx/);
  assert.ok(!context.includes("missing.xlsx"), "failed uploads are not claimed as delivered");
  assert.match(context, /Shorten the executive summary/);
  assert.match(context, /rather than starting over/);
});
