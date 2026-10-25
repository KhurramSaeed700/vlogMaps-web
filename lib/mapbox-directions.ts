import { reportHandledError } from "@/lib/monitoring/diagnostics"

export type RouteCoordinate = [number, number]
export type RoutePreference = "fastest" | "shortest"
export type RoutedLegKind = "road" | "flight" | "offroad"

export interface RoutedLeg {
  fromTime: number
  toTime: number
  coordinates: RouteCoordinate[]
  isStationary?: boolean
  isFallback?: boolean
  routeKind: RoutedLegKind
  sections?: Array<{ routeKind: RoutedLegKind; coordinates: RouteCoordinate[] }>
}

interface RoutableKeyframe {
  time: number
  lat: number
  lng: number
  pointType?: "point" | "stop" | "flight"
  flightPhase?: "takeoff" | "landing"
  regionCircle?: { radiusKm: number; anonymous?: boolean }
  via?: RouteCoordinate[]
}

export function isFlightRouteLeg(
  startPointType?: RoutableKeyframe["pointType"],
  endPointType?: RoutableKeyframe["pointType"],
) {
  return startPointType === "flight" && endPointType === "flight"
}

const earthRadiusKm = 6371
const flightPathTargetSegmentKm = 160
const flightPathMinSegments = 16
const flightPathMaxSegments = 128

function toCartesian([lng, lat]: RouteCoordinate) {
  const latitude = (lat * Math.PI) / 180
  const longitude = (lng * Math.PI) / 180
  const latitudeRadius = Math.cos(latitude)

  return [
    latitudeRadius * Math.cos(longitude),
    latitudeRadius * Math.sin(longitude),
    Math.sin(latitude),
  ] as const
}

function unwrapLongitude(longitude: number, previousLongitude: number) {
  let unwrappedLongitude = longitude
  while (unwrappedLongitude - previousLongitude > 180) unwrappedLongitude -= 360
  while (unwrappedLongitude - previousLongitude < -180) unwrappedLongitude += 360
  return unwrappedLongitude
}

export function createGreatCircleFlightCoordinates(
  start: RouteCoordinate,
  end: RouteCoordinate,
) {
  const startVector = toCartesian(start)
  const endVector = toCartesian(end)
  const dotProduct = Math.min(
    Math.max(
      startVector[0] * endVector[0] +
        startVector[1] * endVector[1] +
        startVector[2] * endVector[2],
      -1,
    ),
    1,
  )
  const angularDistance = Math.acos(dotProduct)
  const segmentCount = Math.min(
    Math.max(
      Math.ceil((angularDistance * earthRadiusKm) / flightPathTargetSegmentKm),
      flightPathMinSegments,
    ),
    flightPathMaxSegments,
  )
  const sinAngularDistance = Math.sin(angularDistance)
  const coordinates: RouteCoordinate[] = [start]
  let previousLongitude = start[0]

  for (let index = 1; index <= segmentCount; index += 1) {
    const progress = index / segmentCount
    let longitude: number
    let latitude: number

    if (Math.abs(sinAngularDistance) < 0.000001) {
      const endLongitude = unwrapLongitude(end[0], start[0])
      longitude = start[0] + (endLongitude - start[0]) * progress
      latitude = start[1] + (end[1] - start[1]) * progress
    } else {
      const startWeight = Math.sin((1 - progress) * angularDistance) / sinAngularDistance
      const endWeight = Math.sin(progress * angularDistance) / sinAngularDistance
      const x = startVector[0] * startWeight + endVector[0] * endWeight
      const y = startVector[1] * startWeight + endVector[1] * endWeight
      const z = startVector[2] * startWeight + endVector[2] * endWeight
      const vectorLength = Math.hypot(x, y, z) || 1
      longitude = (Math.atan2(y, x) * 180) / Math.PI
      latitude = (Math.asin(Math.min(Math.max(z / vectorLength, -1), 1)) * 180) / Math.PI
    }

    longitude = unwrapLongitude(longitude, previousLongitude)
    coordinates.push([longitude, latitude])
    previousLongitude = longitude
  }

  return coordinates
}

