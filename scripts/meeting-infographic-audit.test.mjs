import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AUDIT_CATEGORIES,
  classifyAuditState,
  runMeetingInfographicAudit,
} from "./meeting-infographic-audit.mjs";

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function writeMeetingSummary(brainRoot, id) {
  const file = path.join(brainRoot, "core", "meetings", "summaries", `${id}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `# ${id}\\n\\n## Summary\\n\\nFixture.`);
}

function writePackage(brainRoot, id, file) {
  const dir = path.join(brainRoot, "natively", "meeting-infographics", id);
  fs.mkdirSync(dir, { recursive: true });
  if (file) fs.writeFileSync(path.join(dir, file), "fixture-png");
}

test("classifies the four missing causes and preserves unavailable", () => {
  assert.equal(
    classifyAuditState({ display: "missing", saved: "present", association: "present" }),
    AUDIT_CATEGORIES.missingDisplayOnly
  );
  assert.equal(
    classifyAuditState({ display: "missing", saved: "missing", association: "present" }),
    AUDIT_CATEGORIES.missingSavedArtifactOnly
  );
  assert.equal(
    classifyAuditState({ display: "missing", saved: "present", association: "missing" }),
    AUDIT_CATEGORIES.missingAssociationOnly
  );
  assert.equal(
    classifyAuditState({ display: "missing", saved: "missing", association: "missing" }),
    AUDIT_CATEGORIES.fullyMissing
  );
  assert.equal(
    classifyAuditState({ display: "unavailable", saved: "present", association: "present" }),
    null
  );
});

test("audits every displayed meeting and reports only missing items", async (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "meeting-infographic-audit-"));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  const brainRoot = path.join(fixtureRoot, "brain");
  const seedPath = path.join(fixtureRoot, "frontend-seed.json");
  const meetings = [
    {
      id: "2026-01-01-complete-review",
      title: "Complete Review",
      day: "2026-01-01",
      infographic: {
        id: "2026-01-01-complete-review",
        file: "Complete Review [2026-01-01].png",
      },
    },
    {
      id: "2026-01-02-display-review",
      title: "Display Review",
      day: "2026-01-02",
    },
    {
      id: "2026-01-03-saved-file-review",
      title: "Saved File Review",
      day: "2026-01-03",
      infographic: {
        id: "2026-01-03-saved-file-review",
        file: "Saved File Review [2026-01-03].png",
      },
    },
    {
      id: "2026-01-04-quarterly-planning",
      title: "Quarterly Planning",
      day: "2026-01-04",
    },
    {
      id: "2026-01-05-no-art-review",
      title: "No Art Review",
      day: "2026-01-05",
    },
  ];

  writeJson(seedPath, {
    meetingIndex: {
      updatedAt: "2026-01-06T12:00:00.000Z",
      meetings,
      upcoming: [],
      active: [],
      recent: [],
    },
  });
  for (const meeting of meetings) writeMeetingSummary(brainRoot, meeting.id);
  writePackage(brainRoot, "2026-01-01-complete-review", "Complete Review [2026-01-01].png");
  writePackage(brainRoot, "2026-01-02-display-review", "Display Review [2026-01-02].png");
  writePackage(brainRoot, "2026-01-03-saved-file-review", null);
  writePackage(
    brainRoot,
    "2026-01-04-quarterly-planning-review",
    "Quarterly Planning [2026-01-04].png"
  );

  const { snapshot, entries } = await runMeetingInfographicAudit({
    seedPath,
    brainRoot,
    checkedAt: "2026-01-06T13:00:00.000Z",
    displayProbe: async (art) =>
      art.id === "2026-01-01-complete-review"
        ? { state: "present", detail: "fixture" }
        : { state: "missing", detail: "fixture" },
  });

  assert.equal(entries.length, meetings.length);
  assert.equal(snapshot.scope.meetingCount, meetings.length);
  assert.equal(snapshot.totals.complete, 1);
  assert.equal(snapshot.totals.needsAttention, 4);
  assert.equal(snapshot.findings.length, 4);
  assert.deepEqual(snapshot.categories, {
    [AUDIT_CATEGORIES.missingDisplayOnly]: 1,
    [AUDIT_CATEGORIES.missingSavedArtifactOnly]: 1,
    [AUDIT_CATEGORIES.missingAssociationOnly]: 1,
    [AUDIT_CATEGORIES.fullyMissing]: 1,
  });
  assert.ok(snapshot.findings.every((finding) => finding.category));
});

