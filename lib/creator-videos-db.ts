import "server-only"

import type { NeonQueryFunction } from "@neondatabase/serverless"
import type { CreatorVideoState } from "@/lib/creator-video-state"
import { ensureCreatorVideoStateSchema, saveCreatorVideoStateToDb } from "@/lib/creator-video-state-db"
import { getSqlClient, isDatabaseConfigured } from "@/lib/database"
import { travelVideos, type TravelVideo, type VideoKeyframe } from "@/lib/demo-data"

type CreatorVideoStatus = TravelVideo["status"]

interface CreatorVideoRow {
  id: string
  owner_user_id: string
  title: string
  creator: string
  creator_channel_url: string
  youtube_id: string
  thumbnail: string | null
  duration_seconds: number | string | null
  views: number | string | null
  map_views: number | string | null
  likes: number | string | null
  status: string | null
  created_at: Date | string | null
  description: string | null
  locations: unknown
  keyframes: unknown
  tags: unknown
  state_points?: unknown
  updated_at?: Date | string | null
}

let didEnsureSchema = false
let didSeedCatalogVideos = false

const catalogOwnerUserId = "catalog"

function toNumber(value: unknown, fallback = 0) {
  const numberValue = typeof value === "string" ? Number(value) : value
  return typeof numberValue === "number" && Number.isFinite(numberValue) ? numberValue : fallback
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return new Date().toISOString()
  }

  return new Date(value).toISOString()
}

function readJson<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }

  return (value ?? fallback) as T
}

function normalizeStatus(value: unknown): CreatorVideoStatus {
  return value === "published" ? "published" : "draft"
}

function keyframesFromStatePoints(value: unknown) {
  const points = readJson<Array<VideoKeyframe & { id?: string }>>(value, [])
  if (!Array.isArray(points)) {
    return []
  }

  return points.map(({ id: _id, ...point }) => point)
}

function rowToTravelVideo(row: CreatorVideoRow): TravelVideo {
  const stateKeyframes = keyframesFromStatePoints(row.state_points)
  const savedKeyframes = readJson<VideoKeyframe[]>(row.keyframes, [])
  const keyframes = stateKeyframes.length > 0 ? stateKeyframes : savedKeyframes

  return {
    id: row.id,
    title: row.title,
    creator: row.creator,
    creatorChannelUrl: row.creator_channel_url,
    youtubeId: row.youtube_id,
    thumbnail: row.thumbnail || "",
    durationSeconds: toNumber(row.duration_seconds),
    views: toNumber(row.views),
    mapViews: toNumber(row.map_views),
    likes: toNumber(row.likes),
    status: normalizeStatus(row.status),
    createdAt: toIsoString(row.created_at),
    description: row.description || "",
    locations: readJson<string[]>(row.locations, keyframes.map((point) => point.location)),
    keyframes,
    tags: readJson<string[]>(row.tags, []),
  }
}

async function ensureCreatorVideosSchema(sql: NeonQueryFunction<false, false>) {
  if (didEnsureSchema) {
    return
  }

  await sql`
    CREATE TABLE IF NOT EXISTS creator_videos (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      creator TEXT NOT NULL,
      creator_channel_url TEXT NOT NULL,
      youtube_id TEXT NOT NULL,
      thumbnail TEXT,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      map_views INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      description TEXT NOT NULL DEFAULT '',
      locations JSONB NOT NULL DEFAULT '[]'::jsonb,
      keyframes JSONB NOT NULL DEFAULT '[]'::jsonb,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS idx_creator_videos_owner_user_id ON creator_videos(owner_user_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_creator_videos_status ON creator_videos(status)`
  await sql`CREATE INDEX IF NOT EXISTS idx_creator_videos_created_at ON creator_videos(created_at DESC)`
  await ensureCreatorVideoStateSchema(sql)

  didEnsureSchema = true
}

