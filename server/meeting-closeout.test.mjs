import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import test from "node:test";
import {
  generateMeetingCloseoutVisual,
  inspectStoredMeetingPackage,
  listStoredPackages,
  listTodaysMeetings,
  listVerifiedMeetingInfographics,
  persistMeetingPackage as persistMeetingPackageReal,
  processMeetingCloseout as processMeetingCloseoutReal,
  resetTodayCalendarState,
  shouldRefreshSnapshot,
  synthesizeReviewPackage,
} from "./meeting-closeout.mjs";

const CODEX_IMAGE_FIXTURE = resolve("public", "brand", "ip-corporation-official.png");

function withCodexFixture(options = {}) {
  return {
    ...options,
    codexInfographicOptions: {
      fixtureImagePath: CODEX_IMAGE_FIXTURE,
      ...options.codexInfographicOptions,
    },
  };
}

function persistMeetingPackage(value, transcriptValue, source, options = {}) {
  return persistMeetingPackageReal(value, transcriptValue, source, withCodexFixture(options));
}

function processMeetingCloseout(payload, options = {}) {
  return processMeetingCloseoutReal(payload, withCodexFixture(options));
}

const meeting = {
  id: "meeting-closeout-test",
  title: "Fabric Delivery Review",
  start: "2026-08-04T14:00:00-04:00",
  end: "2026-08-04T14:30:00-04:00",
  organizer: "Patrick Stiller",
  attendees: ["Steve Nahrup", "Patrick Stiller", "Mike Spencer"],
};

const transcript = [
  "Steve: I will send the Fabric workbook to Patrick tomorrow.",
  "Steve: Please create a Jira ticket for the refresh work.",
  "Patrick: Update MT-42 with the source mapping.",
  "Steve: Email Mike with the recap.",
  "The recording recap and SharePoint document are at https://example.test/fabric-review.",
].join("\n");

async function prepareBrainRoot(root) {
  await mkdir(root, { recursive: true });
  await Promise.all([
    writeFile(
      join(root, "AGENTS.md"),
      "# Brain instructions\n\nRead INGESTION_PLAYBOOK.md before writing.\n",
      "utf8"
    ),
    writeFile(
      join(root, "INGESTION_PLAYBOOK.md"),
      "# Ingestion playbook\n\n## MANDATORY Brain CHANGELOG/MANIFEST rule\n",
      "utf8"
    ),
    writeFile(
      join(root, "CHANGELOG.md"),
      [
        "# CHANGELOG & MANIFEST",
        "",
        "## SECTION 1 - CHANGELOG",
        "",
        "| 2026-08-05 | 09:00 ET | Workbench | Existing file | Existing checked change. |",
        "",
        "## SECTION 2 - MANIFEST",
        "",
        "| 1 | staged.md | core/staged.md | **INSTALL** | Earlier staged file. |",
        "| 2 | notes.md | Stays outside Brain | **DO NOT INGEST** | Reference only. |",
        "",
        "### Processed manifest items",
        "- 2026-08-05 09:05 ET - Workbench - item #1 installed and checked.",
        "",
      ].join("\n"),
      "utf8"
    ),
  ]);
}

test("an empty live calendar is reported as no meetings today", async () => {
  const result = await listTodaysMeetings({
    date: "2026-08-04",
    preparedMeetings: [],
    fixture: { calendarAvailable: true, todayMeetings: [] },
  });

  assert.equal(result.availability, "empty");
  assert.equal(result.microsoft365Available, true);
  assert.equal(result.meetings.length, 0);
  assert.match(result.detail, /no meetings for today/i);
});

test("an unavailable calendar keeps a listed meeting processable", async () => {
  const result = await listTodaysMeetings({
    date: "2026-08-04",
    preparedMeetings: [],
    fixture: {
      calendarAvailable: false,
      todayMeetings: [meeting],
    },
  });

  assert.equal(result.availability, "unavailable");
  assert.equal(result.microsoft365Available, false);
  assert.equal(result.meetings[0].id, meeting.id);
});

test("a calendar query error is distinct from an unavailable connection", async () => {
  const result = await listTodaysMeetings({
    date: "2026-08-04",
    preparedMeetings: [meeting],
    fixture: {
      calendarAvailable: true,
      calendarError: "Calendar query returned 500",
      todayMeetings: [],
    },
  });

  assert.equal(result.availability, "error");
  assert.equal(result.microsoft365Available, false);
  assert.equal(result.meetings[0].id, meeting.id);
  assert.match(result.detail, /query failed/i);
});

