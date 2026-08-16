# Weekly Status Comment Revision

## Copy-ready implementation instruction

Implement the anchored comment revision described below for the Weekly Status email preview. Treat this document as the complete implementation instruction. Inspect the current repository before editing, follow its local instructions and established patterns, preserve unrelated changes, and finish with evidence from the real user path.

Do not send email during development or verification. This feature never touches the Outlook draft path. It changes the draft that Steve is already looking at, and nothing else.

Design approved by Steve on 2026-08-15. Scheduled as Phase 7 item 8 in `docs/architecture/WORKBENCH-ARCHITECTURE-ROADMAP.md`. Do not start it ahead of the phases before it.

## 1. Objective

Let Steve select any part of the rendered weekly status email, say what he wants changed at that spot, and have only that part rewritten.

Today the Weekly Status page has a guidance box that sits above the email and steers a full redraft. It is blank when he opens the page, so he is steering before he has seen anything, and it has no way to say which part he means. Every send rerolls bullets he was happy with.

The reference experience is the comment popover in Claude Design: click a spot, describe the change, either stack the comment or send it.

## 2. Required outcome

When Steve has a generated weekly status draft on screen:

1. Selecting or clicking any text in the email preview opens a comment popover at that spot.
2. The popover accepts free text and offers two actions, Add comment and Send to Claude.
3. Add comment stacks the comment and closes the popover. Send to Claude acts on everything stacked.
4. Stacked comments appear as pins in the margin beside the region each one targets, and any pin can be removed before sending.
5. Sending rewrites only the fields the stacked comments target.
6. Every field with no comment against it returns byte-identical.
7. The rewritten draft renders into the same preview, so what he sees stays the email he will send.
8. Voice rules apply to a rewrite exactly as they apply to a fresh draft.
9. Generate still works as it does now for anyone who never opens a comment.

## 3. Current repository evidence

Verified 2026-08-15 against the working tree.

| Fact | Location |
| --- | --- |
| The preview is a same-origin iframe with no sandbox attribute, so the parent can read a selection inside it | `src/views/workbench/WeeklyStatusView.tsx:442` |
| A guidance textarea already exists and posts with the generate request | `src/views/workbench/WeeklyStatusView.tsx:114`, `:161`, `:243` |
| The gateway trims guidance to 2000 characters and passes it through | `server/jira-gateway.mjs:2656` to `:2661` |
| The prompt already carries guidance as top priority instruction | `server/weekly-status/build-weekly-status.mjs:143`, `:167` |
| The email is rendered from structured fields, not authored as a document | `renderWeeklyStatusHtml` at `build-weekly-status.mjs:384` |
| The full email is one template literal, so field stamps go on the existing row wrappers and need no structural change | `build-weekly-status.mjs:398` to `:438` |
| The draft runs through a spawned headless CLI | `build-weekly-status.mjs:199` inside `generateWeeklyStatus` |
| Voice enforcement already runs on generated output | `scrubDashes` at `:256`, `normalizeFields` at `:263` |
| Draft history lives outside the repository | `%LOCALAPPDATA%\IPCorpBrain\weekly-status` |

The editable fields are `overallStatus`, `budget`, `schedule`, `scope`, `bottomLine`, `highlights[]`, `needsFromBusiness[]`, and `risks[]`.

## 4. Product rules

### 4.1 The generate path does not change

`generateWeeklyStatus`, its route, and its prompt keep working exactly as they do now. Revision is a second path beside it, not a replacement. The Friday flow is unaffected for anyone who never opens a comment.

### 4.2 Untouched fields are not rewritten

A revision request returns only the fields its comments target. The server merges those over the current fields. Any field with no comment against it is the same value it was, not a regenerated version that happens to read the same.

### 4.3 Voice rules are not weakened on a tweak

Revision output runs through the same `normalizeFields` and `scrubDashes` as a fresh draft. A short rewrite is where banned words and dashes are most likely to slip back in, because the request is small and the instruction is specific.

