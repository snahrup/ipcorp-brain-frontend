# Foreman Briefing, design spec (2026-08-17)

Status: direction approved; this is the buildable design. Companions in this folder: the
concept (`2026-08-17-foreman-briefing-concept.md`), the research compendium
(`2026-08-17-pm-walkthrough-inspiration.md`), the nine-frame storyboard
(`foreman-briefing-storyboard.html`), and the Cluely element map (`cluely-element-map.md`).

## 1. Purpose and scope

Two guided journeys replace "land on a dashboard" with "land on a walkthrough": the morning
Foreman Briefing, and a per-meeting Countdown triggered by a T-30 toast that ends with the
desk physically set for the meeting. v1 ships behind a toggle; the Today view and every
existing surface stay untouched and reachable.

## 2. Surfaces and rollout

- Routes: `/briefing` (journey one), `/briefing/meeting/<outlookId>` (journey two). The
  toast deep-links to the meeting route.
- Toggle: `foreman-briefing` flag in localStorage plus `?briefing=1` query override. While
  the flag is off, nothing changes anywhere. When on, `/` renders the briefing with
  "Current State" linking to the existing Today view.
- Meeting identity comes from the real Outlook meeting objects the closeout flow already
  uses (`/api/meeting-closeout/today` lane), never a synthesized identity. Calendar markers
  ("Reminder: ...", "<name> - WFH") are skipped.

## 3. Journey one: state machine and per-chapter reads

```
arrival → orientation → changes → item-1 … item-n → day-plan → clear
(any state → quick-brief | current-state; Esc skips any transition; state is resumable)
```

- **Arrival.** Counts from the TodaySnapshot read (sources: jira, agentBoard,
  reconciliation, loop) plus today's meetings. Advertised cost is computed from item count.
- **Orientation.** Deltas against yesterday's run ledger: progressed, completed-and-verified,
  next meeting, per-source freshness. A failed or stale source renders as the amber
  disclosure line with its real age. Replaces the six health cards and warning strip.
- **Changes.** At most three material changes since the last briefing, each with evidence
  pills (meeting record, ticket, message). No evidence, no card; drops are recorded.
- **Items.** The ranked queue, one at a time (section 4), each with why-now, recommended
  answer, and a per-item confidence tag derived from source count and freshness.
- **Day plan.** Calendar blocks plus proposed focus blocks; ballpark chips; planned time
  summed against available focused time with overflow shown and one-key deferral. Remaining
  work uses the same derivation as the issue cards (original estimate minus time spent,
  never Jira's drifting remaining field).
- **Clear.** Renders exactly the receipts written this run, the parked count, and one First
  Focus. Green appears here only.

## 4. Ranking, caps, ledger

- **Next-actor rule:** an item enters the queue only if a human is the next actor and that
  human is Steve.
- **Cap:** 5. Ranking signals, in order: explicit deadline distance, meeting proximity
  (needed for a meeting today beats everything undated), direct request or mention,
  multi-source corroboration, declared priorities (a small `priorities.md` the briefing
  reads; editable, plain text), staleness of the owed reply. No learned ranking in v1.
- **Parked remainder:** everything filtered out lands in a named "parked" list one click
  away, each entry carrying its return trigger: a date, or new activity on the item,
  whichever comes first. The cap must never read as concealment.
- **Anti-repetition ledger:** every item is stamped `lastWalked` / `lastAnswered` plus a
  content hash. Before generation, a close-out pass reconciles yesterday's answers (the
  Weekly Status three-week no-repeat check is the in-house precedent). An answered item
  returns only when its content hash changes or its snooze trigger fires.

## 5. Replies and receipts

Verb set per item: approve / change the answer / more context / snooze / not mine, plus
ballpark chips (15m, 30m, 1h, half day, custom) on estimate items and one line of free text.
Routing:

- Approvals and answers land as Jira comments or worklogs through the existing gateway lanes
  (`addIssueComment`, worklog routes), as drafts and comments only, never sends.
- "Respond" items produce an email draft through the established draft lane; the briefing
  links to the draft, and sending stays manual.
