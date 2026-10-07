# Uploaded video visibility

Use the visibility control on an uploaded video in the creator dashboard to choose Private, Unlisted or Public. The selected setting is shown in its visibility column. Changes are saved to the database; failures leave the previous selection unchanged.

- Public: visible in web/mobile feeds, search, creator listings and recommendations, and accessible by link.
- Unlisted: hidden from those discovery surfaces, but anyone with the link can watch and read the route.
- Private: only the owning creator can view the TravelMap video and route through the authenticated web API. Other viewers receive 404. Anonymous mobile APIs cannot read it.

Visibility is independent of publication status. A private uploaded video remains uploaded and editable. Unpublish still turns it into an owner-only draft. Existing uploads retain Public visibility. Editor saves preserve the database visibility so an older editor tab cannot accidentally make a private video public again.

This controls TravelMap only; it cannot change the privacy of the original YouTube video or revoke copies of data already viewed or downloaded.

## Database setup

Apply `prisma/migrations/20261006120000_add_video_visibility/migration.sql` before running the new code, and regenerate the Prisma client (`pnpm exec prisma generate`). The migration adds a non-null visibility field, a check constraint and a discovery index. It does not remove videos or timestamps.

For databases with current Prisma migration history, deploy normally with `pnpm exec prisma migrate deploy` using the target database environment. If older migrations were applied manually, inspect/baseline their history separately; do not blindly rerun or mark unrelated migrations. The visibility migration can be applied in isolation with `pnpm exec prisma db execute --file prisma/migrations/20261006120000_add_video_visibility/migration.sql`, then recorded with `pnpm exec prisma migrate resolve --applied 20261006120000_add_video_visibility`. Standalone Prisma commands need the database environment loaded; they do not automatically load Next.js `.env.local`.

Restart the dev server after client generation if it is still using an older Prisma client. Web and mobile video responses are not shared-cacheable, so a visibility change takes effect on the next request.

## Verification

Run `node scripts/test-video-visibility.cjs`, `node scripts/test-access-control.cjs`, `pnpm exec tsc --noEmit` and `git diff --check`. Check the dashboard menu with mouse and keyboard; only uploaded, owned cards expose visibility controls. Use a disposable uploaded video to test saving, reloading, anonymous direct links, public feed exclusion and private route denial.

`node scripts/test-video-visibility-db.cjs` checks real database persistence and read permissions using a temporary video inside a transaction that always rolls back; existing videos are not modified.
