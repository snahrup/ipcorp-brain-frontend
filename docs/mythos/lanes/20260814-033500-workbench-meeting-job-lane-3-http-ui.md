# Lane 3: Meeting job HTTP and UI

Owner: coordinator

Status: complete

Files: meeting routes, gateway caller, Meeting Wrap-up UI, and focused HTTP/browser tests.

Return accepted work immediately, expose redacted progress, support stop and resume, and
attach activity reconciliation to the same saved job. Keep Jira and email review-only.

## Result

The process route now returns an accepted saved job immediately. Status, list, stop, and
resume routes expose redacted progress. Startup continues prepared or interrupted work,
while failed and user-stopped jobs wait for an explicit resume. Activity reconciliation
uses the same meeting job and reports its saved stage when incomplete.

Meeting Wrap-up restores saved work after reload, shows all eight stages, and offers Stop
and Resume. It displays only a verified PNG returned by the real image route. Chromium and
Firefox checks passed, including the 390 by 844 layout.
