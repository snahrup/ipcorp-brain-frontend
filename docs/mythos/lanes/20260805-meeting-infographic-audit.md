# Meeting infographic audit work lane

Owner: primary session
Status: complete

## Inputs

- `data/frontend-seed.json`
- `src/views/workbench/MeetingsWorkspaceView.tsx`
- `src/components/drawer/MeetingDetail.tsx`
- Brain meeting summaries and `natively/meeting-infographics` packages

## Output

- A repeatable read-only scanner
- A checked audit snapshot containing only missing items and source availability
- A compact Meetings review surface
- Focused scanner, build, and browser evidence

## Safety rules

- Do not write to the Brain checkout.
- Do not refresh or rewrite the broader prepared meeting index.
- Do not touch shared Jira or reconciliation work.
- Do not report a source as missing when it could not be read.
