# Current Task

Phase 2: move activity reconciliation fully onto the shared saved-step engine.

- Status: next up
- Authority: `docs/architecture/SELF-DRIVING-WORKBENCH-BUILD-PLAN.md`, Phase 2
- Prerequisite: Phase 1 complete, independent review PASS WITH FINDINGS, 2026-08-16
- Safety: no live Jira or communication effect; recommendation and review paths only
- Also owed: resolve the unused `clock` in `activity-lifecycle.mjs` while in that file

## Parallel track in progress: Track FB, Foreman Briefing (2026-08-17)

- The landing walkthrough program: morning briefing plus per-meeting countdown
- Authority: `docs/brainstorm/2026-08-17-foreman-briefing-spec.md`; roadmap section
  "Track FB" in `docs/architecture/SELF-DRIVING-WORKBENCH-BUILD-PLAN.md`
- Branch: `claude/dashboard-overload-brainstorm-7917fc` (worktree); Phase 2 files untouched
- Status: FB-1 and FB-2 implemented and verified in the worktree, each as its own commit on
  this branch. FB-1: rank, ledger, assembly, guided chapters, Playwright checks 4-7 (the
  resume check caught a real clobbered-resume defect first). FB-2: narration through the
  same headless drafting lane Weekly Status uses, an 8-test red-first suite covering both
  faces of spec check 3, voice-rule rejection, unknown-key drops, single-flight per day,
  and a race fix proven by a failing test first: a draft finishing after a mid-draft answer
  no longer erases the answer. e2e is now 5 checks in both browsers, including narration
  merge and the fail-closed mechanical render. Same hour, a test-isolation defect was found
  and fixed: the temp-dir helper released its env override at the first await, leaking test
  writes into the real %LOCALAPPDATA% foreman dir; the helper now awaits the async body,
  the one polluted file was deleted, and a clean suite run leaves the real dir empty.
- FB-3a implemented and verified (2026-08-17 evening, after the reboot): the countdown
  scheduler (calendar markers never ring, T-30 with immediate raise inside the window, T-15
  re-raise once on Later, outcomes persisted, injectable timers with idempotent re-arm), the
  Windows toast raiser (WinRT via PowerShell, protocol deep link, injection-safe argument
  array), and the gateway lane: POST /api/foreman/countdown/arm (a human-visit signal, so the
  normal single-flight cached calendar path), POST /api/foreman/countdown/outcome, and a
  startup re-arm that reads the cache ONLY, so a gateway restart never starts a Microsoft
  read (check 8 by construction; the live-smoke asserts it against the broker ledger).
  32 units green, red-first throughout; e2e 10/10 in both browsers with arming asserted to
  fire once per page open and never from navigation.
- Lesson recorded twice now, so it is a rule: never reach a sibling of the state root with
  "..". Under the test override that walks OUT of the sandbox into a shared directory
  (%TEMP%\countdown leaked exactly that way and poisoned three tests). The foreman state
  root is now ONE overridable directory with runs/, prompts/, and countdown/ beneath it.
- LIVE SMOKE DONE (2026-08-17 evening), and it earned its keep. The branch now runs side by
  side on 5218 plus its own gateway on 8818 (`npm run dev:foreman` and `dev:foreman:gateway`,
  both in .claude/launch.json), leaving the everyday 5217/8817 stack and the checkout another
  session is using completely alone. Against real Jira the briefing read 5 need you, 10
  waiting, 103 open, ranked five real items with 91 parked and 7 excluded for next-actor,
  and narration came back in Steve's voice naming real MT keys and dates. Three defects only
  the live stack could show: the gateway's write-origin allowlist knew only 5217, so every
  POST from the preview was refused; the countdown toast deep link hard-coded 5217 and now
  reads WORKBENCH_APP_ORIGIN; and the narration drafter passed its prompt as an "@file"
  argument that does not resolve on Windows, so the model received no prompt and answered
  this machine's session-startup hooks instead. The page did exactly what it promised while
  that was broken: mechanical copy, nothing canned, which is spec check 3 proving itself in
  production. Drafting now goes in on stdin with the working directory set to the state dir,
  outside any repository, so no project instructions or hooks can reach a drafting run, and
  a test asserts that invocation shape.
