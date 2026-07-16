export type RouteCoordinate = [number, number]
export type RoutePreference = "fastest" | "shortest"
export type RoutedLegKind = "road" | "flight"

export interface RoutedLeg {
  fromTime: number
  toTime: number
  coordinates: RouteCoordinate[]
  isStationary?: boolean
  isFallback?: boolean
  routeKind: RoutedLegKind
}

interface RoutableKeyframe {
  time: number
  lat: number
  lng: number
  pointType?: "point" | "stop" | "flight"
  via?: RouteCoordinate[]
}

export function isFlightRouteLeg(
  startPointType?: RoutableKeyframe["pointType"],
  endPointType?: RoutableKeyframe["pointType"],
) {
  return startPointType === "flight" && endPointType === "flight"
}

interface DirectionsRoute {
  geometry?: {
    coordinates?: RouteCoordinate[]
    type?: string
  }
}

interface DirectionsResponse {
  routes?: DirectionsRoute[]
  code?: string
  message?: string
}

interface FetchRoutedLegsOptions {
  routePreference?: RoutePreference
  onLegResolved?: (index: number, leg: RoutedLeg) => void
}

interface DirectionsGeometry {
  coordinates: RouteCoordinate[]
}

type DirectionsResolution =
  | { status: "routed"; geometry: DirectionsGeometry }
  | { status: "no-route" }

const routedLegCache = new Map<string, Promise<DirectionsResolution>>()
const routeAlgorithmVersion = "road-v4-shortest-per-leg"
const defaultRoutePreference: RoutePreference = "shortest"
const maxConcurrentDirectionsRequests = 4
const maxDirectionsWaypoints = 23
const maxRateLimitedDirectionsRetries = 2
const maxTransientDirectionsRetries = 2
const transientDirectionsRetryDelayMs = 750
const defaultRateLimitRetryDelayMs = 15000
const maxRateLimitRetryDelayMs = 65000
let activeDirectionsRequests = 0
const pendingDirectionsRequests: Array<() => void> = []

function formatRouteCoordinateValue(value: number) {
  return Number.isFinite(value) ? value.toFixed(6) : String(value)
}

function formatRouteCoordinate(coordinate: RouteCoordinate) {
  return `${formatRouteCoordinateValue(coordinate[0])},${formatRouteCoordinateValue(coordinate[1])}`
}

function createLegCacheKey(
  start: RouteCoordinate,
  end: RouteCoordinate,
  via: RouteCoordinate[] = [],
  routePreference: RoutePreference = defaultRoutePreference,
) {
  return `${routePreference}:${formatRouteCoordinate(start)}:${via.map(formatRouteCoordinate).join("|")}:${formatRouteCoordinate(end)}`
}

function reverseDirectionsResolution(resolution: DirectionsResolution) {
  if (resolution.status === "no-route") {
    return resolution
  }

  return {
    status: "routed",
    geometry: {
      coordinates: [...resolution.geometry.coordinates].reverse() as RouteCoordinate[],
    },
  } satisfies DirectionsResolution
}

function readStoredLegCoordinates(_key: string): RouteCoordinate[] | null {
  return null
}

function writeStoredLegCoordinates(_key: string, _coordinates: RouteCoordinate[]) {}

function scheduleDirectionsRequest<T>(task: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeDirectionsRequests += 1
      task()
        .then(resolve, reject)
        .finally(() => {
          activeDirectionsRequests -= 1
          pendingDirectionsRequests.shift()?.()
        })
    }

    if (activeDirectionsRequests < maxConcurrentDirectionsRequests) {
      run()
      return
    }

    pendingDirectionsRequests.push(run)
  })
}

function waitForDirectionsRetry(delayMs: number) {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs))
}

function getRateLimitRetryDelay(response: Response) {
  const retryAfterSeconds = Number(response.headers.get("Retry-After"))
  const retryAfterMs = Number.isFinite(retryAfterSeconds)
    ? retryAfterSeconds * 1000
    : defaultRateLimitRetryDelayMs

  return clampRetryDelay(retryAfterMs)
}

function clampRetryDelay(delayMs: number) {
  return Math.min(Math.max(delayMs, 1000), maxRateLimitRetryDelayMs)
}

function isValidCoordinatePair(value: unknown): value is RouteCoordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  )
}

function sampleRouteWaypoints(waypoints: RouteCoordinate[], maxWaypoints = maxDirectionsWaypoints) {
  if (waypoints.length <= maxWaypoints) {
    return waypoints
  }

  if (maxWaypoints <= 1) {
    return [waypoints[Math.floor(waypoints.length / 2)]]
  }

  return Array.from({ length: maxWaypoints }, (_, index) => {
    const waypointIndex = Math.round((index * (waypoints.length - 1)) / (maxWaypoints - 1))
    return waypoints[waypointIndex]
  })
}

