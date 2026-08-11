import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  inspectStoredMeetingPackage,
  listStoredPackages,
  listTodaysMeetings,
  persistMeetingPackage,
  processMeetingCloseout,
  resetTodayCalendarState,
  synthesizeReviewPackage,
} from "./meeting-closeout.mjs";

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
  const packages = await listStoredPackages({ brainRoot: root });

  assert.equal(first.id, second.id);
  assert.equal(packages.length, 1);
  assert.equal(packages[0].meeting.title, meeting.title);
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
