export type RouteCoordinate = [number, number]
export type RoutePreference = "fastest" | "shortest"

export interface RoutedLeg {
  fromTime: number
  toTime: number
  coordinates: RouteCoordinate[]
  isStationary?: boolean
  isFallback?: boolean
}

interface RoutableKeyframe {
  time: number
  lat: number
  lng: number
  pointType?: "point" | "stop"
  via?: RouteCoordinate[]
}

interface DirectionsResponse {
  routes?: Array<{
    geometry?: {
      coordinates?: RouteCoordinate[]
      type?: string
    }
  }>
}

const routedLegCache = new Map<string, Promise<RouteCoordinate[] | null>>()
const defaultRoutePreference: RoutePreference = "fastest"
const routedLegStoragePrefix = "vlogmaps:routed-leg:v2:"
const routedLegStorageTtlMs = 1000 * 60 * 60 * 24 * 30
const maxConcurrentDirectionsRequests = 4
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

function reverseRouteCoordinates(coordinates: RouteCoordinate[] | null) {
  return coordinates ? ([...coordinates].reverse() as RouteCoordinate[]) : null
}

function readStoredLegCoordinates(key: string) {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const raw = window.localStorage.getItem(`${routedLegStoragePrefix}${key}`)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as { expiresAt?: number; coordinates?: unknown }
    if (!parsed.expiresAt || parsed.expiresAt < Date.now()) {
      window.localStorage.removeItem(`${routedLegStoragePrefix}${key}`)
      return null
    }

    const coordinates = Array.isArray(parsed.coordinates)
      ? parsed.coordinates.filter(isValidCoordinatePair)
      : []

    return coordinates.length >= 2 ? coordinates : null
  } catch {
    return null
  }
}

function writeStoredLegCoordinates(key: string, coordinates: RouteCoordinate[]) {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(
      `${routedLegStoragePrefix}${key}`,
      JSON.stringify({
        expiresAt: Date.now() + routedLegStorageTtlMs,
        coordinates,
      }),
    )
  } catch {
    // Storage may be unavailable or full; in-memory caching still prevents duplicate in-flight requests.
  }
}

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

async function fetchDirectionsLeg(start: RouteCoordinate, end: RouteCoordinate, via: RouteCoordinate[] = [], routePreference: RoutePreference = defaultRoutePreference) {
  if (!isValidCoordinatePair(start) || !isValidCoordinatePair(end)) {
    return null
  }

  const validVia = via.filter(isValidCoordinatePair)
  const key = createLegCacheKey(start, end, validVia, routePreference)
  const reverseKey = createLegCacheKey(end, start, [...validVia].reverse(), routePreference)
  const existingRequest = routedLegCache.get(key)
  const reverseRequest = routedLegCache.get(reverseKey)

  if (existingRequest) {
    return existingRequest
  }

  if (reverseRequest) {
    return reverseRequest.then(reverseRouteCoordinates)
  }

  const storedLeg = readStoredLegCoordinates(key)
  if (storedLeg) {
    const cachedRequest = Promise.resolve(storedLeg)
    routedLegCache.set(key, cachedRequest)
    return cachedRequest
  }

  const storedReverseLeg = readStoredLegCoordinates(reverseKey)
  if (storedReverseLeg) {
    const cachedRequest = Promise.resolve(reverseRouteCoordinates(storedReverseLeg))
    routedLegCache.set(key, cachedRequest)
    return cachedRequest
  }

  const request = (async () => {
    const searchParams = new URLSearchParams({
      start: formatRouteCoordinate(start),
      end: formatRouteCoordinate(end),
      profile: "driving",
      routePreference,
    })
    if (validVia.length > 0) {
      searchParams.set("waypoints", validVia.map(formatRouteCoordinate).join("|"))
    }

    let response: Response
    try {
      response = await scheduleDirectionsRequest(() =>
        fetch(`/api/mapbox/directions?${searchParams.toString()}`, {
          cache: "force-cache",
        }),
      )
    } catch {
      return null
    }

    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as DirectionsResponse
    const legCoordinates = payload.routes?.[0]?.geometry?.coordinates?.filter(isValidCoordinatePair) ?? []

    if (legCoordinates.length < 2) {
      return null
    }

    return legCoordinates
  })()

  routedLegCache.set(key, request)

  const resolvedCoordinates = await request
  if (!resolvedCoordinates) {
    routedLegCache.delete(key)
  } else {
    writeStoredLegCoordinates(key, resolvedCoordinates)
    writeStoredLegCoordinates(reverseKey, [...resolvedCoordinates].reverse() as RouteCoordinate[])
  }

  return resolvedCoordinates
}

export async function fetchRoutedLegsForKeyframes(
  keyframes: RoutableKeyframe[],
  options: { routePreference?: RoutePreference } = {},
) {
  if (keyframes.length < 2) {
    return [] as RoutedLeg[]
  }

  let routedCoordinates: Array<RouteCoordinate[] | null>
  try {
    routedCoordinates = await Promise.all(
      keyframes.slice(0, -1).map((keyframe, index) =>
        fetchDirectionsLeg(
          [keyframe.lng, keyframe.lat],
          [keyframes[index + 1].lng, keyframes[index + 1].lat],
          keyframe.via,
          options.routePreference,
        ),
      ),
    )
  } catch {
    routedCoordinates = []
  }

  return keyframes.slice(0, -1).map((keyframe, index) => {
    const routedLeg = routedCoordinates[index]

    return {
      fromTime: keyframe.time,
      toTime: keyframes[index + 1].time,
      isFallback: !routedLeg,
      isStationary: keyframe.pointType === "stop",
      coordinates:
        routedLeg ??
        ([
          [keyframe.lng, keyframe.lat],
          [keyframes[index + 1].lng, keyframes[index + 1].lat],
        ] as RouteCoordinate[]),
    }
  })
}
