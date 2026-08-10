import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ACTIVITY_SOURCES } from "./activity-reconciliation.mjs";
import { collectActivitySources } from "./activity-sources.mjs";

function windows() {
  return Object.fromEntries(
    ACTIVITY_SOURCES.map((source) => [
      source.id,
      {
        from: "2026-08-06T13:00:00.000Z",
        to: "2026-08-06T15:00:00.000Z",
        lateSweepFrom: "2026-07-30T15:00:00.000Z",
        overlapMinutes: 15,
        previousPosition: "2026-08-06T13:15:00.000Z",
      },
    ])
  );
}

function emptyMicrosoft365Streams() {
  return Object.fromEntries(
    ACTIVITY_SOURCES.filter((source) => source.id !== "brain_updates").map((source) => [
      source.id,
      {
        state: "empty",
        confirmedThrough: "2026-08-06T15:00:00.000Z",
        detail: "Read succeeded.",
        items: [],
      },
    ])
  );
}

test("the Brain reader returns dated records and metadata without private file bodies", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "activity-brain-reader-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  const summary = join(root, "core", "meetings", "summaries", "2026-08-06-fabric-review.md");
  const rawCapture = join(root, "core", "meetings", "transcripts", "private-capture.md");
  const retired = join(
    root,
    "core",
    "deliverables",
    "mdm-program-planning",
    "_retired",
    "old-plan.md"
  );
  const visualStatus = join(root, "natively", "meeting-infographics", "meeting-one", "status.json");
  const visual = join(root, "natively", "meeting-infographics", "meeting-one", "meeting-one.png");
  const decisions = join(root, "core", "project-memory", "learnings", "decisions.json");
  for (const file of [summary, rawCapture, retired, visualStatus, visual, decisions]) {
    await mkdir(join(file, ".."), { recursive: true });
  }
  await writeFile(
    join(root, "CHANGELOG.md"),
    "| Date | Time ET | Who | What was altered | Reason |\n| --- | --- | --- | --- | --- |\n| 2026-08-06 | 09:30 ET | Workbench | core/project-memory/open-questions.md | Recorded current work. |\n",
    "utf8"
  );
  await mkdir(join(root, "_intake"), { recursive: true });
  await writeFile(
    join(root, "_intake", "processed.log"),
    "2026-08-06T13:40:00.000Z | workbench-meeting-closeout | meeting-one | sha256:fixture\n",
    "utf8"
  );
  await writeFile(summary, "PRIVATE MEETING CONTENT MUST NOT LEAVE THIS FILE", "utf8");
  await writeFile(rawCapture, "PRIVATE RAW CAPTURE", "utf8");
  await writeFile(retired, "PRIVATE RETIRED CONTENT", "utf8");
  await writeFile(visualStatus, '{"status":"complete"}\n', "utf8");
  await writeFile(visual, "not-a-real-image", "utf8");
  await writeFile(
    decisions,
    JSON.stringify({
      decisions: [
        {
          id: "DEC-2026-08-06-001",
          date: "2026-08-06",
          title: "Fabric source decision",
          decision: "PRIVATE STRUCTURED DECISION BODY",
          status: "proposed",
        },
      ],
    }),
    "utf8"
  );
  const modified = new Date("2026-08-06T13:50:00.000Z");
  for (const file of [summary, rawCapture, retired, visualStatus, visual, decisions]) {
    await utimes(file, modified, modified);
  }

  const result = await collectActivitySources(
    { windows: windows(), onActivity: () => undefined },
    {
      brainRoot: root,
      m365Runner: async () => ({ ok: true, data: { streams: emptyMicrosoft365Streams() } }),
    }
  );
  const brain = result.sources.find((source) => source.id === "brain_updates");
  assert.equal(brain.state, "current");
  assert.equal(
    brain.items.some((item) => item.providerItemId.startsWith("CHANGELOG.md|")),
    true
  );
  assert.equal(
    brain.items.some((item) => item.providerItemId.includes("workbench-meeting-closeout")),
    true
  );
  assert.equal(
    brain.items.some(
      (item) => item.sourceReference === "core/meetings/summaries/2026-08-06-fabric-review.md"
    ),
    true
  );
  assert.equal(
    brain.items.some(
      (item) =>
        item.sourceReference === "core/project-memory/learnings/decisions.json#DEC-2026-08-06-001"
    ),
    true
  );
  assert.equal(
    brain.items.some((item) => item.sourceReference?.includes("transcripts")),
    false
  );
  assert.equal(
    brain.items.some((item) => item.sourceReference?.includes("_retired")),
    false
  );
  assert.equal(
    brain.items.some((item) => item.sourceReference?.endsWith(".png")),
    false
  );
  assert.equal(JSON.stringify(brain.items).includes("PRIVATE"), false);
});

test("a stop request aborts the active Microsoft 365 read", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "activity-source-cancel-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  let stopRequested = false;
  let abortObserved = false;
  const resultPromise = collectActivitySources(
    {
      windows: windows(),
      onActivity: () => undefined,
      isCancellationRequested: async () => stopRequested,
    },
    {
      brainRoot: root,
      cancelPollMs: 5,
      m365Runner: async (_sourceWindows, { signal }) =>
        new Promise((resolve) => {
          signal.addEventListener(
            "abort",
            () => {
              abortObserved = true;
              resolve({
                ok: false,
                code: "m365_canceled",
                error: "Microsoft 365 read stopped by the user.",
              });
            },
            { once: true }
          );
        }),
    }
  );
  stopRequested = true;
  const result = await resultPromise;

  assert.equal(abortObserved, true);
  assert.equal(
    result.sources
      .filter((source) => source.id !== "brain_updates")
      .every((source) => source.state === "canceled"),
    true
  );
});