function modelOutput(overrides = {}) {
  const value = {
    summary:
      "Patrick and Steve aligned on the next Fabric delivery steps, and Steve took the workbook follow-up and the MT-42 source mapping update.",
    commitments: [
      {
        text: "Send the Fabric workbook to Patrick Stiller.",
        evidence: "Steve: I will send the Fabric workbook to Patrick tomorrow.",
        due: "tomorrow",
      },
    ],
    jiraProposals: [
      {
        operation: "Update",
        jiraKey: "MT-42",
        title: "Update MT-42 with the source mapping",
        rationale: "Patrick asked for the source mapping on the existing item.",
        evidence: "Patrick: Update MT-42 with the source mapping.",
      },
    ],
    documentRequests: [
      {
        text: "Send Patrick Stiller the Fabric workbook.",
        owner: "Patrick Stiller",
        evidence: "Steve: I will send the Fabric workbook to Patrick tomorrow.",
      },
    ],
    reminderCandidates: [
      {
        text: "Send the Fabric workbook.",
        timing: "tomorrow",
        evidence: "Steve: I will send the Fabric workbook to Patrick tomorrow.",
      },
    ],
    supportingMaterial: [
      { label: "Fabric review page", reference: "https://example.test/fabric-review" },
    ],
    emailDrafts: [
      {
        to: "Mike Spencer",
        subject: "Fabric review recap",
        body: "Mike,\n\nRecap from the Fabric delivery review.\n\nSteve",
        evidence: "Steve: Email Mike with the recap.",
      },
    ],
    themes: ["Fabric delivery", "Source mapping"],
    notes: [],
    ...overrides,
  };
  return `PACKAGE:\n${JSON.stringify(value)}\nEND PACKAGE`;
}

const stubModel = async () => modelOutput();

function markerFor(value) {
  return `<!-- WORKBENCH_CLOSEOUT_JSON ${Buffer.from(JSON.stringify(value), "utf8").toString("base64")} -->`;
}

test("synthesis builds the package from model output with verified evidence", async () => {
  const value = await synthesizeReviewPackage(
    {
      meeting,
      transcript,
      contextNotes: "The source mapping is the supporting context.",
      recap: "The team aligned on the next Fabric delivery steps.",
      relatedMaterial: ["https://example.test/meeting-recording"],
    },
    stubModel
  );

  assert.equal(value.meeting.title, meeting.title);
  assert.equal(value.commitments.length, 1);
  assert.match(value.commitments[0].text, /Fabric workbook/);
  assert.equal(value.jiraProposals[0].jiraKey, "MT-42");
  assert.ok(
    value.supportingMaterial.some(
      (item) => item.reference === "https://example.test/meeting-recording"
    )
  );
  assert.equal(value.documentRequests.length, 1);
  assert.equal(value.reminderCandidates.length, 1);
  assert.equal(value.emailDrafts.length, 1);
  assert.deepEqual(value.infographic.themes, ["Fabric delivery", "Source mapping"]);
  assert.deepEqual(
    value.infographic.metrics.map((item) => item.value),
    [1, 1, 1, 1]
  );
  assert.equal(value.externalActions.emailSent, false);
  assert.equal(value.externalActions.jiraChanged, false);
});

test("synthesis drops items whose evidence is not verbatim in the transcript", async () => {
  const value = await synthesizeReviewPackage({ meeting, transcript }, async () =>
    modelOutput({
      commitments: [
        {
          text: "Send the Fabric workbook to Patrick Stiller.",
          evidence: "Steve: I will send the Fabric workbook to Patrick tomorrow.",
          due: "tomorrow",
        },
        {
          text: "A fabricated obligation.",
          evidence: "Steve: I promised something that was never said.",
          due: null,
        },
      ],
    })
  );

  assert.equal(value.commitments.length, 1);
  assert.match(value.commitments[0].text, /Fabric workbook/);
  assert.ok(value.synthesisNotes.some((note) => /1 commitment item dropped/.test(note)));
});

test("a mostly personal meeting produces an honest empty package", async () => {
  const value = await synthesizeReviewPackage({ meeting, transcript }, async () =>
    modelOutput({
      summary:
        "Most of this meeting was personal conversation. The only work item was a brief status check with nothing assigned.",
      commitments: [],
      jiraProposals: [],
      documentRequests: [],
      reminderCandidates: [],
      supportingMaterial: [],
      emailDrafts: [],
      themes: ["Status check"],
    })
  );

  assert.match(value.summary, /personal conversation/);
  assert.equal(value.commitments.length, 0);
  assert.equal(value.jiraProposals.length, 0);
  assert.equal(value.emailDrafts.length, 0);
  assert.deepEqual(
    value.infographic.metrics.map((item) => item.value),
    [0, 0, 0, 0]
  );
});

