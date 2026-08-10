# Current Task

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

## Previous completed work

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
