# Activity reconciliation interface lane

## Purpose

Add the Work action, persistent run panel, source status, recap, Stop and Resume,
and reviewed proposal experience.

## In scope

- `src/features/activity-reconciliation/`
- Narrow integration in `src/features/jira/JiraWorkSurface.tsx`
- Focused component styling and client types

## Out of scope

- Existing Jira layouts and issue editor behavior
- Meeting overview redesign
- Source implementation details

## Dependencies

- Stable server response shapes
- Existing Workbench design tokens
- Existing proposal review and live activity patterns

## Verification expectations

- Browser fixture checks cover all visible states, focus, keyboard, reduced motion,
  phone width, and no horizontal overflow.
- Opening Work alone sends no activity source request.

## Owner

Builder, followed by verifier and reviewer.

## Status

Complete. The Work action, idle and running states, source progress, Stop and Resume,
proposal review, typed Jira approval, and changes-only recap are implemented and
covered in Chromium and Firefox at desktop and phone widths.
