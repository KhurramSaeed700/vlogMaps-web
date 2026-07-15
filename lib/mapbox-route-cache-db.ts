import "server-only"

import { getSqlClient, isDatabaseConfigured } from "@/lib/database"

export interface CachedDirectionsPayload {
  code?: string
  message?: string
  routes?: Array<{
    distance?: number
    duration?: number
    geometry?: {
      coordinates?: unknown
      type?: string
    }
    legs?: Array<{
      steps?: Array<{
        geometry?: {
          coordinates?: unknown
          type?: string
        }
      }>
    }>
  }>
}

interface RouteCacheRequestParams {
  start: string
  end: string
  waypoints: string[]
  profile: string
  routePreference: string
}

const routeCacheTtlDays = 30

export async function readDirectionsPayloadFromDb(cacheKey: string) {
  if (!isDatabaseConfigured()) {
    return null
  }

  const sql = getSqlClient()
  if (!sql) {
    return null
  }

  try {
    const rows = await sql`
      select payload
      from map_route_cache
      where cache_key = ${cacheKey}
        and expires_at > now()
      limit 1
    `
    const payload = rows[0]?.payload
    return payload && typeof payload === "object" ? (payload as CachedDirectionsPayload) : null
  } catch {
    return null
  }
}

export async function writeDirectionsPayloadToDb(
  cacheKey: string,
  requestParams: RouteCacheRequestParams,
  payload: CachedDirectionsPayload,
) {
  if (!isDatabaseConfigured()) {
    return
  }

  const sql = getSqlClient()
  if (!sql) {
    return
  }

  try {
    await sql`
      insert into map_route_cache (
        cache_key,
        profile,
        route_preference,
        request_params,
        payload,
        expires_at,
        updated_at
      )
      values (
        ${cacheKey},
        ${requestParams.profile},
        ${requestParams.routePreference},
        ${JSON.stringify(requestParams)}::jsonb,
        ${JSON.stringify(payload)}::jsonb,
        now() + (${routeCacheTtlDays} * interval '1 day'),
        now()
      )
      on conflict (cache_key) do update set
        profile = excluded.profile,
        route_preference = excluded.route_preference,
        request_params = excluded.request_params,
        payload = excluded.payload,
        expires_at = excluded.expires_at,
        updated_at = now()
    `
  } catch {
    // The route cache is an optimization. Missing migrations or transient DB errors
    // should never prevent the watch page from fetching directions.
  }
}
