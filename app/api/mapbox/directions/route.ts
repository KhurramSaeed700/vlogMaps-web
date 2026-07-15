import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { getServerMapboxAccessToken } from "@/lib/mapbox-server"
import {
  readDirectionsPayloadFromDb,
  writeDirectionsPayloadToDb,
  type CachedDirectionsPayload,
} from "@/lib/mapbox-route-cache-db"
import { checkRateLimit } from "@/lib/rate-limit"

type DirectionsPayload = CachedDirectionsPayload

const directionsCache = new Map<string, { expiresAt: number; payload: DirectionsPayload }>()
const directionsCacheTtlMs = 1000 * 60 * 60 * 24
const maxDirectionsCacheEntries = 1000
const directionsFetchTimeoutMs = 8000
const directionsDbCacheTimeoutMs = 1500
const directionsRouteAlgorithmVersion = "road-v4-shortest-per-leg"
const allowedProfiles = new Set(["driving", "driving-traffic", "walking", "cycling"])
const allowedRoutePreferences = new Set(["fastest", "shortest"])
const maxWaypointCount = 23
const maxCoordinateParamLength = 64
const maxWaypointsParamLength = 2048

interface DirectionsFetchInit extends RequestInit {
  next?: {
    revalidate?: number
  }
}

function createDirectionsCacheKey({
  start,
  end,
  waypoints,
  profile,
  routePreference,
}: {
  start: string
  end: string
  waypoints: string[]
  profile: string
  routePreference: string
}) {
  return createHash("sha256")
    .update([directionsRouteAlgorithmVersion, profile, routePreference, start, ...waypoints, end].join("|"))
    .digest("hex")
}

async function resolveWithin<T>(promise: Promise<T>, fallback: T, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

function readDirectionsCache(key: string) {
  const cached = directionsCache.get(key)
  if (!cached) {
    return null
  }

  if (cached.expiresAt < Date.now()) {
    directionsCache.delete(key)
    return null
  }

  return cached.payload
}

function writeDirectionsCache(key: string, payload: DirectionsPayload) {
  if (directionsCache.size >= maxDirectionsCacheEntries) {
    const oldestKey = directionsCache.keys().next().value
    if (oldestKey) {
      directionsCache.delete(oldestKey)
    }
  }

  directionsCache.set(key, {
    expiresAt: Date.now() + directionsCacheTtlMs,
    payload,
  })
}

function parseCoordinateParam(value: string | null) {
  if (!value) {
    return null
  }

  if (value.length > maxCoordinateParamLength) {
    return null
  }

  const parts = value.split(",")
  if (parts.length !== 2) {
    return null
  }

  const lng = Number(parts[0])
  const lat = Number(parts[1])
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    return null
  }

  return `${lng.toFixed(6)},${lat.toFixed(6)}`
}

function parseWaypointParams(value: string | null) {
  if (!value) {
    return [] as string[]
  }

  if (value.length > maxWaypointsParamLength) {
    return null
  }

  const waypoints = value
    .split("|")
    .map((waypoint) => parseCoordinateParam(waypoint.trim()))

  if (waypoints.some((waypoint) => !waypoint) || waypoints.length > maxWaypointCount) {
    return null
  }

  return waypoints as string[]
}

function createDirectionsResponse(payload: DirectionsPayload) {
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
    },
  })
}

function rankDirectionsRoutes(routes: NonNullable<DirectionsPayload["routes"]>, routePreference: string) {
  return routes
    .map((route, index) => ({ route, index }))
    .sort((left, right) => {
      if (routePreference === "shortest") {
        const leftDistance = left.route.distance ?? Number.POSITIVE_INFINITY
        const rightDistance = right.route.distance ?? Number.POSITIVE_INFINITY
        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance
        }

        const durationDifference =
          (left.route.duration ?? Number.POSITIVE_INFINITY) -
          (right.route.duration ?? Number.POSITIVE_INFINITY)
        return durationDifference || left.index - right.index
      }

      const durationDifference =
        (left.route.duration ?? Number.POSITIVE_INFINITY) -
        (right.route.duration ?? Number.POSITIVE_INFINITY)
      if (durationDifference !== 0) {
        return durationDifference
      }

      return (left.route.distance ?? Number.POSITIVE_INFINITY) - (right.route.distance ?? Number.POSITIVE_INFINITY)
    })
    .map(({ route }) => route)
}

