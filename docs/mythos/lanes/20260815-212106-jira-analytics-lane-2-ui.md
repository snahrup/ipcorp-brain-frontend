# Lane 2: responsive analytics view

- Owner: main
- Status: pending

## Purpose

Add the Analytics layout, data states, accessible charts, and desktop plus iPhone presentation.

## In scope

- `src/features/jira/JiraAnalyticsView.tsx`
- `src/features/jira/jira-analytics.css`
- Narrow edits to Jira client types, client API, and `JiraWorkSurface.tsx`

## Out of scope

- Workbench navigation changes
- Redesign of List, Board, Activity, Timeline, Gantt, or Dependencies
- New chart packages

## Dependencies

Lane 1 response shape.

## Notes

Use semantic HTML and CSS bars so every chart also has readable text. Put the phone layout first
in each responsive decision and prevent page-level horizontal scrolling.

## Verification

TypeScript, focused Biome, production build, and browser checks.

