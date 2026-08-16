# Lane 3: Serialized Refresh and User-Path Proof

## Purpose

Run the current activity pipeline once with safe options, sync any resulting local read
models, and prove Today through the real app path.

## In scope

- wait for the already-started calendar read to finish
- one activity run with sources, meetings, stale review, and MDM comparison
- Outlook draft delivery disabled
- local data sync when needed
- desktop and phone-width verification
- full automated checks and fresh review

## Out of scope

- Jira apply
- email or Teams send
- Outlook draft creation
- overlapping or retried Microsoft requests without a terminal receipt

## Dependencies

Lanes 1 and 2 complete, gateway restarted cleanly, and no Microsoft request in progress.

## Verification expectations

The saved run has one ID, a terminal status, source receipts, meeting results, and an MDM
comparison receipt. Today displays the resulting state at both requested widths.

## Owner role

verifier

## Status

complete

## Final evidence

- Saved run `activity-20260814011850-0e48fb03` finished `partial_success` with 1,480
  observed items, 86 new, 4 changed, three repaired meetings, and two excerpt-only
  meetings left partial.
- The run prepared 25 Jira proposals, four email drafts, and two MDM corrections for
  review. `actualChanges` was empty and Outlook draft delivery was disabled.
- The gateway restarted from the current checkout, stayed in loop mode `shadow`, and
  exposed ten delivered, zero working, and 49 waiting cards on the live Agent Board.
- Live desktop and 390-pixel phone checks showed Today, activity, and loop state with no
  browser errors, failed requests, or horizontal overflow.
- Evidence: `docs/mythos/evidence/20260813-workbench-today-freshness.md`