### 4.4 Nothing is sent

This feature ends at the draft on screen. The existing Outlook draft path is untouched and is still the only way anything leaves the Workbench.

### 4.5 State stays outside the repository

Comments and revision history are written under `%LOCALAPPDATA%\IPCorpBrain\weekly-status`, never into the tree. A repository write while the dev server is running full-reloads every open tab.

## 5. User journey

1. Steve generates the weekly status as he does today.
2. He reads the preview and finds a highlight bullet that overstates progress.
3. He selects the phrase and types "this reads like it shipped, it is still in review".
4. He clicks Add comment. A pin appears beside that bullet.
5. He finds a second problem in the bottom line and comments on it too.
6. He clicks Send to Claude.
7. Both targeted fields come back rewritten. The other six highlights are unchanged.
8. He reads the updated preview and sends the Outlook draft as usual.

## 6. Ordered feature list

Build in this order. Each item is verifiable on its own before the next one starts.

### Feature 1: Field stamps in the rendered email

Stamp `data-field` on the existing row wrapper for each field-derived region in `renderWeeklyStatusHtml`. Indexed fields carry their index, for example `data-field="highlights[2]"`. The header band, condition chips, signature block, and section headings are stamped or left unstamped according to whether they are field-derived.

Check: a unit test asserts every field present in a fixture produces exactly one stamped region, and that an empty `highlights` array produces none.

### Feature 2: Selection to field resolution

A pure function takes a selection inside the preview document and walks up to the nearest `data-field` ancestor, returning the field path and the exact selected text. A selection with no stamped ancestor returns nothing rather than guessing.

Check: unit tests on a fixture document cover a selection inside one bullet, a selection spanning two bullets, a click with no selected characters, and a selection in unstamped content.

### Feature 3: The revision path

Add `buildRevisionPrompt`, which receives the current field values and the stacked comments and asks for back only the fields those comments target. Add `reviseWeeklyStatus`, which shares the spawned CLI runner with `generateWeeklyStatus`. Extract that runner out of the current function so there is one spawn path rather than two. Run the result through `normalizeFields` and `scrubDashes`.

Add `POST /weekly-status/revise` to the gateway. It takes the current fields and the comment stack, merges what comes back over what it was given, and returns the full field set.

Check: a test asserts a revision touching one field returns every other field strictly equal to its input. A test asserts a rewrite containing an em dash or a banned word is cleaned before it is returned.

### Feature 4: The comment popover and pin margin

The popover opens at the selection, accepts free text, and offers Add comment and Send to Claude. Stacked comments render as pins beside their region. A pin can be removed. Send disables while a revision is in flight and re-enables on success or failure, with the failure reason shown rather than swallowed.

Check: a Playwright test in `tests/weekly-status.spec.ts` drives the real path from selection through revision and asserts an uncommented bullet is unchanged in the DOM.

### Feature 5: Keep the record

Write each sent comment alongside the before and after field values into the existing weekly status state directory. This builds nothing that reads it yet. It exists so the edit-driven writing improvement recorded in the roadmap has real material when it is scheduled.

Check: a test asserts a revision writes one record with the comment text, the field path, the prior value, and the new value.

## 7. Acceptance

| # | Item |
| --- | --- |
| 1 | Selecting text in the preview opens the popover at that spot. |
| 2 | Add comment stacks a comment and shows a pin beside its region. |
| 3 | A pin can be removed before sending. |
| 4 | Send rewrites only the commented fields. |
| 5 | Every uncommented field is strictly equal before and after. |
| 6 | Revision output passes the same voice checks as generated output. |
| 7 | A selection in unstamped content does not open a comment. |
| 8 | A failed revision leaves the current draft intact and states why. |
| 9 | Generate still works unchanged with no comments present. |
| 10 | No revision writes into the repository tree. |
| 11 | Each sent comment is recorded with its before and after values. |