test("synthesis failure fails closed with no fallback package", async () => {
  const result = await processMeetingCloseout(
    { meeting },
    {
      fixture: { transcripts: { [meeting.id]: { transcript } } },
      runModel: async () => {
        throw new Error("The model is unreachable.");
      },
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "synthesis_unavailable");
  assert.equal(result.package, undefined);
  assert.match(result.detail, /stays unprocessed/);
});

test("unparseable synthesis output fails closed instead of guessing", async () => {
  await assert.rejects(
    synthesizeReviewPackage({ meeting, transcript }, async () => "I could not do that."),
    { code: "synthesis_unavailable" }
  );
});

test("missing Teams capture returns the pasted-transcript path", async () => {
  const result = await processMeetingCloseout(
    { meeting },
    {
      fixture: {
        calendarAvailable: true,
        todayMeetings: [meeting],
        transcripts: { [meeting.id]: null },
      },
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "transcript_unavailable");
  assert.equal(result.meeting.id, meeting.id);
});

test("a conversational bridge reply is not a Teams capture", async () => {
  const preamble = "I'll start by locating the meeting on your calendar.";
  const result = await processMeetingCloseout(
    { meeting },
    {
      fixture: {
        calendarAvailable: true,
        todayMeetings: [meeting],
        transcripts: { [meeting.id]: { transcript: preamble, recap: preamble } },
      },
      runModel: async () => {
        throw new Error("Synthesis must never run against a non-transcript.");
      },
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "transcript_unavailable");
});

test("a Copilot digest of the transcript never reaches synthesis", async (t) => {
  const suppliedRoot = await mkdtemp(join(tmpdir(), "meeting-closeout-abridged-"));
  const capturedRoot = await mkdtemp(join(tmpdir(), "meeting-closeout-abridged-captured-"));
  t.after(async () => {
    assert.ok(suppliedRoot.startsWith(tmpdir()));
    assert.ok(capturedRoot.startsWith(tmpdir()));
    await rm(suppliedRoot, { recursive: true, force: true });
    await rm(capturedRoot, { recursive: true, force: true });
  });
  const digest = [
    "[00:00:03] Robin Virginia: All right, Steve, do you want to start by going",
    "through the spreadsheet? Take it away. [00:02:46] Steve Nahrup: The overview",
    "is set up with pre-wave, like program pre-wave one... 1.1 is purview. So these",
    "are both in progress. [00:39:47] Robin Virginia: It has some real traction to",
    "it now. [00:40:34] Steve Nahrup: Yep, that's the objective... I'll send a",
    "follow up. (excerpt; full transcript available at source)",
  ].join(" ");
  const refuse = async () => {
    throw new Error("Synthesis must never run against an abridged transcript.");
  };

  const supplied = await processMeetingCloseout(
    { meeting, transcript: digest },
    { brainRoot: suppliedRoot, runModel: refuse }
  );
  assert.equal(supplied.ok, false);
  assert.equal(supplied.code, "transcript_abridged");

  const captured = await processMeetingCloseout(
    { meeting },
    {
      brainRoot: capturedRoot,
      runModel: refuse,
      fixture: { transcripts: { [meeting.id]: { transcript: digest } } },
    }
  );
  assert.equal(captured.ok, false);
  assert.equal(captured.code, "transcript_abridged");
});

test("a whole transcript that discusses an excerpt is still processed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-excerpt-word-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  await prepareBrainRoot(root);

  const result = await processMeetingCloseout(
    {
      meeting,
      transcript: `Patrick: Read the excerpt from the full transcript out loud.\n${transcript}`,
    },
    { brainRoot: root, runModel: stubModel }
  );

  assert.equal(result.ok, true, "the words alone are not a disclosure of abridgement");
});

test("a transcript covering three minutes of a thirty minute meeting is not the meeting", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-partial-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  await prepareBrainRoot(root);
  const slice = [
    "[00:20:29] Steve Nahrup: The Azure naming standard is written.",
    "[00:21:33] Patrick Stiller: Did you come up with a location?",
    "[00:22:43] Steve Nahrup: I can finish that today. I'll put those in Jira.",
    "[00:23:24] Patrick Stiller: Mike is taking that before the ELT tomorrow.",
  ].join("\n");

  const result = await processMeetingCloseout(
    { meeting, transcript: slice },
    {
      brainRoot: root,
      runModel: async () => {
        throw new Error("Synthesis must never run against three minutes of a meeting.");
      },
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "transcript_partial");
  assert.match(result.detail, /3 minutes of the 30 minute meeting/);
});

test("a short ad-hoc call is processed on its own length, not a stand-up's", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-adhoc-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  await prepareBrainRoot(root);

  const adhoc = {
    ...meeting,
    id: "meeting-adhoc",
    end: "2026-08-04T14:05:00-04:00",
  };
  const result = await processMeetingCloseout(
    {
      meeting: adhoc,
      transcript: `[00:00:12] ${transcript.split("\n").join("\n[00:02:40] ")}`,
    },
    { brainRoot: root, runModel: stubModel }
  );

  assert.equal(result.ok, true);
});

test("a Teams transcript handed in by reconciliation is filed as Teams", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-declared-source-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  await prepareBrainRoot(root);

  const result = await processMeetingCloseout(
    { meeting, transcript, transcriptSource: "teams" },
    { brainRoot: root, runModel: stubModel }
  );

  assert.equal(result.ok, true);
  assert.match(result.package.source, /Teams/);
  assert.match(result.package.files.transcript, /transcripts\/consolidated/);
  await readFile(
    join(
      root,
      "core",
      "meetings",
      "transcripts",
      "teams-export",
      "2026-08-04-fabric-delivery-review.md"
    ),
    "utf8"
  );
  await assert.rejects(
    readFile(
      join(
        root,
        "core",
        "meetings",
        "transcripts",
        "cluely-export",
        "2026-08-04-fabric-delivery-review.md"
      )
    ),
    undefined,
    "a Teams transcript is never filed as a Cluely capture"
  );
});

