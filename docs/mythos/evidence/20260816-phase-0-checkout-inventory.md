# Phase 0 evidence: checkout inventory and recovery points

Date: 2026-08-16
Phase: 0, Preserve and rewrite
Prior state: 60 tracked modifications and 56 untracked paths sitting uncommitted on `main`

## Why this existed

The architecture review of 2026-08-15 stopped the build sequence and asked for a recovery
point first. Its exact words: without durable checkpoints, "a later reviewer cannot reliably
distinguish a new regression from the substantial work already sitting in `main`."

At review time the count was 51 tracked and 40 untracked. By the time Phase 0 ran it had grown
to 60 and 56, because two further sessions worked in the same checkout.

## What the changes were

Every uncommitted path is now a commit on `main`, pushed to `origin`. Each row below states
what the work is and whether it is finished, paused, or inherited from another session.

| Commit | Work | Standing |
| --- | --- | --- |
| `8475cc8` | Untrack the Playwright report and last-run marker | Complete. Both were already ignored, so every test run dirtied the checkout. |
| `8ab5bf9` | Saved work-item and receipt engine, meeting closeout and Today snapshot as its first two consumers | Complete for internal work. Explicitly **not** safe for external effects. This is what Phase 1 repairs. |
| `094499e` | Activity reconciliation lifecycle module | Partial. The lifecycle exists; the migration onto shared saved steps is Phase 2. |
| `4f7482e` | Jira time analytics and the gateway refusing an issue with no written description | Complete. Read-only analytics. The gateway change closes a real defect where canned bullets were posted under Steve's account. |
| `3095f5c` | Codex infographics, placeholder removed, meeting follow-ups with stable identity | Mixed. The visual work is complete. **The follow-up identity work is paused**, see below. |
| `3b5be4e` | Collapsing left nav, Today reading the snapshot | Complete and verified. Inherited from Codex session `01a00a21-a400` (`sage-arc`). |
| `f6bad60` | Loop and board follow-ups, phase-infographic skill | Complete. Loop stays in shadow. |
| `b53b737` | Refreshed data export | Complete. Regenerated read model, no behavior change. |
| `ffac5ee` | Build record: acceptance checks, lanes, evidence, reviews since 2026-08-13 | Complete as a record. The plan documents it contains were still wrong at that moment, which Phase 0 now corrects. |
| `90e9c64` | Meeting closeout end-to-end checks | Complete. |
| bridge repo `484e951` | Nexus Omni Bridge, first commit | Complete and separate. Not Workbench code. |

## The paused work, stated plainly

`3095f5c` contains the beginning of the meeting-to-execution bridge: `src/features/meeting-actions/`
and the follow-up identity it uses. The review rejected starting this before the state
protections existed, and it was already underway when the review landed.

It is **paused, not discarded**. It is committed so it is recoverable, and it is not wired to
create anything. Its current behavior is read-only: show a Jira key when one already exists,
show a recorded run when one already exists, and say plainly when neither does. Nothing in it
creates a Jira issue, sends anything, or writes to the Brain.

The identity it uses is also known to be wrong in the way the review described: it derives
from evidence content, so changed evidence produces a second record rather than a new revision
of the same one. Phase 1 replaces that with a permanent lineage plus revisions. Phase 3 then
rebuilds this feature on top of it.

## Inherited work from other sessions

Two sessions edited this checkout while the plan was stopped. Both are ended.

- `sage-arc`, Codex `01a00a21-a400`, ipcorp-brain-frontend: the responsive left-nav collapse.
  It found that CSS made the rail look collapsed below 1200px while React still considered it
  expanded, leaving the control, submenu rendering, and accessibility state out of sync. Its
  fix makes responsive collapse a real state and remembers the manual choice separately. It
  reported the implementation in and typecheck clean, then went quiet before reporting its
  browser checks.
- `swift-tower`, Nexus session `748dff0b`: registered and ended without producing a single
  turn. Zero messages, no transcript source. It changed nothing.

## Recorded failures inherited

None open. The one unfinished check from `sage-arc` was run during Phase 0 and passed.

## Verification run before the checkpoints were created

| Check | Result |
| --- | --- |
| `node --test` across `server/` and `scripts/` | 360 passed, 0 failed |
| `tsc --noEmit` | clean |
| `biome check --write .` | 6 files fixed; 4 remaining errors are pre-existing in files this work never touched |
| `playwright test tests/sidebar-collapse.spec.ts` | 6 passed in Chromium and Firefox, closing `sage-arc`'s unfinished check |

## Recovery points

`main`, pushed to `origin/main` at `34b6684..90e9c64`. Every commit above is reachable and can
be reverted independently.

## Known defect recorded rather than fixed

`server/activity-reconciliation/activity-lifecycle.mjs:237` assigns `clock` and never uses it.
It looks like injectable time for tests that was never wired up, so the correct repair may be
to use it rather than delete it. Phase 1 touches this file and should resolve it there.

## What Phase 0 still owed after this inventory

The plan rewrite, the parked-work record above, the work breakdown for all nine phases, and
the Phase 1 completion checks. Those are the remaining Phase 0 items.
