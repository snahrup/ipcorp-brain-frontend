# Team Library and modal UX lane

Date: 2026-07-29

## Scope handled

- Reduced the Jira issue dialog size and changed Jira descriptions to formatted read mode with a separate edit action.
- Restyled the meeting detail drawer to match the light Workbench interface and removed the unreadable dark panel treatment.
- Changed Team Library folder cards so selecting a folder opens an immediate folder view with its own title, count, search, type filters, artifact rows, preview actions, and back action.
- Changed Team Library preview copy from generic item language to artifact language.
- Kept preview and download separate. Preview opens the drawer and only the Download button fetches the original file.
- Changed Mermaid preview failure handling so browser parser details are not shown to the user. The drawer now shows a clean unavailable state and a readable source listing.

## Verification

- `npx biome lint src/features/jira/JiraIssueModal.tsx src/components/drawer/DetailDrawer.tsx src/components/drawer/MeetingDetail.tsx src/views/workbench/TeamLibraryView.tsx src/features/team-library/LibraryPreviewDrawer.tsx src/features/team-library/MermaidDiagram.tsx src/features/team-library/presentation.ts src/views/SourceHealthView.tsx src/App.css tests/smoke.spec.ts tests/team-library-preview.spec.ts --max-diagnostics=100 --diagnostic-level=error`
- `npm run typecheck`
- `npx playwright test tests/smoke.spec.ts tests/team-library-preview.spec.ts --project=chromium`
- `npm run build`

## Notes

- The production build passed and still reports existing large chunk warnings from the app bundle.
- This lane did not exercise live Jira writes or Microsoft 365 requests.
