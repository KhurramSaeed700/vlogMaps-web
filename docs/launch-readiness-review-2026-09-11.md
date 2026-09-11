# TravelMap Launch Readiness Review

Completed September 11, 2026. The original recommendations are preserved below with implementation follow-ups noted.

Implementation follow-up: The first approved repair batch removes the catalog-draft exception (S1) and email/demo authorization shortcuts (S2), unifies the access endpoint with server authorization, and scopes client approval to the current account. The map follow-up implements M1-M4 on both watch and edit maps: tile-independent flight geometry, overview/arrival-first preloading, bundled coarse geography, and policy adjustment from observed source latency/backlog. Twenty-seven focused regressions pass, along with TypeScript checking and a production build. These local changes are not a production deployment. Existing demo/email-only creators must have their approved database identity explicitly linked to their Clerk ID before rollout. Recommendations without an implementation note remain open.

## Scope And Confidence

Reviewed the shared map, public/creator APIs, authorization, persistence, search providers, dependency audit, and key public/product pages. Inspected the deployed public homepage and response headers. Authenticated creator workflows were reviewed in code, not fully exercised with an authorized production account. No destructive security tests or private-data probing were performed.

This is a prioritized engineering review, not a complete penetration test or certification. Deployment settings, Clerk configuration, token restrictions, backup policies, and production telemetry require owner-side verification. Dependency counts below are the audit snapshot obtained during this review, not a claim that every advisory is exploitable here.

## Fix Before Public Launch

### S1. Restrict public draft access - High, confirmed code issue

Evidence: `lib/creator-videos-db.ts:349`. The public video lookup allows `ownerUserId: catalogOwnerUserId` independently of publication status. Consequently, a catalog-owned draft can pass this lookup when requested anonymously by ID. This does not establish that sensitive catalog drafts currently exist.

Change: Public reads should require published status. Keep owner previews behind explicit server authorization; do not use a catalog-owner exception as publication permission. Remove the empty-string anonymous-owner match too.

Acceptance: Anonymous and unrelated users cannot retrieve either catalog or ordinary drafts. Owners can preview only their own drafts; published videos remain public. Test both web and mobile endpoints.

### S2. Harden creator identity and approval - High, configuration-dependent risk

Evidence: `lib/server-creator-auth.ts:36` and `lib/creator-access.ts`. Hardcoded demo emails bypass ordinary approval, and database identity lookup accepts either Clerk ID or email without checking email verification in this function. The selected database user's ID becomes an editable owner ID.

Change: Use a unique Clerk-ID association and database-managed roles. Remove production demo bypasses. Any email-based legacy linking must require verified ownership and an explicit, collision-safe migration flow. Verify production Clerk settings before judging exploitability.

Acceptance: An unrelated account, an unverified matching email, and conflicting identity records cannot acquire another creator's ownership or privileges. Rejected/revoked creators lose mutation access.

### S3. Patch and triage dependencies - High

Evidence: `pnpm audit --prod --json` reported 38 findings: 21 high, 15 moderate, 2 low. The reviewed installation included Next 16.2.9 and Sharp 0.34.5. Findings include optional/tooling dependency chains as well as runtime packages.

Change: Upgrade to supported patched versions, regenerate the lockfile, rerun the audit and production build, and document any remaining non-reachable findings. Do not blindly force incompatible upgrades. The reviewed Next advisory specifies 16.2.11 as its patch floor, not a guarantee that this is sufficient for all current advisories.

Important qualification: The single-locale Next middleware advisory requires specific configuration absent from the reviewed `next.config`; it is not evidence that this application's authentication is bypassable. [Official advisory](https://github.com/vercel/next.js/security/advisories/GHSA-6gpp-xcg3-4w24).

### S4. Decide whether published edits are immediately live - High, product/privacy decision

Evidence: `lib/creator-videos-db.ts:115` prefers editor-state points for public output. Editor saves replace keyframes and route state without requiring a new publish operation. Public mobile route output also uses editor state.

Change: Recommended: separate draft revisions from an immutable published snapshot; publishing atomically advances the public revision. Alternatively, explicitly label published editing as immediately live and require an intentional transition into that mode.