- Owed: a real toast observed at T-30 (the scheduler and raiser are proven by unit checks
  and the arm route returns 200 live, but nobody has watched one appear yet); FB-3b (the
  per-meeting prep chapters at /briefing/meeting/<id>, which today lands on the briefing
  itself) is next in the track.
- Safety: no external effect; replies land as drafts and comments through existing lanes

## Completed: Phase 1, Action-Safe State (2026-08-16)

- Branch `phase-1/action-safe-state`, merged to `main`
- Action identity with permanent lineage and evidence on revisions; lease generations with
  heartbeats and pre-write ownership checks; guarded resume; the external-effect lifecycle
  (prepared, claimed, attempting, confirmed, uncertain, reconcile, read back); completion
  authority requiring a verification receipt; stop reaching a running step; public-field
  allowlists, whole-payload secret scan, corrupt-artifact quarantine, backup and restore
- 24 checks in `server/workbench-state/action-safe-state*.test.mjs`, each proven able to fail
  by mutation; full suite 384 passing against a 360 baseline
- Independent review ran twice: NEEDS CHANGES with four blocking findings, all fixed, then
  PASS WITH FINDINGS with none blocking
- Two AS amendments recorded in the acceptance file; Phase 4 preconditions recorded on the
  risk register (the non-cooperative-step hole and the shape-only verification receipt)
- Evidence: `docs/mythos/evidence/20260816-phase-1-action-safe-state.md`

## Completed: Phase 0, preserve and rewrite (2026-08-16)

- The 116 uncommitted paths became 11 recovery commits on `main`; the plan was rewritten
  around the reviewed order; Phase 1 checks were frozen before implementation
- Steve confirmed the revised 0 through 8 order before Phase 1 started

## Paused work

The meeting-to-execution bridge was started before the review landed and is paused, not
discarded. It is committed at `3095f5c` and is read-only: it shows an existing Jira key and an
existing run when those exist, and says plainly when neither does. It creates nothing.

Its identity is known to be wrong in the way the review described. It derives from evidence
content, so changed evidence makes a second record instead of a new revision. Phase 1 replaces
that with a permanent lineage plus revisions, and Phase 3 rebuilds this feature on top of it.

Its earlier acceptance file, `docs/mythos/gates/20260814-200003-meeting-action-visibility.md`,
is superseded by Phase 3 of the build plan.

## Previous current task

Close the meeting visual recovery and define the next implementation sequence for the
self-driving Workbench.

- Status: visual recovery complete for every evidence-ready meeting; execution bridge planned
- Current result: 123 real meetings, 109 selected reviewed visuals, 14 source-blocked meetings
  with no selected visual, and 0 selected placeholder, failed, pending, or rejected receipts
- Source rule: compare every matching file, use Teams first, fill only genuine gaps, hash the
  evidence, and stop on unresolved disagreement
- Verification: 16 focused selector and generator checks, 123-meeting audit, production build,
  and desktop plus phone image checks in Chromium and Firefox passed
- Architecture result: meeting follow-ups now have a dependency-ordered plan for automatic
  Jira handling, autonomous suitability, five-perspective convergence, full dress rehearsal,
  value analysis, impact analysis, and per-class maturity
- Current authority: `docs/architecture/SELF-DRIVING-WORKBENCH-REMAINING-BUILD.md`
- Next implementation block: durable production visual worker and source recovery, then the
  meeting action ledger plus activity trust, then convergence and staged execution
- Safety: no live Jira, email, Teams, or Outlook effect was performed

## Previous active task

Move activity reconciliation onto the common saved work-item and receipt model, using the
completed meeting job as the first proven consumer.

