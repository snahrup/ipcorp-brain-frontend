# Workbench Integration Gate

Status: FROZEN  
Plan: V1.2  
Advisor: PLAN_APPROVED  
Frozen: 2026-07-28

## Objective

Turn the existing stakeholder-safe Brain frontend into one understandable IP
Corporation team Workbench based on the verified Workbench v4 handoff. Preserve
the existing Brain capabilities while adding a team-first daily surface, a
Jira-style work board, truthful Microsoft 365 and Jira connection states, one
approval-preview flow, and an optional lazy Data work capability.

## Product boundary

- The Brain remains the source of curated architecture knowledge, meetings,
  decisions, questions, risks, evidence, and prepared work.
- Microsoft 365 remains the source of Email, Calendar, Teams, and Files.
- Jira remains the source of Jira workflow state.
- Fabric and Altimate remain the source of specialist data-tool results.
- The Workbench is a sanitized projection and coordination surface. It is not a
  replacement system of record.
- The existing owner-local Microsoft 365 bridge must not be exposed as team
  access. Browser code must not receive credentials or arbitrary MCP methods.
- V1 performs no external Microsoft 365, Jira, or Fabric mutation.

## Frozen information architecture

- Today: First up, Needs you, Waiting, Done.
- Work: Brain-derived list and Jira-style board.
- Meetings: existing meeting intelligence in a team-first workspace.
- Team Library: Prepared meeting notes, Decisions, Open questions, Risks, and
  How things connect.
- Data work: lazy Explore data, Compare sources, Review SQL, Trace fields,
  Convert SQL, and Models & tests.
- Connections: Brain, Microsoft 365, Jira, and Data work source passports.

## Frozen visual system

- Structural navy: `#0E2338`, `#14314F`.
- Corporate blues: `#334862`, `#446084`.
- Action blue: `#1B5E9E`.
- Supporting blues: `#1D4570`, `#2A4A6B`, `#9FB0C2`.
- Surfaces: `#FFFFFF`, `#FAFBFC`, `#F7F8F9`, `#F0F2F4`.
- Borders: `#E1E4E8`, `#D5D9DE`.
- Text: `#1B1D20`, `#5A6169`, `#8A9099`.
- Semantic-only colors: success `#1E7B4D`, attention/stale `#B0761A`,
  blocked/error `#C8102E`.
- Purple, aubergine, legacy green `#22C55E`, legacy gold `#FDCF5A`, and the
  prior near-black theme are not permitted on new Workbench surfaces.
- Figtree headings, system-stack body, restrained monospace metadata.

## Acceptance gates

1. The default route is Today and uses plain workplace language.
2. Existing Brain meetings, packets, decisions, questions, risks, search,
   details, and explorer remain reachable.
3. The Brain explorer and its graph dependencies are absent from the initial
   Today load and load only when How things connect opens.
4. Data work is absent from the initial Today load and loads only when opened.
5. Every work item and connection state carries source, as-of, and limitation
   information.
6. Microsoft 365 shows both:
   - `Owner-local bridge: verified on this computer`
   - `Team access: not connected`
7. Jira never appears connected without a verified adapter.
8. Moving or editing a board item opens an exact review preview and performs no
   external request.
9. Approval copy says:
   `Prepared only — nothing will be sent until a team connection is configured.`
10. Data work describes only grounded Altimate capabilities and does not fake
    pipeline history, collaboration, or governance backends.
11. Loading, empty, stale, partial, unavailable, blocked, and error states are
    understandable without connector jargon.
12. Keyboard navigation, visible focus, 44px targets, text-plus-icon statuses,
    responsive layouts, and reduced motion are verified.
13. New Workbench brand/action selectors use only the blue-and-white system.
    Green, amber, and red appear only in semantic status selectors.
14. `npm run ci` passes and bundle evidence proves both lazy boundaries.
15. `vite.config.ts` and unrelated user changes remain untouched.

## Rollback

New behavior must live in new Workbench modules plus a bounded `App.tsx` and
`App.css` shell integration. Reverting those shell integrations and removing the
new modules restores the graph-first frontend without changing prepared Brain
data or source repositories.

## Amendment A — live Jira, real Team Library, and MDM portfolio rebuild

Added: 2026-07-28  
Reason: Steve expanded the requested outcome after the V1.2 gate was frozen.
The original gate remains above as the historical baseline; this amendment
governs the expanded implementation.

