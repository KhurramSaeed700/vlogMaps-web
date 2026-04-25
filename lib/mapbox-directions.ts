export type RouteCoordinate = [number, number]

export interface RoutedLeg {
  fromTime: number
  toTime: number
  coordinates: RouteCoordinate[]
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

function createLegCacheKey(start: RouteCoordinate, end: RouteCoordinate) {
  return `${start[0]},${start[1]}:${end[0]},${end[1]}`
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

async function fetchDirectionsLeg(start: RouteCoordinate, end: RouteCoordinate) {
  if (!isValidCoordinatePair(start) || !isValidCoordinatePair(end)) {
    return null
  }

  const key = createLegCacheKey(start, end)
  const existingRequest = routedLegCache.get(key)

  if (existingRequest) {
    return existingRequest
  }

  const request = (async () => {
    const searchParams = new URLSearchParams({
      start: `${start[0]},${start[1]}`,
      end: `${end[0]},${end[1]}`,
      profile: "driving",
    })

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
  keyframes: Array<{
    time: number
    lat: number
    lng: number
  }>,
) {
  if (keyframes.length < 2) {
    return [] as RoutedLeg[]
  }

  let routedCoordinates: Array<RouteCoordinate[] | null>
  try {
    routedCoordinates = await Promise.all(
      keyframes.slice(0, -1).map((keyframe, index) =>
        fetchDirectionsLeg([keyframe.lng, keyframe.lat], [keyframes[index + 1].lng, keyframes[index + 1].lat]),
      ),
    )
  } catch {
    routedCoordinates = []
  }

  return keyframes.slice(0, -1).map((keyframe, index) => ({
    fromTime: keyframe.time,
    toTime: keyframes[index + 1].time,
    coordinates:
      routedCoordinates[index] ??
      ([
        [keyframe.lng, keyframe.lat],
        [keyframes[index + 1].lng, keyframes[index + 1].lat],
      ] as RouteCoordinate[]),
  }))
}
