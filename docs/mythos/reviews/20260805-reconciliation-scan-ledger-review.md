# Review · 20260805 reconciliation scan ledger

Role-separated review simulated sequentially (subagents were not permitted this
session). Reviewed the final state of every touched file against the frozen gate,
not the author's intentions.

## Correctness

- `classifyEvidence` handles all four dispositions; the changed-after-resolved path
  reopens evidence to pending in `recordScan`, so a dismissed record that later
  changes is proposed again exactly once. Covered by tests 5 and 6.
- Fingerprints hash kind+title+reference. Microsoft 365 ids embed an array index and
  would have churned; the design sidesteps ids entirely. Two records with identical
  kind, title, and reference collapse into one fingerprint; they would be duplicate
  evidence anyway.
- `applyReconciliationBatch` still rejects uncertainty and non-MT keys; the new
  fingerprint field rides along without weakening validation. Applied dispositions
  are only recorded for results with ok=true.
- The modal's apply safety is unchanged: enabling checkboxes on uncertain proposals
  only feeds the local dismiss path; canApply still requires every selected proposal
  to be uncertainty-free after explicit manual review.

## Missed requirements / scope check

- The gate's non-goals (M365 window threading, issue creation, meeting catch-up,
  recap choreography) were not smuggled in. The change is the bug fix only.
- Stale-open cancel proposals are gone per the no-touch rule; the count remains in
  the asof line. Nothing else about stale handling changed.

## Regression risk

- Preview is no longer a pure read: it appends a scan record. This is the feature
  (every scan logged). It writes outside the repo, so no build tooling reacts.
- Load-modify-save on the ledger has a small lost-update window if a preview and a
  dismissal race. Single local user; worst case one dismissal resurfaces once.
  Logged in the risk register rather than engineered around.
- `rename` over an existing file is the Windows-safe atomic replace in Node; the
  round-trip test exercises it.

## Evidence quality

Every acceptance criterion maps to a command output or DOM extraction in the
evidence file; none rests on "looks good". The one deliberately unexecuted step
(bulk dismissal of 169 real records through the UI) is called out as a decision
reserved for Steve, with the underlying route proven separately.

## Verdict

Gate satisfied. No blocking findings. Two follow-ups noted for phase 2: ledger
write serialization if concurrent use ever appears, and surfacing scan history
(`ledger.scans`) in the UI as the recap surface.
