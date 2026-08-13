# Port: receipts ledger

- Donor: ghostwork `src/main/receipt.ts` (scoreboard fields), `src/main/db.ts` (schema shape)
- Station: observability + memory
- Date started: 2026-08-12
- Budget: one day. Blown: no

## 1. Behavior we want (our words)

The append-only record the whole system trusts: every run's outcome, tokens,
verification result, and what it changed. Rules from the data model doc:

- Receipts are never updated or deleted. Corrections are new rows that name
  the row they supersede.
- A run without a verification row can never read as done; the join renders
  it unverified.
- Tokens per work class per week is a first-class query, not an estimate.
- Earned-autonomy counters (`recordOutcome` state per class) persist here.

**Deviation from the ERD, recorded honestly:** the design says one SQLite
file. better-sqlite3 v12 installed but segfaulted instantly on this
machine's Node 22.12 (`Segmentation fault` on a trivial in-memory open), and
node:sqlite still needs an experimental flag every launcher would have to
carry. A crashing native dep under the gateway is disqualified. v1
implements the SAME shape and rules as an atomic-write JSON store, the
pattern the activity store already proves in production here. The module
API is the agreement; the engine can become SQLite later without callers
changing.

NOT taking from the donor: ghostwork's rule-mining tables, its Electron IPC,
its minutes-saved estimator (invented numbers; our receipts only record
measured things).

## 2. Red

- Test file: `server/loop/ledger.test.mjs`
- Failure output pasted:

```
# Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'...\server\loop\ledger.mjs' imported from ...\server\loop\ledger.test.mjs
# fail 1
```

## 3. Green, small

- Implementation files: `server/loop/ledger.mjs`
- Lines added: ~170
- Read from the donor, rewritten: the receipt field set; append-only made
  structural (the API has no update or delete for receipts at all) instead
  of relying on discipline.

## 4. Real exercise (flagged, real data)

- Done via the shadow scheduler port: the 2026-08-13T01:46Z live pass wrote 27
  shadow runs and receipts to the real ledger; see `shadow-scheduler.md` for the
  full evidence.

## 5. Sign-off

- [x] Spec complete before code
- [x] Red before green, output pasted
- [x] Implementation small and fully explainable
- [x] Real end-to-end exercise linked (shadow scheduler port, 2026-08-13T01:46Z)
- [x] Banned-word scan clean on any human-read text
- [x] Commit links this file
