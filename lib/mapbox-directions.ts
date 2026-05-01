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

function createLegCacheKey(start: RouteCoordinate, end: RouteCoordinate, via: RouteCoordinate[] = [], routePreference: RoutePreference = defaultRoutePreference) {
  return `${routePreference}:${start[0]},${start[1]}:${via.map((coordinate) => coordinate.join(",")).join("|")}:${end[0]},${end[1]}`
}

function reverseRouteCoordinates(coordinates: RouteCoordinate[] | null) {
  return coordinates ? ([...coordinates].reverse() as RouteCoordinate[]) : null
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

  const request = (async () => {
    const searchParams = new URLSearchParams({
      start: `${start[0]},${start[1]}`,
      end: `${end[0]},${end[1]}`,
      profile: "driving",
      routePreference,
    })
    if (validVia.length > 0) {
      searchParams.set("waypoints", validVia.map((coordinate) => coordinate.join(",")).join("|"))
    }

    let response: Response
    try {
      response = await fetch(`/api/mapbox/directions?${searchParams.toString()}`, {
        cache: "no-store",
      })
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