- Every routed reply writes a receipt row: timestamp, item id, verb, destination, result.
  Receipts and all run state live under `%LOCALAPPDATA%\IPCorpBrain\foreman\` (repo files
  trigger dev-server reloads; machine state never lands in the repo).

## 6. Journey two: countdown

```
toast → room → last-time → open-threads → goal → materials → set-room → set
(any state → full-packet | skip; the set-room run starts only from an explicit click)
```

- **Scheduler.** When a human visit warms the day's calendar (briefing arrival or the
  meetings pages), the local scheduler sets one timer per real meeting. T-30 raises a
  Windows toast (title, time, "prep is ready"); Later re-raises at T-15; dismissals are
  recorded. The scheduler never starts a Microsoft read of its own (single-flight house
  rule: background jobs are cachedOnly). A meeting added after the last visit rings only
  after the next visit refreshes the cache, and the walkthrough states that limit.
- **Chapters.** The room, last time, open threads (owed both ways, with evidence pills),
  today's goal (editable), materials (opened in the background, never stealing focus).
  Content comes from the prep package, the last meeting summary, and open commitments in
  the brain.
- **Set the Room.** The eight receipted steps from the concept doc, executed per the element
  map: resolve the per-meeting Cluely prep file (missing file stops the run and offers
  generation first), restore Cluely and confirm target by title AND tree, select the
  "IP Corp" mode, check the reference list for the file name and skip the upload if already
  present, otherwise upload via typed path in the Win32 dialog and verify the name appears,
  start a new session (the one irreversible step, always last), send the widget message
  naming the file, minimize everything else with prep documents open in the background.
  Targeting is by visible name only, never React-ephemeral automation ids; element indexes
  are re-resolved after every state change; the run refuses to start during a screen share;
  an unverifiable step stops the run and reports unverified.

## 7. Generation and voice

Narration is drafted server-side through the same headless drafting lane Weekly Status uses,
from the assembled evidence only. House voice rules apply in full (banned words, no
templates). Fail closed: if narration cannot be produced, the briefing renders the Quick
Brief list without prose; a canned paragraph is never substituted. Every number shown comes
from the snapshot, never from the model.

## 8. Rendering and motion

Layered CSS, SVG, and canvas only; no WebGL requirement in v1. Animation is compositor-only
(transform, opacity); layout properties are never animated. Cinematic transitions between
chapters, 300 to 600ms inside them. `prefers-reduced-motion` collapses transitions to fades.
Fully keyboard-completable; Esc skips; scroll and gestures navigate and never execute.
Two speeds from day one: Guided (first visit of the day, resumable) and Quick Brief
(condensed list, "Begin at item 1," always one keystroke away).

## 9. Storage sketch

`%LOCALAPPDATA%\IPCorpBrain\foreman\runs\<date>.json`:

```json
{
  "runId": "2026-08-18-am",
  "generatedAt": "...",
  "sources": { "jira": {"status": "ok", "observedAt": "..."}, "...": {} },
  "items": [
    { "id": "mt-142-decision", "kind": "decide", "hash": "...",
      "sourceRefs": ["..."], "confidence": 2,
      "answer": { "verb": "approve", "at": "...", "routedTo": "jira:MT-142#comment", "receipt": "..." } }
  ],
  "parked": [ { "id": "...", "returnAt": "...", "wakeOnActivity": true } ],
  "meetings": [ { "outlookId": "...", "toastAt": "...", "outcome": "opened|later|dismissed" } ]
}
```

## 10. Acceptance checks that can fail

Unit (fail-then-pass on the ranking and ledger modules):
1. Eleven candidate items in, five out, ordered by the declared signals; next-actor
   violations excluded with reasons recorded.
2. An item answered yesterday with an unchanged hash does not reappear; the same item with a
   changed hash does; a snoozed item returns on date OR recorded new activity.
3. Generation failure produces the Quick Brief structure with empty narration fields, not
   placeholder prose.

End to end (Playwright):
4. With the toggle on, `/` renders arrival with counts equal to a fixture snapshot's values.
5. Wheel and arrow events in every chapter fire zero mutation requests (network assertion);
   verbs fire exactly one each.
6. Esc from any chapter lands on the next state within 200ms; reload mid-item resumes the
   same item.
7. Quick Brief is reachable in one interaction from every state.

Countdown and choreography (first supervised run, receipts as evidence):
8. The scheduler run originates zero Microsoft requests (broker ledger shows no new rows
   attributable to it).
9. A meeting fixture at T-30 raises exactly one toast; Later re-raises once at T-15.
10. Set the Room with a missing prep file refuses with the stated message and no side
    effects; with a duplicate file present it skips the upload and says so; a full run
    produces one receipt per step and the amber line for anything unverified.

## 11. Out of scope v1

Learned ranking, audio digest, WebGL backgrounds, auto-scheduling, multi-user briefings,
guided tours for other viewers.

## 12. Build order

1. State machine shell + Quick Brief from the existing TodaySnapshot (no narration yet).
2. Ranking + ledger modules with checks 1 to 3 failing first.
3. Chapters and motion; checks 4 to 7.
4. Narrated generation through the drafting lane.
5. Toast scheduler; checks 8 and 9.
6. Set the Room behind its own confirm, first run supervised; check 10; the run also maps
   the two known element gaps (Ask-bar compose input, Modes opener).
7. A week of real mornings, then decide the default.
