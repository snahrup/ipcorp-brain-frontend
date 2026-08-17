# Cluely element map (studied 2026-08-17)

Method: UIA tree captures via the background-safe automation driver, ax mode (no pixels).
Every capture and the single click carried a clean receipt: background_safe true, cursor never
moved, foreground never changed. No meeting session was started; the Modes dialog was already
open when studied and was left exactly as found.

## Process and windows

Cluely is one Electron process (app_name "Cluely", window class `Chrome_WidgetWin_1`; the pid
changes per launch, resolve it fresh each run via list_windows). Five top-level windows:

| Role | How to recognize it | Notes |
|---|---|---|
| Main app window | Title "Cluely", large (~1050x700) | Holds settings and the Modes dialog |
| Control pill | Title "Cluely", tiny (~163x64), top-center, always on top | The floating widget |
| Ask bar | ~540x140, positioned just below the pill | Hidden until Ask is pressed AND focused |
| Chat/response panel | ~786x593 | Hidden until in use |
| Shell/background | ~1426x746, empty title, `Chrome_WidgetWin_0` | Not a target |

Rule learned again here: a hidden or minimized Electron window reads as an empty tree. Restore
or focus before reading; never conclude "no elements" from a hidden window.

## Control pill (the floating widget)

- button "Drag control window"
- button "Ask" (opens the Ask bar; the bar keeps its UI only while focused, so the compose
  input must be mapped during a foreground run)
- button "Start session" (this is the new-meeting control; never press it outside a real,
  explicitly-started Set the Room run: it begins a live capture)

## Modes dialog (in the main window)

- Mode buttons are addressable by visible name. At study time the list was "General",
  "Personal", "IP Corp Meetings", "IP Corp", "Team Meet", "Looking for work",
  "Cluely Templates", plus "New Mode". Same day, Steve removed the duplicate IP Corp modes;
  a single "IP Corp" mode remains (his report; the main window was minimized at re-check
  time and a minimized window reads empty, so the first run's snapshot re-verifies the list).
  **The countdown selects "IP Corp".**
- Active mode "IP Corp" (Mode name field value "IP Corp", marked Active). Its standing
  real-time prompt already instructs Cluely to expect a meeting prep markdown file, delivered
  either in the widget chat input or as a reference file announced by name, and to use it as
  the guideline for that specific meeting. The app side of the choreography is already
  briefed.
- Reference files section: rows of file name + size + an "Open file actions" button per file.
  Names follow the established prep patterns (Cluely_Prep_<topic>_<date>.md and related).
- button "Upload additional file": the upload entry point. It opens the standard Win32 open
  dialog; the stable route is typing the full file path and Enter.
- A "Choose File: <last file>" file-input button also exists; prefer "Upload additional file".
- button "Save" (disabled until the mode is edited), button "Open mode menu", button "Close".

## Findings that change the choreography

1. **Target by name, never by automation id.** The dialog's automation ids are React-generated
   (`base-ui-_r_*`) and ephemeral across renders. Anchor on visible labels and control types;
   element indexes are per-snapshot cache and must be re-resolved after every state change.
2. **Check before uploading.** The reference list already contains duplicate rows for several
   files (the same prep file uploaded twice on different days). The run must search the list
   for the file name first; if present, skip the upload and announce the existing file instead.
3. **Focus is part of the procedure.** The Ask bar and chat panel hold UI only while focused,
   which the choreography provides anyway (it restores Cluely deliberately). Background-only
   reads of those two windows will always look empty.
4. **Session start is the one irreversible step.** Everything else in the choreography is
   inspect-and-retry; "Start session" begins a live capture and sits last, after the file is
   verified present.

## Remaining gaps (mapped during the first supervised run)

1. The Ask bar's compose input element (requires held focus, see above).
2. The route that opens the Modes dialog when it is closed (it was already open during this
   study, so the opener control sits behind the dialog and was not captured).

Neither gap blocks the spec; both resolve with one snapshot each during the first run.