async function ensureCatalogVideosSeeded(sql: NeonQueryFunction<false, false>) {
  if (didSeedCatalogVideos) {
    return
  }

  await ensureCreatorVideosSchema(sql)

  for (const video of travelVideos) {
    await sql`
      INSERT INTO creator_videos (
        id,
        owner_user_id,
        title,
        creator,
        creator_channel_url,
        youtube_id,
        thumbnail,
        duration_seconds,
        views,
        map_views,
        likes,
        status,
        description,
        locations,
        keyframes,
        tags,
        created_at
      )
      VALUES (
        ${video.id},
        ${catalogOwnerUserId},
        ${video.title},
        ${video.creator},
        ${video.creatorChannelUrl},
        ${video.youtubeId},
        ${video.thumbnail},
        ${Math.max(0, Math.round(video.durationSeconds))},
        ${Math.max(0, Math.round(video.views))},
        ${Math.max(0, Math.round(video.mapViews))},
        ${Math.max(0, Math.round(video.likes))},
        ${video.status},
        ${video.description},
        ${JSON.stringify(video.locations)}::jsonb,
        ${JSON.stringify(video.keyframes)}::jsonb,
        ${JSON.stringify(video.tags ?? [])}::jsonb,
        ${video.createdAt}::timestamptz
      )
      ON CONFLICT (id)
      DO UPDATE SET
        title = EXCLUDED.title,
        creator = EXCLUDED.creator,
        creator_channel_url = EXCLUDED.creator_channel_url,
        youtube_id = EXCLUDED.youtube_id,
        thumbnail = EXCLUDED.thumbnail,
        duration_seconds = EXCLUDED.duration_seconds,
        views = EXCLUDED.views,
        map_views = EXCLUDED.map_views,
        likes = EXCLUDED.likes,
        status = EXCLUDED.status,
        description = EXCLUDED.description,
        locations = EXCLUDED.locations,
        keyframes = EXCLUDED.keyframes,
        tags = EXCLUDED.tags,
        updated_at = NOW()
    `
  }

  didSeedCatalogVideos = true
}

export function isCreatorVideosDbConfigured() {
  return isDatabaseConfigured()
}

export async function saveCreatorVideoToDb({
  video,
  ownerUserId,
  state,
  publish = false,
}: {
  video: TravelVideo
  ownerUserId: string
  state?: CreatorVideoState | null
  publish?: boolean
}) {
  const sql = getSqlClient()
  if (!sql) {
    return null
  }

  await ensureCreatorVideosSchema(sql)

  const keyframes = state?.points?.length
    ? state.points.map(({ id: _id, ...point }) => point)
    : video.keyframes
  const status = publish ? "published" : video.status

  const rows = (await sql`
    INSERT INTO creator_videos (
      id,
      owner_user_id,
      title,
      creator,
      creator_channel_url,
      youtube_id,
      thumbnail,
      duration_seconds,
      views,
      map_views,
      likes,
      status,
      description,
      locations,
      keyframes,
      tags,
      created_at
    )
    VALUES (
      ${video.id},
      ${ownerUserId},
      ${video.title},
      ${video.creator},
      ${video.creatorChannelUrl},
      ${video.youtubeId},
      ${video.thumbnail},
      ${Math.max(0, Math.round(video.durationSeconds))},
      ${Math.max(0, Math.round(video.views))},
      ${Math.max(0, Math.round(video.mapViews))},
      ${Math.max(0, Math.round(video.likes))},
      ${status},
      ${video.description},
      ${JSON.stringify(keyframes.map((point) => point.location))}::jsonb,
      ${JSON.stringify(keyframes)}::jsonb,
      ${JSON.stringify(video.tags ?? [])}::jsonb,
      ${video.createdAt}::timestamptz
    )
    ON CONFLICT (id)
    DO UPDATE SET
      owner_user_id = EXCLUDED.owner_user_id,
      title = EXCLUDED.title,
      creator = EXCLUDED.creator,
      creator_channel_url = EXCLUDED.creator_channel_url,
      youtube_id = EXCLUDED.youtube_id,
      thumbnail = EXCLUDED.thumbnail,
      duration_seconds = EXCLUDED.duration_seconds,
      views = EXCLUDED.views,
      map_views = EXCLUDED.map_views,
      likes = EXCLUDED.likes,
      status = EXCLUDED.status,
      description = EXCLUDED.description,
      locations = EXCLUDED.locations,
      keyframes = EXCLUDED.keyframes,
      tags = EXCLUDED.tags,
      updated_at = NOW()
    RETURNING
      id,
      owner_user_id,
      title,
      creator,
      creator_channel_url,
      youtube_id,
      thumbnail,
      duration_seconds,
      views,
      map_views,
      likes,
      status,
      created_at,
      description,
      locations,
      keyframes,
      tags,
      updated_at
  `) as CreatorVideoRow[]

  if (state) {
    await saveCreatorVideoStateToDb(video.id, ownerUserId, state)
  }

  return rows[0] ? rowToTravelVideo({ ...rows[0], state_points: state?.points }) : null
}

