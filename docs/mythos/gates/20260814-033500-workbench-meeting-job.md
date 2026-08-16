# Workbench Meeting Job Acceptance Record

Status: frozen before implementation

Started: 2026-08-14 03:35 ET

## Objective

Make meeting closeout the first real resumable consumer of the Workbench state engine.
The work must leave the current transcript comparison in place, move long synthesis and
image work outside the HTTP request lifetime, and recover unfinished user-started work
after a local server restart.

## Required outcomes

1. Every closeout job has these named steps in order: discover, reconcile sources,
   synthesize, store, generate visual, associate, verify display, finalize.
2. One durable work item owns each meeting plus input-content hash. A Windows-safe lease
   prevents two local processes from running the same job at once.
3. Each step records start, success, failure, input hash, output references, output hash,
   attempt count, and observation time in append-only state.
4. Step artifacts and the original user-started input live under the explicit Workbench
   state root, never in the repo. Raw meeting text never appears in events, logs, status
   responses, or browser payloads.
5. A resumed job skips a successful step only when its input hash matches and its saved
   artifact or external output passes that step's check. Missing or stale output reruns.
6. `POST /api/meeting-closeout/process` returns an accepted job record without waiting
   for synthesis or image generation. A read route reports redacted step progress and the
   final package. A stop route asks the runner to stop after the current safe step. A
   resume route continues the same job.
7. Startup recovery finds unfinished user-started meeting jobs and continues them without
   needing another transcript paste.
8. Codex remains the preferred image provider. Existing verified NotebookLM output may
   be reused, and NotebookLM remains available for later artifact types. Provider IDs,
   source hashes, output hash, dimensions, review note, and retry history are retained.
9. A provider failure creates no substitute visual. The job remains partial at generate
   visual and is safe to resume.
10. Finalize succeeds only after the saved PNG, status receipt, package association,
    processed record, change record, and Workbench image response all pass inspection.
11. Activity reconciliation attaches to the same meeting job instead of starting a
    second closeout path. It reports the current saved step when work is partial.
12. Existing transcript cleanup, multi-source comparison, source receipt hashes, summary
    replacement, explicit Brain file staging, snapshot refresh, and the
    `MEETING_CLOSEOUT_STATE_DIR` and `MEETING_CLOSEOUT_SYNTHESIS_BIN` test controls remain.
13. Jira and email remain review-only. No live external send or Jira change is added.

## Required evidence

- Red-first and passing step-runner checks for leases, exact retries, changed inputs,
  stop, resume, stale artifacts, and redacted status.
- Meeting checks that inject an interruption after every step and prove the next run
  repairs only unfinished work.
- A fake synthesis program and fixture image prove no real model or image task runs in
  tests.
- HTTP and browser checks prove accepted, progress, stop, resume, partial image failure,
  final package display, and no raw transcript in responses.
- TypeScript, focused Biome, Node syntax, production build, and `git diff --check`.
- A fresh reviewer compares the result and evidence with this record.

## Ownership

- Lane 1: reusable saved step runner under `server/workbench-state/**`.
- Lane 2: closeout stages and recovery in meeting closeout server modules.
- Lane 3: HTTP, activity reconciliation, and Meeting Wrap-up progress UI.
- Coordinator: integration, safety arbitration, live read-only proof, evidence, and review.

## Stop conditions

- Stop before a real Jira change, email send, Teams send, or Outlook write.
- Stop if tests can reach a real synthesis program or real image task.
- Stop completion if any visual, association, display, processed record, or change record
  check is missing or ambiguous.

