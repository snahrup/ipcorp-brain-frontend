import assert from "node:assert/strict";
import test from "node:test";
import {
  artifactsOf,
  buildReadoutPrompt,
  evidenceOf,
  isUsable,
  parseModelJson,
  planOutcome,
  quoteIsGrounded,
  ReadoutError,
  SECTIONS_BY_VERDICT,
  ticketFromRequest,
  verifyReadout,
} from "./agent-readout.mjs";

const REQUEST = `You are completing a real work item for Steve Nahrup on the IP Corporation
Fabric and MDM engagement. Work in the architecture brain at "C:\\brain" unless told otherwise.

JIRA ISSUE MT-462
Summary : Write the governance and access process documentation
Status  : In Review

DESCRIPTION
Patrick asked for this directly and Michael Kenney owns the Azure subscription.

BEFORE THE WORK, STATE YOUR PLAN
Print these two blocks before your first tool call.`;

const DETAIL = {
  verdict: "BLOCKED",
  note: "The resource group naming convention was never settled.",
  attachments: [
    { path: "C:\\brain\\docs\\access-process.md", ok: true, error: null },
    { path: "C:\\brain\\docs\\draft-email.md", ok: false, error: "attach failed" },
  ],
  review: {
    request: REQUEST,
    approach: "Read the prior sessions, then write the grant and revoke paths.",
    plan: [
      { text: "Read the prior sessions", status: "done" },
      { text: "Write the grant path", status: "done" },
      { text: "Name every resource group", status: "failed", note: "naming was never settled" },
      { text: "Send it to the infrastructure team", status: "unfinished" },
    ],
    messages: [
      {
        text: "The naming convention was left open on the 7th call, so the groups cannot be named yet.",
      },
      { text: "Michael Kenney owns the Azure subscription and has to approve the upgrade." },
    ],
    postedComment: "Wrote the grant and revoke paths. The group names wait on the naming decision.",
  },
};

const never = () => false;

test("the ticket is cut out of the instruction, without the standing scaffolding", () => {
  const ticket = ticketFromRequest(REQUEST);
  assert.ok(ticket.startsWith("JIRA ISSUE MT-462"));
  assert.ok(ticket.includes("Patrick asked for this directly"));
  assert.ok(!ticket.includes("BEFORE THE WORK"), "standing instructions are not the ticket");
  assert.ok(!ticket.includes("You are completing a real work item"));
});

test("a run with no recorded ticket says so rather than guessing", () => {
  assert.equal(ticketFromRequest("just some prose"), null);
  assert.equal(ticketFromRequest(null), null);
});

test("the plan outcome counts a started step that never reported an ending", () => {
  const outcome = planOutcome(DETAIL.review.plan);
  assert.deepEqual(outcome.counts, { done: 2, failed: 1, skipped: 0, unfinished: 1, total: 4 });
  assert.equal(outcome.failures[0].note, "naming was never settled");
});

test("the prompt asks for the sections that match how the run ended", () => {
  const blocked = buildReadoutPrompt(DETAIL);
  assert.ok(blocked.includes("whatBlockedIt"));
  assert.ok(blocked.includes("whatSteveMustDo"));
  assert.ok(!blocked.includes("- whatToKnow"), "a blocked run is not briefing material");

  const done = buildReadoutPrompt({ ...DETAIL, verdict: "DONE" });
  assert.ok(done.includes("whatToKnow"));
  assert.ok(done.includes("anomalies"));
  assert.ok(!done.includes("whatBlockedIt"));
});

test("the prompt carries the real evidence and the recorded file names", () => {
  const prompt = buildReadoutPrompt(DETAIL);
  assert.ok(prompt.includes("The naming convention was left open on the 7th call"));
  assert.ok(prompt.includes("access-process.md"));
  assert.ok(prompt.includes("2 done, 1 failed"));
});

test("the prompt states the voice rules it must not break", () => {
  const prompt = buildReadoutPrompt(DETAIL);
  assert.ok(prompt.includes('Never write "Pat"'));
  assert.ok(prompt.includes("No em dashes"));
});

test("a quote is grounded only when the words are really in the record", () => {
  const evidence = evidenceOf(DETAIL);
  assert.equal(
    quoteIsGrounded("The naming convention was left open on the 7th call", evidence),
    true
  );
  // Re-wrapped and re-cased is the same quote.
  assert.equal(
    quoteIsGrounded("the   NAMING convention was left\nopen on the 7th call", evidence),
    true
  );
  // Plausible, and not in the record.
  assert.equal(
    quoteIsGrounded("The naming convention was agreed on the 9th call", evidence),
    false
  );
  // Too short to mean anything.
  assert.equal(quoteIsGrounded("the naming", evidence), false);
});

