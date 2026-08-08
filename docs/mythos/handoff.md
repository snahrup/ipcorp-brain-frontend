# Handoff

## Workbench activity reconciliation (2026-08-06, complete)

The Work screen now has a user-started activity reconciliation panel. It reads Outlook,
Teams, ready meeting captures, and relevant Brain updates through one saved incremental
run, associates supported evidence with Jira work, and prepares reviewable proposals.

- Entry point: Work, then `Reconcile activity`; that action creates or resumes the run
- Service: `server/activity-reconciliation/`
- Interface: `src/features/activity-reconciliation/`
- Jira and meeting integration: `server/jira-gateway.mjs`, `server/meeting-closeout.mjs`,
  `server/meeting-infographic-renderer.mjs`, `src/features/jira/JiraWorkSurface.tsx`
- Acceptance checks: `docs/mythos/gates/20260806-111351-workbench-activity-reconciliation.md`
- Evidence: `docs/mythos/evidence/20260806-workbench-activity-reconciliation.md`
- Review: `docs/mythos/reviews/20260806-activity-reconciliation-final-review.md`

The first run starts at January 1, 2026 and ends at its captured start time. Later runs
use each source's last successful position with a 15-minute overlap and a 7-day late-item
sweep. Stable source identities and content hashes suppress exact repeats while allowing
changed evidence to return. A stopped run resumes with the same run ID. Failed sources
keep their earlier successful positions.

Jira remains review-only until the user selects proposals and types the exact approval
phrase. Quoted or copied Jira keys require target review, no-op changes are removed, stale
issue reads stop apply, and the service saves an apply claim before any Jira write. Email
output stays draft-only.

Ready meetings are checked piece by piece. Missing summaries, decisions, actions, Brain
files, meeting records, infographic files, associations, processed-log rows, and Brain
change rows are repaired without repeating completed pieces. Raw meeting text stays in
memory for processing and is not saved in activity run state. Before any meeting file is
written, the service checks Brain instructions, dated change history, and open MANIFEST
rows, then stops if another pending file change still needs completion.

Verification passed: 26 server tests, 10 Chromium and Firefox browser tests, TypeScript,
focused Biome, Python and Node syntax checks, production build, live Work panel inspection,
and real read-only Microsoft 365, Jira, and Brain probes. Opening the live Work page made
no activity reconciliation request. The check stopped before selecting the action because
selection now starts or resumes work, and the status route confirmed that no run existed.

No email was sent, no Jira record was changed, no real meeting was processed, and no real
Brain file was written during verification. The shared checkout still contains unrelated
local work and must be preserved.

## Workbench agent (2026-08-06, expanded work in progress)

The Workbench now has one global agent surface mounted at the application shell.
It answers with live Agent SDK streaming, shows status while it thinks, supports Stop,
can move users to registered pages and sections, and can execute only the semantic
page actions the client reports as currently available.

- Service: `server/workbench-agent/`
- Interface: `src/features/workbench-agent/`
- Integration: `server/jira-gateway.mjs`, `src/App.tsx`
- Focused UI check: `tests/workbench-agent-registry.spec.ts`
- Acceptance checks: `docs/mythos/gates/20260806-065126-workbench-agent.md`
- Evidence: `docs/mythos/evidence/20260806-workbench-agent.md`

The service creates a local owner session with an HttpOnly cookie plus an in-memory
request token. Review records expire, are single-use, and are checked again before
any reviewed action runs. Workbench and Team Library reads are local, NotebookLM and
DevSpace expose readiness and safe reads, Microsoft 365 reads are exposed as read-only,
and write paths return unavailable unless a dedicated reviewed executor exists.

Verification passed: 24 server tests, 12 Playwright registry checks, TypeScript,
production build, focused Biome, the real `C:\Apps\IP Corp Brain Launch.bat`
path, direct health on ports 5217 and 8817, a safe live Workbench status lookup,
and a browser pass on desktop plus phone-width Workbench routes.

The Fabric Toolbox comparison expanded this work after the first verification pass.
SQL reads, Power BI reads and reviewed model changes, Fabric reads and reviewed cache
administration, richer answer formatting, and a visible source activity trail are now
being added. The earlier completion label and counts below are historical and will be
replaced after the expanded checks finish.

Residual limits: Microsoft 365 write execution is not enabled. The `frontend-verify`
wrapper dependency was missing, so the UI pass used the repo Playwright install
directly. Jira timed out on an earlier probe and then returned ready on the final
status read, proving the widget can report either state honestly.

## Meeting infographic coverage audit (2026-08-06, newest)

The Meetings overview now includes a collapsed, review-only infographic coverage audit.
It reads a checked snapshot produced by a repeatable read-only scanner and lists only
meetings that need attention.

