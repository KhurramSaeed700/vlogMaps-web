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

Choose **Start mapping playlist** in the import preview, or **Map video** on any imported entry. The editor's **Finish video** button saves through the normal autosave outbox, then asks **Map the next video?**. Successful uploads open the same prompt automatically. Confirming opens the next imported video in YouTube playlist order; **Creator dashboard** returns to the content list after saving. Failed or offline saves prevent advancing. Unimported entries are skipped, and the final imported video shows a completion message. Playlist context stays in editor URLs and new imported videos retain their source playlist tag for reopening from Studio.

When the next episode has no saved map points, its editor starts an open stop at **0:00** using the previous episode's final recorded location. The map marker is already placed, normal autoplay starts after loading, and **W** ends the stop at the current video time. Airport landings become ordinary stops; anonymous regions retain their radius and privacy label. Opening an unmapped episode directly uses the preceding imported episode. Continuing with **Yes, map next video** preserves the actual source episode in the URL, including when YouTube order differs or entries are skipped. Source videos must belong to the signed-in creator and the same playlist. Existing cloud/local points and active drafts are never replaced. If the prior episode cannot be loaded or has no location, normal manual mapping remains available.

Continuity checks: `node scripts/test-playlist-continuity.cjs`.

### Homepage link preview

The homepage recognizes `list=` URLs before treating them as individual videos. The preview displays the playlist title and YouTube's total item count. Approved creators can open the playlist import preview in Creator Studio with the URL already filled in. Video previews offer an editor link for owned entries or an add action for a new map. Availability uses only published public entries plus the signed-in owner's library; previews are private, uncached responses and hide previous results on account changes.

### Stops and anonymous regions

**W** starts a normal stop. **Shift+W** starts a 5 km **Anonymous Region** around the selected map location. If no location is selected, click the map once. The usual autoplay countdown resumes playback after placement. Press the shortcut again when the stop ends. The compact status indicator shows the pending action; Escape cancels pending placement. City/region search and manual area drawing are removed.

Normal **W** stops have no radius field. Only **Shift+W** anonymous regions show **Radius (km)** in Edit. Click an anonymous region circle to open its radius editor. Radius changes use the existing Save action, autosave, and undo flow. Regions support radii from 0.05 to 500 km and show their radius in kilometers on both maps.

Anonymous regions use the label **Anonymous Region** and the message **The current location is somewhere within this region.** on Watch. Their names are not reverse-geocoded. Playback and video autoplay are unchanged. Region geometry and radius labels update only when saved or draft points change, outside traveler/camera animation frames.

Checks: `node scripts/test-stop-circles.cjs`, `node scripts/test-anonymous-regions.cjs`, and `node scripts/test-editor-stop-shortcut.cjs`.

### Airport ground routes

Ground travel to or from an airport uses the mapped road route, including short transfers after landing. When a pin is off the road network, mostly connected journeys retain their roads with thin dotted connectors to the exact endpoints. Journeys with substantial off-network gaps, disconnected water/trail points, or no available road route retain the dotted fallback. Watch and Edit share route sections and distance-proportional movement timing; stop durations remain stationary.

Region stops route from their saved center coordinates to the next timestamp through available roads, with short dotted connectors for off-network pins. The radius visualization does not change the route origin. Touching or overlapping stop ranges keep their connecting geometry; without a travel interval, that connection is revealed at the next timestamp rather than changing the saved stop times.

### Playlist workspace

Imported playlist episodes are grouped into one row alongside standalone videos in Content, sharing the status tabs, search, sorting, filters, and pagination. Mixed playlists appear in both Uploaded and Drafts when they contain matching episodes. The Add video workspace groups playlists into cards. The Playlists navigation item opens `/creator/playlists`; selecting a card opens its dedicated `/creator/playlists/[playlistId]` page. Opening a playlist row shows its individual videos in the dedicated playlist workspace.

The playlist page shows imported video count, videos with map points, upload progress, ordered episodes, and Start/Continue mapping. It loads YouTube order once, keeps only the creator's imported members, retains removed/unavailable episodes, and falls back to imported order if YouTube cannot be reached. New imports store their source position; existing imports are grouped automatically with no reimport or migration. Search, visibility, preview, upload, and edit actions remain available. Edit links preserve playlist context, and finishing a series returns to its playlist page.


### Reuse timestamp locations

Press **W** or **Q**, then click a past timestamp's location name to use it for the current entry without seeking the video. Unnamed locations display their coordinates. Flight rows expose departure and arrival locations separately while choosing. Existing entries being edited can also reuse a location. The new entry keeps its current time; open stops continue until **W** ends them. Anonymous stops retain their radius and privacy label, and cannot be reused as exact point timestamps.

Likely hotels and airports are recognized from mapped timestamp names and flight entries. A small bookmark icon beside the timestamp location adds the location to this video's **Places** through normal autosave, without typing its name again. A filled bookmark indicates an already saved location, without adding a second row. Places can be selected directly while a point or stop is awaiting placement. Recognition is based on mapped names, not video-content analysis or an assumed calendar day.

Checks: `node scripts/test-timestamp-locations.cjs`.

### Content status and durations

The content table omits creation/upload dates. Videos with saved keyframes display a teal **Mapped** badge and subtle row tint; videos without keyframes display **Not mapped**, in both standalone and playlist lists. Playlist rows show mapped episode counts. New playlist imports include YouTube content-detail durations in batches of 50. Existing entries with missing durations fetch metadata only for the visible page; unavailable durations show a dash rather than a misleading 0:00.

Videos use three mapping states without adding row height: **Not mapped** (no points), yellow **Mapping** (points exist but the latest point or stop end has not reached the final five minutes), and teal **Mapped** (latest mapped time reaches the final five minutes). Unknown durations display a neutral Checking… state until metadata resolves, rather than being incorrectly classified as Mapping. Durations update rows individually; unavailable metadata is labeled Duration unavailable. Playlist summaries distinguish complete videos from videos still being mapped.

When playback ends with a placed stop still recording, the editor closes it at the player-reported video duration and saves it through normal autosave. It keeps playback stopped, preserves anonymous-region settings, and leaves an unplaced stop awaiting location rather than inventing coordinates. Manual W completion remains unchanged.

The **Views** column uses VlogMaps `mapViews`; **YT views**, immediately after it, uses YouTube metadata view counts refreshed for visible videos. If YouTube metadata is unavailable, stored YouTube counts remain visible when available. Missing counts show a dash. Playlist rows sum the stored member counts. Sorting Views uses VlogMaps views.

### Reliable duration metadata

Creator content refreshes duration and YouTube view counts through an approved-creator batch endpoint (up to 50 IDs per request), avoiding per-video metadata rate limits. Successful durations are cached in this browser and saved to owned cloud video records. Requests retry transient failures, preserve known values, and can retry on focus/reconnection or the compact retry control. The editor also persists player-reported duration independently of timestamp saves. Saving an older video object with duration zero never erases a known cloud duration. Actual unavailable/deleted videos may still require retry or checking access; no duration is inferred from route timestamps.
