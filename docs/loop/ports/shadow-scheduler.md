# Port: shadow scheduler

- Donor: mission-control `scripts/daemon/scheduler.ts` (walk-and-classify shape); the Agent Board builder in this repo (the single source of open work)
- Station: sense + decide, dark
- Date started: 2026-08-12
- Budget: one day. Blown: no

## 1. Behavior we want (our words)

First light per the validation plan: the loop senses and classifies, and
does nothing. Rules:

- The scheduler reads the SAME state the Agent Board renders, via the same
  builder. One source of truth; the board and the loop can never disagree
  about what work exists.
- Every open item (Waiting and Watching lanes) maps to a work class through
  a small explicit table. Kinds with no mapping classify as unknown and the
  policy fails them closed to ask-first; nothing is silently skipped.
- Each pass writes shadow runs and receipts to the ledger: "WOULD dispatch
  as class X at tier Y with model Z" — zero tokens, no verification row, so
  every shadow row honestly reads unverified.
- A pass is idempotent per item per day: re-running within the same day adds
  nothing new for items already shadowed.
- Mode lives in `LOOP_MODE`: `off` (default, the route reports disabled and
  writes nothing) or `shadow`. There is no `live` yet; the dispatcher port
  adds it later.
- Surfaced at `GET /api/loop/status`: mode, last pass, verdict counts by
  class and tier, and the week's tokens by class from the ledger.

NOT taking from the donor: node-cron (the gateway route triggers passes for
v1; a timer arrives with the dispatcher), the retry queue, anything that
acts.

## 2. Red

- Test file: `server/loop/shadow.test.mjs`
- Failure output pasted:

```
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'...\server\loop\shadow.mjs' imported from ...\server\loop\shadow.test.mjs
# fail 1
```

## 3. Green, small

- Implementation files: `server/loop/shadow.mjs`, route wiring in
  `server/jira-gateway.mjs`
- Lines added: ~120 module, ~40 route
- Read from the donor, rewritten: the walk-classify-record pass as one pure
  function over injected board state, policy, ledger, and clock.

## 4. Real exercise (flagged, real data)

- Flag used: `LOOP_MODE=shadow` on the running gateway (first light per the rollout plan).
- What ran: `GET /api/loop/status?pass=1` at 2026-08-13T01:46:23Z against the live Agent Board.
- Evidence: 27 open items considered, 27 shadow rows recorded, zero duplicates on re-pass.
  Verdicts: 11 show-tier (9 recommended Jira changes as jira-create/top, 2 drafts as
  draft-deliver/none) and 16 ask-tier (commitments and captures whose kinds are not yet
  policy classes, failing closed exactly as designed). Ledger at
  %LOCALAPPDATA%/IPCorpBrain/loop-ledger.json holds the rows; every shadow run reads
  unverified with zero tokens.

## 5. Sign-off

- [x] Spec complete before code
- [x] Red before green, output pasted
- [x] Implementation small and fully explainable
- [x] Real end-to-end exercise linked
- [x] Banned-word scan clean on any human-read text
- [x] Commit links this file
