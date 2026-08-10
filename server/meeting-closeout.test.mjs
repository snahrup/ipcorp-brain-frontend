import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildReviewPackage,
  inspectStoredMeetingPackage,
  listStoredPackages,
  listTodaysMeetings,
  persistMeetingPackage,
  processMeetingCloseout,
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

test("buildReviewPackage creates every review category without external actions", () => {
  const value = buildReviewPackage({
    meeting,
    transcript,
    contextNotes: "The source mapping is the supporting context.",
    recap: "The team aligned on the next Fabric delivery steps.",
    relatedMaterial: ["https://example.test/meeting-recording"],
  });

  assert.equal(value.meeting.title, meeting.title);
  assert.ok(value.commitments.length > 0);
  assert.ok(value.jiraProposals.length > 0);
  assert.ok(value.supportingMaterial.length > 0);
  assert.ok(value.documentRequests.length > 0);
  assert.ok(value.reminderCandidates.length > 0);
  assert.ok(value.emailDrafts.length > 0);
  assert.equal(value.externalActions.emailSent, false);
  assert.equal(value.externalActions.jiraChanged, false);
  assert.equal(value.infographic.metrics.length, 4);
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

  const value = buildReviewPackage({
    meeting,
    transcript,
    contextNotes: "Patrick Stiller asked for the workbook link.",
  });

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
  const value = buildReviewPackage({ meeting, transcript });

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
  const value = buildReviewPackage({ meeting, transcript });

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
  const value = buildReviewPackage({ meeting, transcript });

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
