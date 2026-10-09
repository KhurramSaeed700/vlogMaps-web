# Home-page loading improvements

Baseline: the mobile PageSpeed report at
https://pagespeed.web.dev/analysis/https-vlogmaps-vercel-app/kt9tq8kk27?form_factor=mobile
(October 9, 2026) scored 73. LCP was 6.6 s, FCP 2.0 s, TBT 20 ms and CLS 0.
The LCP element was the first video thumbnail, loaded lazily after client-side catalog fetching.

## Changes

- Query the existing public-only catalog on the server and render cards in the initial HTML.
- Do not empty the server-provided catalog during hydration or fetch it again immediately.
- Keep background YouTube metadata refresh, filtering, deduplication and sorting.
- Preload only the first visible thumbnail; keep remaining thumbnails lazy-loaded.
- Account for grid gutters and the maximum container width in responsive image sizing.
- Omit full route geometry from the initial home-page payload.
- Keep the page dynamic, without cross-request catalog caching, so private/unlisted visibility changes are not delayed by a new cache.

No watch/edit animation, tile preload, camera tracking, authentication, or database mutation behavior is changed.
The existing Clerk scripts account for much of the report's unused JavaScript, but are intentionally left unchanged in this targeted pass.

## Verification

Run `node scripts/test-home-performance.cjs`, `node scripts/test-video-visibility.cjs`,
`node scripts/test-access-control.cjs`, `pnpm exec tsc --noEmit` and `git diff --check`.

After deployment, rerun mobile PageSpeed under comparable conditions. Verify that the first
thumbnail is discoverable in the initial response, that its request is prioritized, and that
catalog query latency does not offset the removed browser waterfall. Scores and LCP improvements
are not guaranteed; compare several runs rather than a single result.
