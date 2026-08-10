# Workbench Agent Lane 3

Owner: integration and verification
Status: waiting on lanes 1 and 2

## Owns

- Narrow gateway and app-shell integration review
- Focused checks, production build, and browser runs
- Real launcher and direct health proof
- Safe live connector proof
- Fresh implementation review and final handoff

## Stop conditions

- A change action can run without the exact review being confirmed
- A secret appears in the browser, logs, test data, or diff
- The agent claims data was read when its connector was unavailable
- Navigation or UI action execution can use a free-form selector
- Existing Jira, Meetings, or Team Library behavior regresses

