# TravelMap

*Automatically synced with your [v0.app](https://v0.app) deployments*

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/khurrams-projects/v0-equinemates)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.app-black?style=for-the-badge)](https://v0.app/chat/projects/odkDz9sF7ji)

## Overview

TravelMap is a travel-video experience where viewers watch trips alongside synchronized map keyframes, and creators apply to add interactive journey data to their own videos.

This repository will stay in sync with your deployed chats on [v0.app](https://v0.app).
Any changes you make to your deployed app will be automatically pushed to this repository from [v0.app](https://v0.app).

## Deployment

Your project is live at:

**[https://vercel.com/khurrams-projects/v0-equinemates](https://vercel.com/khurrams-projects/v0-equinemates)**

## Build your app

Continue building your app on:

**[https://v0.app/chat/projects/odkDz9sF7ji](https://v0.app/chat/projects/odkDz9sF7ji)**

## How It Works

1. Create and modify your project using [v0.app](https://v0.app)
2. Deploy your chats from the v0 interface
3. Changes are automatically pushed to this repository
4. Vercel deploys the latest version from this repository

## Creator Edit Persistence

Creator video map edits are saved locally first and, when configured, mirrored to Neon Postgres through `DATABASE_URL`.

Add this to `.env.local` with your Neon pooled connection string:

```bash
DATABASE_URL="postgresql://..."
```

The app creates the `creator_video_states` table automatically on first load/save. Without `DATABASE_URL`, the editor keeps using browser localStorage as a fallback.

## Project Structure

The App Router route files stay in `app/`, while reusable UI is grouped by feature under `components/`:

- `components/home`: entry page and video catalog experience.
- `components/viewer`: watch page and split video/map viewer.
- `components/creator`: creator workspace, access guard, and route editor.
- `components/maps`: Mapbox map surfaces and previews.
- `components/media`: shared media player primitives.
- `components/app-shell`: shared layout and brand chrome.
- `components/auth`: Clerk/auth loading and wrappers.
- `components/ui`: reusable design-system primitives only.
