# Risk Register

- The request spans UI help, external services, and repo maintenance. A permissive tool
  runner would turn a bad model choice into a real change. The service must allow only
  registered tools and targets, then require exact confirmation for every change.
- The Workbench is currently local and single-user. Same-origin checks, a local owner
  session, request tokens, short expiry, and one-time confirmation protect the browser
  path. A future multi-user or public deployment needs identity-provider sign-in before
  maintenance is enabled.
- Microsoft 365, Jira, NotebookLM, Claude OAuth, or DevSpace may be unavailable
  independently. Each connector needs its own truthful readiness and error state.
- Semantic control keys become stale after render changes. Keys are request-scoped and
  the client must revalidate the target immediately before acting.
- Agent SDK requests can run for a long time. Abort must stop the SDK request and close
  the stream without leaving a review card in an executable state.
- Reconciliation ledger writes are load-modify-save without a lock. A preview racing a dismissal can drop one dismissal, which then resurfaces once. Single local user today; serialize writes if concurrent use ever appears.
- The reconciliation backlog (169 carried items) is pending until Steve bulk-clears it in the modal. Until then the carried toggle shows a large number; that is accurate, not a defect.
- Existing shared-checkout edits overlap the Meetings page and gateway. Use narrow edits and inspect the final diff.
- Microsoft 365 can be unavailable or slow. The pasted Cluly path must remain fully usable.
- Brain writes must be path-safe, repeatable, and paired with a root CHANGELOG row.
- Live Jira and email actions must remain impossible from the closeout page.
- Activity reconciliation must serialize saved run writes and proposal claims across tabs.
- A timed-out or indeterminate Jira create must be verified before any retry.
- Activity verification must use a temporary Brain root so the real repository remains unchanged.
- A meeting summary marker is not completion; every later artifact and display step must be checked.
- The current Workbench runs one local gateway process. Activity run and apply writes are
  serialized inside that process. A future multi-process deployment needs a shared file or
  database lock before it can safely accept writes from more than one gateway.
- The live narrow Microsoft 365 check returned healthy empty source results. A full real
  baseline was not started because it could process a ready meeting and write Brain files.