- Status: next implementation block
- Prerequisite: saved meeting job completed 2026-08-14 04:23 ET
- Started: 2026-08-14 04:34 ET
- Acceptance checks: `docs/mythos/gates/20260814-043457-workbench-activity-completion.md`
- Current checkpoint: existing 25-item spec and current implementation mapped; common
  lifecycle, email-review safety, and missing acceptance evidence frozen before edits
- Scout refresh 2026-08-14 14:45 ET: live Today snapshot and Agent Board checked, visual
  replacement state checked, focused tests/typecheck/build passed, and the ordered
  remaining-work audit was written to
  `docs/mythos/evidence/20260814-self-driving-workbench-remaining-work.md`.
- Safety: no live Jira, email, Teams, or Outlook change; no automatic production run
- Preserve: all unrelated work in the shared checkout

## Previous completed work

Make meeting closeout the first resumable consumer of the Workbench state engine.

- Status: complete
- Started: 2026-08-14 03:35 ET
- Finished: 2026-08-14 04:23 ET
- Acceptance checks: `docs/mythos/gates/20260814-033500-workbench-meeting-job.md`
- Result: eight saved stages, async start, redacted status, stop and resume, startup
  recovery, exact-stage retry, verified PNG display, and one meeting job shared by activity
  reconciliation
- Evidence: `docs/mythos/evidence/20260814-workbench-meeting-job.md`
- Review: `docs/mythos/reviews/20260814-042332-workbench-meeting-job-final-review.md`
- Safety: no live Jira, email, Teams, or Outlook change; tests cannot reach real model or
  image work
- Preserve: all unrelated work in the shared checkout, plus
  `MEETING_CLOSEOUT_STATE_DIR` and `MEETING_CLOSEOUT_SYNTHESIS_BIN`

## Earlier completed work

Build Workbench Foundation Block 1: the restart-safe state engine, server-produced Today
snapshot, and current architecture index that all later meeting, reconciliation, agent,
and self-driving work will use.

- Status: complete
- Started: 2026-08-14 02:48 ET
- Finished: 2026-08-14 03:27 ET
- Acceptance checks: `docs/mythos/gates/20260814-024852-workbench-foundation-block-1.md`
- Result: append-only state and replay, Windows-safe lease operations, exact retry no-ops,
  one Today snapshot response, live desktop and phone proof, and current architecture map
- Evidence: `docs/mythos/evidence/20260814-workbench-foundation-block-1.md`
- Review: `docs/mythos/reviews/20260814-032700-workbench-foundation-block-1-final-review.md`
- Preserve: all unrelated work in the shared checkout

## Earlier completed work

Make Today reflect the current Workbench, preserve completed ticket-agent evidence across
local server restarts, reconcile multiple meeting captures, replace local visual
placeholders with verified Codex or NotebookLM images, and publish the ordered architecture
roadmap for the remaining Workbench work.

- Status: complete
- Started: 2026-08-13 21:20 ET
- Finished: 2026-08-14 00:16 ET
- Acceptance checks: `docs/mythos/gates/20260813-212000-workbench-today-freshness.md`
- Current checkpoint: Today, saved reconciliation, transcript consolidation, Codex-first
  image generation, final live restart proof, architecture review, and fresh review complete
- Confirmed before edits: Today is Jira-only; Jira was read live at 21:09 ET; Agent Board
  had 2 delivered items and 31 waiting; loop was shadow-only; activity reconciliation was
  last completed on August 10; in-memory ticket-agent history was empty after restart
- Preserve: all unrelated work in the shared checkout
- Safety: no Jira apply, email send, Teams send, Outlook draft delivery, or overlapping
  Microsoft request
- Result: After the local date changed to August 14, Today correctly shows 0 delivered,
  0 working, 49 waiting, 104 open issues, the prior activity run as old, and current
  shadow loop state. Seven ticket-agent summaries survive restart. Failed image generation
  leaves no placeholder. The ordered remaining-work plan is
  `docs/architecture/WORKBENCH-ARCHITECTURE-ROADMAP.md`.
