# 20260805-183000 · Reconciliation scan ledger (bug fix)

**Status: FROZEN 2026-08-05 18:30**

## Task summary

The Refresh and Reconcile MDM modal re-proposes every evidence record ever exported
(168 of 170 candidates are "candidate new work") on every single run. Nothing records
that a candidate was already reviewed, applied, or dismissed, and nothing records when
the last scan happened. NEW-key candidates are also un-dismissable: the modal gives
them no review affordance and the apply route rejects them, so the backlog can never
shrink. The feature is unusable.

## User-visible outcome

- The first scan after this change still shows the full backlog once (there is no
  earlier scan on record), and a bulk "mark reviewed, no Jira change" action clears it.
- Every later scan only surfaces evidence that is new or changed since it was last
  handled. Unresolved carried items are hidden behind a count, not re-shouted.
- The modal shows the activity window ("since <last scan time>") and every scan is
  logged with its window and counts.
- No proposal is generated for a stale open ticket with no associated evidence
  (Steve's no-touch rule: never comment on an unassociated ticket).

## Non-goals (phase 2, separate work)

- Threading the scan window into the Microsoft 365 collection prompt.
- Creating new Jira issues from candidate-new-work proposals.
- Meeting catch-up (transcripts, brain summaries, infographics).
- Full recap screen and always-alive progress choreography.

## Scope

- `server/mdm-reconciliation/scan-ledger.mjs` (new, pure logic + IO helpers)
- `server/mdm-reconciliation/scan-ledger.test.mjs` (new)
- `server/jira-gateway.mjs` (preview, apply, new dismiss route)
- `src/features/jira/types.ts`, `src/features/jira/api.ts`,
  `src/features/jira/MdmReconciliationModal.tsx`, `src/features/jira/jira-views.css`
- `data/mdm-reconciliation-ledger.json` (new state file, gateway-owned;
  sync-data.mjs writes only its own named files so this is safe from the resync)

## Acceptance criteria

1. `node --test server/mdm-reconciliation/scan-ledger.test.mjs` passes, including the
   regression case: scan unchanged records, dismiss everything, rescan, and get zero
   proposal-eligible records.
2. Two consecutive live previews with unchanged evidence: the second reports 0 new
   evidence and the prior items as carried or handled, never as new.
3. POST /api/jira/reconcile/dismiss persists dispositions in the ledger file; a
   gateway restart does not resurrect dismissed items.
4. The stale-open sweep emits no proposals; the stale count stays informational.
5. Every preview appends one scan entry with window from/to to the ledger.
6. `npm run lint` and `npm run typecheck` pass.
7. Existing `npm run test:mdm-policy` still passes.

## Verification

- Unit: node --test (red first, then green).
- Live: restart gateway on 8817, curl preview twice, dismiss, preview again; counts
  must collapse. Evidence file records the actual JSON.
- Browser: modal on :5217 shows window line, freshness badges, bulk review action.

## Risks

- Fingerprint instability would resurface handled items. Mitigated: fingerprints hash
  kind+title+reference, never array index or churn-prone ids (M365 ids embed an index).
- Ledger corruption must never break the modal. loadLedger falls back to an empty
  ledger on any parse error.

## Rollback

Delete the ledger file and revert the four source files; the preview returns to the
old always-everything behavior.

## Amendment · 2026-08-05 19:05

The ledger cannot live in `data/`. Verified live: Tailwind v4's automatic source scan
watches every non-gitignored file in the repo, so the gateway writing the ledger
mid-scan triggered a full Vite reload that killed the reconciliation modal while its
own scan was running, twice in a row. New location:
`%LOCALAPPDATA%\IPCorpBrain\mdm-reconciliation-ledger.json` (the launcher already
keeps its logs under that root), overridable via `IPCORP_RECONCILIATION_LEDGER_PATH`.
Machine state now lives outside the watched tree entirely, which removes the failure
class instead of depending on scanner ignore rules. Acceptance criterion added:
opening the modal and completing a scan must NOT reload the page.