export async function GET(request: NextRequest) {
  const rateLimitResponse = checkRateLimit(request, {
    keyPrefix: "mapbox-directions",
    limit: 60,
    windowMs: 60_000,
  })
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  const start = request.nextUrl.searchParams.get("start")
  const end = request.nextUrl.searchParams.get("end")
  const waypoints = request.nextUrl.searchParams.get("waypoints")
  const profile = request.nextUrl.searchParams.get("profile") || "driving"
  const routePreference = request.nextUrl.searchParams.get("routePreference") || "shortest"
  const startCoordinate = parseCoordinateParam(start)
  const endCoordinate = parseCoordinateParam(end)
  const waypointCoordinates = parseWaypointParams(waypoints)

  if (!allowedProfiles.has(profile)) {
    return NextResponse.json({ error: "Unsupported directions profile." }, { status: 400 })
  }

  if (!allowedRoutePreferences.has(routePreference)) {
    return NextResponse.json({ error: "Unsupported route preference." }, { status: 400 })
  }

  if (!startCoordinate || !endCoordinate || waypointCoordinates === null) {
    return NextResponse.json({ error: "Invalid start, end, or waypoint coordinates." }, { status: 400 })
  }

  const cacheKey = createDirectionsCacheKey({
    start: startCoordinate,
    end: endCoordinate,
    waypoints: waypointCoordinates,
    profile,
    routePreference,
  })
  const cachedPayload = readDirectionsCache(cacheKey)
  if (cachedPayload) {
    return createDirectionsResponse(cachedPayload)
  }

  const dbCachedPayload = await resolveWithin(
    readDirectionsPayloadFromDb(cacheKey),
    null,
    directionsDbCacheTimeoutMs,
  )
  if (dbCachedPayload) {
    writeDirectionsCache(cacheKey, dbCachedPayload)
    return createDirectionsResponse(dbCachedPayload)
  }

  const coordinates = [startCoordinate, ...waypointCoordinates, endCoordinate].join(";")
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}`)
  try {
    url.searchParams.set("access_token", getServerMapboxAccessToken())
  } catch {
    return NextResponse.json({ error: "Mapbox directions are not configured." }, { status: 500 })
  }

  url.searchParams.set("geometries", "geojson")
  url.searchParams.set("overview", "full")
  url.searchParams.set("steps", "false")
  url.searchParams.set("alternatives", "true")

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), directionsFetchTimeoutMs)
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
      next: {
        revalidate: 3600,
      },
      signal: controller.signal,
    } as DirectionsFetchInit).finally(() => clearTimeout(timeout))

    const payload = (await response.json().catch(() => null)) as DirectionsPayload | null

    if (!response.ok) {
      if (payload?.code === "NoRoute") {
        const noRoutePayload: DirectionsPayload = { ...payload, routes: [] }
        writeDirectionsCache(cacheKey, noRoutePayload)
        await resolveWithin(
          writeDirectionsPayloadToDb(
            cacheKey,
            {
              start: startCoordinate,
              end: endCoordinate,
              waypoints: waypointCoordinates,
              profile,
              routePreference,
            },
            noRoutePayload,
          ),
          undefined,
          directionsDbCacheTimeoutMs,
        )
        return createDirectionsResponse(noRoutePayload)
      }

      return NextResponse.json({ error: "Mapbox directions request failed." }, { status: response.status })
    }

    if (!payload) {
      return NextResponse.json({ error: "Mapbox directions returned an invalid response." }, { status: 502 })
    }

    if (Array.isArray(payload.routes)) {
      payload.routes = rankDirectionsRoutes(payload.routes, routePreference)
    }

    writeDirectionsCache(cacheKey, payload)
    await resolveWithin(
      writeDirectionsPayloadToDb(
        cacheKey,
        {
          start: startCoordinate,
          end: endCoordinate,
          waypoints: waypointCoordinates,
          profile,
          routePreference,
        },
        payload,
      ),
      undefined,
      directionsDbCacheTimeoutMs,
    )
    return createDirectionsResponse(payload)
  } catch {
    return NextResponse.json({ error: "Unable to fetch map directions." }, { status: 500 })
  }
}