// Illustrative ocean corridors, not airline flight plans. Keep the same path in
// previews and live tracking so the airplane never changes routes on handoff.
export function createIllustrativeFlightCoordinates(start: RouteCoordinate, end: RouteCoordinate) {
  const canonical = (lng: number) => ((lng + 180) % 360 + 360) % 360 - 180
  const isAmericas = ([lng, lat]: RouteCoordinate) => canonical(lng) >= -170 && canonical(lng) <= -30 && lat >= -60 && lat <= 83
  const startInAmericas = isAmericas(start), endInAmericas = isAmericas(end)
  if (startInAmericas === endInAmericas) return createGreatCircleFlightCoordinates(start, end)
  const overseas = startInAmericas ? end : start
  const overseasLng = canonical(overseas[0])
  // Asia/Oceania use the Pacific; Europe/Africa use the Atlantic. Bound the
  // corridor latitude to avoid routing a long-haul illustration over a pole.
  const latitude = Math.max(-40, Math.min(45, (start[1] + end[1]) / 2))
  const pacific = overseasLng >= 35 || overseasLng < -170
  const corridor: RouteCoordinate[] = pacific ? [[150, latitude], [200, latitude]] : [[-35, latitude]]
  if (startInAmericas) corridor.reverse()
  const waypoints = [start, ...corridor, end]
  const coordinates: RouteCoordinate[] = [start]
  for (let leg = 1; leg < waypoints.length; leg++) {
    const section = createGreatCircleFlightCoordinates(waypoints[leg - 1], waypoints[leg])
    for (const point of section.slice(1)) {
      coordinates.push([unwrapLongitude(point[0], coordinates[coordinates.length - 1][0]), point[1]])
    }
  }
  return coordinates
}

function getCoordinateDistanceKm(start: RoutableKeyframe, end: RoutableKeyframe) {
  const toRadians = (value: number) => (value * Math.PI) / 180
  const startLat = toRadians(start.lat)
  const endLat = toRadians(end.lat)
  const deltaLat = endLat - startLat
  const deltaLng = toRadians(end.lng - start.lng)
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
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
const routeAlgorithmVersion = "road-v5-region-centers"
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
    reportHandledError(error, "map.directions", { routePreference })
    throw error
  }

  if (resolution.status === "routed") {
    writeStoredLegCoordinates(key, resolution.geometry.coordinates)
    writeStoredLegCoordinates(reverseKey, [...resolution.geometry.coordinates].reverse() as RouteCoordinate[])
  }

  return resolution
}

function coordinateDistanceKm(start: RouteCoordinate, end: RouteCoordinate) {
  return getCoordinateDistanceKm(
    { time: 0, lng: start[0], lat: start[1] },
    { time: 0, lng: end[0], lat: end[1] },
  )
}

function routeDistanceKm(coordinates: RouteCoordinate[]) {
  let distance = 0
  for (let index = 1; index < coordinates.length; index += 1) {
    distance += coordinateDistanceKm(coordinates[index - 1], coordinates[index])
  }
  return distance
}

// Split only when route data changes. Animation continues using the existing
// indexed timeline and precomputed distances, including the off-road connectors.
export function splitRoutedLegSections(leg: RoutedLeg): RoutedLeg[] {
  if (!leg.sections?.length || leg.isStationary) return [leg]
  const distances = leg.sections.map(section => routeDistanceKm(section.coordinates))
  const totalDistance = distances.reduce((sum, distance) => sum + distance, 0)
  if (totalDistance <= 0) return [leg]
  let fromTime = leg.fromTime
  return leg.sections.map((section, index) => {
    const toTime = index === leg.sections!.length - 1
      ? leg.toTime
      : fromTime + (leg.toTime - leg.fromTime) * distances[index] / totalDistance
    const result: RoutedLeg = {
      fromTime,
      toTime,
      coordinates: section.coordinates,
      routeKind: section.routeKind,
      isStationary: false,
      isFallback: section.routeKind === "offroad",
    }
    fromTime = toTime
    return result
  })
}

