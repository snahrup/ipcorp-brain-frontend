# Port: outlook-proof-and-send (spec complete; live proof deferred to morning)

- Donor: none; Trope CUA is the vehicle, the m365 bridge is the verifier.
- Station: execute (show tier for proofing) + the permanent ask-first send
- Date: 2026-08-13 overnight (spec), first live proof with Steve awake

## 1. Behavior we want

The footer-free send lane. Today the automated send path stamps a visible
"Sent by Copilot Cowork" line, so every send is manual. The lane:

1. A draft exists in Outlook (created by the bridge's draft tool, which is
   permitted, or by Steve).
2. The proofing skill opens the draft in the Outlook desktop app through
   Trope (element-index actions, background-safe lanes), captures the
   window, and checks: recipient exactly as intended, subject exact, body
   matches the approved text, no footer, no stray recipients.
3. The proof (screenshot plus the checked fields) lands in the evidence
   root and on the board as a run-then-show card.
4. On Steve's per-instance send instruction, the skill clicks Send in the
   Outlook UI, which produces a footer-free email from his own client.
5. Verification closes the loop through the API: the bridge reads Sent
   Items and confirms the message landed, recipient and subject exact.
   Double verification: eyes before, readback after.

## 2. What stays fixed

- email-send remains pinned ask-first in code. This lane changes who does
  the clicking after Steve says send, never whether he is asked.
- The one-job rule bounds the bridge verification read.
- MFA, password, and credential surfaces are never captured or driven.

## 3. Why the live exercise is deferred

Trope's write actions were classifier-blocked until Steve's allow rule
landed at 1:45 AM, and by then the priority was the M365 duplicate guard.
Read-only window snapshots (the proofing half) are proven; the first full
proof-and-send runs with Steve awake so the send instruction is real, not
simulated.

## 4. Sign-off

- [x] Spec complete before code
- [ ] Red before green (first: the proof-field checker as a pure function)
- [ ] Implementation small
- [ ] Real exercise: one real draft proofed, one real send on instruction
- [x] Banned-word scan clean
- [x] Commit links this file
