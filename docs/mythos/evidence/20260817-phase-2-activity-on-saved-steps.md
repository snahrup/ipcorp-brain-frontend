# Phase 2 evidence: activity on saved steps

Date: 2026-08-17
Branch: `phase-2/activity-on-saved-steps`
Checks: `docs/mythos/gates/20260817-activity-on-saved-steps.md`
Status: review round one returned NEEDS CHANGES; its findings are fixed and re-verification is pending

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

## What the independent review found, and what was done

Round one verdict: NEEDS CHANGES. The blocking findings, all fixed:

1. **A failed source was cached and never retried.** The failed artifact validated on resume,
   so a transient mailbox outage became permanent for that run id. An unhealthy prior artifact
   now salts the next step input, so the source reruns. Round two found the first salt was a
function of the failure's content and repeated after the second identical failure; it is the
step's attempt count now, which moves every run. AJ-02c proves two identical failures then a
recovery, with the reader called on every run. Accepted consequence, stated: the
   first run after a recovery reads that source once more than strictly necessary. Covered by
   AJ-02b, which also proves a malformed artifact is retried rather than trusted.
2. **The death test never killed anything.** The old AJ-02/03 completed its first run cleanly,
   which releases the lease; a killed process does not. AJ-03b now claims the run as a dead
   worker and proves the honest semantics: busy while the abandoned lease is live, then the
   same run id resumes after expiry, still one work item. The busy window is the engine's
   duplicate-work protection and is reported, not hidden.
3. **Partial was not reported.** The return now carries `partial` and `failedSources`, asserted
   in AJ-04.
4. **The sources map leaked unselected streams** from the engine's cumulative projection. It is
   filtered to the run's selection now.
5. **AJ-07's keep clause was untested.** AJ-07b runs two sources, ignores the stop in the first
   reader, and proves the validated result is kept while the second source never starts.
6. The dead test scaffolding and the misleading comment are gone, and the AJ-08 guard now
   strips comments and refuses any clock reference, so destructuring cannot slip past it.

Known limits the review named, accepted and recorded: `resume: true` reaches the engine's
resume before the lease check, so a caller can clear a pending stop it does not own (engine
behavior from Phase 1, now filed on the risk register's Phase 4 list); a deselected then reselected
source with an unchanged window and position serves its saved artifact without a reread, which
is the same semantics AJ-05 proves and is judged correct; and importing the reconciliation
module for its source list drags in more than eight strings, deferred to the wiring increment.

Mutation evidence for the round-one fixes: disabling the retry salts failed AJ-02b; forcing
`partial: false` failed AJ-04 and AJ-02b. Restored to 10 of 10.

## Verification

| Check | Result |
| --- | --- |
| Phase 2 checks | 10 pass, 0 fail |
| Full suite | 394 tests, 394 pass over server/ and scripts/ (Phase 1 closed at 384). Three src/ test files sit outside this scope, one pre-existing red, untouched by this branch. |
| `tsc --noEmit` | clean |
| Live external effects | none anywhere; every reader in the checks is an inert function |

Four load-sensitive checks are now known: the three named in the Phase 1 evidence, plus
`concurrent saveLedger calls to the same path never collide on the tmp file` in
`server/mdm-reconciliation/scan-ledger.test.mjs`, seen red under parallel load by the round
two review and green in isolation. All unrelated to this work.