async function fetchDirectionsGeometry(
  start: RouteCoordinate,
  end: RouteCoordinate,
  via: RouteCoordinate[] = [],
  routePreference: RoutePreference = defaultRoutePreference,
): Promise<DirectionsResolution> {
  if (!isValidCoordinatePair(start) || !isValidCoordinatePair(end)) {
    throw new Error("Invalid directions coordinates.")
  }

  const validVia = sampleRouteWaypoints(via.filter(isValidCoordinatePair))
  const key = createLegCacheKey(start, end, validVia, routePreference)
  const reverseKey = createLegCacheKey(end, start, [...validVia].reverse(), routePreference)
  const existingRequest = routedLegCache.get(key)
  const reverseRequest = routedLegCache.get(reverseKey)

  if (existingRequest) {
    return existingRequest
  }

  if (reverseRequest) {
    return reverseRequest.then(reverseDirectionsResolution)
  }

  const storedLeg = readStoredLegCoordinates(key)
  if (storedLeg) {
    const cachedRequest = Promise.resolve({
      status: "routed",
      geometry: { coordinates: storedLeg },
    } satisfies DirectionsResolution)
    routedLegCache.set(key, cachedRequest)
    return cachedRequest
  }

  const storedReverseLeg = readStoredLegCoordinates(reverseKey)
  if (storedReverseLeg) {
    const cachedRequest = Promise.resolve({
      status: "routed",
      geometry: { coordinates: [...storedReverseLeg].reverse() as RouteCoordinate[] },
    } satisfies DirectionsResolution)
    routedLegCache.set(key, cachedRequest)
    return cachedRequest
  }

  const request = (async () => {
    const searchParams = new URLSearchParams({
      start: formatRouteCoordinate(start),
      end: formatRouteCoordinate(end),
      profile: "driving",
      routePreference,
      routeVersion: routeAlgorithmVersion,
    })
    if (validVia.length > 0) {
      searchParams.set("waypoints", validVia.map(formatRouteCoordinate).join("|"))
    }

    let rateLimitAttempts = 0
    let transientAttempts = 0

    while (true) {
      let response: Response
      try {
        response = await scheduleDirectionsRequest(() =>
          fetch(`/api/mapbox/directions?${searchParams.toString()}`, {
            cache: "force-cache",
          }),
        )
      } catch (error) {
        if (transientAttempts < maxTransientDirectionsRetries) {
          transientAttempts += 1
          await waitForDirectionsRetry(transientDirectionsRetryDelayMs * transientAttempts)
          continue
        }

        throw error
      }

      if (response.status === 429 && rateLimitAttempts < maxRateLimitedDirectionsRetries) {
        rateLimitAttempts += 1
        await waitForDirectionsRetry(getRateLimitRetryDelay(response))
        continue
      }

      if (!response.ok) {
        if (response.status >= 500 && transientAttempts < maxTransientDirectionsRetries) {
          transientAttempts += 1
          await waitForDirectionsRetry(transientDirectionsRetryDelayMs * transientAttempts)
          continue
        }

        throw new Error(`Directions request failed with status ${response.status}.`)
      }

      const payload = (await response.json()) as DirectionsResponse
      if (payload.code === "NoRoute" || (Array.isArray(payload.routes) && payload.routes.length === 0)) {
        return { status: "no-route" } satisfies DirectionsResolution
      }

      const route = payload.routes?.[0]
      const coordinates = route?.geometry?.coordinates?.filter(isValidCoordinatePair) ?? []

      if (coordinates.length < 2) {
        throw new Error(payload.message || "Directions response did not include usable road geometry.")
      }

      return {
        status: "routed",
        geometry: {
          coordinates,
        },
      } satisfies DirectionsResolution
    }
  })()

  routedLegCache.set(key, request)

  let resolution: DirectionsResolution
  try {
    resolution = await request
  } catch (error) {
    routedLegCache.delete(key)
    throw error
  }

  if (resolution.status === "routed") {
    writeStoredLegCoordinates(key, resolution.geometry.coordinates)
    writeStoredLegCoordinates(reverseKey, [...resolution.geometry.coordinates].reverse() as RouteCoordinate[])
  }

  return resolution
}

function createRoadLeg(
  keyframe: RoutableKeyframe,
  nextKeyframe: RoutableKeyframe,
  resolution: DirectionsResolution,
) {
  return {
    fromTime: keyframe.time,
    toTime: nextKeyframe.time,
    isFallback: resolution.status !== "routed",
    isStationary: keyframe.pointType === "stop",
    routeKind: "road" as const,
    coordinates: resolution.status === "routed" ? resolution.geometry.coordinates : [],
  } satisfies RoutedLeg
}

function createFlightLeg(keyframe: RoutableKeyframe, nextKeyframe: RoutableKeyframe) {
  return {
    fromTime: keyframe.time,
    toTime: nextKeyframe.time,
    isFallback: true,
    isStationary: false,
    routeKind: "flight" as const,
    coordinates: [
      [keyframe.lng, keyframe.lat],
      [nextKeyframe.lng, nextKeyframe.lat],
    ] as RouteCoordinate[],
  } satisfies RoutedLeg
}

export async function fetchRoutedLegsForKeyframes(
  keyframes: RoutableKeyframe[],
  options: FetchRoutedLegsOptions = {},
) {
  if (keyframes.length < 2) {
    return [] as RoutedLeg[]
  }

  const legs = keyframes.slice(0, -1).map((keyframe, index) =>
    isFlightRouteLeg(keyframe.pointType, keyframes[index + 1].pointType)
      ? createFlightLeg(keyframe, keyframes[index + 1])
      : createRoadLeg(keyframe, keyframes[index + 1], { status: "no-route" }),
  )
  const requests = keyframes.slice(0, -1).map(async (keyframe, index) => {
    const nextKeyframe = keyframes[index + 1]
    if (isFlightRouteLeg(keyframe.pointType, nextKeyframe.pointType)) {
      options.onLegResolved?.(index, legs[index])
      return
    }

    const resolution = await fetchDirectionsGeometry(
      [keyframe.lng, keyframe.lat],
      [nextKeyframe.lng, nextKeyframe.lat],
      keyframe.via,
      options.routePreference,
    )
    const leg = createRoadLeg(keyframe, nextKeyframe, resolution)
    legs[index] = leg
    options.onLegResolved?.(index, leg)
  })

  await Promise.allSettled(requests)
  return legs
}
