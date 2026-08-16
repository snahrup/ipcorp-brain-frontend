# Decision Log

- 2026-08-14 04:23 ET: Meeting closeout is one saved eight-stage job. HTTP requests start,
  inspect, stop, or resume it but do not own its lifetime.
- 2026-08-14 04:23 ET: Startup continues only prepared or interrupted work. Failed and
  user-stopped work waits for an explicit resume, preventing an unexpected Microsoft read
  or image retry when the local server starts.
- 2026-08-14 04:23 ET: A live process lease is never displaced. A dead-process lease may
  be cleared after checking the saved owner PID, so restart recovery does not wait for the
  full lease time.
- 2026-08-14 04:23 ET: Meeting visuals render only from a verified PNG. Codex is preferred,
  verified NotebookLM output remains reusable, every attempt stays in history, and failed
  generation leaves the package incomplete.
- 2026-08-14 03:27 ET: Event replay owns work-item lease state. Per-item Windows locks
  serialize claim, renewal, and release while the event writer lock keeps journal writes
  ordered. No second lease file can disagree with replay.
- 2026-08-14 03:27 ET: Today reads one server-produced snapshot. The Agent Board portion
  is always cache-only, so opening or polling Today cannot start a Microsoft request.
- 2026-08-14 03:27 ET: Exact event retries are no-ops and changed retries are recorded as
  conflicts. A caller can safely resume after a process restart with the same event ID.
- 2026-08-14 03:27 ET: LoopX remains a design reference. The Workbench keeps its native
  Node and TypeScript implementation and does not run a second scheduler beside it.
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
