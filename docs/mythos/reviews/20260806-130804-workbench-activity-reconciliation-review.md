# Workbench Activity Reconciliation Review

Verdict: needs-changes

Date: 2026-08-06 13:08 ET

Reviewed against:

- `docs/specs/workbench-activity-reconciliation.md`
- `docs/mythos/gates/20260806-111351-workbench-activity-reconciliation.md`

Scope inspected:

- `server/activity-reconciliation/`
- `src/features/activity-reconciliation/`
- `server/meeting-closeout.mjs`
- `server/meeting-infographic-renderer.mjs`
- `server/m365-reconcile.py`
- `server/jira-gateway.mjs`
- `src/features/jira/JiraWorkSurface.tsx`
- `tests/activity-reconciliation.spec.ts`

Commands run:

- `node --test server/activity-reconciliation/activity-reconciliation.test.mjs server/activity-reconciliation/activity-router.test.mjs server/activity-reconciliation/activity-sources.test.mjs server/activity-reconciliation/jira-proposals.test.mjs server/activity-reconciliation/activity-gateway.test.mjs`
- `npm run typecheck`
- `node --test server/activity-reconciliation/activity-reconciliation.test.mjs server/activity-reconciliation/activity-router.test.mjs server/activity-reconciliation/activity-sources.test.mjs server/activity-reconciliation/jira-proposals.test.mjs server/activity-reconciliation/activity-gateway.test.mjs server/meeting-closeout.test.mjs server/meeting-closeout-gateway.test.mjs`

Results:

- Activity server checks: 13 passed, 0 failed.
- TypeScript: passed.
- Activity plus meeting closeout server checks: 22 passed, 0 failed.

## Findings

### High: Brain MANIFEST procedure is not implemented for real meeting writes

The spec requires every runtime Brain write path to read the Brain instructions and keep the MANIFEST accurate before writing to the real Brain repository (`docs/specs/workbench-activity-reconciliation.md:486`). The activity path calls `processMeetingCloseout` for non-fixture meetings (`server/jira-gateway.mjs:2604`), and `persistMeetingPackage` writes the transcript, summary marker, task spec, infographic HTML, run report, PNG/status, processed log, and `CHANGELOG.md` (`server/meeting-closeout.mjs:878`, `server/meeting-closeout.mjs:897`, `server/meeting-closeout.mjs:904`, `server/meeting-closeout.mjs:940`, `server/meeting-closeout.mjs:945`). There is no read or update for MANIFEST in this path, and the only matching search hits are `processed.log` and `CHANGELOG.md`.

Why it matters: a real ready meeting can create Brain files without satisfying the Brain write procedure in AC-15, AC-17, AC-24, and the frozen meeting completion checks. The focused tests use temporary Brain fixtures and do not cover MANIFEST behavior.

### High: Meeting-derived Jira proposals and email drafts are dropped

Feature 11 requires the reused meeting closeout package to create Jira proposals and email follow-up drafts when supported (`docs/specs/workbench-activity-reconciliation.md:256`). `buildReviewPackage` does create `jiraProposals` and `emailDrafts` (`server/meeting-closeout.mjs:505`, `server/meeting-closeout.mjs:575`), but `processActivityMeeting` returns only package status, receipt, and links (`server/jira-gateway.mjs:2625`). The service prepares the Jira and email review before meeting processing (`server/activity-reconciliation/activity-reconciliation.mjs:761`, `server/activity-reconciliation/activity-reconciliation.mjs:770`), so proposals produced by meeting closeout cannot appear in the activity run review or recap.

Why it matters: a meeting can be processed successfully while its own Jira and email follow-ups never reach the approval UI. That leaves AC-14 and the meeting proposal portion of AC-15 under-implemented.

### Medium: Stop cannot interrupt the Microsoft 365 source read

The service passes `isCancellationRequested` into source collection (`server/activity-reconciliation/activity-reconciliation.mjs:529`), but `collectActivitySources` ignores it and starts `runMicrosoft365` plus the Brain reader in one `Promise.all` (`server/activity-reconciliation/activity-sources.mjs:380`, `server/activity-reconciliation/activity-sources.mjs:388`). `runMicrosoft365` then waits for the Python process for up to 900 seconds (`server/activity-reconciliation/activity-sources.mjs:106`). Stop is only checked after collection returns (`server/activity-reconciliation/activity-reconciliation.mjs:758`).

Why it matters: AC-20 says Stop should preserve completed units and resume unfinished work. In a slow Microsoft 365 read, the user can request Stop, but the run remains stuck in the current read until the external process returns or times out. The test at `server/activity-reconciliation/activity-reconciliation.test.mjs:179` proves only that Stop waits for a mocked read to release, not that the collector can stop between source units or expose partial source progress.

### Medium: The Work action does not itself create or resume a run

The required outcome says selecting "Reconcile activity" creates or resumes one reconciliation run (`docs/specs/workbench-activity-reconciliation.md:20`). The Work button only opens the panel (`src/features/jira/JiraWorkSurface.tsx:422`), and the actual start call is behind a second `Start reconciliation` click (`src/features/activity-reconciliation/ActivityReconciliationPanel.tsx:364`). The browser test locks in that behavior by asserting zero start calls after selecting `Reconcile activity` (`tests/activity-reconciliation.spec.ts:327`).

Why it matters: the implemented flow is two-step. That may be acceptable if the idle state is intentional, but it does not match the stated required outcome and should be clarified or changed.

## Evidence That Supports Passing Areas

- Saved state lives outside the repo via `%LOCALAPPDATA%\IPCorpBrain\activity-reconciliation.json` (`server/jira-gateway.mjs:91`).
- Source windows use 2026-01-01 for the first run and a 15-minute overlap for later runs (`server/activity-reconciliation/activity-reconciliation.mjs:105`).
- Source positions advance only for successful or confirmed partial reads (`server/activity-reconciliation/activity-reconciliation.mjs:504`).
- Saved run state stores content hashes and redacted evidence metadata, not transcript runtime text (`server/activity-reconciliation/activity-reconciliation.mjs:447`, `server/activity-reconciliation/evidence.mjs:186`).
- Jira apply uses a saved apply receipt keyed by run and selected proposal IDs, and concurrent identical calls share one promise (`server/activity-reconciliation/activity-reconciliation.mjs:920`).
- Stale Jira update protection reads the issue before applying existing-issue changes (`server/jira-gateway.mjs:2752`).
- UI has ARIA live updates, focus movement on start and completion, source cards, counts, Stop, Resume, recap, and draft-only email display (`src/features/activity-reconciliation/ActivityReconciliationPanel.tsx:218`, `src/features/activity-reconciliation/ActivityReconciliationPanel.tsx:397`, `src/features/activity-reconciliation/ActivityReconciliationPanel.tsx:602`).

## Residual Risk

- I did not rerun the Playwright suite or live read-only Microsoft 365/Jira probes in this review. The submitted evidence says they passed, but my current proof is limited to focused server checks and TypeScript.
- I did not inspect files outside the requested paths.
