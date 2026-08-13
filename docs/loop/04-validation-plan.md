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

## Adopted from TrendOperator (Steve's parallel build, 2026-08-13)

Steve's TrendOperator spec converged on the same loop independently, and
four of its rules are stronger than ours were. They bind the dispatcher
port when it is built:

1. **No action without observability.** If the receipts ledger cannot be
   written, the loop refuses to act before the next action, not after. A
   health check on the ledger is a startup and per-pass precondition.
2. **Skill specs carry the failure path.** Every dispatcher skill defines
   preconditions, allowed actions, expected result, verification rule,
   timeout, retry limit, recovery, audit evidence, and permitted next
   states. A skill without its failure path is incomplete.
3. **Immutable briefs, reconcile before resume.** A dispatch brief freezes
   at dispatch; the agent cannot rewrite its own objective mid-run. On any
   restart, the dispatcher compares last intended action against last
   verified result before acting, so a consequential action never repeats.
   This generalizes the Cowork one-job rule to everything.
4. **Degraded model mode.** When a tier's model is unreachable: checkpoint,
   then pause or use a smaller APPROVED model. Judgment work is never
   silently handed to a weaker model.

Later port worth taking back: hash-chained manifests under an identity the
runtime agent cannot touch. Our ledger is append-only by API; TrendOperator's
is tamper-evident by construction, which is stronger.

Deliberately NOT adopted: the computer-use stack (UI-TARS, accessibility
driving). TrendOperator needs it because its platform has no sanctioned API;
the Workbench acts only through verified APIs with readback, and importing
screen-driving would import that project's hardest reliability problem
without its justification.

## Rollout order with kill switches

1. Everything ships dark behind `LOOP_ENABLED=0`.
2. First light: sense and classify only; the board shows what the loop
   WOULD do, does nothing. One week shadow.
3. Second: auto-tier for the two lowest-risk classes (meeting processing of
   supplied captures, snapshot syncs). Everything else staged.
4. Then classes promote one at a time per the trust ladder.
5. `LOOP_ENABLED=0` at any moment returns the Workbench to exactly today's
   behavior; the loop owns nothing another path depends on.
