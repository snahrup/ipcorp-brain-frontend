# Readable detail surfaces and Team Library navigation

Date: 2026-07-29

## Scope

- Reduced the Jira issue dialog so it reads like a normal desktop dialog instead of filling the screen.
- Added formatted Jira description rendering from Jira ADF, with markdown fallback when ADF is unavailable.
- Kept Jira description editing explicit, so the user sees the formatted view first and raw edit text only after choosing to edit.
- Changed the shared detail drawer from a full-height right panel to a centered, light IP Corporation dialog.
- Updated Team Library folder cards so selecting a folder immediately opens a focused folder view with title, count, back action, filters, and files in view.
- Kept artifact preview separate from download. Download now requires the explicit `Download original` button.
- Improved markdown preview formatting by removing duplicate first headings when the dialog header already shows the title.
- Replaced raw Mermaid parser output with a calm unavailable state and a formatted source panel.
- Preserved source-specific preview errors so users see useful retry context.

## Files changed

- `server/jira-gateway.mjs`
- `src/features/jira/JiraDescriptionContent.tsx`
- `src/features/jira/JiraIssueModal.tsx`
- `src/features/jira/types.ts`
- `src/components/drawer/DetailDrawer.tsx`
- `src/components/drawer/MeetingDetail.tsx`
- `src/components/drawer/ProposalDetail.tsx`
- `src/features/team-library/CsvPreview.tsx`
- `src/features/team-library/LibraryPreviewDrawer.tsx`
- `src/features/team-library/MarkdownContent.tsx`
- `src/features/team-library/MermaidDiagram.tsx`
- `src/features/team-library/presentation.ts`
- `src/views/workbench/MeetingsWorkspaceView.tsx`
- `src/views/workbench/TeamLibraryView.tsx`
- `src/App.css`
- `package.json`

## Verification

- `npx biome lint ...`: passed for focused changed files.
- `npm run typecheck`: passed.
- `node --check server\jira-gateway.mjs`: passed.
- `npm run test -- tests/team-library-preview.spec.ts tests/smoke.spec.ts`: 22 passed.
- `npm run build`: passed. Vite reported existing large bundle chunk warnings.

## Notes

- No Microsoft 365 live calls were made.
- No Jira writes were made.
- The Team Library preview route was tested for preview-first behavior, explicit download, retryable errors, folder entry, and Mermaid source fallback.
