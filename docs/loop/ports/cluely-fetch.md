# Port: cluely-fetch

- Donor: none to port; built fresh after live probing. Trope CUA performed
  the reconnaissance; Playwright over CDP performs the fetch.
- Station: sense
- Date: 2026-08-13, overnight
- Budget: one day. Blown: no (about two hours including the dead ends)

## 1. Behavior we want

End the manual copy-paste of every Cluely capture. Given a capture title,
read its full transcript out of the running Cluely app and hand it to the
closeout pipeline, whose cleanup pass then makes it Teams quality. Fail
closed on a missing session or a fragment.

## 2. What the live probing established (the dead ends are the spec)

- Cluely stores transcripts in its cloud only. The local app data
  (leveldb, cache, WebStorage) contains no transcript text. Re-confirmed
  once tonight; Steve has confirmed it many times before. Closed forever.
- The desktop window exposes exactly three accessibility elements
  (Minimize, Maximize, Close). Custom-rendered; the UIA route is out.
- GDI window capture returns a constant blank; the pixel route is out too.
- The harness classifier blocked trope's click lane mid-probe. Steve added
  an allow rule for the trope binary; the CDP route made clicking mostly
  unnecessary anyway.
- The door: Cluely is Electron. Relaunched with
  `--remote-debugging-port=9223`, its renderer exposes real pages
  (dashboard, chat, control) and the dashboard lists every capture as a
  link. Trope's own doc names CDP as the correct lane for custom-rendered
  surfaces.

## 3. Red

- Test file: `server/loop/skills/cluely-fetch.test.mjs` (parser, the
  failable heart). Written against the observed DOM shape:
  speaker / timestamp / utterance triplets buried in UI chrome.
- Red output: ERR_MODULE_NOT_FOUND for the skill module, then green on
  implementation. 2 tests.

## 4. Real exercise (live, 2026-08-13 ~01:10)

- Target: the only 8/12 capture, Cluely-titled "Finalizing Credits Scroll"
  (3:41 PM, 13 minutes) = the 3:30 Halftime Deliverable Review.
- Fetched 8,093 DOM characters, parsed to 155 capture lines (7,800 chars),
  processed through `processMeetingCloseout` with the real calendar
  identity: the cleanup pass attributed every line (zero "Them" in the
  stored transcript), the package stored with 4 commitments, and the
  snapshot re-synced itself. Session
  `fc06831d-e98e-4c66-b7a7-6ca625db94cb`, package
  `2026-08-12-halftime-deliverable-review`.
- This was also the first live firing of the transcript auto-cleanup built
  earlier the same night.

## 5. Standing requirement

Cluely must run with the debug port for the skill to work. Tonight's
relaunch carries it; the durable form is adding
`--remote-debugging-port=9223` to Cluely's launch shortcut, which is a
one-time change Steve makes or approves in the morning.

## 6. Sign-off

- [x] Spec complete (this file; written after live probing, which is the
      honest order for a skill whose surface was unknown)
- [x] Red before green on the parser
- [x] Implementation small and fully explainable
- [x] Real end-to-end exercise linked
- [x] Banned-word scan clean
- [x] Commit links this file