- Work List and Board read live Jira project `MT` through a bounded local
  gateway. Fixture work must never appear as Jira-backed.
- Selecting a Jira card opens a centered Jira-like modal with one-to-one field
  mapping. A save requires an expected Jira update timestamp, reports loading,
  validation, conflict, and error states, and reads the issue back before
  claiming success.
- Jira writes remain deliberate. The gateway accepts only `MT-*` issues,
  whitelisted fields, explicit confirmation, and reviewable effects.
- The MDM reconciliation is a portfolio rebuild, not a small sync. It compares
  live Jira with available Brain records, the Team Library, and bounded
  Microsoft 365 evidence; it surfaces stale or missing issues, comments,
  dependencies, subtasks, fields, and statuses as proposals with provenance
  and uncertainty.
- The initial portfolio rebuild must inventory and reconcile all authorized,
  MDM-relevant evidence rather than only the prepared frontend projection:
  user-visible Codex task transcripts and summaries, Claude Code session
  transcripts and summaries, Brain meeting records and execution history,
  repository activity, complete Team Library file content, Jira issue history,
  comments, worklogs, links and subtasks, Outlook email and calendar, Teams
  chats/channels/meetings/transcripts/recaps, and related SharePoint/OneDrive
  material. Hidden model reasoning and unrelated personal or non-MDM material
  are excluded.
- Existing Jira issues must receive an evidence-backed disposition of keep,
  update, complete, cancel, supersede, or merge. Missing current work may be
  proposed only when its complete Jira metadata and source trail are available.
- After an approved baseline rebuild, ordinary refreshes may be incremental,
  but the UI must preserve the last complete coverage ledger and identify every
  source or date range that has not been refreshed.
- No reconciliation proposal is applied automatically. Ambiguous proposals are
  not selectable until deliberately reviewed, and new tasks remain unavailable
  until the complete Jira metadata required by the governing Jira workflow is
  present.
- The reconciliation scope is locked to Jira project `MT`. Other projects are
  rejected by both the preview and apply paths.
- Microsoft 365 is read-only in this workflow. Timeout, partial, unavailable,
  and authentication failures are distinct; a timeout does not instruct the
  user to restart or sign in.
- Team Library categories mirror the six actual synchronized
  SharePoint/OneDrive folders one-to-one. `index.html` is a coverage index only,
  never a visual template.
- Team Library content is read lazily from the synchronized local source and
  exposes publication revision, local inventory time, folder coverage, and the
  limitation that SharePoint cloud freshness is unverified until the team
  connector can confirm it.
- The Workbench remains one application shell. Jira, Team Library, Microsoft
  365, graph, and specialist data capabilities load independently so one slow
  source cannot block the rest of the interface.
- Meetings must be rebuilt from current evidence rather than presented from the
  prepared Brain snapshot as if current. The timeline reconciles Outlook
  calendar events, Teams meetings/transcripts/recaps, related email/chat
  follow-up, Brain meeting records and prep packages, and exposes source
  coverage, freshness, missing transcript/recap state, and contradictions per
  meeting.

## Amendment B — truthful historical reconstruction and reusable Jira policy

Added: 2026-07-28  
Reason: Steve clarified the required truth, workflow, hierarchy, relationship,
and effort-accounting behavior for both the baseline Jira reconstruction and
the permanent dashboard reconciliation capability.

- Historical work may be represented only when the available evidence supports
  that Steve actually performed it. Microsoft-aligned gaps may become planned
  work, but they may not be presented as historically completed activity.
- Personal projects, personal application development, trading work, and any
  other non-engagement activity are excluded from evidence, tasks, comments,
  worklogs, and weekly totals. Prism and Prism v2 are connector implementation
  references only; their product work is not MDM Jira evidence.
- A person, meeting, conversation, approval, decision, or stakeholder
  interaction may be named only when calendar, transcript, email, Teams, Jira,
  or another authorized source proves it occurred. Solo work remains written as
  solo work.
- `In Progress` is reserved for work that is demonstrably active now and still
  due. Stale, completed, obsolete, blocked, canceled, superseded, and future
  work must be classified into their truthful states instead of being left in
  an active swimlane.
- Subtasks are used when the evidence shows a real independently trackable
  decomposition. Every subtask receives the same complete metadata,
  description, dates, comments, effort, verification, and disposition as its
  parent. Skeleton subtasks are forbidden.
- Jira links reflect real execution relationships. `Blocks`, `is blocked by`,
  dependency sequencing, duplicates, supersession, and related-work links must
  be created when the evidence supports them and verified by Jira read-back.
