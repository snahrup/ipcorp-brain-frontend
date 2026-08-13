# Charter: the self-driving Workbench

Written 2026-08-12. This is the founding document for the build. Everything
else in `docs/loop/` hangs off it.

## What we are building

A loop inside the Workbench that runs Steve's working day: it senses what
happened (calendar, meetings, comms, the board), decides what each item needs
under a written policy, executes work through context-rich agents, verifies
every result with checks that can fail, and reports through one surface and
one voice. Steve is interrupted only for pastes no one else can supply,
approvals, and genuinely critical judgment.

## Why now

Every prior attempt at this (Praxis, MRI, Paperclip, Multica, ghostwork,
mission-control) was built against models that could not hold long-horizon
work, and without the access the Workbench now has: Jira, Outlook and Teams
through the local bridge, verbatim transcripts, the knowledge base, and
verified write paths with readback checks. The compensating machinery those
projects invented (decomposition, convergence verification, earned autonomy)
is exactly what makes autonomy trustworthy now that the models are strong.

## Ground rules (set by Steve, 2026-08-12, non-negotiable)

1. **Built into the Workbench.** No platform runs alongside it. Prior work
   contributes prompts, specs, regexes, and designs; running code is written
   fresh and small in this repo.
2. **Ports, not transplants.** Every adopted behavior arrives through: a
   one-page port spec, a failing test here first, a small green
   implementation, and one flagged end-to-end exercise on real data. What
   cannot clear that in about a day gets rewritten with the donor as
   reference. Nothing is adopted to honor past effort.
3. **One policy, two columns.** Every work class carries an autonomy tier
   (auto-run / run-then-show / ask-first) and a model tier (plain code
   first; local open-source for mechanical work; flat-rate Sonnet/Codex for
   drafting and coding; top Claude only for judgment, consequence
   verification, and Steve's voice). Receipts track tokens per class beside
   success rate.
4. **One surface, one voice.** All state renders on the Agent Board. One
   foreman agent is the only voice that addresses Steve: escalations carry
   what failed, where, what it impacted, and the fix in flight; morning
   standup and evening retro assemble from receipts. Unverified results are
   reported as unverified, always.
5. **House discipline applies to the loop itself.** Red test before
   behavior, readback after writes, fail closed over fabricate, evidence
   quoted verbatim, banned words enforced in anything a person reads.

## Standing constraints inherited from the operating rules

- Outbound email sends and meeting invitations are ask-first, permanently.
- Microsoft actions follow the one-job rule: one durable job per material
  action, continue the same job to terminal, never replay an indeterminate
  outcome, never verify by firing more requests.
- Jira text never says "brain," never carries a storage path, and never
  calls an edit a proposal. Deliverables attach to the issue or link from
  the Team Library.
- Voice text is model-written from evidence or withheld. No templates.

## Success criteria

The build is working when, for two consecutive weeks:

1. Steve's manual touches per day are: transcript pastes, approvals, and
   answers to escalations. Nothing else.
2. Every meeting that occurs is processed the same day without Steve asking.
3. Every ticket the loop worked carries verified evidence, and zero verified
   defects trace back to an unverified port.
4. The morning standup and evening retro arrive on schedule, assembled from
   receipts, and match reality when spot-checked.
5. Token spend per work class is visible weekly and top-model calls occur
   only in the classes the policy assigns them.

## Non-goals

- Replacing the Workbench UI or adding a second dashboard.
- Autonomous outbound communication of any kind.
- Migrating or reviving any prior platform as a running service.
- Trading, personal finance, or anything outside the working day.

## Deliverables of the design phase

| # | Artifact | File |
|---|---|---|
| 1 | This charter | `00-charter.md` |
| 2 | System spec: stations, modules, integration points | `01-system-spec.md` |
| 3 | Data model with ERD | `02-data-model.md` |
| 4 | Workflow diagrams: daily loop, dispatch, approval, escalation, standup | `03-workflows.md` |
| 5 | Validation plan and the port checklist | `04-validation-plan.md` |
| 6 | Port specs, one page each, per adopted behavior | `ports/` |
| 7 | System infographic rendered through the existing pipeline | after spec sign-off |

Design gets reviewed by Steve before implementation starts. Implementation
follows the build order in `../self-driving-workbench-map.md`.
