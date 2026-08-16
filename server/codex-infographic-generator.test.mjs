import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  buildCodexInfographicPrompt,
  generateMeetingInfographicWithCodex,
} from "./codex-infographic-generator.mjs";

const meeting = {
  title: "Fabric Delivery Review",
  start: "2026-08-04T14:00:00-04:00",
  attendees: ["Steve Nahrup", "Patrick Stiller"],
};

test("the Codex prompt forbids a PowerPoint-style placeholder", () => {
  const prompt = buildCodexInfographicPrompt({
    meeting,
    sourceText: "Meeting summary: the Fabric delivery sequence was agreed.",
    outputPath: "C:\\job\\result.png",
  });
  assert.match(prompt, /Use \$imagegen in built-in mode/);
  assert.match(prompt, /not a PowerPoint slide/);
  assert.match(prompt, /No slide frame/);
  assert.match(prompt, /commissioned information art/);
  assert.match(prompt, /repeated white card grid/);
  assert.match(prompt, /visual metaphor and illustrated structure/);
  assert.match(prompt, /only factual source/);
  assert.match(prompt, /Source material/);
  assert.match(prompt, /Fabric delivery sequence/);
  assert.match(prompt, /reviewed final image/);
  assert.match(prompt, /Do not build an HTML, SVG, slide, or screenshot substitute/);
});

test("the generator validates and files a Codex image with source receipts", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "codex-infographic-test-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  const outputPath = join(root, "brain", "meeting-codex.png");
  const result = await generateMeetingInfographicWithCodex(
    {
      meetingId: "2026-08-04-fabric-delivery-review",
      meeting,
      summary: "The team agreed on the Fabric delivery sequence.",
      transcript: "Steve: I will send the workbook.\nPatrick: Update MT-42.",
      commitments: [{ text: "Send the workbook." }],
      themes: ["Fabric delivery"],
      outputPath,
    },
    {
      stateRoot: join(root, "state"),
      fixtureImagePath: resolve("public", "brand", "ip-corporation-official.png"),
    }
  );

  assert.equal(result.provider, "codex");
  assert.equal(result.imageModel, "gpt-image-2");
  assert.match(result.artifactId, /^codex-imagegen:/);
  assert.equal(result.sourceIds.length, 2);
  assert.ok(result.width >= 800);
  assert.ok((await readFile(outputPath)).length > 5_000);
});

test("the generator retrieves the image owned by the exact Codex task", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "codex-infographic-receipt-test-"));
  t.after(async () => {
    assert.ok(root.startsWith(tmpdir()));
    await rm(root, { recursive: true, force: true });
  });
  const taskId = "019ffe5a-0f38-79c2-a8ce-1933f5038277";
  const generatedDirectory = join(root, "generated", taskId);
  await mkdir(generatedDirectory, { recursive: true });
  await writeFile(
    join(generatedDirectory, "reviewed.png"),
    await readFile(resolve("public", "brand", "ip-corporation-official.png"))
  );
  const outputPath = join(root, "brain", "meeting-codex.png");
  const result = await generateMeetingInfographicWithCodex(
    {
      meetingId: "2026-08-04-fabric-delivery-review",
      meeting,
      summary: "The team agreed on the Fabric delivery sequence.",
      transcript: "Steve: I will send the workbook.\nPatrick: Update MT-42.",
      commitments: [{ text: "Send the workbook." }],
      themes: ["Fabric delivery"],
      outputPath,
    },
    {
      stateRoot: join(root, "state"),
      generatedImageRoot: join(root, "generated"),
      runCodex: async () => ({
        threadId: taskId,
        stdout: `${JSON.stringify({ type: "thread.started", thread_id: taskId })}\n`,
        stderr: "",
      }),
    }
  );

  assert.equal(result.taskId, taskId);
  assert.ok((await readFile(outputPath)).length > 5_000);
});
