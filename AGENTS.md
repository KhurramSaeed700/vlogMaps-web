# TravelMap engineering priorities

## Map smoothness is the highest priority

The watch and edit maps are the core product experience. A feature is not complete if it makes traveler motion, camera movement, route drawing, map interaction, or tile loading feel slower or less reliable.

- Keep traveler and camera animation on `requestAnimationFrame`; never add React state updates, network requests, storage work, or route-wide calculations to the per-frame loop.
- Cache or sample contextual work such as density, speed, and stop detection. The camera may reuse a target briefly, but its visible interpolation must continue every frame.
- Preserve logarithmic route-leg and camera-timeline lookups in `components/maps/mapbox-travel-map.tsx`.
- Preserve route preloading, bounded tile caches, viewport marker virtualization, and throttled route/marker refreshes unless a measured replacement is faster.
- Keep the active traveler centered during tracking on mobile and desktop.
- Prefer graceful visual simplification over dropped frames when routes become large or devices are slow.

For every map-related change:

1. Run `tsc --noEmit` and `git diff --check`.
2. Test the live watch or edit map at slow movement, fast movement, and a stop point.
3. Confirm tracking remains centered and map interactions still respond immediately.
4. Check the browser console for errors.
5. Do not add new per-frame work without a clear performance budget or cache.
