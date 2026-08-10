# Workbench Agent Lane 2

Owner: interface implementation
Status: ready

## Owns

- New `src/features/workbench-agent/` files and focused tests
- Destination and section registry
- Semantic inventory of the visible UI
- Streaming conversation, reasoning status, Stop, receipts, and review cards
- Desktop, phone, keyboard, reduced-motion, and screen-reader behavior
- One narrow mount in `src/App.tsx`

## Does not own

- Existing page business logic
- Existing Jira and meeting components
- Existing work by other sessions in shared files

## Required proof

- Every current Workbench destination resolves
- The client refuses any unregistered destination or stale action key
- Browser proof covers navigation, an immediate safe action, and a confirmed change

