# Daily meeting prep acceptance checks

Status: Frozen before implementation on 2026-08-04

## User path

1. `/meetings/daily-prep` opens directly and remains under Meetings in the left navigation.
2. The page reads the dated local prep output only. Opening it does not start a Microsoft 365 read.
3. Every package found for the selected day appears with its meeting name, time, readiness, and last update.
4. Selecting a package shows its meeting context, evidence note, and available source files.
5. A ready package can be opened, printed, and downloaded from the package view.
6. Missing folders, incomplete files, skipped meetings, and an unavailable dated source are shown as such.

## Checks

- The server reads only one validated `YYYY-MM-DD` folder and direct package children.
- User supplied package and file names are matched against actual directory entries.
- The existing Meetings page keeps its current behavior.
- Focused server tests, type checking, a production build, and a browser path check pass.