test("different transcript sources are consolidated before synthesis", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-consolidate-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  await prepareBrainRoot(root);
  await mkdir(join(root, "core", "meetings", "transcripts", "teams-export"), {
    recursive: true,
  });
  const teamsText = [
    "Steve: I will send the Fabric workbook to Patrick tomorrow.",
    "Patrick: Update MT-42 with the source mapping.",
  ].join("\n");
  const cluelyText = [
    "[00:01:00] Steve: Email Mike with the recap.",
    "[00:03:00] Mike: The support window starts Thursday.",
  ].join("\n");
  await writeFile(
    join(
      root,
      "core",
      "meetings",
      "transcripts",
      "teams-export",
      "2026-08-04-fabric-delivery-review.md"
    ),
    `# Fabric Delivery Review - 2026-08-04\n\n${teamsText}\n`,
    "utf8"
  );

  let consolidationCalls = 0;
  let synthesisSawBothSources = false;
  const runModel = async (prompt) => {
    if (prompt.includes("CONSOLIDATED:")) {
      consolidationCalls += 1;
      assert.match(prompt, /teams-export\/2026-08-04-fabric-delivery-review\.md/);
      assert.match(prompt, /cluely-export\/2026-08-04-fabric-delivery-review\.md/);
      assert.match(prompt, /Teams transcript as the stronger source/);
      assert.match(prompt, /source mapping/);
      assert.match(prompt, /support window starts Thursday/);
      return `CONSOLIDATED:
Steve: I will send the Fabric workbook to Patrick tomorrow.
Patrick: Update MT-42 with the source mapping.
Steve: Email Mike with the recap.
Mike: The support window starts Thursday.
END CONSOLIDATED`;
    }
    synthesisSawBothSources =
      prompt.includes("source mapping") && prompt.includes("support window starts Thursday");
    return modelOutput();
  };

  const result = await processMeetingCloseout(
    { meeting, transcript: cluelyText, transcriptSource: "cluely" },
    { brainRoot: root, runModel }
  );

  assert.equal(result.ok, true);
  assert.equal(consolidationCalls, 1);
  assert.equal(synthesisSawBothSources, true);
  assert.match(result.package.source, /Consolidated meeting context from 2 transcript sources/);
  assert.match(result.package.files.transcript, /core\/meetings\/transcripts\/consolidated/);
  assert.ok(result.package.files.transcriptSource1);
  assert.ok(result.package.files.transcriptSource2);

  const context = await readFile(join(root, result.package.files.transcript), "utf8");
  assert.match(context, /Source receipts/);
  assert.match(context, /sha256:/);
  assert.match(context, /support window starts Thursday/);
});

test("different same-named captures are preserved and rerun safely", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-versioned-source-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  await prepareBrainRoot(root);
  const folder = join(root, "core", "meetings", "transcripts", "cluely-export");
  await mkdir(folder, { recursive: true });
  const storedText = [
    "Steve: I will send the Fabric workbook to Patrick tomorrow.",
    "Patrick: Update MT-42 with the source mapping.",
  ].join("\n");
  const incomingText = [
    "Steve: Email Mike with the recap.",
    "Mike: The support window starts Thursday.",
  ].join("\n");
  const basePath = join(folder, "2026-08-04-fabric-delivery-review.md");
  await writeFile(basePath, `# Fabric Delivery Review - 2026-08-04\n\n${storedText}\n`, "utf8");

  const runModel = async (prompt) =>
    prompt.includes("CONSOLIDATED:")
      ? `CONSOLIDATED:\n${storedText}\n${incomingText}\nEND CONSOLIDATED`
      : modelOutput();
  const options = { brainRoot: root, runModel };
  const payload = { meeting, transcript: incomingText, transcriptSource: "cluely" };

  const first = await processMeetingCloseout(payload, options);
  const second = await processMeetingCloseout(payload, options);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  const versions = (await readdir(folder)).filter((name) =>
    name.startsWith("2026-08-04-fabric-delivery-review")
  );
  assert.equal(versions.length, 2);
  assert.match(await readFile(basePath, "utf8"), /source mapping/);
  const versionPath = join(
    folder,
    versions.find((name) => name !== basename(basePath))
  );
  assert.match(await readFile(versionPath, "utf8"), /support window starts Thursday/);
  const context = await readFile(join(root, second.package.files.transcript), "utf8");
  assert.equal(context.match(/sha256:/g)?.length, 2);
});

test("Teams capture carries recap and related material into the stored package", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-teams-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  await prepareBrainRoot(root);

  const result = await processMeetingCloseout(
    { meeting },
    {
      brainRoot: root,
      runModel: stubModel,
      fixture: {
        transcripts: {
          [meeting.id]: {
            transcript,
            recap: "The team aligned on the next Fabric delivery steps.",
            relatedMaterial: ["https://example.test/meeting-recording"],
          },
        },
      },
    }
  );

  assert.equal(result.ok, true);
  assert.match(result.package.source, /Teams/);
  assert.match(result.package.summary, /aligned on the next Fabric delivery steps/);
  assert.ok(
    result.package.supportingMaterial.some(
      (item) => item.reference === "https://example.test/meeting-recording"
    )
  );
  assert.equal(result.package.externalActions.emailSent, false);
  assert.equal(result.package.externalActions.jiraChanged, false);
});