Acceptance: Under the snapshot model, autosaving changes to a published video cannot alter public routes until Publish succeeds. Unpublish removes public access consistently, including caches.

### P1. Finish or hide creator applications - High, confirmed functionality gap

Evidence: `app/creator/apply/page.tsx:232` uses a timeout to show submission success rather than persisting an application. Selected files remain client state. The verification code derives from a short user-ID prefix; URL validation is not sufficient channel-ownership proof.

Change: For an early launch, invite-only creation is simpler. Otherwise build a real application, status, and review workflow with a server-generated challenge and verified channel ownership. Do not invite government-ID uploads without a justified, private, retention-limited document workflow.

Acceptance: Success means a durable application exists and is visible to authorized reviewers. Duplicate submissions, failures, and approval/rejection work end to end.

### S5. Replace public Nominatim autocomplete - High, provider compliance/reliability

Evidence: `components/maps/mapbox-travel-map.tsx:5142`, `lib/location-search/search.ts`, and `lib/location-search/providers/openstreetmap.ts`. Debounced typing can reach public Nominatim; fallback variants can fan out requests. Per-process queuing cannot enforce an application-wide budget across serverless instances.

Change: Use a provider/service tier that permits autocomplete, or a self-hosted service. If retaining public Nominatim for deliberate submitted searches, enforce its application-wide limits, caching, attribution, identification, and service-switching requirements. Its public service prohibits autocomplete and limits total application traffic to one request per second. [Official usage policy](https://operations.osmfoundation.org/policies/nominatim/).

## Map Loading: Recommended Next Work

The white globe and late blue line have different contributing paths. The exact reported 5-6 seconds plus 2 seconds was not isolated with a production timing trace; the following code paths are concrete reasons the existing preload strategy can fall behind.

### M1. Draw available routes independently of tile completion - Implemented

Evidence: `components/maps/mapbox-travel-map.tsx:3959` and related route drawing functions return when `isStyleLoaded()` is false. That readiness check includes source loading. `runWhenStyleReady` at line 2294 can subscribe to a future `style.load` even when only tiles are pending, which does not necessarily trigger another style-load event.

Change: Track actual style initialization/replacement separately. Once the style and route source/layer exist, update local route geometry without waiting for unrelated basemap tiles. Make style replacement safely recreate those overlays.

Also prepare flight arcs locally before playback. Pending legs currently begin as endpoint pairs; resolved geometry is applied after the asynchronous route batch. Publish/precompute road geometry where appropriate, or use incremental leg resolution. Flight geometry itself does not require a road-directions API call.

Acceptance: The flight line is visible from the first rendered flight frame even when background tiles are artificially delayed. Seeking, style changes, and stops retain correct line progress.

### M2. Preload transition overview and destination before fine detail - Implemented

Evidence: `components/maps/mapbox-travel-map.tsx:4344` suspends preloading until both style and all active tiles are loaded. A fast camera can continuously request tiles, starving lookahead precisely when it is needed.

Change: Prepare known transitions while the viewer is still in New York: first the coarse whole-flight overview, then coarse Paris coverage, then destination detail. Allow a small bounded speculative budget while the active viewport is loading; give visible requests priority rather than requiring complete global idleness. Cancel obsolete plans on seek/style/route changes.

The existing lookahead duration describes sampled future targets, not guaranteed seconds of render-ready coverage. Mapbox's `preloadOnly` requests future tiles but is not a guarantee that future frames are already decoded, uploaded, and ready. [Mapbox camera options](https://docs.mapbox.com/mapbox-gl-js/api/properties/).

### M3. Provide an always-available coarse world fallback - Implemented

Change: Package a small, appropriately licensed low-detail land/ocean representation beneath the detailed map. During large zoom-outs, recognizable geography remains visible while labels, satellite imagery, and detailed tiles arrive. Prototype this in the existing map and verify projection/style compatibility.

This is the closest analogue to YouTube showing a lower-resolution frame first. Simply increasing cache size or downloading more tiles cannot guarantee a nonblank cold start. Avoid loading the whole planet in high detail or adding a second hidden WebGL map without measuring memory, GPU, and billing impact.

### M4. Adapt to observed performance, not only connection hints - Implemented

Change: Use rolling request latency, tile backlog/errors, and frame-time measurements to adjust preload concurrency and detail budgets. Use browser network hints only as initial estimates, with conservative defaults where unsupported. Respect Data Saver, offline state, background tabs, and memory limits. Do this outside the animation loop.

### M5. Add a repeatable map acceptance benchmark - Partially implemented

Test watch and edit on desktop and mobile: cold/warm cache, slow/fast movement, NYC-to-Paris overview and landing, stop points, seeks, pause/resume, rapid style changes, constrained networks, and failed tile requests. Confirm centered tracking, immediate interactions, bounded requests/cache, and no console errors. Record first geography, first route, destination readiness, and frame-time percentiles separately. Run `tsc --noEmit`, relevant tests, and `git diff --check` for changes.

Target: no fully white geography during playback using the coarse fallback, with route rendering independent of tile latency. Detailed imagery can still take time on a poor connection; do not promise instant high resolution.

Implementation note: Automated checks now cover coarse-world availability, tile-independent route readiness, prioritized overview/arrival targets, adaptive preload policy, scheduler cleanup, camera timing, and large-route lookup behavior. The public watch page was also exercised on desktop and mobile through the New York-to-Paris flight and Paris arrival with a clean final console. Authenticated edit-map browser coverage and recorded cold-network/frame-time percentiles remain open parts of M5.

## Security And Data Integrity Hardening

### S6. Shared rate limits and provider cost ceilings

Evidence: `lib/rate-limit.ts` stores counters in a process-local Map and has no general expired-key cleanup. Public proxies have local limits; creator mutations lack equivalent limits.

Change: Use atomic shared limits per account and trusted client IP, upstream concurrency caps, and global cost ceilings. Verify trusted forwarding-header behavior on the host. Bound limiter storage and add alerts for Mapbox/YouTube usage. Test across multiple instances, not with a production load attack.

### S7. Enforce actual request size and mutation boundaries

Evidence: `app/api/creator/videos/route.ts:53` and `app/api/creator/video-state/[videoId]/route.ts:61` check declared Content-Length before parsing the whole JSON body. Missing or inaccurate length bypasses these application checks.

Change: Enforce a streamed byte limit, expected JSON content type, validation limits, and per-creator storage quotas. Verify platform caps. Review allowed origins/Clerk authorized parties and cookie-authenticated mutation CSRF protections. This is a hardening recommendation, not a demonstrated CSRF exploit. Validate missing latitude/longitude before converting strings to numbers in nearby lookup.

### S8. Make engagement and identity fields server-authoritative

Evidence: Creator payload/persistence accepts views, mapViews, likes, and creator/channel metadata. Public ranking uses view counts.

Change: Separate editable content fields from engagement counters and verified identity. Maintain counters through controlled server events/provider sync and require verified channel ownership before presenting it as verified. Test that arbitrary creator payloads cannot inflate ranking.

### S9. Add browser security headers without breaking embeds

Evidence: The deployed root response inspected during the review had HSTS, but no CSP, nosniff, Referrer-Policy, Permissions-Policy, or X-Frame-Options. Other routes were not exhaustively checked.

Change: Introduce CSP in report-only mode, then enforce a tested policy compatible with Clerk, Mapbox workers, and YouTube. Define frame-ancestors, nosniff, referrer and permission policies. Embedding YouTube is separate from allowing other sites to frame TravelMap. Verify all relevant response types.

### S10. Protect saves from cross-device conflicts

Evidence: `lib/creator-video-state-outbox.ts`, `lib/creator-videos-cloud-client.ts`, and database save logic provide local retry/revision handling but no server compare-and-swap revision. Local keys are video-scoped, not account-scoped.

Change: Add optimistic server revisions and conflict recovery. Scope local queues by account; handle sign-out/account-switch explicitly. Do not endlessly retry validation or authorization failures. Preserve recoverable unsaved edits and make save failure/conflict visible.

Acceptance: An old offline tab cannot silently overwrite a newer save. A different signed-in account cannot replay the previous account's pending work.

## Product, Performance, And Operations

### P2. Return small, paginated catalog responses

Evidence: `lib/creator-videos-db.ts:318` loads the public catalog with editor state/keyframes; public listing is dynamic. Watch recommendations also request catalog data. Mobile filtering occurs after a capped fetch.

Change: Separate card-summary DTOs from full routes; select only needed fields, paginate, filter in the database, and cache public summaries with publish invalidation. Keep private state out of shared caches. Test results beyond the first page and representative large catalogs.

### P3. Surface failures honestly

Evidence: Published-list database errors can become an empty array, indistinguishable from an empty library.

Change: Distinguish empty, not found, unauthorized, unavailable, and offline states. Add retry/error boundaries around loading and map/provider failure. Never display submission/save success before confirmed persistence.

### P4. Complete trust and discovery basics

Evidence: Contact uses a `.example` address and legal/help copy contains placeholders. The inspected homepage showed a 0:00 duration for Make It Count and zero engagement counts. Category controls are tucked into settings; no-match filtering can show the full set again.

Change: Provide reachable support and abuse/copyright reporting, accurate privacy/terms and retention/deletion information, corrected metadata, visible destination/title discovery, and truthful empty results. Hide metrics that are not yet implemented rather than presenting them as meaningful. Get appropriate legal review for the actual operating jurisdictions and data flows.

### P5. Verify accessibility and mobile workflows

Change: Audit labels, keyboard/focus behavior, dialogs, touch targets, screen-reader status announcements, contrast, and reduced motion. Exercise video/map controls, creator editing, save errors, and authentication on actual mobile sizes. Do not rely on desktop screenshots as accessibility verification.

### P6. Add public-video metadata and indexing controls

Evidence: `app/watch/[id]/page.tsx` delegates to a client page without per-video metadata generation.

Change: Add safe server-rendered public metadata, canonical URLs, share images, appropriate video structured data, sitemap/robots rules, and reliable timestamp links. Drafts/private pages must not become indexable; metadata must not leak them.

### O1. Establish working automated release gates

Evidence: `package.json:10` still uses `next lint`, which Next 16 removed. No tracked CI workflow was found in the review.

Change: Configure the ESLint CLI and CI checks for type checking, lint, production build, map tests, authorization/ownership tests, publish isolation, autosave conflicts, and dependency/secret scanning. Pin package-manager and Node versions. [Next.js ESLint guidance](https://nextjs.org/docs/app/api-reference/config/eslint).

### O2. Verify database recovery and deployment safety

Change: Document a production migration step, least-privilege database access, pooling, automated backups, restore testing, and rollback procedure. Keep production and preview data/secrets isolated. Existing migrations are a useful foundation; their presence does not prove production restore capability.

### O3. Add actionable monitoring and budget alerts

Change: Capture redacted server errors, client exceptions, tile failures, route delays, failed saves, provider usage, and database availability. Record map timing outside animation frames. Alert on user-visible failures and spending thresholds; avoid logging secrets or unnecessarily precise private location data.

### O4. Verify production configuration and secrets

Change: Check production Clerk instance settings, admin MFA, token scopes/domain restrictions, environment validation, secret rotation and full-history secret scanning. Public Mapbox tokens are expected in a browser; restrict scopes/allowed origins rather than treating every public token as a leaked secret. Verify provider storage/caching terms before expanding persistent tile/geocoding caches.

Only `.env.example` was tracked among the inspected environment files, and a limited tracked-file secret-pattern check found no matches. That is positive but not a full secret-history audit.

## Suggested Approval Order

1. S1-S5 and P1: privacy, authorization, dependency and provider risks, and the nonfunctional onboarding flow.
2. M1-M5: route readiness, transition preparation, fallback geography, and measured watch/edit verification.
3. S6-S10 and O1-O4: abuse resistance, save integrity, release and recovery safeguards.
4. P2-P6: catalog scale, error handling, trust, discovery, accessibility, and sharing.

For a small invite-only beta, discovery and SEO can follow later. Draft privacy, identity authorization, honest persistence, essential monitoring, and recoverable data should not.
