# Workbench activity reconciliation acceptance checks

**Status: FROZEN 2026-08-06 11:13 ET**

## Task summary

Add the approved activity reconciliation workflow to the Work screen. The full
instruction is `docs/specs/workbench-activity-reconciliation.md`; AC-01 through
AC-25 in that file are part of this frozen check set.

## User-visible outcome

1. Reconcile activity starts only after Steve selects it on Work.
2. One saved run reads the requested activity period and stays visibly active.
3. Evidence creates only reviewable, source-backed Jira and email proposals.
4. Ready, unprocessed meeting fixtures produce complete, displayable packages.
5. The final view contains changes, proposals, source failures, and receipts only.

## Work not included

- Scheduled or page-load collection
- Automatic email sending
- Jira changes without selected review and typed confirmation
- Real meeting processing or real Brain writes during verification
- Redesigning unrelated Work, Meetings, or Jira surfaces

## Likely implementation areas

- `server/activity-reconciliation/`
- `server/jira-gateway.mjs` and `server/m365-reconcile.py`
- `server/meeting-closeout.mjs`
- `src/features/activity-reconciliation/`
- `src/features/jira/JiraWorkSurface.tsx` and focused tests

## Frozen acceptance checks

### Run and source behavior

- A run captures startedAt before reads and finishedAt after saved recap state.
- The first run uses 2026-01-01; later source positions include a 15-minute overlap.
- Late items, changed content, repeated overlap items, and pending transcripts behave as specified.
- One active run exists across tabs; reload and restart attach or resume it.
- Stop preserves completed units and does not advance unfinished source positions.

### Evidence and external proposals

- All eight Outlook, Teams, transcript, and Brain streams report truthful states.
- Jira association follows exact evidence first and leaves ambiguous candidates unselected.
- No unrelated Jira item or no-op comment appears.
- Apply uses a durable run ID plus proposal ID claim and returns saved receipts on retry.
- Email remains draft-only and Jira changes require explicit selected confirmation.

### Meeting completion and repair

- Only ended meetings with a ready, non-empty, unprocessed Teams transcript advance.
- Missing transcripts stay pending even after the normal activity period moves on.
- A summary marker cannot hide missing later artifacts after an interruption.
- Completion requires Brain fixture records, Workbench entity links, a saved visual, association, and display.
- Brain write behavior follows the Brain instructions and is tested only with temporary fixtures.

### Interface and recap

- The run panel continuously shows phase, sources, counts, elapsed time, activity, and Stop.
- Loading, empty, unavailable, review-needed, error, partial, canceled, and completed states are distinct.
- The recap groups changed results by destination and source and omits unchanged items.
- Keyboard, focus, reduced motion, laptop, and phone behavior meet AC-23.
- Raw messages, full transcripts, credentials, and tokens never enter saved run state or browser storage.

## Verification

- Focused Node tests for saved state, source positions, association, apply claims, cancellation, and meeting repair
- TypeScript and focused Biome checks
- Production build
- Playwright fixture path for start, progress, Stop, Resume, recap, review, and two-tab apply
- Read-only source probes with request IDs and redacted counts only

## Risks

- The checkout contains many unrelated edits, including the gateway and Jira UI.
- A slow Microsoft 365 read must remain single-flight and stoppable after its current safe unit.
- Existing meeting persistence can return early after a summary marker.
- Existing scan-ledger writes are not serialized.
- The final meeting PNG creation path is not yet verified from Workbench.

## Rollback

Remove the new activity feature files and revert only the narrow gateway,
meeting, and Work-screen integration edits. Leave existing MDM reconciliation,
meeting wrap-up, and unrelated shared work unchanged.

## Created

2026-08-06 11:13 ET
