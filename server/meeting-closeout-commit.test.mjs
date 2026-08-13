/**
 * The closeout must commit its own brain writes in the same run.
 *
 * Twice now the scheduled NotebookLM job stood down because the working tree
 * held another workflow's uncommitted files: Monday's hundred-path backlog,
 * and on 2026-08-13 the 12:01 Workbench closeout itself. The job refuses
 * dirty overlap by design, so a closeout that writes without committing
 * silently blocks the real infographic for every meeting behind it.
 *
 * The standing rule already says it: complete the files, the knowledge
 * update, the validation, and the required commit in the same run.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { commitCloseoutFiles } from "./meeting-closeout.mjs";

const run = promisify(execFile);

async function makeBrainRepo() {
  const root = await mkdtemp(join(tmpdir(), "brain-commit-"));
  await run("git", ["init", "-q"], { cwd: root });
  await run("git", ["config", "user.email", "workbench@local"], { cwd: root });
  await run("git", ["config", "user.name", "Workbench"], { cwd: root });
  await writeFile(join(root, "CHANGELOG.md"), "# changelog\n");
  await run("git", ["add", "-A"], { cwd: root });
  await run("git", ["commit", "-qm", "init"], { cwd: root });
  return root;
}

test("the closeout commits exactly its own files and the ledgers", async () => {
  const root = await makeBrainRepo();
  await mkdir(join(root, "core", "meetings", "summaries"), { recursive: true });
  await mkdir(join(root, "_intake"), { recursive: true });
  await writeFile(join(root, "core", "meetings", "summaries", "m.md"), "summary\n");
  await writeFile(join(root, "_intake", "processed.log"), "row\n");
  await writeFile(join(root, "CHANGELOG.md"), "# changelog\nrow\n");
  // A bystander file from some other workflow, which must NOT be swept up.
  await writeFile(join(root, "unrelated.md"), "someone else's work\n");

  const result = await commitCloseoutFiles({
    brainRoot: root,
    files: { summary: "core/meetings/summaries/m.md" },
    meetingId: "2026-08-13-test-meeting",
    meetingTitle: "Test Meeting",
  });

  assert.equal(result.committed, true, result.detail || "commit did not happen");
  assert.ok(result.commit, "the short hash of the commit must be reported");

  const { stdout: clean } = await run(
    "git",
    ["status", "--porcelain", "core", "_intake", "CHANGELOG.md"],
    { cwd: root }
  );
  assert.equal(clean.trim(), "", "the closeout's own paths must be committed");

  const { stdout: leftover } = await run("git", ["status", "--porcelain"], { cwd: root });
  assert.match(leftover, /unrelated\.md/, "another workflow's file must be left exactly as it was");

  const { stdout: message } = await run("git", ["log", "-1", "--format=%B"], { cwd: root });
  assert.match(message, /Test Meeting/, "the commit names the meeting");
});

test("a failed commit is reported, never thrown, and never silent", async () => {
  const root = await mkdtemp(join(tmpdir(), "brain-nogit-"));
  await mkdir(join(root, "_intake"), { recursive: true });
  await writeFile(join(root, "CHANGELOG.md"), "row\n");

  // Not a git repository at all: the worst realistic environment.
  const result = await commitCloseoutFiles({
    brainRoot: root,
    files: {},
    meetingId: "x",
    meetingTitle: "x",
  });
  assert.equal(result.committed, false);
  assert.ok(result.detail, "the failure must carry its reason");
});
