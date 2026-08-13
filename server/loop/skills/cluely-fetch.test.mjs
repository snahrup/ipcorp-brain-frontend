import assert from "node:assert/strict";
import test from "node:test";
import { parseCluelyDomText } from "./cluely-fetch.mjs";

// The parser is the failable heart of the fetch: the DOM text arrives as
// speaker / timestamp / utterance triplets buried in UI chrome, and the
// output must be raw capture format the cleanup pipeline recognizes.

const domText = [
  "Search or ask anything...",
  "Command Palette",
  "Yesterday at 3:41 PM",
  "Follow-up email",
  "Summary",
  "Transcript",
  "Usage",
  "Copy transcript",
  "Steve",
  "0:01",
  "That's what I was thinking.",
  "Them",
  "0:02",
  "I'm thinking two, so.",
  "Them",
  "0:04",
  "See if you can just tell AI to add and give it",
  "a list of the accomplishments.",
  "Steve",
  "0:20",
  "I was,",
  "Them",
  "11:15",
  "Thank you.",
  "Resume Session",
].join("\n");

test("DOM text parses to raw capture lines with continuations merged", () => {
  const capture = parseCluelyDomText(domText);
  const lines = capture.split("\n");
  assert.equal(lines[0], "Me [0:01] That's what I was thinking.");
  assert.equal(lines[1], "Them [0:02] I'm thinking two, so.");
  assert.equal(
    lines[2],
    "Them [0:04] See if you can just tell AI to add and give it a list of the accomplishments.",
    "wrapped utterance lines merge into the turn above"
  );
  assert.equal(lines[3], "Me [0:20] I was,");
  assert.match(lines[4], /^Them \[11:15\] Thank you\.$/);
  assert.doesNotMatch(capture, /Resume Session|Copy transcript|Command Palette/);
});

test("chrome-only text with no transcript parses to empty, never junk", () => {
  assert.equal(parseCluelyDomText("Search or ask anything...\nCommand Palette"), "");
});
