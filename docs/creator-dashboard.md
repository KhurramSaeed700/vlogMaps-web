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

## Playlist imports

Open the Creator Video Workspace, paste a YouTube playlist URL (including watch URLs with a `list` parameter), and choose **Preview playlist**. Select new videos and import them as private drafts. Each saved video has a **Map video** link to its existing editor. Imports preserve playlist order in the preview and skip videos already in the owner's library. Unavailable entries are skipped; previews load up to 500 playlist entries.

The importer shows progress and supports stopping after the current save. Failed or stopped items remain selected for retry; each retry refreshes the owner's library before saving. Loading a playlist alone never creates videos. The server uses `YOUTUBE_DATA_API_KEY` (or `YOUTUBE_API_KEY`) and approved creator access. Private YouTube playlists require a separate OAuth integration and cannot be imported with the API key.

Checks: `node scripts/test-playlist-import.cjs` and `node scripts/test-playlist-import-ui.cjs`.

### Map a playlist in sequence

Choose **Start mapping playlist** in the import preview, or **Map video** on any imported entry. The editor's **Finish video** button saves through the normal autosave outbox, then asks **Map the next video?**. Successful uploads open the same prompt automatically. Confirming opens the next imported video in YouTube playlist order; **Stay here** leaves the current editor open. Failed or offline saves prevent advancing. Unimported entries are skipped, and the final imported video shows a completion message. Playlist context stays in editor URLs and new imported videos retain their source playlist tag for reopening from Studio.