function createRoadLeg(
  keyframe: RoutableKeyframe,
  nextKeyframe: RoutableKeyframe,
  resolution: DirectionsResolution,
): RoutedLeg {
  const start: RouteCoordinate = [keyframe.lng, keyframe.lat]
  const end: RouteCoordinate = [nextKeyframe.lng, nextKeyframe.lat]
  const coordinates = resolution.status === "routed" ? resolution.geometry.coordinates : []
  const fallback: RoutedLeg = {
    fromTime: keyframe.time,
    toTime: nextKeyframe.time,
    isFallback: true,
    isStationary: keyframe.pointType === "stop",
    routeKind: "offroad",
    coordinates: [start, ...(keyframe.via ?? []), end],
  }
  if (coordinates.length < 2) return fallback

  const maxRoadSnapDistanceKm = 0.075
  const startGap = coordinateDistanceKm(start, coordinates[0])
  const endGap = coordinateDistanceKm(coordinates[coordinates.length - 1], end)
  const followsRoad = startGap <= maxRoadSnapDistanceKm && endGap <= maxRoadSnapDistanceKm
  if (!followsRoad) {
    // A region center is an approximate ground location, not evidence of a
    // boat/trail journey. Preserve the available road between the exact pins.
    const hasRegionEndpoint = [keyframe, nextKeyframe].some(point =>
      point.pointType === "stop" && typeof point.regionCircle?.radiusKm === "number" &&
      Number.isFinite(point.regionCircle.radiusKm) && point.regionCircle.radiusKm >= 0.05 && point.regionCircle.radiusKm <= 500,
    )
    const directDistance = coordinateDistanceKm(start, end)
    const roadDistance = routeDistanceKm(coordinates)
    const connectedAtOneEnd = Math.min(startGap, endGap) <= maxRoadSnapDistanceKm
    const hasAirportEndpoint = keyframe.pointType === "flight" || nextKeyframe.pointType === "flight"
    const mostlyConnected = (connectedAtOneEnd || hasAirportEndpoint || hasRegionEndpoint) &&
      Math.max(startGap, endGap) <= 3 &&
      startGap + endGap <= directDistance * 0.2 &&
      roadDistance <= directDistance * 3
    if (!mostlyConnected) return fallback
  }

  const sections: NonNullable<RoutedLeg["sections"]> = []
  // Include even small connectors so the traveler never jumps from the pin.
  if (startGap > 0.000001) sections.push({ routeKind: "offroad", coordinates: [start, coordinates[0]] })
  sections.push({ routeKind: "road", coordinates })
  if (endGap > 0.000001) sections.push({ routeKind: "offroad", coordinates: [coordinates[coordinates.length - 1], end] })
  return {
    ...fallback,
    isFallback: false,
    routeKind: "road",
    coordinates: sections.flatMap((section, index) => index === 0 ? section.coordinates : section.coordinates.slice(1)),
    sections,
  }
}

function createFlightLeg(keyframe: RoutableKeyframe, nextKeyframe: RoutableKeyframe) {
  const start: RouteCoordinate = [keyframe.lng, keyframe.lat]
  const end: RouteCoordinate = [nextKeyframe.lng, nextKeyframe.lat]

  return {
    fromTime: keyframe.time,
    toTime: nextKeyframe.time,
    isFallback: false,
    isStationary: false,
    routeKind: "flight" as const,
    coordinates: createIllustrativeFlightCoordinates(start, end),
  } satisfies RoutedLeg
}

export function createInitialRoutedLegs(keyframes: RoutableKeyframe[]): RoutedLeg[] {
  return keyframes.slice(0, -1).map((keyframe, index) => {
    const nextKeyframe = keyframes[index + 1]
    if (isFlightRouteLeg(keyframe.pointType, nextKeyframe.pointType)) {
      return createFlightLeg(keyframe, nextKeyframe)
    }

    return createRoadLeg(keyframe, nextKeyframe, { status: "no-route" })
  })
}

export async function fetchRoutedLegsForKeyframes(
  keyframes: RoutableKeyframe[],
  options: FetchRoutedLegsOptions = {},
) {
  const legs = createInitialRoutedLegs(keyframes)
  const requests = keyframes.slice(0, -1).map(async (keyframe, index) => {
    const nextKeyframe = keyframes[index + 1]
    if (
      isFlightRouteLeg(keyframe.pointType, nextKeyframe.pointType)
    ) {
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
