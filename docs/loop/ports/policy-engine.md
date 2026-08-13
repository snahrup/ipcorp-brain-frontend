# Port: policy engine

- Donor: ghostwork `src/main/actionEngine.ts` (earned tiers, caps), m365_agent_gateway `tools/registry.py` (tool tiers, write refusal below tier), mission-control `dispatcher.ts` (pending-decision check)
- Station: decide
- Date started: 2026-08-12
- Budget: one day. Started at: 2026-08-12 evening. Blown: no

## 1. Behavior we want (our words)

A pure module that answers one question: given a work class, what may happen
to an item of that class right now. The answer has two columns (autonomy
tier: ask < show < auto; model tier: none | local | subscription | top) plus
a named tool set. Rules:

- Policy lives in `server/loop/policy.json`, versioned, human-readable,
  changed only by commit.
- Send-class and invite-class actions are ask-first as CODE. A policy file
  that tries to set them higher is refused at load, loudly.
- Earned autonomy: a class promotes one tier only after `promote_at`
  consecutive verified successes AND at least seven days at its current
  tier. One verified failure demotes one tier immediately and resets the
  streak. Floor is ask; there is no off.
- An unknown work class fails closed: ask-first, top-model verification
  posture, and a detail saying why.
- No clocks inside: `now` is injected everywhere, so every rule is provable
  in tests.

NOT taking from the donors: ghostwork's "the system acts, it doesn't ask"
default posture, its rule-mining, and its DB coupling; the Python registry
itself (pattern only); any UI.

## 2. Red

- Test file: `server/loop/policy.test.mjs`
- Failure output pasted:

```
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'C:\Users\snahrup\CascadeProjects\ipcorp-brain-frontend\server\loop\policy.mjs'
imported from ...\server\loop\policy.test.mjs
# fail 1
```

## 3. Green, small

- Implementation files: `server/loop/policy.mjs`, `server/loop/policy.json`
- Lines added: ~150 implementation, ~40 policy data
- Read from donors, rewritten: the earned-tier promote/demote arithmetic
  (ghostwork) as two pure functions with injected time; the refuse-below-tier
  posture (m365 gateway) as a load-time throw instead of a runtime check, so
  a bad policy never even loads.

## 4. Real exercise (flagged, real data)

- Exercised by the live shadow pass of 2026-08-13T01:46Z: 27 real board items
  classified under policy.json v1, pinned and fail-closed behavior observed on
  real data; see `shadow-scheduler.md`.
- What ran: full unit suite.
- Evidence links: test run in the commit that carries this file.

## 5. Sign-off

- [x] Spec complete before code
- [x] Red before green, output pasted
- [x] Implementation small and fully explainable
- [x] Real end-to-end exercise linked (shadow scheduler port, 2026-08-13T01:46Z)
- [x] Banned-word scan clean on any human-read text
- [x] Commit links this file