test("an entry whose quote is not in the record is dropped, and the drop is reported", () => {
  const result = verifyReadout({
    parsed: {
      whatHappened: { text: "It wrote the grant path.", quote: "Wrote the grant and revoke paths" },
      whatBlockedIt: {
        text: "The naming decision.",
        quote: "The naming convention was left open on the 7th call",
      },
      whatSteveMustDo: {
        text: "Approve the budget with finance.",
        quote: "Finance signed off on the budget last week",
      },
    },
    detail: DETAIL,
    isBanned: never,
  });
  assert.equal(result.sections.whatHappened.text, "It wrote the grant path.");
  assert.equal(result.sections.whatBlockedIt.text, "The naming decision.");
  assert.equal(result.sections.whatSteveMustDo, undefined, "the invented one is gone");
  assert.equal(result.dropped.length, 1);
  assert.equal(result.dropped[0].section, "whatSteveMustDo");
  assert.ok(result.dropped[0].reason.includes("not in the run record"));
});

test("wording that breaks a voice rule is dropped even when its quote is real", () => {
  const result = verifyReadout({
    parsed: {
      whatHappened: {
        text: "We should leverage the existing groups.",
        quote: "Wrote the grant and revoke paths",
      },
    },
    detail: DETAIL,
    isBanned: (text) => /leverage/i.test(text),
  });
  assert.equal(result.sections.whatHappened, undefined);
  assert.equal(result.dropped[0].reason, "the wording broke a voice rule");
});

test("list sections keep only their grounded entries", () => {
  const result = verifyReadout({
    parsed: {
      whatHappened: { text: "It wrote the paths.", quote: "Wrote the grant and revoke paths" },
      whatBlockedIt: {
        text: "Naming.",
        quote: "The naming convention was left open on the 7th call",
      },
      peopleInvolved: [
        {
          text: "Michael Kenney, because he owns the subscription.",
          quote: "Michael Kenney owns the Azure subscription and has to approve",
        },
        { text: "Robin, who signed it off.", quote: "Robin approved the document on Tuesday" },
      ],
    },
    detail: DETAIL,
    isBanned: never,
  });
  assert.equal(result.sections.peopleInvolved.length, 1);
  assert.ok(result.sections.peopleInvolved[0].text.startsWith("Michael Kenney"));
  assert.equal(result.dropped.filter((drop) => drop.section === "peopleInvolved").length, 1);
});

test("artifacts come from the record, so the model cannot add or lose a file", () => {
  const result = verifyReadout({
    parsed: {
      whatHappened: { text: "It wrote the paths.", quote: "Wrote the grant and revoke paths" },
      whatBlockedIt: {
        text: "Naming.",
        quote: "The naming convention was left open on the 7th call",
      },
      artifacts: [
        {
          text: "access-process.md, the operating document",
          quote: "Wrote the grant and revoke paths",
        },
        {
          text: "invented-extra.md, a file nobody made",
          quote: "Wrote the grant and revoke paths",
        },
      ],
    },
    detail: DETAIL,
    isBanned: never,
  });
  assert.equal(result.sections.artifacts.length, 2, "exactly the two recorded files");
  const names = result.sections.artifacts.map((file) => file.name);
  assert.deepEqual(names, ["access-process.md", "draft-email.md"]);
  assert.ok(result.sections.artifacts[0].text.includes("operating document"));
  // The one the model never described still appears, with no description rather than an
  // invented one, and its failure to attach is preserved.
  assert.equal(result.sections.artifacts[1].text, null);
  assert.equal(result.sections.artifacts[1].delivered, false);
  assert.equal(result.sections.artifacts[1].error, "attach failed");
});

test("a blocked run that lost its blocker is not usable", () => {
  const result = verifyReadout({
    parsed: {
      whatHappened: { text: "It wrote the paths.", quote: "Wrote the grant and revoke paths" },
      whatBlockedIt: { text: "Something.", quote: "a quote that was never written down here" },
    },
    detail: DETAIL,
    isBanned: never,
  });
  assert.equal(isUsable(result), false, "a blocked readout with no blocker misleads");
});

test("a readout that lost what happened is not usable whatever else survived", () => {
  const result = verifyReadout({
    parsed: {
      whatBlockedIt: {
        text: "Naming.",
        quote: "The naming convention was left open on the 7th call",
      },
    },
    detail: DETAIL,
    isBanned: never,
  });
  assert.equal(isUsable(result), false);
});

test("a complete readout is usable", () => {
  const result = verifyReadout({
    parsed: {
      whatHappened: { text: "It wrote the paths.", quote: "Wrote the grant and revoke paths" },
      whatBlockedIt: {
        text: "Naming.",
        quote: "The naming convention was left open on the 7th call",
      },
    },
    detail: DETAIL,
    isBanned: never,
  });
  assert.equal(isUsable(result), true);
});

test("the model's JSON is read out of fences or surrounding prose", () => {
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseModelJson('Here you go:\n{"a":2}\nHope that helps.'), { a: 2 });
  assert.throws(() => parseModelJson("no object at all"), ReadoutError);
  assert.throws(() => parseModelJson("{not valid}"), ReadoutError);
});

test("every verdict asks for what happened and what was delivered", () => {
  for (const sections of Object.values(SECTIONS_BY_VERDICT)) {
    assert.ok(sections.includes("whatHappened"));
    assert.ok(sections.includes("artifacts"));
  }
});

test("a run that delivered nothing reports an empty file list, not a missing one", () => {
  assert.deepEqual(artifactsOf({ attachments: [] }), []);
  assert.deepEqual(artifactsOf({}), []);
});
