export type RouteCoordinate = [number, number]
export type RoutePreference = "fastest" | "shortest"
export type RoutedLegKind = "road" | "direct" | "flight"

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

interface DirectionsRoute {
  geometry?: {
    coordinates?: RouteCoordinate[]
    type?: string
  }
  legs?: Array<{
    steps?: Array<{
      geometry?: {
        coordinates?: RouteCoordinate[]
        type?: string
      }
    }>
  }>
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
  legCoordinates?: RouteCoordinate[][]
}

type DirectionsResolution =
  | { status: "routed"; geometry: DirectionsGeometry }
  | { status: "no-route" }

const routedLegCache = new Map<string, Promise<DirectionsResolution>>()
const routeAlgorithmVersion = "road-v3"
const defaultRoutePreference: RoutePreference = "shortest"
const maxConcurrentDirectionsRequests = 4
const maxDirectionsWaypoints = 23
const maxDirectionsCoordinates = maxDirectionsWaypoints + 2
const maxDirectionsChunkLegs = maxDirectionsCoordinates - 1
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
      legCoordinates: resolution.geometry.legCoordinates
        ? ([...resolution.geometry.legCoordinates].reverse().map((coordinates) => [...coordinates].reverse()) as RouteCoordinate[][])
        : undefined,
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

function appendRouteCoordinate(coordinates: RouteCoordinate[], coordinate: RouteCoordinate) {
  const previousCoordinate = coordinates[coordinates.length - 1]
  if (previousCoordinate && previousCoordinate[0] === coordinate[0] && previousCoordinate[1] === coordinate[1]) {
    return
  }

  coordinates.push(coordinate)
}

function getRouteLegStepCoordinates(route: DirectionsRoute | undefined, waypoints: RouteCoordinate[]) {
  if (!route?.legs || route.legs.length !== waypoints.length - 1) {
    return undefined
  }

  const legCoordinates = route.legs.map((leg, index) => {
    const coordinates: RouteCoordinate[] = []
    appendRouteCoordinate(coordinates, waypoints[index])

    leg.steps?.forEach((step) => {
      step.geometry?.coordinates?.filter(isValidCoordinatePair).forEach((coordinate) => {
        appendRouteCoordinate(coordinates, coordinate)
      })
    })
    appendRouteCoordinate(coordinates, waypoints[index + 1])

    return coordinates.length >= 2 ? coordinates : null
  })

  if (!legCoordinates || legCoordinates.some((coordinates) => !coordinates)) {
    return undefined
  }

  return legCoordinates as RouteCoordinate[][]
}

function getCoordinateDistanceScore(coordinate: RouteCoordinate, target: RouteCoordinate) {
  const latitudeScale = Math.cos((((coordinate[1] + target[1]) / 2) * Math.PI) / 180)
  const lngDistance = (coordinate[0] - target[0]) * latitudeScale
  const latDistance = coordinate[1] - target[1]

  return lngDistance ** 2 + latDistance ** 2
}

function findNearestRouteCoordinateIndex(
  coordinates: RouteCoordinate[],
  target: RouteCoordinate,
  startIndex: number,
  endIndex: number,
) {
  const safeStartIndex = Math.min(Math.max(startIndex, 0), coordinates.length - 1)
  const safeEndIndex = Math.min(Math.max(endIndex, safeStartIndex), coordinates.length - 1)
  let nearestIndex = safeStartIndex
  let nearestDistance = Number.POSITIVE_INFINITY

  for (let index = safeStartIndex; index <= safeEndIndex; index += 1) {
    const distance = getCoordinateDistanceScore(coordinates[index], target)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestIndex = index
    }
  }

  return nearestIndex
}

