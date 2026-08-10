# Workbench Agent Lane 1

Owner: service implementation
Status: ready

## Owns

- New `server/workbench-agent/` modules and focused tests
- Agent SDK streaming
- Local owner sessions and confirmation records
- Workbench, Jira, Microsoft 365, NotebookLM, and DevSpace tool adapters
- A narrow route installer called by the existing gateway

## Does not own

- Existing Jira behavior
- Existing meeting processing
- App shell and widget styling
- Unrelated files already changed in the shared checkout

## Required proof

- Unit and route tests cover allowed and denied paths
- No secret enters a response, log, test snapshot, or repo file
- All change actions stop at review until the matching confirmation is consumed

