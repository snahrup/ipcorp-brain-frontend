import assert from "node:assert/strict";
import test from "node:test";
import { violatesVoiceRules } from "./voice-writer.mjs";

test("clean Jira prose passes the voice rules", () => {
  assert.equal(
    violatesVoiceRules(
      "Patrick Stiller confirmed Chris Meier is the go-to for Azure permission changes."
    ),
    null
  );
});

test("the word brain is refused anywhere in Jira text", () => {
  // "Brain" is Steve's private name for his knowledge base. It means nothing
  // to anyone reading the board and it leaks that the text came from tooling.
  assert.equal(violatesVoiceRules("I stored the summary in the brain for reference."), "brain");
  assert.equal(violatesVoiceRules("The Brain has the full history."), "brain");
  // Compounds are fine: nobody banned brainstorming.
  assert.equal(violatesVoiceRules("We brainstormed the domain list on the call."), null);
});

test("internal storage paths are refused in Jira text", () => {
  // A deliverable gets attached to the issue or linked from the Team Library.
  // A repo-relative or local path means nothing to a Jira reader.
  assert.ok(violatesVoiceRules("The packet is at core/deliverables/kickoff-packet.html."));
  assert.ok(violatesVoiceRules("Summary saved under core/meetings/summaries/2026-08-11.md."));
  assert.ok(violatesVoiceRules("See ipcorp-architecture-brain for the decision record."));
  assert.ok(violatesVoiceRules("The file lives at C:\\Users\\snahrup\\Downloads\\report.xlsx."));
  assert.ok(violatesVoiceRules("PNG under natively/meeting-infographics/2026-08-11/."));
  // Ordinary workplace nouns stay legal.
  assert.equal(
    violatesVoiceRules("I am moving the packets off my OneDrive into the Team Library."),
    null
  );
});