- Audited: 118 meetings from the same array shown in Meetings
- Complete: 88
- Missing display only: 4
- Missing saved artifact only: 0
- Missing association only: 1
- Fully missing: 25
- Unavailable in the current run: 0
- Snapshot: `data/meeting-infographic-audit.json`
- Scanner: `scripts/meeting-infographic-audit.mjs`
- UI: `src/views/workbench/MeetingInfographicAudit.tsx`
- Evidence: `docs/mythos/evidence/20260805-meeting-infographic-audit.md`
- Review: `docs/mythos/reviews/20260805-meeting-infographic-audit-review.md`

One saved and associated PNG does not display because its Workbench image route returns
HTTP 500 with `ERR_INVALID_CHAR` for the response filename header. Three other saved and
associated files have no Workbench image link. One saved file is associated with a
different prepared meeting record. The snapshot contains the 25 fully missing meeting IDs.

Verification passed: 5 scanner tests, current snapshot check, focused Biome, TypeScript and
production build, 4 Chromium/Firefox audit tests with live image checking, the existing
Meetings smoke check, a phone keyboard/overflow check, and fresh read-only review.

No infographic or Brain record was created, changed, removed, or linked. The Brain checkout
already contains unrelated local edits and must remain untouched.

## MDM reconciliation scan ledger (2026-08-05, newest)

The Refresh and Reconcile MDM modal is now incremental. Every preview is a logged
scan; evidence is fingerprinted; dismissed and applied records stay gone unless
their substance changes; carried unresolved items hide behind a toggle; stale
tickets with no associated evidence are never turned into proposals.

- New module and tests: `server/mdm-reconciliation/scan-ledger.{mjs,test.mjs}` (10 tests)
- New route: `POST /api/jira/reconcile/dismiss` with fingerprints
- Ledger lives at `%LOCALAPPDATA%\IPCorpBrain\mdm-reconciliation-ledger.json`.
  NEVER move it into the repo: Tailwind v4's source scan watches every
  non-gitignored file and a mid-scan write reloads the whole app (verified live).
- The 169-item backlog is still pending-carried. Steve clears it himself in the
  modal: show carried, Select all shown, "Mark selected reviewed · no Jira change".
- Gate, evidence, review: `docs/mythos/{gates,evidence,reviews}/20260805-*`
- Phase 2 (not started): M365 window threading, issue creation from candidates,
  meeting catch-up sweep with infographics, full recap and live progress. Steve's
  full description is in the 2026-08-05 session, quoted in the gate's task summary.

The Meeting Wrap-up work is complete. The source Brain and frontend both contain unrelated local edits that must remain untouched.

## Meeting closeout result

- Path: `/meetings/wrap-up`, with the Meetings overview retained at `/meetings`
- Navigation: Meetings Overview, Daily Prep, then Meeting Wrap-up
- Calendar: current Outlook read returned three meetings for 2026-08-04 with times, organizers, and attendees
- Calendar states: loading, no meetings today, Microsoft 365 unavailable or not connected, and query error are shown separately
- Refresh resilience: a listed meeting stays visible and processable when refresh fails
- Processing: selected meeting identity drives a fixed Teams transcript, recap, and related-material lookup
- Fallback: unavailable Teams capture opens a pasted Cluely transcript form with optional context notes
- Review: commitments, Jira create or update proposals, supporting material, document requests, reminder candidates, and draft email follow-ups
- Storage: transcript, summary and context, task spec, run report, infographic HTML, processed log, and Brain changelog entry
- Workbench: saved closeouts reload from Brain meeting summaries
- Safety: email and Jira remain review-only, with no external change
- Verification: eight server checks passed, six browser checks passed across Chromium and Firefox, typecheck passed, the production build passed, and a fresh configured Microsoft 365 read returned three current meetings
- Evidence: `docs/mythos/evidence/20260804-meeting-closeout-verification.md`
- Repo note: full-project lint still reports existing findings in local worktrees, generated run files, and an unrelated server test; the eight touched implementation files pass focused checks

# Daily meeting prep handoff

The daily meeting prep work is complete in the shared checkout.

- Path: `/meetings/daily-prep`
- Navigation: child page under Meetings
- Data: dated prepared package folders only, with no Microsoft 365 read on page open
- Review: daily list, package detail, context, evidence note, and available files
- Actions: open, print, and download
- Truthful states: ready, incomplete, missing, empty, unavailable, and skipped
- Evidence: `docs/mythos/evidence/20260804-daily-meeting-prep.md`
- Status: completed and ready for coordinator review

## 2026-08-07 evening - Jira reconciliation reload fix

- Symptom: starting a Jira reconciliation (or any Workbench-dispatched run) full-reloaded the page back to Today
- Root cause: session hooks append SESSION-JOURNAL.md; the tracked file is scanned by Tailwind v4, so every write forced a Vite full reload
- Fix: `server.watch.ignored` in `vite.config.ts` for SESSION-JOURNAL.md plus the run-state lanes
- Verified live: fail repro before, pass repro after, two full reconciliation scans with journal writes mid-scan, zero reloads
- Evidence: `docs/mythos/evidence/20260807-jira-reconciliation-reload-fix.md`
- Open: data/meeting-infographic-audit.json can still reload via the module graph; journal remains tracked (gitignore has uncommitted edits from another session)
