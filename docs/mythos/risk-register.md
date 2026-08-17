# Risk Register

## Preconditions for the first live external effect (Phase 4)

Named here so they outlive the Phase 1 evidence file. Both were accepted by the independent
review as fine for Phase 1 and wrong to carry into a live effect.

- A step that ignores its abort signal still has post-cancellation output saved and selected
  on resume, because a returned-and-validated output cannot be told apart from finished work
  (`step-runner.mjs`, AS-07 amendment). The state engine cannot close this; the durable
  provider worker must, by enforcing each provider's cancellation behavior instead of trusting
  it. No provider may carry a live effect until its wrapper is proven to honor its signal.
- A caller passing `resume: true` reaches the engine's resume before the lease check, so it
  can clear another owner's pending stop request before finding out it does not hold the
  lease. Engine behavior from Phase 1, surfaced by the Phase 2 review. Close it before any
  provider carries a live effect.
- The completion verification receipt is checked for shape only. Before Phase 4, completion of
  externally acting work must cross-reference the effect lifecycle: the named effect must
  exist, belong to the same action revision, and be in `read_back`. A fabricated receipt
  currently passes; that is acceptable only while nothing externally acting exists.

- The meeting job is now the first production consumer of the saved work-item engine.
  Activity reconciliation still uses its older run store for its other stages and is the
  next migration target.
- A recycled Windows PID can make an old lease look live until its 30-minute expiry. That
  favors duplicate-work prevention over immediate recovery and remains visible in status.
- Full-project Chromium currently has seven older failures outside the saved meeting path.
  The meeting path passes in Chromium and Firefox, but those wider failures remain visible
  follow-up work.
- The append-only event journal is intentionally simple and currently reads the full
  journal to assign the next sequence. This is correct for the first consumer, but it
  needs compaction or an indexed store before very high event volume.
- Today currently carries the complete Jira initiative payload inside its snapshot. The
  live response is large. A later read-model pass should trim it to fields Today renders
  while leaving the full Jira endpoint available to Work.
- Full-project lint is still red from existing graph-generator and generated JSON
  findings. Touched files pass focused checks, but repo-wide lint remains visible work.
- Automatic execution remains off. Meeting closeout is the first production consumer;
  activity reconciliation is next.
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
