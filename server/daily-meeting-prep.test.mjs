import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getDailyMeetingPrep, readDailyMeetingPrepFile } from "./daily-meeting-prep.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "daily-prep-"));
  const day = path.join(root, "2026-08-04");
  const folder = "Morning-Review";
  const packagePath = path.join(day, folder);
  await mkdir(packagePath, { recursive: true });
  await writeFile(
    path.join(day, "00_INDEX.md"),
    "# Daily Prep\n\nEvents checked: **2**\nPackages built: **1**\nEvents skipped: **1**\nEvents blocked: **0**\n\n### 1. Morning Review\n`Morning-Review/`\n\n## Skipped meetings\n- Reminder: Five-minute reminder entry. Not a meeting.\n"
  );
  await writeFile(
    path.join(packagePath, "Cluely_Prep.md"),
    "# Prep Sheet: Morning Review\n\n**When:** Tuesday 2026-08-04, 9:00 to 9:30 AM ET\n**Organizer:** Steve\n**Prepared:** 2026-08-03\n**Evidence state:** Current mail was unavailable. CONFIRM-LIVE.\n\n## 30-second orientation\nConfirm the open decisions before discussion.\n"
  );
  await writeFile(path.join(packagePath, "Prep_Pack.pdf"), "pdf");
  await writeFile(path.join(packagePath, "Prep_Pack.html"), "<html><body>ready</body></html>");
  await writeFile(path.join(packagePath, "RunOfShow.md"), "# Run of show");
  await writeFile(path.join(packagePath, "build.py"), "not visible");
  return { root, folder };
}

test("reads a ready package from one dated folder", async () => {
  const { root, folder } = await fixture();
  try {
    const result = await getDailyMeetingPrep("2026-08-04", { root });
    assert.equal(result.state, "ready");
    assert.equal(result.summary.checked, 2);
    assert.equal(result.packages.length, 1);
    assert.equal(result.packages[0].id, folder);
    assert.equal(result.packages[0].title, "Morning Review");
    assert.equal(result.packages[0].status, "ready");
    assert.equal(result.packages[0].artifacts.length, 4);
    assert.match(result.packages[0].evidenceState, /CONFIRM-LIVE/);
    assert.deepEqual(result.skipped, [
      { title: "Reminder", reason: "Five-minute reminder entry. Not a meeting." },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reports an unavailable dated source truthfully", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "daily-prep-missing-"));
  try {
    const result = await getDailyMeetingPrep("2026-08-04", { root });
    assert.equal(result.state, "unavailable");
    assert.equal(result.packages.length, 0);
    assert.match(result.reason, /No dated prep output/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("matches package and file names against real entries", async () => {
  const { root, folder } = await fixture();
  try {
    const file = await readDailyMeetingPrepFile({
      date: "2026-08-04",
      packageId: folder,
      fileName: "Prep_Pack.pdf",
      print: true,
      root,
    });
    assert.equal(file.contentType, "text/html; charset=utf-8");
    assert.match(file.data.toString("utf8"), /window\.print/);
    await assert.rejects(
      () =>
        readDailyMeetingPrepFile({
          date: "2026-08-04",
          packageId: "..",
          fileName: "00_INDEX.md",
          root,
        }),
      (error) => error.code === "PREP_PACKAGE_NOT_FOUND"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
