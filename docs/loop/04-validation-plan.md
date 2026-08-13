# Validation plan

Nothing in this build is trusted because it existed in a prior repo, and
nothing is trusted because an agent said it worked. This file is the
checklist that makes both stick.

## The port checklist (every adopted behavior, no exceptions)

Copy `ports/TEMPLATE.md` to `ports/<name>.md` and complete it in order:

1. **Spec (one page).** What behavior we want, in our words. What the donor
   does that we are NOT taking. The test that will prove it.
2. **Red.** The failing test lands in this repo first, named after the
   behavior, and the failure output is pasted into the port spec.
3. **Green, small.** The implementation is written fresh at the smallest
   size that passes. Donor code may be read, never pasted wholesale.
   Anything unexplainable does not come in.
4. **Real exercise.** One end-to-end run against real data behind a flag,
   with the evidence (receipt, readback, output path) linked in the spec.
5. **Sign-off.** The port spec's checklist is fully checked and the commit
   message links it. An unchecked port spec on main fails review.

Budget: about a day per port. Blowing the budget means the donor was the
wrong source; write the small fresh version instead and say so in the spec.

## Test strategy per module

| Module | Failable checks |
|---|---|
| Scheduler | Unit: wake emits exactly the open items, never acts. Clock injected. |
| Policy engine | Unit: classification table-driven; pinned classes refuse override even when the policy file tries; earned promotion and failure demotion both proven. |
| Prompt assembler | Unit: brief contains the evidence sections for a fixture item; banned-word scan on assembled rule text; missing context fails closed, never silently thin. |
| Dispatcher | Unit: lifecycle transitions; retry backoff; runaway heartbeat kill; worktree isolation (a run cannot write outside its tree). Integration: one real dispatch behind a flag. |
| Verifier | Unit: each ladder; a run without verification renders unverified; convergence loop stops at zero and at round cap, both proven. |
| Receipts | Unit: append-only enforced; token accounting sums; board query joins. |
| Foreman | Unit: escalation always carries the four fields; briefing cites receipt ids; voice rules pass. Content checks with the existing scanners. |
| Board extension | Playwright: receipts strip, approval card round trip, escalation card shows fix in flight. |

## The trust ladder (how autonomy widens without faith)

- Every class starts at ask-first or run-then-show. Nothing starts at auto.
- Promotion to a higher tier requires `promote_at` consecutive verified
  successes (default 10) AND a week of operation in the current tier.
- Any verified failure drops the class one tier immediately. The retro
  reports every tier change with the receipt that caused it.
- Send-class and invite-class actions do not participate in the ladder.
  They are ask-first as code, not as data.

## Model-tier audits

Weekly, from receipts: tokens per work class per tier. Two hard checks the
retro runs automatically:
1. No top-tier call in a class the policy assigns to a lower tier.
2. No class whose local-model failure rate exceeds its subscription-tier
   failure rate by more than the written threshold keeps its assignment;
   the retro flags it for a policy commit.

## Rollout order with kill switches

1. Everything ships dark behind `LOOP_ENABLED=0`.
2. First light: sense and classify only; the board shows what the loop
   WOULD do, does nothing. One week shadow.
3. Second: auto-tier for the two lowest-risk classes (meeting processing of
   supplied captures, snapshot syncs). Everything else staged.
4. Then classes promote one at a time per the trust ladder.
5. `LOOP_ENABLED=0` at any moment returns the Workbench to exactly today's
   behavior; the loop owns nothing another path depends on.
