# VlogMaps monitoring

Sentry project: https://snb-pd.sentry.io/projects/vlogmaps-web/

The Next.js SDK captures browser, server, and edge exceptions. Browser envelopes use the SDK-generated `/_reports` tunnel because direct browser ingestion was blocked during verification; the route stays outside Clerk's protected middleware matcher. This adds a small forwarding request to the application server. Deliberate breadcrumbs record player state, autoplay and fullscreen transitions, map/style/WebGL failures, navigation, connectivity, and editor saves. Shared map helpers cover watch and edit without adding instrumentation to animation frames. Repeated handled failures are limited to one event per operation/video per minute.

The bug icon in home/watch navigation, the editor settings menu, Contact, and the error fallback opens a problem report. Reports do not request a name, email, or screenshot. Error boundaries offer retry and home navigation. Creator API failures return `X-Request-Id`, also included in structured server logs and diagnostic breadcrumbs.

## Configuration

Sentry is disabled during development by default, including SDK initialization, feedback UI, replay, and build instrumentation. Production monitoring stays enabled when a DSN is configured. `NEXT_PUBLIC_SENTRY_ENABLED=false` pauses it in any environment; `true` explicitly enables local verification. The local ignored environment file currently sets it to `false`. Restart the dev server after changing this setting; production changes need a rebuild.

- `NEXT_PUBLIC_SENTRY_DSN`: use the project's public DSN from Sentry Settings → Projects → vlogmaps-web → Client Keys. Safe for the browser; not an authentication token.
- `SENTRY_ORG=snb-pd` and `SENTRY_PROJECT=vlogmaps-web`: source map upload destination.
- `SENTRY_AUTH_TOKEN`: optional private build token with the source-map upload permissions prescribed by Sentry. Keep in ignored local environment files or the deployment platform's encrypted build variables. Never prefix it `NEXT_PUBLIC_` or commit it.
- `NEXT_PUBLIC_SENTRY_REPLAY_ENABLED=false`: default. Opt-in error replays use a 10% error-session sample, masked text/inputs, and blocked media. Test consent, privacy, and performance before enabling.

Set these in the deployment environment before building. Public Next.js environment variables are embedded at build time. Source map uploads are disabled when the build token is absent; errors still arrive but production stack traces may be minified. Do not set a fake token to suppress this check.

The dedicated organization token **VlogMaps source maps** uses Sentry's `org:ci` build scope (source-map uploads, release creation, and code mappings). It is stored in ignored `.env.local` and as a Vercel Secret for Production and Preview. Client source-map files are deleted from the build output after upload; do not disable that cleanup when publishing builds.

Routine session replay is off. Performance tracing samples 5% of transactions. Arbitrary DOM, console, network, and history breadcrumbs are disabled; explicit diagnostics are retained. Event filtering removes user/request body/header/cookie data, authentication fields, route payloads, URL queries/fragments, emails, and recognizable coordinate pairs. Avoid putting personal data into new diagnostic messages. These filters reduce exposure; review actual events when expanding instrumentation.

## Verification

1. Run `node scripts/test-monitoring.cjs` and the existing player/map regression scripts. Run `tsc --noEmit` and `git diff --check`.
2. For deliberate verification only, set `NEXT_PUBLIC_SENTRY_ENABLED=true` in `.env.local`, restart development, and open `/monitoring-test`. Click **Send test error** and **Send server test error**. The server test deliberately returns 503 with a request reference. The page is unavailable in production.
3. Find **VlogMaps monitoring verification** in Sentry Issues; confirm its event reference, `operation` tag, and deliberate breadcrumb. Check that sensitive payloads are absent.
4. Open **Report a problem**, verify keyboard interaction and submit a clearly labeled test description if testing delivery.
5. Test watch/edit map tracking, fullscreen exit, and countdown playback with the browser console open.

Use Sentry's issue alerts for new/high-priority errors; configure notification recipients and thresholds in Sentry according to team preferences. This setup does not add email/Slack integrations, change billing, or deploy the application.

### Local verification, 2026-10-17

Browser and server verification errors were confirmed in the `vlogmaps-web` Sentry project. Anonymous feedback reached Sentry's Spam folder, so check that folder when testing feedback. The browser tunnel returned HTTP 200 for both error and feedback envelopes.

An optimized local build successfully uploaded Node.js, edge, and browser source maps. The artifact bundles were confirmed in Sentry's Source Map Uploads page. A scan of `.next/static` confirmed that no source-map files or private build-token value remained in the browser output.

TypeScript and `git diff --check` passed. The monitoring, map loading/preloading, YouTube autoplay, fullscreen, and video visibility regression run passed all 19 tests. Live watch playback, flight tracking, and a stop were exercised after the shared preloading guard; no browser errors were recorded in that watch tab. Earlier fullscreen entry and exit were also verified.

Full editor map verification remains incomplete: the selected editor route reported “Video not found,” and its tab later stopped responding. The public DSN is configured in Vercel's development, preview, and production environments, but no deployment has been triggered.
