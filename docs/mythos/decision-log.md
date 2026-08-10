# Decision Log

- 2026-08-06 06:51 ET: Mount one agent at the application shell so its conversation and readiness survive page changes.
- 2026-08-06 06:51 ET: Send a fresh semantic list of visible controls with each turn. The model receives opaque action keys, never CSS selectors or DOM paths.
- 2026-08-06 06:51 ET: Default every submit, delete, send, apply, save, external update, and file change to an exact review card and single-use confirmation.
- 2026-08-06 06:51 ET: Keep DevSpace maintenance inside the exact frontend checkout. Read and allowlisted verification may run directly; edits, writes, and other commands require review.
- 2026-08-06 06:51 ET: Use the direct Microsoft 365 MCP and explicit NotebookLM notebook IDs. Reuse the existing Jira API rather than creating a second Jira write path.
- 2026-08-05 19:10 ET: Evidence fingerprints hash kind+title+reference, never record ids. Microsoft 365 evidence ids embed an array index, so id-based identity would resurface every handled item on reorder.
- 2026-08-05 19:10 ET: A preview IS a scan and always appends a ledger entry. The window question ("how far back") is answered by the ledger, never by a heuristic date.
- 2026-08-05 19:10 ET: Stale open tickets with no associated evidence produce no proposals at all, honoring the rule that unassociated tickets are never touched or commented on. The count stays visible as text.
- 2026-08-05 19:10 ET: The scan ledger lives in %LOCALAPPDATA%\IPCorpBrain, not in the repo. Tailwind v4's source scan watches every non-gitignored repo file, and a mid-scan write inside the repo full-reloaded the app during its own scan (observed twice before the move).
- 2026-08-05 19:10 ET: Carried (seen, unchanged, unresolved) candidates are hidden by default behind a count toggle rather than deleted or re-shouted; dismissal is an explicit user action recorded per fingerprint.
- 2026-08-04 15:31 ET: Extend the existing Meetings page instead of adding another navigation destination.
- 2026-08-04 15:31 ET: Use fixed local gateway routes for today's calendar and selected-meeting processing.
- 2026-08-04 15:31 ET: Keep Jira and email output as review-only proposals. No external action route is part of this piece of work.
- 2026-08-04 15:31 ET: Store raw meeting text in the Brain transcript folders and the review package in a meeting-closeouts deliverables folder.
