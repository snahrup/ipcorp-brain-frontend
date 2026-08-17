# The Foreman Briefing, adopted direction (2026-08-17)

The landing experience becomes a chaptered guided briefing instead of a dashboard. The Foreman
(the one voice already named in the self-driving ground rules) has read Jira, meetings, agent
work, communications, and open decisions before you arrive, and walks you through the day in six
chapters. The full map (Work, Agent Board, Current State) stays one click away at all times. The
interaction grammar borrows from continuous chaptered web experiences: one idea on screen at a
time, large transitions that reorient between chapters, details revealed on arrival, a visible
next step, and motion that communicates progression. The operational controls inside each chapter
stay fast, explicit, and plain.

Companion artifacts: the research compendium
(`2026-08-17-pm-walkthrough-inspiration.md`) and the six-frame storyboard
(`foreman-briefing-storyboard.html`, sample content, illustrative only).

## The six chapters

1. **Arrival.** Calm dark scene, a greeting, the honest totals ("3 need you, 11 continue without
   you"), the advertised cost ("about 4 minutes"), and Begin. Quick Brief and Current State are
   visible from the first frame.
2. **Where we are.** The sources the Foreman examined resolve into one orientation statement:
   what progressed, what completed and verified, the next meeting, and any source that returned
   incomplete information (amber, stated plainly, never papered over). Nothing here needs action.
   Replaces the six health cards and the source-warning strip.
3. **What changed.** At most three material changes since the last briefing, each with its
   evidence line (meeting record, ticket, message). Not an activity feed; anything unchanged
   stays out.
4. **What needs you.** The center of the experience. Items one at a time with a progress marker,
   each in a PM kind (decide, review, estimate, respond, follow up, start work, supply input),
   with why-now, a recommended answer, a per-item confidence tag, and a small closed verb set:
   approve, change the answer, more context, snooze, not mine.
5. **Plan the day.** The proposed timeline against the calendar, ballpark chips (15m, 30m, 1h,
   half day, custom), summed planned work against available focused time with overflow made
   visible. The Foreman proposes and you correct; nothing auto-schedules.
6. **You're clear.** Motion stops. Tallies of what was handled, what continues without you, the
   return conditions, and one First Focus with a Start button. The surface explicitly tells you
   to leave and go work.

## Two speeds, from day one

- **Guided briefing**: the full chaptered experience. Plays on the first visit of the day,
  resumes where you stopped.
- **Quick brief**: the same content as a condensed list with "Begin at item 1." Always one click
  or keystroke away. Skip, Quick Brief, and Current State stay visible at all times; the guided
  version must never become an intro animation you sit through.

## Non-negotiable rules

1. Scroll, wheel, arrows, and gestures navigate. They never approve, dismiss, snooze, or execute.
   Actions require explicit controls and save receipts.
2. Truth fail-closed: every count and claim on screen comes from the live snapshot. A source that
   failed renders as the amber incomplete line; it never becomes an invented number.
3. v1 renders with layered CSS transforms, SVG, canvas particle fields, and framer-motion
   timelines. No WebGL requirement; optional richer backgrounds later behind capability
   detection. Animation is compositor-only (transform, opacity); layout properties are never
   animated (repo learnings, 2026-05-29 and 2026-05-30: context leaks and starved layout
   transitions are how the last 3D surface kept breaking).
4. Keyboard-completable end to end; a three-item briefing costs 2 to 4 minutes; Esc skips any
   transition; prefers-reduced-motion collapses transitions to fades.
5. Item cap 3 to 5. The remainder is visibly parked in a named place with return triggers (a
   date, or new activity on the item, whichever comes first).
6. Anti-repetition ledger: each item is stamped with last-walked and last-answered; yesterday is
   closed out before today is written (Weekly Status already works this way).
7. Replies route into Jira and email as drafts and comments, never sends.
8. Wording: the chapter is "Plan the day" (not "Shape the day"), and background work "continues
   without you" (not "is moving"). House wording rules apply to all briefing copy.

## Visual language

IP Corporation tokens, dark register for the briefing canvas: structural navy depths (#0e2338
family), corporate blue light (#1b5e9e and tints) instead of neon, white and blue-soft (#9fb0c2)
architectural line work, fine grids and blueprint detail instead of fantasy scenery. Green
(#1e7b4d family) only for verified completion; amber (#b0761a family) only for uncertainty or
attention. Figtree for giant chapter titles; monospace only for source references (MT-142,
file names). The recurring object is a living blueprint structure that assembles as the briefing
proceeds: fragmented at arrival, organizing during "Where we are," opening into paths during
"What needs you," a clean completed structure at "You're clear." The metaphor explains progress;
it never hides a button.

## PM item kinds

| Kind | Treatment | Controls |
|---|---|---|
| Decide | Two paths converge | Approve, choose, revise |
| Review | Artifact comes forward | Approve, request changes |
| Estimate | A path changes length | 15m / 30m / 1h / half day / custom |
| Respond | Communication node lights | Review draft, edit, stage |
| Follow up | A distant node stays unresolved | Stage reminder, snooze |
| Start work | A route opens | Begin, schedule, defer |
| Supply input | The route visibly stops | Paste, answer, attach |

## Journey two: the meeting countdown (added same day)

A second guided experience, per meeting, sharing the briefing's grammar.

**Trigger.** When the morning briefing or any meetings-page visit reads the day's calendar, a
local scheduler sets a timer per real meeting (calendar markers like "Reminder:" and "WFH" are
skipped). At T-30 a Windows toast fires: meeting title, time, "prep is ready." Clicking opens
the per-meeting walkthrough; Later re-raises at T-15; dismissals are recorded. The scheduler
never starts a Microsoft read of its own; it consumes the calendar cache a human visit warmed
(house rule: background pollers are cachedOnly). A meeting added after the last visit gets its
toast once the next visit refreshes the cache, and the walkthrough states that coverage limit
rather than hiding it.

**The five prep chapters.** The room (who is in it, one line each from the brain). Last time
(what the previous meeting decided, what was promised). Open threads (what you owe them, what
they owe you, each with an evidence pill). Today's goal (the one outcome that makes the meeting
worth it, editable). Materials (the prep package files, opened in the background as you
continue). Three to five minutes, resumable, same verb grammar as the briefing.

**Set the room: the trope choreography.** Runs only from an explicit click on the final
chapter, never from the toast alone, and never while a screen share is active. Steps, each
verified and receipted before the next:

1. Resolve the per-meeting Cluely prep file from the Claude meeting-prep root. Missing file:
   stop, say so, offer to generate it first. Never an empty upload.
2. Restore the Cluely window (a minimized Electron window renders nothing) and confirm the
   target from the window title AND the element tree, exactly like the Teams procedure.
3. Select IP Corp meeting mode via element-index actions from a fresh get_window_state snapshot.
4. Upload the prep file. Preferred path: type the full file path into the standard Win32 open
   dialog (the stable route); drag-drop only if Cluely exposes a reliable target. Verify the
   file name appears in Cluely's UI before continuing.
5. Start a new meeting session.
6. Send the initial widget message naming the uploaded file: "Use <file name> for this meeting:
   <meeting title>." Screenshot receipt after typing, then submit.
7. Minimize everything else; open the prep documents without focus so they sit ready in the
   background.
8. Write the run ledger to %LOCALAPPDATA%\IPCorpBrain\ (never into the repo), one receipt per
   step with timestamps. The walkthrough's closing frame renders exactly these receipts.

**One-time prerequisite: DONE (2026-08-17).** The Cluely element-map study is complete and
saved as `cluely-element-map.md`: the mode buttons (a single "IP Corp" mode remains after
Steve's same-day cleanup of duplicates, and it is the one the countdown selects), the
"Upload additional file" control, and the pill's "Ask" and "Start session" buttons are all
UIA-addressable by name. Two small gaps map themselves during the first
supervised run (the Ask bar's compose input, which only exists while focused, and the Modes
dialog opener, which sat behind the already-open dialog). Key rules from the study: target by
visible name, never React-ephemeral automation ids; check the reference list for the file name
before uploading (duplicates already exist from manual uploads); "Start session" is the one
irreversible step and runs last. Re-snapshot when Cluely updates.

**Named risks.** Cluely UI drift breaks element maps (re-snapshot; fail closed in the
meantime). File dialogs are the flakiest desktop-automation surface, hence path-typing first.
The choreography refuses to run mid-screen-share. Any unverifiable step stops the run and is
reported unverified, never retried blind.

## Next artifacts

1. Storyboard review (both journeys are in `foreman-briefing-storyboard.html`).
2. Design spec: DONE, `2026-08-17-foreman-briefing-spec.md` (state machines, per-chapter
   reads, ranking and ledger, reply-to-receipt routing, toast scheduler, storage, acceptance
   checks that can fail, build order).
3. The Cluely element-map study: DONE, `cluely-element-map.md`.
4. Prototype behind a toggle, current Today untouched, following the spec's build order.