function splitRouteGeometryByWaypoints(coordinates: RouteCoordinate[], waypoints: RouteCoordinate[]) {
  if (coordinates.length < 2 || waypoints.length < 2) {
    return undefined
  }

  const legCoordinates: RouteCoordinate[][] = []
  let segmentStartIndex = 0

  for (let waypointIndex = 1; waypointIndex < waypoints.length; waypointIndex += 1) {
    const remainingLegs = waypoints.length - waypointIndex - 1
    const maxEndIndex = Math.max(segmentStartIndex, coordinates.length - 1 - remainingLegs)
    const nearestEndIndex = findNearestRouteCoordinateIndex(
      coordinates,
      waypoints[waypointIndex],
      segmentStartIndex,
      maxEndIndex,
    )
    const segmentEndIndex = Math.max(
      nearestEndIndex,
      Math.min(segmentStartIndex + 1, coordinates.length - 1),
    )
    const segmentCoordinates: RouteCoordinate[] = []

    coordinates.slice(segmentStartIndex, segmentEndIndex + 1).forEach((coordinate) => {
      appendRouteCoordinate(segmentCoordinates, coordinate)
    })

    if (segmentCoordinates.length < 2) {
      const nextCoordinate = coordinates[Math.min(segmentStartIndex + 1, coordinates.length - 1)]
      if (!nextCoordinate) {
        return undefined
      }

      appendRouteCoordinate(segmentCoordinates, nextCoordinate)
    }

    if (segmentCoordinates.length < 2) {
      return undefined
    }

    legCoordinates.push(segmentCoordinates)
    segmentStartIndex = segmentEndIndex
  }

  return legCoordinates.length === waypoints.length - 1 ? legCoordinates : undefined
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
      const stepLegCoordinates = getRouteLegStepCoordinates(route, [start, ...validVia, end])
      const coordinates =
        stepLegCoordinates?.flatMap((legCoordinates, index) =>
          index === 0 ? legCoordinates : legCoordinates.slice(1),
        ) ??
        route?.geometry?.coordinates?.filter(isValidCoordinatePair) ??
        []

      if (coordinates.length < 2) {
        throw new Error(payload.message || "Directions response did not include usable road geometry.")
      }

      return {
        status: "routed",
        geometry: {
          coordinates,
          legCoordinates: stepLegCoordinates,
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

function createRoutedLeg(
  keyframe: RoutableKeyframe,
  nextKeyframe: RoutableKeyframe,
  resolution: DirectionsResolution,
  routeKind: RoutedLegKind = resolution.status === "routed" ? "road" : "direct",
) {
  const routedCoordinates = resolution.status === "routed" ? resolution.geometry.coordinates : null
  return {
    fromTime: keyframe.time,
    toTime: nextKeyframe.time,
    isFallback: routeKind !== "road",
    isStationary: keyframe.pointType === "stop",
    routeKind,
    coordinates:
      routedCoordinates ??
      ([
        [keyframe.lng, keyframe.lat],
        [nextKeyframe.lng, nextKeyframe.lat],
      ] as RouteCoordinate[]),
  } satisfies RoutedLeg
}

function createFlightLeg(keyframe: RoutableKeyframe, nextKeyframe: RoutableKeyframe) {
  return createRoutedLeg(keyframe, nextKeyframe, { status: "no-route" }, "flight")
}

async function fetchIndividualRoutedLegs(
  keyframes: RoutableKeyframe[],
  routePreference: RoutePreference | undefined,
) {
  return Promise.all(
    keyframes.slice(0, -1).map(async (keyframe, index) => {
      const nextKeyframe = keyframes[index + 1]
      const resolution = await fetchDirectionsGeometry(
        [keyframe.lng, keyframe.lat],
        [nextKeyframe.lng, nextKeyframe.lat],
        keyframe.via,
        routePreference,
      )
      return createRoutedLeg(keyframe, nextKeyframe, resolution)
    }),
  )
}

async function fetchRoutedLegChunk(
  keyframes: RoutableKeyframe[],
  startLegIndex: number,
  endLegIndex: number,
  routePreference: RoutePreference | undefined,
) {
  const chunkKeyframes = keyframes.slice(startLegIndex, endLegIndex + 2)
  const chunkCoordinates = chunkKeyframes.map((keyframe) => [keyframe.lng, keyframe.lat] as RouteCoordinate)
  const startCoordinate = chunkCoordinates[0]
  const endCoordinate = chunkCoordinates[chunkCoordinates.length - 1]
  const viaCoordinates = chunkCoordinates.slice(1, -1)
  const resolution = await fetchDirectionsGeometry(startCoordinate, endCoordinate, viaCoordinates, routePreference)
  if (resolution.status === "no-route") {
    return fetchIndividualRoutedLegs(chunkKeyframes, routePreference)
  }

  const geometry = resolution.geometry
  const legCoordinates =
    geometry?.legCoordinates?.length === chunkKeyframes.length - 1
      ? geometry.legCoordinates
      : geometry?.coordinates
        ? splitRouteGeometryByWaypoints(geometry.coordinates, chunkCoordinates)
        : undefined

  if (!legCoordinates || legCoordinates.length !== chunkKeyframes.length - 1) {
    return fetchIndividualRoutedLegs(chunkKeyframes, routePreference)
  }

  return chunkKeyframes.slice(0, -1).map((keyframe, index) =>
    createRoutedLeg(keyframe, chunkKeyframes[index + 1], {
      status: "routed",
      geometry: { coordinates: legCoordinates[index] },
    }),
  )
}

export async function fetchRoutedLegsForKeyframes(
  keyframes: RoutableKeyframe[],
  options: FetchRoutedLegsOptions = {},
) {
  if (keyframes.length < 2) {
    return [] as RoutedLeg[]
  }

  const legs = keyframes.slice(0, -1).map((keyframe, index) =>
    keyframe.pointType === "flight" || keyframes[index + 1].pointType === "flight"
      ? createFlightLeg(keyframe, keyframes[index + 1])
      : createRoutedLeg(keyframe, keyframes[index + 1], { status: "no-route" }),
  )
  const requests: Array<Promise<void>> = []
  let legIndex = 0

  while (legIndex < legs.length) {
    const keyframe = keyframes[legIndex]
    const nextKeyframe = keyframes[legIndex + 1]

    if (keyframe.pointType === "flight" || nextKeyframe.pointType === "flight") {
      const flightLeg = createFlightLeg(keyframe, nextKeyframe)
      legs[legIndex] = flightLeg
      options.onLegResolved?.(legIndex, flightLeg)
      legIndex += 1
      continue
    }

    if (keyframe.via?.length) {
      const currentLegIndex = legIndex
      requests.push(
        (async () => {
          const resolution = await fetchDirectionsGeometry(
            [keyframe.lng, keyframe.lat],
            [nextKeyframe.lng, nextKeyframe.lat],
            keyframe.via,
            options.routePreference,
          )
          const leg = createRoutedLeg(keyframe, nextKeyframe, resolution)
          legs[currentLegIndex] = leg
          options.onLegResolved?.(currentLegIndex, leg)
        })(),
      )
      legIndex += 1
      continue
    }

    const chunkStartLegIndex = legIndex
    let chunkEndLegIndex = legIndex

    while (
      chunkEndLegIndex + 1 < legs.length &&
      !keyframes[chunkEndLegIndex + 1].via?.length &&
      keyframes[chunkEndLegIndex + 1].pointType !== "flight" &&
      keyframes[chunkEndLegIndex + 2].pointType !== "flight" &&
      chunkEndLegIndex - chunkStartLegIndex + 1 < maxDirectionsChunkLegs
    ) {
      chunkEndLegIndex += 1
    }

    requests.push(
      (async () => {
        const chunkLegs = await fetchRoutedLegChunk(
          keyframes,
          chunkStartLegIndex,
          chunkEndLegIndex,
          options.routePreference,
        )

        chunkLegs.forEach((leg, index) => {
          const resolvedLegIndex = chunkStartLegIndex + index
          legs[resolvedLegIndex] = leg
          options.onLegResolved?.(resolvedLegIndex, leg)
        })
      })(),
    )

    legIndex = chunkEndLegIndex + 1
  }

  await Promise.allSettled(requests)
  return legs
}