export async function listCreatorVideosFromDb(ownerUserId: string) {
  const sql = getSqlClient()
  if (!sql) {
    return []
  }

  await ensureCreatorVideosSchema(sql)

  const rows = (await sql`
    SELECT
      v.id,
      v.owner_user_id,
      v.title,
      v.creator,
      v.creator_channel_url,
      v.youtube_id,
      v.thumbnail,
      v.duration_seconds,
      v.views,
      v.map_views,
      v.likes,
      v.status,
      v.created_at,
      v.description,
      v.locations,
      v.keyframes,
      v.tags,
      v.updated_at,
      s.points AS state_points
    FROM creator_videos v
    LEFT JOIN creator_video_states s
      ON s.video_id = v.id
      AND s.owner_user_id = v.owner_user_id
    WHERE v.owner_user_id = ${ownerUserId}
    ORDER BY v.created_at DESC
  `) as CreatorVideoRow[]

  return rows.map(rowToTravelVideo)
}

export async function listPublishedCreatorVideosFromDb() {
  const sql = getSqlClient()
  if (!sql) {
    return []
  }

  await ensureCatalogVideosSeeded(sql)

  const rows = (await sql`
    SELECT
      v.id,
      v.owner_user_id,
      v.title,
      v.creator,
      v.creator_channel_url,
      v.youtube_id,
      v.thumbnail,
      v.duration_seconds,
      v.views,
      v.map_views,
      v.likes,
      v.status,
      v.created_at,
      v.description,
      v.locations,
      v.keyframes,
      v.tags,
      v.updated_at,
      s.points AS state_points
    FROM creator_videos v
    LEFT JOIN creator_video_states s
      ON s.video_id = v.id
      AND s.owner_user_id = v.owner_user_id
    WHERE v.status = 'published'
    ORDER BY v.created_at DESC
  `) as CreatorVideoRow[]

  return rows.map(rowToTravelVideo)
}

export async function getCreatorVideoFromDb(videoId: string, requesterUserId?: string | null) {
  const sql = getSqlClient()
  if (!sql) {
    return null
  }

  await ensureCatalogVideosSeeded(sql)

  const rows = (await sql`
    SELECT
      v.id,
      v.owner_user_id,
      v.title,
      v.creator,
      v.creator_channel_url,
      v.youtube_id,
      v.thumbnail,
      v.duration_seconds,
      v.views,
      v.map_views,
      v.likes,
      v.status,
      v.created_at,
      v.description,
      v.locations,
      v.keyframes,
      v.tags,
      v.updated_at,
      s.points AS state_points
    FROM creator_videos v
    LEFT JOIN creator_video_states s
      ON s.video_id = v.id
      AND s.owner_user_id = v.owner_user_id
    WHERE v.id = ${videoId}
      AND (
        v.status = 'published'
        OR v.owner_user_id = ${requesterUserId ?? ""}
        OR v.owner_user_id = ${catalogOwnerUserId}
      )
    LIMIT 1
  `) as CreatorVideoRow[]

  return rows[0] ? rowToTravelVideo(rows[0]) : null
}

export async function deleteCreatorVideoFromDb(videoId: string, ownerUserId: string) {
  const sql = getSqlClient()
  if (!sql) {
    return false
  }

  await ensureCreatorVideosSchema(sql)

  await sql`
    DELETE FROM creator_video_states
    WHERE video_id = ${videoId}
      AND owner_user_id = ${ownerUserId}
  `

  const rows = (await sql`
    DELETE FROM creator_videos
    WHERE id = ${videoId}
      AND owner_user_id = ${ownerUserId}
    RETURNING id
  `) as Array<{ id: string }>

  return rows.length > 0
}
