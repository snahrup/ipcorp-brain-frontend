# Workbench Agent Evidence

Date: 2026-08-06
Status: complete

## Scope

Added a dependable Workbench agent surface that is available from the application
shell. It can answer with streamed model output, guide a new user to the right
page and section, execute registered safe UI actions, show review cards before
change actions, and report connected-service readiness truthfully.

## Changed areas

- `server/workbench-agent/`: sessions, review records, route handler, Agent SDK runner,
  destination lookup, action policy, and service adapters
- `src/features/workbench-agent/`: global widget, destination registry, semantic UI
  inventory, stream client, types, and styling
- `server/jira-gateway.mjs`: narrow Workbench agent router installer
- `src/App.tsx`: single application-shell mount
- `tests/workbench-agent-registry.spec.ts`: focused UI registry and action tests

## Failable checks

- `node --test server/workbench-agent/*.test.mjs`
  - Passed: 24 tests
  - Covered: destination lookup, section rejection, repo path checks, stable review
    hashes, session tokens, single-use confirmations, expiry, Workbench and Microsoft
    365 read policy, streaming route setup, origin rejection, missing owner session,
    forged page actions, replay rejection, review record matching, semantic action
    validation, DevSpace path checks, DevSpace command checks, connector output
    sanitizing, and SDK permissions.
- `npm run typecheck`
  - Passed.
- `npm run build`
  - Passed.
  - Note: Vite still reports large chunks after minification. That is a warning, not
    a failed build.
- `npx biome check server/workbench-agent src/features/workbench-agent server/jira-gateway.mjs src/App.tsx --max-diagnostics 80`
  - Passed with existing `src/App.tsx` warnings only.
- `npx playwright test tests/workbench-agent-registry.spec.ts`
  - Passed: 12 tests in Chromium and Firefox.

## Live proof

- Stopped the stale local gateway process only after confirming its command line was
  `node server/jira-gateway.mjs` and that it returned `404` for the new agent status
  route.
- Relaunched with the real path:
  `C:\Apps\IP Corp Brain Launch.bat -NoBrowser -SkipTypecheck -TimeoutSeconds 120`
- Direct health passed:
  - Frontend: `http://127.0.0.1:5217/`
  - Service: `http://127.0.0.1:8817/healthz`
- Safe live Workbench lookup passed:
  - `GET /api/workbench-agent/status` with Workbench origin returned `ok: true`.
- Connector readiness reported:
  - Workbench local API: ready
  - NotebookLM CLI: ready, owner notebook visible
  - Microsoft 365 read MCP: ready, read-only
  - DevSpace workspace MCP: ready
  - Jira through Workbench API: ready on the final status read
  - Microsoft 365 writes: unavailable by design

## Browser proof

- Desktop 1440 x 900:
  - Loaded Workbench.
  - Opened the global agent.
  - Sent a help prompt.
  - Confirmed visible streaming status.
  - Used Stop and saw the stopped state.
  - No console errors. The single failed request was the intentional chat abort from Stop.
- Phone width 390 x 844:
  - Opened the agent on `/`, `/meetings`, `/meetings/daily-prep`, and
    `/meetings/wrap-up`.
  - The panel stayed visible inside the viewport and clear of the mobile tab bar.
  - The only failed requests were page-close aborts from existing meeting prep and
    wrap-up background fetches, not agent route failures.

## Review

Applied the local completion, spec-check, pragmatic code review, project-rule check,
and UI testing prompts from the local QA agent files. Result: approved with residual
limits called out below.

## Residual limits

- Jira timed out on an earlier status probe and returned ready on the final status
  read. The widget reports the current observed state rather than implying success
  when a connector is unavailable.
- Microsoft 365 write execution is not enabled. Reads are available. Writes need a
  dedicated reviewed executor before the UI can complete them.
- The `frontend-verify` helper could not run because `playwright-cli` is missing from
  this environment. The same browser scenarios were checked with the repo Playwright
  install.
