export const sharedMapNavigationMotion = {
  routePreviewDurationMs: 20000,
  centerNormalMs: 900,
  centerFastMs: 300,
  centerCatchUpMs: 190,
  centerPausedMs: 650,
  zoomOutMs: 780,
  zoomInMs: 1050,
  zoomCatchUpMs: 420,
  targetRefreshMs: 120,
} as const

export const sharedFlightCameraMotion = {
  preflightLeadSeconds: 8,
  landingApproachLeadSeconds: 12,
  landingApproachMaxDurationFraction: 0.3,
  landingApproachZoom: 10.8,
  pathViewportFraction: 0.58,
  maxZoom: 6.6,
  centerSmoothingMs: 480,
  zoomSmoothingMs: 900,
  boundedLookAheadSegments: 6,
  landingFocusZoom: 12.4,
  landingFocusMaxSeconds: 6,
} as const

interface FlightLandingPoint {
  time: number
  lat: number
  lng: number
  pointType?: string
  flightPhase?: string
}

export function getFlightLandingFocusPoint<T extends FlightLandingPoint>(
  points: readonly T[],
  currentTime: number,
) {
  if (points.length === 0 || !Number.isFinite(currentTime)) {
    return null
  }

  let low = 0
  let high = points.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (points[middle].time <= currentTime) low = middle + 1
    else high = middle
  }

  const latestIndex = low - 1
  for (let index = latestIndex; index >= Math.max(0, latestIndex - 5); index -= 1) {
    const point = points[index]
    if (currentTime - point.time > sharedFlightCameraMotion.landingFocusMaxSeconds) {
      break
    }
    if (point.pointType !== "flight" || point.flightPhase !== "landing") {
      continue
    }

    let nextDistinctTime = Number.POSITIVE_INFINITY
    const lastCandidateIndex = Math.min(points.length - 1, index + 6)
    for (let candidateIndex = index + 1; candidateIndex <= lastCandidateIndex; candidateIndex += 1) {
      if (points[candidateIndex].time > point.time + 0.1) {
        nextDistinctTime = points[candidateIndex].time
        break
      }
    }
    const focusEnd = Math.min(
      point.time + sharedFlightCameraMotion.landingFocusMaxSeconds,
      nextDistinctTime,
    )
    return currentTime < focusEnd ? point : null
  }

  return null
}

export function getFlightLandingApproachStartTime(segment: {
  fromTime: number
  toTime: number
}) {
  const duration = Math.max(segment.toTime - segment.fromTime, 0.001)
  const approachDuration = Math.min(
    sharedFlightCameraMotion.landingApproachLeadSeconds,
    duration * sharedFlightCameraMotion.landingApproachMaxDurationFraction,
  )

  return segment.toTime - approachDuration
}

export function getFlightLandingApproachProgress(
  segment: { fromTime: number; toTime: number },
  currentTime: number,
) {
  const approachStart = getFlightLandingApproachStartTime(segment)
  const approachDuration = Math.max(segment.toTime - approachStart, 0.001)
  const progress = Math.min(
    Math.max((currentTime - approachStart) / approachDuration, 0),
    1,
  )

  return progress * progress * (3 - 2 * progress)
}

export const sharedFlightPreloadMotion = {
  leadSeconds: 20,
  pathSampleCount: 6,
  cameraTransitionSampleCount: 1,
} as const

export const sharedRapidLandCameraMotion = {
  minDistanceKm: 75,
  maxDurationSeconds: 180,
  minSpeedKmPerSecond: 1,
  preframeLeadSeconds: 7,
  recoverySeconds: 3.5,
  preloadLeadSeconds: 18,
  pathViewportFraction: 0.72,
  minZoom: 5.2,
  maxZoom: 7.2,
  centerSmoothingMs: 720,
  zoomSmoothingMs: 920,
  boundedLookAheadSegments: 6,
} as const

export const flightOverviewPaddingRatio =
  (1 - sharedFlightCameraMotion.pathViewportFraction) / 2

export const rapidLandOverviewPaddingRatio =
  (1 - sharedRapidLandCameraMotion.pathViewportFraction) / 2

export const pausedNavigationSettlingThresholds = {
  routeTimeSeconds: 0.08,
  routeCoordinateDegrees: 0.000001,
  cameraCenterDegrees: 0.00001,
  cameraZoom: 0.015,
} as const

export interface FlightCameraPreloadTarget {
  center: readonly [number, number]
  zoom: number
}

interface FlightCameraPreloadInput {
  overview: FlightCameraPreloadTarget
  takeoffCenter: readonly [number, number]
  landingCenter: readonly [number, number]
  takeoffZoom: number
  landingZoom: number
}