- Jira comments use Steve's first-person, conversational technical voice and
  never claim automation, AI assistance, or nonexistent collaboration.
- Historical worklogs use Steve's current 3x normalized-effort rule. A weekly
  total of 60 to 65 hours is a reconciliation target and audit constraint, not
  permission to invent filler. Unsupported weekly gaps remain disclosed.
- The authorized retroactive Jira mutation window is 2026-05-01 through
  2026-07-28. Only the full weeks from 2026-05-04 through 2026-07-26 are
  eligible for 60-to-65-hour settlement. The partial boundary periods
  2026-05-01 through 2026-05-03 and 2026-07-27 through 2026-07-28 use actual
  evidence-backed work only. Earlier evidence is context for deduplication,
  dependency reconstruction, and preserving existing Jira history, not
  authority to create new retroactive activity.
- The dashboard's MDM `Refresh / Reconcile` capability must execute this exact
  policy as a reusable, versioned reconciliation engine. It must retain
  provenance, classification rationale, hierarchy/link effects, weekly effort
  audit results, idempotency keys, conflict handling, and post-write Jira
  verification.
- The current direct reconstruction request is deliberate authorization for
  the ledgered Jira mutations produced by this evidence review. Future
  dashboard runs still present the exact proposed effects before the user
  explicitly applies them; ambiguous or unsupported effects remain
  non-applicable.

## Amendment C — approved Workbench visual north star and original Fabric assets

Added: 2026-07-28  
Reason: Steve approved the rendered Data work surface as the design direction
for the broader application and clarified that its imperfect mockup icons are
not implementation references.

- The current Data work surface is the application-wide visual north star:
  bright white and cool-gray surfaces, strong navy typography and hierarchy,
  restrained Fabric teal, generous spacing, quiet dividers, crisp cards,
  compact truthful state badges, and editorial headings.
- Apply that design language coherently to Today, Work/Jira, Meetings, Team
  Library, Connections, reconciliation, detail panels, and shared shell
  surfaces. Preserve each view's information hierarchy instead of cloning the
  Data work hero onto every page.
- IP Corporation blue and white remain the governing brand palette. Fabric
  teal is a restrained product/capability accent, not a replacement brand.
  Purple and generic decorative gradients remain prohibited.
- Every Microsoft Fabric logo, product icon, and capability mark must use the
  exact supplied original PNG asset, preserving its native colors,
  transparency, and aspect ratio. CSS drawings, generic icon substitutions,
  screenshot crops, and hand-matched approximations fail this gate.
- Verification must inspect the live rendered application at the icon's actual
  display size and confirm that the browser loaded the intended original asset
  path without distortion.

## Amendment D - readable detail surfaces and clear Team Library navigation

Added: 2026-07-29  
Reason: Steve tested the current interface and found three high-impact usability
problems in the live app.

- The Jira issue dialog must be centered with visible page space around it on a
  normal desktop screen. Its width and height must stay comfortable for reading,
  with a fixed header and action row plus an independently scrolling body.
- Jira descriptions must open in a formatted reading view. Headings, lists,
  links, emphasis, tables, quotes, dividers, and code must remain readable.
  Editing is an explicit action and must never replace the formatted view with a
  raw wall of text until the user chooses to edit.
- The meeting record panel must use the current light IP Corporation design,
  readable contrast, and content-sized spacing. The retired dark treatment is
  not permitted.
- Selecting a Team Library collection must immediately open a focused collection view
  with a clear title, artifact count, back action, and the matching artifacts in
  view. A silent filter that changes content below the current viewport is not
  acceptable.
- The Team Library reader view presents collections and knowledge items, not
  storage mechanics. Raw paths, extensions, storage names, source revision
  strings, folder wording, and backend-oriented summaries remain hidden.
  Internal section identifiers may still support accurate source mapping.
- Selecting an artifact must open a preview without downloading it. Downloading
  remains a separate deliberate action.
- Valid Mermaid files render as diagrams. If a source file cannot render, the
  interface shows a calm explanation and a formatted source view. Raw parser
  output must not be shown to readers.
- Focus handling, Escape behavior, keyboard access, responsive sizing, and
  reduced motion must remain correct for every updated detail surface.
- Browser checks must cover the Jira description reading and editing states, a
  meeting detail panel, Team Library folder entry and return, and both successful
  and failed diagram previews.
