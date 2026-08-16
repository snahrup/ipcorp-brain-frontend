# Phase 1 evidence: Action-Safe State

Date: 2026-08-16
Branch: `phase-1/action-safe-state`
Checks: `docs/mythos/gates/20260816-action-safe-state.md`
Status: **the nine checks pass. The phase is not finished.** See the open items at the end.

## No live external effect

Nothing in this work performed a Jira, Brain, Outlook, Teams, email, or provider effect. The
effect lifecycle is a state machine with no destination client attached to it yet. Every check
runs against a temporary state root under the operating system temp folder.

## Fail then pass

The checks were written and run before any implementation existed. First run:

```
# tests 1
# pass 0
# fail 1
```

It failed at import, because `action-identity.mjs` and `effect-lifecycle.mjs` did not exist.
After implementation:

```
# tests 14
# pass 14
# fail 0
```

Full unit suite, before this work: 360 passed. After: **374 passed, 0 failed**, which is the
original 360 plus the 14 new checks, with no existing check weakened to make room.

`tsc --noEmit` clean. Biome clean across every file this work touched.

## The nine checks

| Check | What it proves | Where |
| --- | --- | --- |
| AS-01 | A second create for one work-item id is a recorded conflict. The first definition survives. | `index.mjs` `appendEventLocked` |
| AS-02 | Changed evidence revises one lineage instead of creating a second action. | `action-identity.mjs` |
| AS-03 | Ids differing only in unsafe characters do not share a state path. | `index.mjs` `stateSegmentFor` |
| AS-03b | Two colliding job ids keep separate saved steps on disk, end to end. | `step-runner.mjs` `jobDirPath` |
| AS-04 | An expired lease admits a new owner; the old owner's write is refused on its generation. | `index.mjs` `isOwnerWriteCurrent` |
| AS-04b | A lease records process start identity, not the pid alone. | `index.mjs` `PROCESS_IDENTITY` |
| AS-05 | Resume refuses a live owner and takes over a genuinely dead one. | `index.mjs` `resumeWorkItemGuarded` |
| AS-06 | Process loss after the destination responded leaves an uncertain effect, and reconciliation confirms it without a second request. | `effect-lifecycle.mjs` |
| AS-06b | A confirmed effect is not finished until it is read back. | `effect-lifecycle.mjs` |
| AS-07 | Output can be quarantined and the work item shows it. | `index.mjs` `quarantineRecord` |
| AS-08 | Externally acting work cannot complete without a verification receipt, and a raw completion event is refused. | `index.mjs` `completeWorkItem` |
| AS-08b | Internal work still completes without an external receipt. | same |
| AS-09 | A public model names and refuses fields that are not on its allowlist. | `action-identity.mjs` `buildPublicModel` |
| AS-09b | A secret scan finds credential material in saved state and page payloads. | `action-identity.mjs` `scanForSecrets` |

## Three things the work changed my mind about

**The fencing value decides ownership, not the wall clock.** My first implementation refused
any write once the lease timestamp had lapsed. That rejected a legitimate completion at the
exact instant a lease expired, with nobody else having claimed the work. The review says reject
output from an expired *generation*. A matching generation proves no takeover happened, because
every claim raises it. Completion now checks the generation while holding the lease mutation
lock, where a competing claim cannot slip in. Mid-run writes still ask for the stricter clock
check, because renewing the heartbeat is the right response there.

**Discarding finished work on every stop is the wrong reading of AS-07.** My first pass
quarantined a step's output whenever a stop arrived while that step ran. That threw away real,
validated work on every pause and made a resumed job repeat the step it had already finished.
The output that actually needs quarantining is output that lands when this worker no longer
owns the work. A stop now aborts anything still in flight, keeps the completed step, and halts
before the next one.

**A default that assumes the owner is alive defeats startup recovery.** Guarding resume broke
crash recovery, because the guard had no way to tell a live owner from a dead one and assumed
alive. Owners are named with their pid, so the probe is `process.kill(pid, 0)`, plus one extra
rule: a pid that matches this process while carrying a different start identity is a recycled
pid, which Windows hands out freely, so that owner is gone.

## Changes to existing behavior

- `runSavedStepJob` completes through `completeWorkItem` and reports `completion_refused`,
  `lease_lost`, or `stopped` where it previously only reported `completed` or `failed`.
- The runner renews its lease before each step and rechecks ownership before each durable write.
- `step.run` receives a `signal`, so a step can observe cancellation.
- Activity reconciliation completes through `completeWorkItem`. Its return value is now
  `{ status: "completed", event }` rather than the raw append result, and one assertion in its
  own test was updated to match that. No check was loosened.
- Saved-step artifact paths use collision-resistant segments, with a fallback that reads the
  old path when a job was written before this change, so an interrupted job still resumes.
- The unused injected `clock` in `activity-lifecycle.mjs` is gone. Every timestamp that module
  records comes from the run record it was handed.

## Pre-existing flake, not caused by this work

`the child runner enforces an overall timeout` in
`server/mdm-reconciliation/run-weekly-synthesis-queue.test.mjs` fails intermittently under full
suite load. Verified pre-existing: with this work stashed, a clean checkout of `main` fails the
same check the same way under the same load, while the file passes 3 of 3 in isolation. It is a
wall-clock timeout starved by concurrency. It passed on the final run here.

## Open items before Phase 1 can be called finished

1. **The allowlist and the secret scan are built but not yet enforced at the surfaces.**
   `buildPublicModel` and `scanForSecrets` have checks, but the page models the gateway serves
   do not run through them yet. The mechanism exists; the enforcement does not.
2. **Corrupt-state quarantine is manual.** `quarantineRecord` works, but nothing automatically
   quarantines a saved record that fails to parse.
3. **The minimal backup and restore check is not written.**
4. **Two failure exercises are not exercised end to end**: a corrupt saved record, and a stop
   during real provider execution. The second one needs the durable provider worker, which is
   the visual reliability lane rather than this phase.
5. **Independent review in fresh context has not been run.**
6. **The automatic Phase 1 infographic has not been produced.**

Items 1 through 3 are this phase's work and are the next thing to do. Item 4's provider half
belongs to the visual lane. Nothing here should be treated as finished until 1 through 3 land
and item 5 passes.
