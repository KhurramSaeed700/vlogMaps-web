import { NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { mapboxAccessToken } from "@/lib/mapbox"
import {
  readDirectionsPayloadFromDb,
  writeDirectionsPayloadToDb,
  type CachedDirectionsPayload,
} from "@/lib/mapbox-route-cache-db"

type DirectionsPayload = CachedDirectionsPayload

const directionsCache = new Map<string, { expiresAt: number; payload: DirectionsPayload }>()
const directionsCacheTtlMs = 1000 * 60 * 60 * 24
const maxDirectionsCacheEntries = 1000
const directionsFetchTimeoutMs = 8000
const allowedProfiles = new Set(["driving", "driving-traffic", "walking", "cycling"])
const allowedRoutePreferences = new Set(["fastest", "shortest"])
const maxWaypointCount = 23

interface DirectionsFetchInit extends RequestInit {
  next?: {
    revalidate?: number
  }
}

function getDirectionsCacheKey(request: NextRequest) {
  return request.nextUrl.searchParams.toString()
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
    .update([profile, routePreference, start, ...waypoints, end].join("|"))
    .digest("hex")
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

export async function GET(request: NextRequest) {
  const start = request.nextUrl.searchParams.get("start")
  const end = request.nextUrl.searchParams.get("end")
  const waypoints = request.nextUrl.searchParams.get("waypoints")
  const profile = request.nextUrl.searchParams.get("profile") || "driving"
  const routePreference = request.nextUrl.searchParams.get("routePreference") || "fastest"
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
  const legacyCacheKey = getDirectionsCacheKey(request)
  const cachedPayload = readDirectionsCache(cacheKey) ?? readDirectionsCache(legacyCacheKey)
  if (cachedPayload) {
    return createDirectionsResponse(cachedPayload)
  }

  const dbCachedPayload = await readDirectionsPayloadFromDb(cacheKey)
  if (dbCachedPayload) {
    writeDirectionsCache(cacheKey, dbCachedPayload)
    return createDirectionsResponse(dbCachedPayload)
  }

  const coordinates = [startCoordinate, ...waypointCoordinates, endCoordinate].join(";")
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}`)
  url.searchParams.set("access_token", process.env.MAPBOX_ACCESS_TOKEN || mapboxAccessToken)
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

    if (!response.ok) {
      return NextResponse.json({ error: "Mapbox directions request failed." }, { status: response.status })
    }

    const payload = (await response.json()) as DirectionsPayload
    if (Array.isArray(payload.routes)) {
      payload.routes.sort((left, right) => {
        if (routePreference === "shortest") {
          const distanceDifference = (left.distance ?? Number.POSITIVE_INFINITY) - (right.distance ?? Number.POSITIVE_INFINITY)
          if (distanceDifference !== 0) {
            return distanceDifference
          }

          return (left.duration ?? Number.POSITIVE_INFINITY) - (right.duration ?? Number.POSITIVE_INFINITY)
        }

        const durationDifference = (left.duration ?? Number.POSITIVE_INFINITY) - (right.duration ?? Number.POSITIVE_INFINITY)
        if (durationDifference !== 0) {
          return durationDifference
        }

        return (left.distance ?? Number.POSITIVE_INFINITY) - (right.distance ?? Number.POSITIVE_INFINITY)
      })
    }

    writeDirectionsCache(cacheKey, payload)
    await writeDirectionsPayloadToDb(
      cacheKey,
      {
        start: startCoordinate,
        end: endCoordinate,
        waypoints: waypointCoordinates,
        profile,
        routePreference,
      },
      payload,
    )
    return createDirectionsResponse(payload)
  } catch {
    return NextResponse.json({ error: "Unable to fetch map directions." }, { status: 500 })
  }
}
