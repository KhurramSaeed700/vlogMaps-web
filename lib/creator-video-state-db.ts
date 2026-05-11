import "server-only"
import type { NeonQueryFunction } from "@neondatabase/serverless"
import type { CreatorVideoState } from "@/lib/creator-video-state"
import { getSqlClient, isDatabaseConfigured } from "@/lib/database"

interface CreatorVideoStateRow {
  points: unknown
  trip_route: unknown
  route_shapes: unknown
  updated_at: Date | string | null
}

let didEnsureSchema = false

export function isCreatorVideoStateDbConfigured() {
  return isDatabaseConfigured()
}

export async function ensureCreatorVideoStateSchema(sql: NeonQueryFunction<false, false>) {
  if (didEnsureSchema) {
    return
  }

  await sql`
    CREATE TABLE IF NOT EXISTS creator_video_states (
      video_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      points JSONB NOT NULL DEFAULT '[]'::jsonb,
      trip_route JSONB NOT NULL DEFAULT '{"start":null,"end":null}'::jsonb,
      route_shapes JSONB NOT NULL DEFAULT '{"trip":[],"timestampLegs":{}}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (video_id, owner_user_id)
    )
  `

  didEnsureSchema = true
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

export async function loadCreatorVideoStateFromDb(videoId: string, ownerUserId: string) {
  const sql = getSqlClient()
  if (!sql) {
    return null
  }

  await ensureCreatorVideoStateSchema(sql)

  const rows = (await sql`
    SELECT points, trip_route, route_shapes, updated_at
    FROM creator_video_states
    WHERE video_id = ${videoId}
      AND owner_user_id = ${ownerUserId}
    LIMIT 1
  `) as CreatorVideoStateRow[]
  const row = rows[0]
  if (!row) {
    return null
  }

  return {
    state: {
      points: readJson(row.points, []),
      tripRoute: readJson(row.trip_route, { start: null, end: null }),
      routeShapes: readJson(row.route_shapes, { trip: [], timestampLegs: {} }),
    },
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  }
}

export async function saveCreatorVideoStateToDb(videoId: string, ownerUserId: string, state: CreatorVideoState) {
  const sql = getSqlClient()
  if (!sql) {
    return null
  }

  await ensureCreatorVideoStateSchema(sql)

  const rows = (await sql`
    INSERT INTO creator_video_states (
      video_id,
      owner_user_id,
      points,
      trip_route,
      route_shapes
    )
    VALUES (
      ${videoId},
      ${ownerUserId},
      ${JSON.stringify(state.points)}::jsonb,
      ${JSON.stringify(state.tripRoute)}::jsonb,
      ${JSON.stringify(state.routeShapes)}::jsonb
    )
    ON CONFLICT (video_id, owner_user_id)
    DO UPDATE SET
      points = EXCLUDED.points,
      trip_route = EXCLUDED.trip_route,
      route_shapes = EXCLUDED.route_shapes,
      updated_at = NOW()
    RETURNING updated_at
  `) as Array<{ updated_at: Date | string }>

  return rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : null
}
