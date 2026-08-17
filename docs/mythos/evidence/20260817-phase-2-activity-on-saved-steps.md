# Phase 2 evidence: activity on saved steps

Date: 2026-08-17
Branch: `phase-2/activity-on-saved-steps`
Checks: `docs/mythos/gates/20260817-activity-on-saved-steps.md`
Status: complete pending independent review

## What was built

`server/activity-reconciliation/activity-saved-collection.mjs`: activity source collection as
a saved-step job on the Phase 1 engine. Each selected source is its own saved step. The run id
is the work item id, so a restart resumes the same run instead of starting a second one.

Two decisions worth naming:

- **A reader that fails does not fail its step.** The failure becomes a failed-source artifact,
  because one unreachable mailbox must not erase the results of the seven streams that
  answered. A cancelled reader is the exception: it rethrows so the engine quarantines its
  work as stopped, per the Phase 1 AS-07 amendment.
- **The skip identity is the window plus the saved position.** Those two inputs decide what a
  reader would fetch, so when both are unchanged the saved artifact is served and the reader
  is not called; when either moves, exactly that source reruns.

AJ-08 was found already resolved: the unused `clock` assignment in `activity-lifecycle.mjs`
was removed earlier with a comment stating that every timestamp comes from the run record. A
source guard now keeps the option from returning half-wired.

## What this phase does not claim

The existing reconciliation service still has its own single-shot collect path; the gateway
has not been switched to this module yet. That wiring, and retiring the old path, belongs to
the service integration increment that follows. The engine path itself is what Phase 2's
checks required, and it is proven.

## Fail then pass

The checks passed on first run because the engine they exercise landed in Phase 1. The two
protections this module itself owns were proven by mutation:

| Protection disabled | Check that failed |
| --- | --- |
| failure isolation (reader errors rethrown instead of saved) | AJ-04 |
| skip identity (step input ignores window and position) | AJ-06 |

Both restored to 7 of 7.

## Verification

| Check | Result |
| --- | --- |
| Phase 2 checks | 7 pass, 0 fail |
| Full suite | 391 tests, 391 pass (Phase 1 closed at 384) |
| `tsc --noEmit` | clean |
| Live external effects | none anywhere; every reader in the checks is an inert function |

The three load-sensitive checks named in the Phase 1 evidence remain load-sensitive and
unrelated to this work.
