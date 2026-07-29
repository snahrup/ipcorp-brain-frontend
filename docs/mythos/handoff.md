# Workbench Integration Handoff

Status: Jira reconstruction in progress  
Updated: 2026-07-28

## Intended verified outcome

One blue-and-white IP Corporation Workbench with a team-first daily surface,
Brain-derived work board, preserved Brain library, truthful connection states,
approval previews, and lazy specialist Data work.

## Verification ledger

- 2026-07-29 focused UI pass: `npx biome lint src/features/jira/JiraIssueModal.tsx src/components/drawer/DetailDrawer.tsx src/components/drawer/MeetingDetail.tsx src/views/workbench/TeamLibraryView.tsx src/features/team-library/LibraryPreviewDrawer.tsx src/features/team-library/MermaidDiagram.tsx src/features/team-library/presentation.ts src/views/SourceHealthView.tsx src/App.css tests/smoke.spec.ts tests/team-library-preview.spec.ts --max-diagnostics=100 --diagnostic-level=error`: passed.
- 2026-07-29 focused UI pass: `npm run typecheck`: passed.
- 2026-07-29 focused UI pass: `npx playwright test tests/smoke.spec.ts tests/team-library-preview.spec.ts --project=chromium`: 11 passed.
- 2026-07-29 focused UI pass: `npm run build`: passed with existing large bundle warnings.
- `npm run typecheck`: passed after the expanded implementation.
- `node --check server/jira-gateway.mjs`: passed.
- `python -m py_compile server/m365-reconcile.py`: passed.
- Live Jira read: 154 `MT` issues.
- Live MDM preview: 154 issues, 29 stale open, 201 evidence records, 207
  review candidates, 3 disclosed conflicts, 0 automatic Jira writes.
- Team Library manifest: 115 usable artifacts, 6 of 6 source folders.
- Microsoft 365 evidence: authenticated Copilot Cowork sweep completed through
  2026-07-28 with 30 dated MDM records and explicit coverage limitations.

## Current governing reconstruction rules

- Treat activity as Steve's solo work unless an authorized source proves
  another participant, meeting, conversation, approval, or decision.
- Keep only demonstrably active and still-due work in `In Progress`.
- Use fully populated subtasks for real independently trackable decomposition.
- Create and verify blockers, dependencies, sequencing, duplicate,
  supersession, and related-work links when supported by evidence.
- Apply the user-specified 3x normalized-effort rule and audit each represented
  week against the 60 to 65 hour target without inventing filler.
- Limit retroactive Jira mutations to 2026-05-01 through 2026-07-28. Settle
  only the complete weeks from 2026-05-04 through 2026-07-26; treat the May
  and July boundary fragments as partial actual-evidence periods.
- Use the same policy, operation schema, provenance, idempotency, conflict
  handling, and Jira read-back in the permanent MDM `Refresh / Reconcile`
  feature.
- The earlier 207-candidate preview is diagnostic evidence only. Do not apply it
  directly; rebuild the candidate ledger from the complete authorized evidence
  inventory first.

## Live integration boundary

- Owner-local Microsoft 365 bridge: this is the existing Copilot Cowork MCP
  connector, already running over stdio. It is not Prism's retired Outlook
  desktop DOM/COM automation. Restarting it is neither required nor useful for
  browser access.
- Browser-to-Cowork boundary: fixed read-only adapter behind the localhost
  gateway; no credentials or arbitrary MCP methods reach the browser.
- Microsoft 365 evidence: currently unavailable due to a bounded response
  timeout, not an authentication or bridge-start failure. The Workbench
  adapter now uses two seven-minute Copilot Cowork attempts inside one
  15-minute hard ceiling instead of inheriting Claude Desktop's 40-second
  structured-call deadline.
- Jira runtime adapter: connected to the live `MT` project using the approved
  existing runtime credential source. Credential values are never returned,
  copied into source, or logged.
- Jira mutation routes: implemented with project guard, field whitelist,
  optimistic conflict detection, deliberate confirmation, and read-back.
- Jira mutation verification: intentionally not exercised against live work
  items during QA. The interface must not imply that a write was tested.
- Reconciliation: preview-only during this verification run; no proposed batch
  was applied.
- Team Library: reads the synchronized local OneDrive source. SharePoint cloud
  freshness remains unverified until the team connector can confirm it.
