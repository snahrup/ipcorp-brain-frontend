# Durable Notes

- Meeting infographic coverage is refreshed with `scripts/meeting-infographic-audit.mjs`;
  the checked result is `data/meeting-infographic-audit.json`, and Meetings warns when
  that snapshot no longer matches the loaded index.
- Infographic coverage uses three separate states: Workbench display, saved file, and
  meeting/package association. A source read failure stays unavailable and is never labeled
  missing.
- The 2026-08-05 run reviewed 118 meetings and found 30 needing attention. One saved PNG
  returns `ERR_INVALID_CHAR` from the image response filename header.

- The Meetings page already has truthful prepared-record and Microsoft 365 availability states.
- The local gateway is the existing same-origin write and integration surface.
- The Brain checkout may be dirty. Tests use a temporary Brain root.
- Reconciliation scan memory lives at `%LOCALAPPDATA%\IPCorpBrain\mdm-reconciliation-ledger.json` (override: `IPCORP_RECONCILIATION_LEDGER_PATH`). It must stay outside the repo or Tailwind v4's source scan reloads the app on every write.
- Evidence identity in reconciliation is `scan-ledger.mjs#evidenceFingerprint` (kind+title+reference); content change detection is `evidenceHash`. Reuse these for any phase 2 evidence source (M365 window, meetings) so dispositions carry over.