function interpolateFlightCameraCenter(
  from: readonly [number, number],
  to: readonly [number, number],
  progress: number,
): readonly [number, number] {
  let longitudeDelta = to[0] - from[0]
  if (longitudeDelta > 180) longitudeDelta -= 360
  if (longitudeDelta < -180) longitudeDelta += 360

  let longitude = from[0] + longitudeDelta * progress
  if (longitude > 180) longitude -= 360
  if (longitude < -180) longitude += 360

  return [longitude, from[1] + (to[1] - from[1]) * progress]
}

/**
 * Builds a small, bounded zoom pyramid along both flight camera transitions.
 * The overview is first so an immediate takeoff can fall back to already-warm
 * low-resolution tiles while the intermediate views finish preloading.
 */
export function getFlightCameraPreloadTargets({
  overview,
  takeoffCenter,
  landingCenter,
  takeoffZoom,
  landingZoom,
}: FlightCameraPreloadInput): FlightCameraPreloadTarget[] {
  const targets: FlightCameraPreloadTarget[] = [
    overview,
    { center: landingCenter, zoom: Math.min(landingZoom, 6) },
    { center: landingCenter, zoom: landingZoom },
  ]
  const sampleCount = sharedFlightPreloadMotion.cameraTransitionSampleCount

  // The takeoff viewport is already visible. Warm the landing transition next
  // so a fast flight can jump to the current video position without waiting on
  // every intermediate region to load first.
  for (let index = 1; index <= sampleCount; index += 1) {
    const progress = index / sampleCount
    targets.push({
      center: interpolateFlightCameraCenter(overview.center, landingCenter, progress),
      zoom: overview.zoom + (landingZoom - overview.zoom) * progress,
    })
  }

  for (let index = 1; index <= sampleCount; index += 1) {
    const progress = index / sampleCount
    targets.push({
      center: interpolateFlightCameraCenter(overview.center, takeoffCenter, progress),
      zoom: overview.zoom + (takeoffZoom - overview.zoom) * progress,
    })
  }

  return targets
}

interface TimedNavigationSegment {
  fromTime: number
  toTime: number
  routeKind?: string
  isStationary?: boolean
}

interface RapidLandNavigationSegment extends TimedNavigationSegment {
  totalDistance: number
  coordinates: readonly unknown[]
}

export function isRapidLandNavigationSegment(
  segment: RapidLandNavigationSegment,
) {
  if (
    segment.routeKind === "flight" ||
    segment.isStationary ||
    segment.coordinates.length < 2
  ) {
    return false
  }

  const durationSeconds = Math.max(segment.toTime - segment.fromTime, 1)
  const speedKmPerSecond = segment.totalDistance / durationSeconds

  return (
    segment.totalDistance >= sharedRapidLandCameraMotion.minDistanceKm &&
    durationSeconds <= sharedRapidLandCameraMotion.maxDurationSeconds &&
    speedKmPerSecond >= sharedRapidLandCameraMotion.minSpeedKmPerSecond
  )
}

/**
 * These segments can cross an entire viewport between ordinary playback
 * samples. Their camera center must follow video time directly; easing an old
 * center makes the map visibly trail the traveler and wastes tile requests on
 * places the video has already left.
 */
export function isRealtimeNavigationSegment(
  segment: RapidLandNavigationSegment,
) {
  return segment.routeKind === "flight" || isRapidLandNavigationSegment(segment)
}

function getUpcomingRapidLandSegment<T extends RapidLandNavigationSegment>(
  segments: T[],
  currentTime: number,
  leadSeconds: number,
  recoverySeconds: number,
) {
  if (segments.length === 0 || !Number.isFinite(currentTime)) {
    return null
  }

  let low = 0
  let high = segments.length - 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (segments[middle].toTime + recoverySeconds >= currentTime) {
      high = middle
    } else {
      low = middle + 1
    }
  }

  const lastCandidateIndex = Math.min(
    segments.length - 1,
    low + sharedRapidLandCameraMotion.boundedLookAheadSegments,
  )
  const overviewWindowEnd = currentTime + leadSeconds

  for (let index = low; index <= lastCandidateIndex; index += 1) {
    const segment = segments[index]
    if (segment.fromTime > overviewWindowEnd) {
      break
    }

    if (
      isRapidLandNavigationSegment(segment) &&
      currentTime >= segment.fromTime - leadSeconds &&
      currentTime <= segment.toTime + recoverySeconds
    ) {
      return segment
    }
  }

  return null
}

