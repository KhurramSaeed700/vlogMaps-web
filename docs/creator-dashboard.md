# Creator Studio dashboard

The dashboard takes inspiration from YouTube Studio's channel content layout while retaining TravelMap's branding and editing workflow.

- Content is the default view: compact thumbnails and descriptions, mapped locations, visibility, date, keyframe count, views and actions.
- Overview shows the existing creator metrics. No placeholder analytics, comments or YouTube notices are fabricated.
- All videos / Uploaded / Drafts and the visibility filter combine with local title/description/creator/location/tag search. Date, keyframes and views can be sorted in either direction. Results are paginated at ten videos per page.
- Search/filter changes reset pagination; deleting or filtering the final page safely clamps the page number. Filtering and sorting do not change the input videos or make network requests.
- Clicking a row, thumbnail or title opens the editor when owned. Preview, visibility and menu buttons operate independently without navigating to edit. Read-only videos link to watch instead.
- Visibility is editable directly in its column. Upload, preview, moving to drafts and confirmed deletion retain their existing server-backed handlers.
- Desktop has a workspace sidebar; smaller viewports use compact section buttons and an independently scrolling table.

Verification: `node scripts/test-creator-dashboard.cjs`, `node scripts/test-video-visibility.cjs`, `node scripts/test-access-control.cjs`, `pnpm exec tsc --noEmit` and `git diff --check`. Check content/overview navigation, keyboard menus, empty filters and a narrow viewport in the browser. Do not change real video visibility or delete user videos merely to test the design.
