# Evidence · 20260805 reconciliation scan ledger

Gate: `docs/mythos/gates/20260805-183000-reconciliation-scan-ledger.md`

## 1. Unit tests (red first, then green)

- `node --test server/mdm-reconciliation/scan-ledger.test.mjs` before the module
  existed: ERR_MODULE_NOT_FOUND (red confirmed).
- After implementation: `# tests 10 · # pass 10 · # fail 0`, including
  "REGRESSION: scan, dismiss all, rescan proposes nothing".
- `npm run test:mdm-policy`: `# tests 8 · # pass 8 · # fail 0`.
- `npm run typecheck`: exit 0. Biome on all touched files: no errors (35
  pre-existing warnings in App.css and neighbors, none introduced).

## 2. Live gateway sequence (the exact complaint, reproduced then fixed)

All via POST to 127.0.0.1:8817 with forceMicrosoft365=false; Jira read live.

```text
SCAN 1: candidates=170 new=255 changed=0 carried=0   handled=0  (first scan, full backlog once)
SCAN 2: candidates=170 new=0   changed=0 carried=255 handled=0  window=since scan 1
DISMISS 1 fingerprint (brain-action-proposal::eafd0e9a...) -> dismissed=1
SCAN 3: candidates=169 new=0   changed=0 carried=254 handled=1  dismissed item absent: True
```

Ledger file after scan 3: scans=3, entry disposition=dismissed, resolvedAt set.
Scans 1-2 were logged by one gateway process and scan 3 by a new process after a
restart, so persistence across restarts is demonstrated by the numbering itself.

## 3. Ledger relocation (amendment)

Writing the ledger into `data/` reloaded the app mid-scan twice (Tailwind v4 source
scan watches every non-gitignored repo file). Filesystem check showed the ledger was
the only file written in the window. After moving it to
`%LOCALAPPDATA%\IPCorpBrain\mdm-reconciliation-ledger.json`:

```text
SCAN AFTER MOVE: scan#=8 new=0 carried=254 handled=1   (history continued, repo copy gone)
```

## 4. Browser verification on 127.0.0.1:5217 (DOM-level, pane not compositing)

Reload probe `window.__reloadProbe` set before opening the modal survived the full
scan: no page reload. Extracted from the live DOM after scan #9:

```json
{"probe":"alive-since-before-the-scan",
 "windowLine":"Activity window: since the last scan on 8/5/2026, 2:59:21 PM. Scan #9 was logged at 8/5/2026, 2:59:40 PM.",
 "tiles":["376 Total MT issues","99 Open issues","0 New this scan","0 Changed since handled","254 Carried unresolved","1 Already handled, left alone"],
 "carriedToggle":"169 carried candidates from earlier scans are hidden · show them",
 "shownProposals":0}
```

The modal that previously showed 170 shouting candidates shows zero by default.
Toggle click revealed all 169 carried cards with `data-freshness="carried"` badges;
"Select all shown" checked 169 boxes and enabled "Mark selected reviewed · no Jira
change". The bulk dismissal itself was deliberately NOT fired on real data; the
route is proven in section 2 and the decision belongs to Steve.

## Verdict per acceptance criterion

1. Unit suite green with regression case — PASS
2. Second preview reports 0 new, prior items carried — PASS (curl scan 2, browser scan 9)
3. Dismissals persist across gateway restarts — PASS
4. Stale sweep emits no proposals; count informational — PASS (code removed; asof line)
5. Every preview appends a scan entry — PASS (scans numbered 1 through 9)
6. lint + typecheck — PASS
7. test:mdm-policy — PASS
Amendment: modal scan without page reload — PASS (probe survived)