- Evidence: `docs/mythos/evidence/20260813-workbench-today-freshness.md`
- Review: `docs/mythos/reviews/20260814-001600-workbench-final-review.md`

## Earlier completed work

Implement the user-triggered Workbench activity reconciliation workflow from the
approved copy-ready specification.

- Status: complete
- Started: 2026-08-06 11:13 ET
- Finished: 2026-08-06 13:40 ET
- Source: `docs/specs/workbench-activity-reconciliation.md`
- Acceptance checks: `docs/mythos/gates/20260806-111351-workbench-activity-reconciliation.md`
- Current checkpoint: implementation, safe live Work check, and final verification complete
- Primary additions: `server/activity-reconciliation/`,
  `src/features/activity-reconciliation/`, focused Jira and meeting integration,
  and `tests/activity-reconciliation.spec.ts`
- Verification: 26 server tests, 10 Chromium and Firefox browser tests, TypeScript,
  focused Biome, syntax checks, production build, live Work panel check, and real
  read-only Microsoft 365, Jira, and Brain probes
- Evidence: `docs/mythos/evidence/20260806-workbench-activity-reconciliation.md`
- Review: `docs/mythos/reviews/20260806-activity-reconciliation-final-review.md`
- Preserve: all unrelated modified and untracked files in the shared checkout
- Safety: no email send, no unreviewed Jira change, and no real meeting or Brain write
  during verification

## Earlier completed work

Build a dependable, global Workbench agent for guidance, navigation, UI assistance,
connected-service lookup, and confirmed maintenance.

- Status: complete
- Started: 2026-08-06 06:51 ET
- Finished: 2026-08-06 08:40 ET
- Primary additions: `server/workbench-agent/` and `src/features/workbench-agent/`
- Verification: unit, route, type, build, browser, direct health, safe live lookup,
  safe live connector read, and fresh review passed

Audit infographic coverage for every meeting in the Workbench Meetings index.

- Status: complete
- Started: 2026-08-05
- Finished: 2026-08-06 01:15 ET
- Result: 118 reviewed; 88 complete; 4 missing display only; 0 missing saved artifact only;
  1 missing association only; 25 fully missing; 0 unavailable
- Evidence: `docs/mythos/evidence/20260805-meeting-infographic-audit.md`
- Review: `docs/mythos/reviews/20260805-meeting-infographic-audit-review.md`
- Safety: no infographic or Brain record was created, changed, removed, or linked

## Earlier completed work

Fix the MDM reconciliation modal so it stops re-proposing every evidence record ever
exported on every run.

- Status: complete
- Started: 2026-08-05 18:30 ET
- Finished: 2026-08-05 19:20 ET
- Source checkout: shared main checkout
- Primary files: `server/mdm-reconciliation/scan-ledger.mjs` (new), `server/jira-gateway.mjs`,
  `src/features/jira/MdmReconciliationModal.tsx`, `src/features/jira/{api,types}.ts`, `src/App.css`
- Ledger state file: `%LOCALAPPDATA%\IPCorpBrain\mdm-reconciliation-ledger.json`
  (outside the repo on purpose; see the gate amendment)
- Verification: 10 unit tests (red first), policy suite, typecheck, scoped lint,
  three-step live gateway sequence, DOM-level browser check with a reload probe
- Gate: `docs/mythos/gates/20260805-183000-reconciliation-scan-ledger.md`
- Preserve: every unrelated modified and untracked file (other sessions are active
  in this checkout)

Phase 2 is scoped but NOT started: threading the scan window into the Microsoft 365
collection, creating Jira issues from candidate-new-work, the meeting catch-up
sweep (transcripts, brain, infographics), and the full recap and progress
choreography Steve described on 2026-08-05.
