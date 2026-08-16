# Workbench saved meeting job evidence

Date: 2026-08-14

Status: complete

Acceptance checks:
`docs/mythos/gates/20260814-033500-workbench-meeting-job.md`

## Delivered result

- Meeting closeout runs as one durable work item with these saved stages: discover,
  reconcile sources, synthesize, store, generate visual, associate, verify display, and
  finalize.
- The HTTP start call returns an accepted job before synthesis or image work finishes.
  Status, list, stop, and resume calls use the same saved job.
- The original user-started input and every stage artifact live under the selected local
  Workbench state root. Browser projections and event records contain hashes and
  references, never raw meeting text.
- Resume skips only a stage whose input hash matches and whose saved result still passes
  inspection. Missing, changed, or stale output runs again.
- Startup continues prepared and interrupted work after a dead local process. It leaves a
  live worker alone. Failed and user-stopped work waits for an explicit resume.
- Visual generation prefers Codex. Existing verified NotebookLM output remains reusable.
  Each attempt is retained with provider details, source and output hashes, dimensions,
  review details, and outcome.
- A failed provider leaves the package partial and creates no substitute image.
- Final completion requires the PNG, status receipt, package association, processed row,
  change row, configured Workbench image path, PNG decode, and saved hash to agree.
- Activity reconciliation now attaches to this same meeting job and returns its job ID,
  status, and current saved stage when the meeting remains incomplete.
- Existing transcript cleanup, multi-source comparison and consolidation, source receipts,
  summary replacement, explicit Brain staging, snapshot refresh, and both meeting test
  environment variables remain in use.
- Jira and email output remains review-only. No send or Jira change path was added.

## Failable checks

- `node --test server/activity-reconciliation/*.test.mjs server/meeting-closeout*.test.mjs server/workbench-state/*.test.mjs`
  passed 88 of 88.
- `npx playwright test tests/meeting-closeout.spec.ts --project=chromium --project=firefox`
  passed 10 of 10.
- The saved-job browser check ran at 390 by 844 and confirmed the document did not overflow
  horizontally.
- `npm run typecheck` passed.
- `npm run build` passed. Vite still reports the existing large main-chunk warning.
- Focused Biome passed on the meeting service, job service, gateway, saved-step runner,
  Meeting Wrap-up UI, and focused tests.
- `git diff --check` passed with line-ending warnings only.

## Interruption and recovery proof

The job test interrupted work after each of the seven stages where stopping is safe. The
next run used the same job, reused every valid saved output, and completed only the
remaining stages. Separate tests proved that a dead-process lease is continued, a live
process is not displaced, an early duplicate resume is refused, and a failed visual waits
for a user-started retry.

## Image and display proof

The gateway fixture test fetched the same image response used by the browser and compared
its bytes with the generated PNG. Display verification also decoded the PNG from the exact
configured image directory and compared its SHA-256 with the saved receipt. Retry coverage
proved that a failed attempt remains in history after a later successful image run.

## Review history

The first fresh review found four issues: dead-process lease recovery, image-route runtime
proof, missing current-stage detail on partial reconciliation, and missing append-style
image attempt history. Each was fixed and covered by a failing check that now passes. The
fresh re-review found no remaining actionable issue.

Review: `docs/mythos/reviews/20260814-042332-workbench-meeting-job-final-review.md`

## Known unrelated repository findings

The full lint command remains red from older graph-generator and generated JSON findings.
The wider Chromium run also has seven older failures outside this work. All files changed
for this meeting job pass focused checks, and the focused meeting path passes in Chromium
and Firefox.
