# TravelMap engineering priorities

## Canonical project context

- This directory (`vlogMaps-web/`) is the default working directory for web tasks.
- At the start of each task, inspect this project's `.agents/` and `.codex/` directories and read relevant project instructions and context before editing files. Follow the applicable skill-discovery rules for any skills found there.
- Store project-local context, skills, and Codex configuration only in these directories; do not create duplicate context directories at the parent `vlog maps/` level or in `vlogMaps-mobile/` for web work.
- Keep `.agents/` and `.codex/` separate because they serve different tool conventions. Use this `AGENTS.md` as the shared instruction entry point instead of duplicating project policies in both directories.
- Do not store API keys, credentials, or copies of global user configuration in context files. Inspect relevant configuration without exposing secrets.

## Map smoothness is the highest priority

The watch and edit maps are the core product experience. A feature is not complete if it makes traveler motion, camera movement, route drawing, map interaction, or tile loading feel slower or less reliable.

- Keep traveler and camera animation on `requestAnimationFrame`; never add React state updates, network requests, storage work, or route-wide calculations to the per-frame loop.
- Cache or sample contextual work such as density, speed, and stop detection. The camera may reuse a target briefly, but its visible interpolation must continue every frame.
- Preserve logarithmic route-leg and camera-timeline lookups in `components/maps/mapbox-travel-map.tsx`.
- Preserve route preloading, bounded tile caches, viewport marker virtualization, and throttled route/marker refreshes unless a measured replacement is faster.
- Keep the active traveler centered during tracking on mobile and desktop.
- Prefer graceful visual simplification over dropped frames when routes become large or devices are slow.
- Treat watch/edit navigation parity as a product requirement. Camera, traveler tracking, pause/resume, zoom planning, route drawing, and map-interaction changes must be implemented and tested on both pages, preferably through shared helpers or constants. Do not ship page-only navigation behavior unless the user explicitly asks for it.

For every map-related change:

1. Run `tsc --noEmit` and `git diff --check`.
2. Test both the live watch and edit maps at slow movement, fast movement, and a stop point.
3. Confirm tracking remains centered and map interactions still respond immediately.
4. Check the browser console for errors.
5. Do not add new per-frame work without a clear performance budget or cache.