test("keeps an unavailable display probe out of the missing groups", async (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "meeting-infographic-display-"));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  const brainRoot = path.join(fixtureRoot, "brain");
  const seedPath = path.join(fixtureRoot, "frontend-seed.json");
  const meeting = {
    id: "2026-02-01-display-unavailable",
    title: "Display Unavailable",
    day: "2026-02-01",
    infographic: {
      id: "2026-02-01-display-unavailable",
      file: "Display Unavailable [2026-02-01].png",
    },
  };

  writeJson(seedPath, {
    meetingIndex: {
      updatedAt: "2026-02-02T12:00:00.000Z",
      meetings: [meeting],
    },
  });
  writeMeetingSummary(brainRoot, meeting.id);
  writePackage(brainRoot, meeting.infographic.id, meeting.infographic.file);

  const { snapshot } = await runMeetingInfographicAudit({
    seedPath,
    brainRoot,
    displayProbe: async () => ({ state: "unavailable", detail: "fixture timeout" }),
  });

  assert.equal(snapshot.findings.length, 0);
  assert.equal(snapshot.totals.needsAttention, 0);
  assert.equal(snapshot.totals.unavailable, 1);
  assert.equal(snapshot.source.displayProbe.state, "unavailable");
  assert.deepEqual(snapshot.unavailableMeetings[0], {
    meetingId: meeting.id,
    title: meeting.title,
    day: meeting.day,
    display: "unavailable",
    saved: "present",
    association: "present",
  });
});

test("keeps unreadable Brain package evidence out of the missing groups", async (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "meeting-infographic-package-"));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  const brainRoot = path.join(fixtureRoot, "brain");
  const seedPath = path.join(fixtureRoot, "frontend-seed.json");
  const meeting = {
    id: "2026-02-02-quarterly-planning",
    title: "Quarterly Planning",
    day: "2026-02-02",
  };
  const packageId = "2026-02-02-quarterly-planning-review";
  const packageFile = "Quarterly Planning [2026-02-02].png";

  writeJson(seedPath, {
    meetingIndex: {
      updatedAt: "2026-02-03T12:00:00.000Z",
      meetings: [meeting],
    },
  });
  writeMeetingSummary(brainRoot, meeting.id);
  writePackage(brainRoot, packageId, packageFile);
  fs.writeFileSync(
    path.join(brainRoot, "natively", "meeting-infographics", packageId, "status.json"),
    "{not-json"
  );

  const { snapshot } = await runMeetingInfographicAudit({ seedPath, brainRoot });

  assert.equal(snapshot.findings.length, 0);
  assert.equal(snapshot.totals.needsAttention, 0);
  assert.equal(snapshot.totals.unavailable, 1);
  assert.equal(snapshot.source.brain.unreadablePackageRecords, 1);
  assert.equal(snapshot.unavailableMeetings[0].display, "missing");
  assert.equal(snapshot.unavailableMeetings[0].saved, "present");
  assert.equal(snapshot.unavailableMeetings[0].association, "unavailable");
});

test("keeps missing Brain source roots out of the missing groups", async (t) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "meeting-infographic-root-"));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

  const seedPath = path.join(fixtureRoot, "frontend-seed.json");
  const meeting = {
    id: "2026-02-03-source-unavailable",
    title: "Source Unavailable",
    day: "2026-02-03",
  };
  writeJson(seedPath, {
    meetingIndex: {
      updatedAt: "2026-02-04T12:00:00.000Z",
      meetings: [meeting],
    },
  });

  const { snapshot } = await runMeetingInfographicAudit({
    seedPath,
    brainRoot: path.join(fixtureRoot, "missing-brain"),
  });

  assert.equal(snapshot.findings.length, 0);
  assert.equal(snapshot.totals.needsAttention, 0);
  assert.equal(snapshot.totals.unavailable, 1);
  assert.equal(snapshot.source.brain.state, "unavailable");
  assert.equal(snapshot.unavailableMeetings[0].saved, "unavailable");
  assert.equal(snapshot.unavailableMeetings[0].association, "unavailable");
});
