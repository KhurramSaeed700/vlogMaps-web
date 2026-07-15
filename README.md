# VlogMaps

VlogMaps lets people watch YouTube travel videos with a map that follows the journey. Viewers can open a trip, watch the video, and see the route, stops, and timestamped locations move alongside it.

Creators can add their own YouTube videos, mark locations on the timeline, save drafts, and publish mapped travel videos for the public catalog.

## What You Can Do

- Watch featured travel videos with synchronized maps.
- Paste a YouTube link and open an instant watch page.
- Sign in and apply for creator access.
- As an approved creator, add videos, timestamp stops, draw routes, save drafts, and publish.
- Use Mapbox search and directions to make route editing easier.

## Getting Started

Install dependencies:

```bash
pnpm install
```

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Fill in the values you need:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=
MAPBOX_ACCESS_TOKEN=

YOUTUBE_DATA_API_KEY=
DATABASE_URL=
```

Generate Prisma Client:

```bash
pnpm db:generate
```

Start the app:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are used for sign-in and creator authorization.

`NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is used by browser map views. Without it, map panels show a setup message instead of crashing.

`MAPBOX_ACCESS_TOKEN` is used by server API routes for directions and location search. Use a restricted Mapbox token in production.

`YOUTUBE_DATA_API_KEY` is used for richer YouTube metadata. The app can fall back to YouTube oEmbed for basic metadata.

`DATABASE_URL` enables saved creator videos, editor state, published cloud videos, and approved creator checks.

This is a Next.js web app, so Expo or React Native variable names such as `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, and `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` are not used here.

## Using The App

### Watch A Video

1. Open the home page.
2. Pick a featured video, or paste a YouTube link into the search bar.
3. The watch page opens with the YouTube player and map side by side.
4. As the video plays, the map follows the saved timestamp points and route.

### Use Creator Tools

1. Sign in with Clerk.
2. Open the creator menu and apply for creator access.
3. Once your account is approved in the database, open the creator dashboard.
4. Add a YouTube video.
5. Use the editor to capture timestamped map points, stops, trip routes, and route shapes.
6. Save as a draft or publish it to the public catalog.

Creator API routes require an approved creator account on the server. Client-side UI guards are only for user experience; they are not the source of truth.

## Useful Commands

```bash
pnpm dev
pnpm build
pnpm db:generate
pnpm db:pull
pnpm exec tsc --noEmit
pnpm audit --audit-level moderate
```

`pnpm dev` runs the local app.

`pnpm build` checks the production build.

`pnpm db:generate` refreshes Prisma Client after dependency or schema changes.

`pnpm db:pull` introspects the configured database into Prisma. Use it only when you intentionally want to update the schema from the database.

## Troubleshooting

If `pnpm dev` says another Next dev server is already running, stop the listed PID:

```powershell
taskkill /PID <pid> /F
```

If maps do not render, check `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` in `.env.local`, then restart `pnpm dev`.

If creator saves fail, check `DATABASE_URL`, run `pnpm db:generate`, and make sure the signed-in user is approved as a creator in the database.

If YouTube metadata is incomplete, add `YOUTUBE_DATA_API_KEY`.