test("pasted transcript writes an idempotent Brain package and lists it for Workbench", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-test-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  await prepareBrainRoot(root);

  const value = await synthesizeReviewPackage(
    { meeting, transcript, contextNotes: "Patrick Stiller asked for the workbook link." },
    stubModel
  );

  const first = await persistMeetingPackage(value, transcript, "cluely", { brainRoot: root });
  const second = await persistMeetingPackage(value, transcript, "cluely", { brainRoot: root });
  const outputFile = "Fabric Delivery Review [2026-08-04].png";
  const infographicDir = join(root, "natively", "meeting-infographics", first.id);
  const outputBytes = await readFile(join(root, first.files.infographicPng));
  const outputHash = createHash("sha256").update(outputBytes).digest("hex");
  await writeFile(join(infographicDir, outputFile), outputBytes);
  await writeFile(
    join(root, first.files.infographicStatus),
    `${JSON.stringify(
      {
        status: "GENERATED",
        meetingTitle: meeting.title,
        generatedAt: "2026-08-04T19:00:00.000Z",
        artifactId: "artifact-fabric-review",
        generator: { provider: "codex", imageModel: "gpt-image-2" },
        sourceIds: ["transcript-source", "summary-source"],
        output: { file: outputFile, sha256: outputHash },
        verification: "The PNG, both sources, and the artifact were read back.",
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  const verifiedStatusBefore = await readFile(join(root, first.files.infographicStatus), "utf8");
  let replacementRenderCalls = 0;
  const refreshed = await persistMeetingPackage(value, transcript, "cluely", {
    brainRoot: root,
    generateInfographic: async () => {
      replacementRenderCalls += 1;
      throw new Error("A verified infographic must not be rendered over.");
    },
  });
  const verifiedStatusAfter = await readFile(join(root, first.files.infographicStatus), "utf8");
  const completions = await listVerifiedMeetingInfographics({ brainRoot: root });
  const packages = await listStoredPackages({ brainRoot: root });

  assert.equal(first.id, second.id);
  assert.equal(replacementRenderCalls, 0);
  assert.equal(verifiedStatusAfter, verifiedStatusBefore);
  assert.equal(basename(refreshed.files.infographicPng), outputFile);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].artifactId, "artifact-fabric-review");
  assert.equal(completions[0].file, outputFile);
  assert.equal(packages.length, 1);
  assert.equal(packages[0].meeting.title, meeting.title);
  assert.equal(packages[0].infographic.verified.file, outputFile);
  assert.match(packages[0].source, /Cluely/);
  assert.equal(packages[0].externalActions.emailSent, false);
  assert.equal(packages[0].externalActions.jiraChanged, false);

  for (const storedPath of Object.values(first.files)) {
    const contents = await readFile(join(root, storedPath), "utf8");
    assert.ok(contents.length > 0);
  }

  const storedTranscript = await readFile(join(root, first.files.transcript), "utf8");
  assert.match(storedTranscript, /I will send the Fabric workbook/);
  const storedSummary = await readFile(join(root, first.files.summary), "utf8");
  assert.match(storedSummary, /Patrick Stiller asked for the workbook link/);

  const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /Workbench meeting closeout/);
  const processedLog = await readFile(join(root, "_intake", "processed.log"), "utf8");
  assert.match(processedLog, /meeting-closeout/);
});

test("a failed Codex generation stays pending without an HTML or PNG placeholder", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-no-placeholder-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  await prepareBrainRoot(root);

  const result = await processMeetingCloseout(
    { meeting, transcript },
    {
      brainRoot: root,
      runModel: stubModel,
      generateInfographic: async () => {
        throw new Error("Image service unavailable for this test.");
      },
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "meeting_package_incomplete");
  assert.deepEqual(result.inspection.missing, ["infographicPng"]);
  assert.equal(result.package.files.infographicPng, undefined);
  assert.equal(result.package.files.infographicHtml, undefined);
  const status = JSON.parse(
    await readFile(join(root, result.package.files.infographicStatus), "utf8")
  );
  assert.equal(status.status, "pending_generation");
  assert.equal(status.requestedProvider, "codex");
  assert.equal(status.alternateProvider, "notebooklm");
  assert.equal(status.attemptHistory.length, 1);
  assert.equal(status.attemptHistory[0].outcome, "failed");
  const visualFiles = await readdir(
    join(root, "natively", "meeting-infographics", result.package.id)
  );
  assert.deepEqual(visualFiles, ["status.json"]);
});

test("visual generation and association can resume after the package is stored", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-staged-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  await prepareBrainRoot(root);
  const value = await synthesizeReviewPackage({ meeting, transcript }, stubModel);

  const pending = await persistMeetingPackageReal(value, transcript, "cluely", {
    brainRoot: root,
    deferInfographic: true,
  });
  const pendingInspection = await inspectStoredMeetingPackage(pending, { brainRoot: root });
  assert.equal(pendingInspection.complete, false);
  assert.deepEqual(pendingInspection.missing, ["infographicPng"]);

  const generated = await generateMeetingCloseoutVisual(
    value,
    { text: transcript },
    withCodexFixture({ brainRoot: root, throwOnInfographicFailure: true })
  );
  assert.ok(generated.visual?.sha256);

  const associated = await persistMeetingPackageReal(value, transcript, "cluely", {
    brainRoot: root,
    visual: generated.visual,
  });
  const inspection = await inspectStoredMeetingPackage(associated, { brainRoot: root });
  assert.equal(inspection.complete, true);
  assert.equal(inspection.associated, true);
  assert.equal(inspection.visual.sha256, generated.visual.sha256);
  const visualStatus = JSON.parse(
    await readFile(join(root, associated.files.infographicStatus), "utf8")
  );
  assert.equal(visualStatus.attemptHistory.length, 1);
  assert.equal(visualStatus.attemptHistory[0].outcome, "generated");
});

test("a summary-marker stop resumes and repairs every later meeting piece once", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-resume-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  await prepareBrainRoot(root);
  const value = await synthesizeReviewPackage({ meeting, transcript }, stubModel);

  await assert.rejects(
    persistMeetingPackage(value, transcript, "teams", {
      brainRoot: root,
      failAfter: "summary_marker",
    }),
    { code: "injected_summary_marker_stop" }
  );
  await assert.rejects(
    readFile(
      join(
        root,
        "core",
        "deliverables",
        "meeting-closeouts",
        "2026-08-04-fabric-delivery-review-task-spec.md"
      )
    )
  );

  const repaired = await persistMeetingPackage(value, transcript, "teams", { brainRoot: root });
  const inspection = await inspectStoredMeetingPackage(repaired, { brainRoot: root });
  assert.equal(inspection.complete, true);
  assert.equal(inspection.missing.length, 0);
  assert.equal(inspection.associated, true);

  const processed = await readFile(join(root, "_intake", "processed.log"), "utf8");
  assert.equal(processed.match(/workbench-meeting-closeout/g)?.length, 1);
  const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
  assert.equal(changelog.match(/Workbench meeting closeout stored/g)?.length, 1);
  const summary = await readFile(join(root, repaired.files.summary), "utf8");
  assert.equal(summary.match(/WORKBENCH_CLOSEOUT_JSON/g)?.length, 1);
});

test("reprocessing replaces an independent summary's stacked Workbench markers", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-marker-replace-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  await prepareBrainRoot(root);
  const value = await synthesizeReviewPackage({ meeting, transcript }, stubModel);
  const summaryPath = join(
    root,
    "core",
    "meetings",
    "summaries",
    "2026-08-04-fabric-delivery-review.md"
  );
  await mkdir(join(root, "core", "meetings", "summaries"), { recursive: true });
  await writeFile(
    summaryPath,
    [
      "# Independent meeting note",
      "",
      "This paragraph was written before the Workbench closeout.",
      "",
      "## Workbench closeout review",
      "",
      "Old package one.",
      markerFor({ ...value, id: "old-one" }),
      "",
      "Old package two.",
      markerFor({ ...value, id: "old-two" }),
      "",
      "## Human notes",
      "",
      "This later section must remain.",
      "",
    ].join("\n"),
    "utf8"
  );

  const stored = await persistMeetingPackage(value, transcript, "cluely", { brainRoot: root });
  const summary = await readFile(join(root, stored.files.summary), "utf8");

  assert.match(summary, /This paragraph was written before the Workbench closeout/);
  assert.match(summary, /This later section must remain/);
  assert.doesNotMatch(summary, /Old package one/);
  assert.doesNotMatch(summary, /Old package two/);
  assert.equal(summary.match(/WORKBENCH_CLOSEOUT_JSON/g)?.length, 1);
});

test("meeting persistence stops before writing when Brain instructions are missing", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-instructions-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  const value = await synthesizeReviewPackage({ meeting, transcript }, stubModel);

  await assert.rejects(persistMeetingPackage(value, transcript, "teams", { brainRoot: root }), {
    code: "brain_write_instructions_unavailable",
  });
  await assert.rejects(
    readFile(
      join(
        root,
        "core",
        "meetings",
        "transcripts",
        "teams-export",
        "2026-08-04-fabric-delivery-review.md"
      )
    )
  );
});

test("meeting persistence checks open MANIFEST rows and stops on a pending write", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-manifest-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  await prepareBrainRoot(root);
  await writeFile(
    join(root, "CHANGELOG.md"),
    [
      "# CHANGELOG & MANIFEST",
      "",
      "## SECTION 1 - CHANGELOG",
      "",
      "| 2026-08-05 | 09:00 ET | Workbench | Existing file | Existing checked change. |",
      "",
      "## SECTION 2 - MANIFEST",
      "",
      "| 9 | waiting.md | core/waiting.md | **INSTALL** | Must be written first. |",
      "",
      "### Processed manifest items",
      "- None.",
      "",
    ].join("\n"),
    "utf8"
  );
  const value = await synthesizeReviewPackage({ meeting, transcript }, stubModel);

  await assert.rejects(persistMeetingPackage(value, transcript, "teams", { brainRoot: root }), {
    code: "brain_manifest_items_pending",
  });
  await assert.rejects(
    readFile(
      join(
        root,
        "core",
        "meetings",
        "transcripts",
        "teams-export",
        "2026-08-04-fabric-delivery-review.md"
      )
    )
  );
});

test("a slow calendar read runs in the background and later calls share one result", async () => {
  resetTodayCalendarState();
  let reads = 0;
  let releaseRead = () => undefined;
  const pending = new Promise((resolveRead) => {
    releaseRead = () =>
      resolveRead({ ok: true, data: { meetings: [{ ...meeting, title: "Live meeting" }] } });
  });
  const options = {
    date: "2026-08-04",
    preparedMeetings: [meeting],
    fixture: null,
    readCalendar: () => {
      reads += 1;
      return pending;
    },
  };

  const first = await listTodaysMeetings(options);
  assert.equal(first.availability, "loading");
  assert.equal(first.meetings[0].id, meeting.id);
  assert.equal(reads, 1);

  // A second page visit while the read is still running never starts another read.
  const second = await listTodaysMeetings(options);
  assert.equal(second.availability, "loading");
  assert.equal(reads, 1);

  releaseRead();
  await new Promise((resolveWait) => setTimeout(resolveWait, 20));

  const third = await listTodaysMeetings(options);
  assert.equal(third.availability, "current");
  assert.equal(third.meetings[0].title, "Live meeting");
  assert.equal(reads, 1);

  // Cached: navigating back within the cache window is free.
  const fourth = await listTodaysMeetings(options);
  assert.equal(fourth.availability, "current");
  assert.equal(reads, 1);
});

test("failures retry after a short window and force starts a fresh read", async () => {
  resetTodayCalendarState();
  const now = { value: Date.parse("2026-08-04T12:00:00.000Z") };
  let reads = 0;
  let nextResponse = { ok: false, data: { error: "Calendar query returned 500" } };
  const options = {
    date: "2026-08-04",
    preparedMeetings: [meeting],
    fixture: null,
    clock: () => new Date(now.value),
    readCalendar: () => {
      reads += 1;
      return Promise.resolve(nextResponse);
    },
  };

  const first = await listTodaysMeetings(options);
  assert.equal(first.availability, "loading");
  await new Promise((resolveWait) => setTimeout(resolveWait, 20));

  const failed = await listTodaysMeetings(options);
  assert.equal(failed.availability, "error");
  assert.equal(reads, 1);

  // Still inside the failure window: the cached failure is served.
  now.value += 10_000;
  const cachedFailure = await listTodaysMeetings(options);
  assert.equal(cachedFailure.availability, "error");
  assert.equal(reads, 1);

  // Past the failure window: the next visit retries on its own.
  now.value += 30_000;
  nextResponse = { ok: true, data: { meetings: [meeting] } };
  const retry = await listTodaysMeetings(options);
  assert.equal(retry.availability, "loading");
  assert.equal(reads, 2);
  await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  const recovered = await listTodaysMeetings(options);
  assert.equal(recovered.availability, "current");

  // A good cached answer stays put until Refresh forces a new read.
  const cached = await listTodaysMeetings(options);
  assert.equal(reads, 2);
  assert.equal(cached.availability, "current");
  const forced = await listTodaysMeetings({ ...options, force: true });
  assert.equal(forced.availability, "loading");
  assert.equal(reads, 3);
});

test("a long executive readout is kept whole instead of cut mid-word", async () => {
  // The readout is a paragraph, not a quotation. It was being run through the
  // short-quote cleaner, which chopped it at 500 characters and left summaries
  // ending mid-word ("...and pre-w").
  const longSummary = `${"Steve walked the team through the breakdown workbook and they agreed the hierarchy. ".repeat(
    9
  )}Governance becomes its own project.`;
  assert.ok(longSummary.length > 500, "the fixture has to exceed the old cap");

  const value = await synthesizeReviewPackage({ meeting, transcript }, async () =>
    modelOutput({ summary: longSummary })
  );

  assert.equal(value.summary, longSummary);
  assert.ok(
    value.summary.endsWith("Governance becomes its own project."),
    `readout was truncated: ...${value.summary.slice(-40)}`
  );
});

test("an explicit no-fixture caller reads the real calendar, whatever the environment says", async () => {
  // A MEETING_CLOSEOUT_FIXTURE left in the environment used to win over a
  // caller that had already said there is no fixture, so the wrap-up page
  // served a stale recorded day instead of the live Outlook read.
  resetTodayCalendarState();
  const previous = process.env.MEETING_CLOSEOUT_FIXTURE;
  process.env.MEETING_CLOSEOUT_FIXTURE = join(tmpdir(), "meeting-closeout-no-such-fixture.json");
  try {
    let reads = 0;
    const value = await listTodaysMeetings({
      date: "2026-08-04",
      preparedMeetings: [meeting],
      fixture: null,
      readCalendar: () => {
        reads += 1;
        return new Promise(() => undefined);
      },
    });
    assert.equal(value.availability, "loading");
    assert.equal(reads, 1);
  } finally {
    if (previous === undefined) delete process.env.MEETING_CLOSEOUT_FIXTURE;
    else process.env.MEETING_CLOSEOUT_FIXTURE = previous;
    resetTodayCalendarState();
  }
});

test("a raw Cluely capture is cleaned to Teams quality before anything reads it", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-cleanup-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  await prepareBrainRoot(root);

  const rawCapture = [
    "Me [0:27] Did you have a chance to look at the workbook?",
    "Them [0:40] No, where is it",
    "Them [0:41] located?",
    "Them [2:34] Hey, guys.",
    "Me [11:02] The task breakdown is the third tab.",
    "Them [19:48] That order works for the first domain.",
    "Me [24:10] I will send it over after this.",
  ].join("\n");
  const cleaned = [
    "**Steve Nahrup** [0:27]",
    "Did you have a chance to look at the workbook?",
    "",
    "**Eudias Tata** [0:40]",
    "No, where is it located?",
    "",
    "**Patrick Stiller** [2:34]",
    "Hey, guys.",
    "",
    "**Steve Nahrup** [11:02]",
    "The task breakdown is the third tab.",
    "",
    "**Patrick Stiller** [19:48]",
    "That order works for the first domain.",
    "",
    "**Steve Nahrup** [24:10]",
    "I will send it over after this.",
  ].join("\n");

  let cleanupCalls = 0;
  let synthesisSawCleaned = false;
  const runModel = async (prompt) => {
    if (prompt.includes("END RAW CAPTURE")) {
      cleanupCalls += 1;
      return `CLEANED:
${cleaned}
END CLEANED`;
    }
    synthesisSawCleaned = prompt.includes("**Eudias Tata** [0:40]");
    return modelOutput({
      summary: "Steve walked Patrick Stiller and Eudias Tata through the workbook.",
      commitments: [],
      jiraProposals: [],
      supportingMaterial: [],
      documentRequests: [],
      reminderCandidates: [],
      emailDrafts: [],
      themes: ["Workbook"],
    });
  };

  const result = await processMeetingCloseout(
    { meeting, transcript: rawCapture },
    { brainRoot: root, runModel }
  );

  assert.equal(result.ok, true);
  assert.equal(cleanupCalls, 1, "the capture went through exactly one cleanup pass");
  assert.ok(synthesisSawCleaned, "synthesis read the cleaned transcript, not the raw one");
  const stored = await readFile(join(root, result.package.files.transcript), "utf8");
  assert.match(stored, /\*\*Eudias Tata\*\* \[0:40\]/);
  assert.doesNotMatch(stored, /^Them /m, "no unattributed speaker survives to storage");
});

test("a cleanup that fails or leaves Them labels keeps the meeting unprocessed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-cleanup-fail-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  await prepareBrainRoot(root);

  const rawCapture = "Them [0:40] No, where is it located?";
  const stillDirty = await processMeetingCloseout(
    { meeting, transcript: rawCapture },
    {
      brainRoot: root,
      runModel: async () =>
        `CLEANED:
Them [0:40] No, where is it located, plus enough padding to pass any length check on the cleaned output of this capture.
END CLEANED`,
    }
  );
  assert.equal(stillDirty.ok, false);
  assert.equal(stillDirty.code, "transcript_cleanup_unavailable");

  const crashed = await processMeetingCloseout(
    { meeting, transcript: rawCapture },
    {
      brainRoot: root,
      runModel: async () => {
        throw new Error("The model is unreachable.");
      },
    }
  );
  assert.equal(crashed.ok, false);
  assert.equal(crashed.code, "transcript_cleanup_unavailable");
  await assert.rejects(
    readFile(
      join(
        root,
        "core",
        "meetings",
        "transcripts",
        "cluely-export",
        "2026-08-04-fabric-delivery-review.md"
      )
    ),
    undefined,
    "nothing raw was stored"
  );
});

test("an already attributed paste skips the cleanup pass entirely", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "meeting-closeout-cleanup-skip-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  await prepareBrainRoot(root);

  let cleanupCalls = 0;
  const runModel = async (prompt) => {
    if (prompt.includes("END RAW CAPTURE")) {
      cleanupCalls += 1;
      return "CLEANED:\nshould never be used\nEND CLEANED";
    }
    return modelOutput();
  };

  const result = await processMeetingCloseout(
    { meeting, transcript },
    { brainRoot: root, runModel }
  );
  assert.equal(result.ok, true);
  assert.equal(cleanupCalls, 0, "clean text goes straight to synthesis");
});

test("the snapshot refresh fires only against the real Brain", () => {
  assert.equal(shouldRefreshSnapshot({ brainRoot: "C:/tmp/x" }, {}), false);
  assert.equal(shouldRefreshSnapshot({}, { MEETING_CLOSEOUT_BRAIN_ROOT: "C:/tmp/y" }), false);
  assert.equal(shouldRefreshSnapshot({}, {}), true);
});

test("a cached-only read never starts a Microsoft call", async () => {
  // The loop polls the board every few minutes. Left alone it expires the
  // calendar cache and starts a fresh Microsoft read every ~15 minutes,
  // which is a billed Copilot task each time. Background pollers must be
  // able to read the cache and never initiate.
  resetTodayCalendarState();
  let reads = 0;
  const options = {
    date: "2026-08-13",
    preparedMeetings: [meeting],
    fixture: null,
    readCalendar: () => {
      reads += 1;
      return Promise.resolve({ ok: true, data: { meetings: [meeting] } });
    },
  };

  const cold = await listTodaysMeetings({ ...options, cachedOnly: true });
  assert.equal(reads, 0, "a cold cached-only read starts nothing");
  assert.equal(cold.availability, "stale");
  assert.equal(cold.meetings[0].id, meeting.id, "prepared meetings still list");

  // A real caller warms the cache.
  await listTodaysMeetings(options);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(reads, 1);

  const warm = await listTodaysMeetings({ ...options, cachedOnly: true });
  assert.equal(reads, 1, "cached-only serves the cache without a new read");
  assert.equal(warm.availability, "current");
});