export function getRapidLandOverviewSegment<T extends RapidLandNavigationSegment>(
  segments: T[],
  currentTime: number,
) {
  return getUpcomingRapidLandSegment(
    segments,
    currentTime,
    sharedRapidLandCameraMotion.preframeLeadSeconds,
    sharedRapidLandCameraMotion.recoverySeconds,
  )
}

export function getRapidLandPreloadSegment<T extends RapidLandNavigationSegment>(
  segments: T[],
  currentTime: number,
) {
  return getUpcomingRapidLandSegment(
    segments,
    currentTime,
    sharedRapidLandCameraMotion.preloadLeadSeconds,
    sharedRapidLandCameraMotion.recoverySeconds,
  )
}

function getUpcomingFlightSegment<T extends TimedNavigationSegment>(
  segments: T[],
  currentTime: number,
  leadSeconds: number,
) {
  if (segments.length === 0 || !Number.isFinite(currentTime)) {
    return null
  }

  let low = 0
  let high = segments.length - 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (segments[middle].toTime >= currentTime) {
      high = middle
    } else {
      low = middle + 1
    }
  }

  const lastCandidateIndex = Math.min(
    segments.length - 1,
    low + sharedFlightCameraMotion.boundedLookAheadSegments,
  )
  const overviewWindowEnd = currentTime + leadSeconds

  for (let index = low; index <= lastCandidateIndex; index += 1) {
    const segment = segments[index]
    if (segment.fromTime > overviewWindowEnd) {
      break
    }

    if (
      segment.routeKind === "flight" &&
      !segment.isStationary &&
      currentTime >= segment.fromTime - leadSeconds &&
      currentTime <= segment.toTime
    ) {
      return segment
    }
  }

  return null
}

export function getFlightOverviewSegment<T extends TimedNavigationSegment>(
  segments: T[],
  currentTime: number,
) {
  return getUpcomingFlightSegment(
    segments,
    currentTime,
    sharedFlightCameraMotion.preflightLeadSeconds,
  )
}

export function getFlightPreloadSegment<T extends TimedNavigationSegment>(
  segments: T[],
  currentTime: number,
  leadSeconds: number = sharedFlightPreloadMotion.leadSeconds,
) {
  return getUpcomingFlightSegment(
    segments,
    currentTime,
    Math.max(sharedFlightPreloadMotion.leadSeconds, leadSeconds),
  )
}

export function getMapNavigationSmoothing(
  deltaMs: number,
  smoothingMs: number,
  min = 0,
  max = 1,
) {
  const smoothing = 1 - Math.exp(-Math.max(deltaMs, 0) / Math.max(smoothingMs, 1))
  return Math.min(Math.max(smoothing, min), max)
}

export function getStationaryCameraFocusProgress(
  segment: { fromTime: number; toTime: number },
  currentTime: number,
  delaySeconds = 3,
  transitionSeconds = 2,
) {
  const duration = Math.max(segment.toTime - segment.fromTime, 0)
  if (duration < 2.5) {
    return 1
  }

  const delay = Math.min(delaySeconds, duration * 0.25)
  const transition = Math.min(transitionSeconds, Math.max(0.75, duration * 0.16))
  const zoomInStart = segment.fromTime + delay
  const zoomInEnd = Math.min(zoomInStart + transition, segment.toTime)
  const progress = Math.min(
    Math.max((currentTime - zoomInStart) / Math.max(zoomInEnd - zoomInStart, 0.001), 0),
    1,
  )

  return progress * progress * (3 - 2 * progress)
}

interface PausedNavigationSettledInput {
  routeTimeDeltaSeconds: number
  routeCoordinateDeltaDegrees: number
  cameraCenterDeltaDegrees: number
  cameraZoomDelta: number
  isFollowing: boolean
}

export function isPausedMapNavigationSettled({
  routeTimeDeltaSeconds,
  routeCoordinateDeltaDegrees,
  cameraCenterDeltaDegrees,
  cameraZoomDelta,
  isFollowing,
}: PausedNavigationSettledInput) {
  const routeIsSettled =
    Math.abs(routeTimeDeltaSeconds) < pausedNavigationSettlingThresholds.routeTimeSeconds &&
    routeCoordinateDeltaDegrees < pausedNavigationSettlingThresholds.routeCoordinateDegrees

  if (!routeIsSettled) {
    return false
  }

  return (
    !isFollowing ||
    (cameraCenterDeltaDegrees < pausedNavigationSettlingThresholds.cameraCenterDegrees &&
      Math.abs(cameraZoomDelta) < pausedNavigationSettlingThresholds.cameraZoom)
  )
}
