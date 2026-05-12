# TravelMap

TravelMap is a travel-video web app where viewers watch YouTube trips alongside a synchronized interactive map. Creators can add timestamped route points, stops, trip routes, and route shapes so a journey can be replayed geographically while the video plays.

## Features

- YouTube video playback with synchronized map movement.
- Public watch pages for published travel videos.
- Creator dashboard for managing videos, previews, and publishing status.
- Creator editor for capturing timestamp points and stops from the video timeline.
- Mapbox-powered location picking, route previews, and viewer maps.
- Clerk authentication and creator access checks.
- Neon Postgres persistence through Prisma for videos, keyframes, users, and editor state.
- Browser localStorage fallback for creator drafts when cloud persistence is unavailable.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Clerk
- Mapbox
- YouTube Data API
- Neon Postgres
- Prisma Client with the Neon adapter

## Getting Started

Install dependencies:

```bash
pnpm install
```

Create `.env.local` from `.env.example` and fill in the required values:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=
MAPBOX_ACCESS_TOKEN=

YOUTUBE_DATA_API_KEY=

DATABASE_URL=
```

Generate Prisma Client after installing dependencies or changing the Prisma schema:

```bash
pnpm db:generate
```

Start the development server:

```bash
pnpm dev
```

The app runs at `http://localhost:3000`.

## Database

The production data model is defined in `prisma/schema.prisma`.

Important tables:

- `users`: app users and Clerk identity mapping.
- `creator_profiles`: creator channel metadata and verification state.
- `videos`: app-facing video records, YouTube IDs, status, metrics, tags, and metadata.
- `video_keyframes`: timestamped map points and stops for each video.
- `video_editor_states`: editor-only route state such as points JSON, trip route, and route shapes.
- `video_views`: video and map view tracking.
- `user_favorites`: saved videos.
- `creator_applications`: creator application submissions.

Creator video records are stored in `videos`, timestamp points are stored in `video_keyframes`, and editor state is stored in `video_editor_states`. The actual video files are not stored by TravelMap; YouTube hosts and serves the video content.

## Prisma

Useful commands:

```bash
pnpm db:generate
pnpm db:pull
```

Use `db:generate` after schema changes. Use `db:pull` only when intentionally introspecting the current Neon database schema into Prisma.

## Creator Workflow

1. A creator adds or opens a YouTube video in the creator workspace.
2. The editor loads the video and map tools.
3. The creator captures timestamped map points and stops while watching.
4. Draft state is saved locally first and synced to Neon when cloud persistence is configured.
5. Published videos appear in the public catalog and can be viewed on `/watch/[id]`.

## Project Structure

- `app/`: Next.js App Router pages and API routes.
- `components/home`: public catalog and home page UI.
- `components/viewer`: split video/map watch experience.
- `components/creator`: creator dashboard, workspace, access guard, and route editor.
- `components/maps`: Mapbox surfaces, previews, and location tools.
- `components/media`: shared YouTube player components.
- `components/app-shell`: shared layout and brand chrome.
- `components/auth`: Clerk wrappers and auth loading states.
- `components/ui`: reusable UI primitives.
- `lib/`: data access, YouTube helpers, creator state helpers, map utilities, and Prisma setup.
- `prisma/`: Prisma schema and migrations.
- `scripts/`: database setup and seed SQL helpers.

## Verification

Run the TypeScript check:

```bash
pnpm exec tsc --noEmit
```

Build for production:

```bash
pnpm build
```
