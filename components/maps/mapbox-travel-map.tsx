"use client"

import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { Crosshair, ExternalLink, Loader2, Play, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  fetchRoutedLegsForKeyframes,
  isFlightRouteLeg,
  type RouteCoordinate,
  type RoutedLeg,
} from "@/lib/mapbox-directions"
import {
  applyFlightAirplaneMarkerSize,
  createFlightAirplaneMarkerElement,
  flightPathLineWidth,
  flightPathOutlineWidth,
  getRouteBearingAtProgress,
  updateFlightAirplaneMarkerElement,
} from "@/components/maps/flight-airplane-marker"
import { hasMapboxAccessToken, mapboxAccessToken } from "@/lib/mapbox"
import { buildCameraZoomPlan, getCameraPlanZoom, type CameraZoomWindow } from "@/lib/map-camera-plan"
import { readMapPreloadPolicy } from "@/lib/map-preload-policy"
import { getFlightRouteKeyframes } from "@/lib/flight-path"
import { getTimestampLegKey, type CreatorRouteShapes } from "@/lib/creator-route-shapes"
import { getCoordinateSearchResult } from "@/lib/location-search/query-utils"
import {
  flightOverviewPaddingRatio,
  getFlightCameraPreloadTargets,
  getFlightLandingApproachProgress,
  getFlightLandingApproachStartTime,
  getFlightOverviewSegment,
  getFlightPreloadSegment,
  getMapNavigationSmoothing,
  getRapidLandOverviewSegment,
  getRapidLandPreloadSegment,
  isRealtimeNavigationSegment,
  isRapidLandNavigationSegment,
  isPausedMapNavigationSettled,
  rapidLandOverviewPaddingRatio,
  sharedFlightCameraMotion,
  sharedMapNavigationMotion,
  sharedRapidLandCameraMotion,
} from "@/lib/map-navigation-motion"

interface Keyframe {
  id?: string
  time: number
  stopEndTime?: number
  lat: number
  lng: number
  location: string
  description: string
  pointType?: "point" | "stop" | "flight"
  flightId?: string
  flightPhase?: "takeoff" | "landing"
}

interface MapboxTravelMapProps {
  keyframes: Keyframe[]
  markerKeyframes?: Keyframe[]
  routeShapes?: CreatorRouteShapes
  currentKeyframe: Keyframe
  liveCurrentTimeRef?: { readonly current: number }
  isPlaying?: boolean
  isJourneyComplete?: boolean
  followZoomPreferenceKey?: string
  autoResumeTracking?: boolean
  trackingResumeDelayMs?: number
  onLocationClick?: (keyframe: Keyframe) => void
  className?: string
}

interface PositionedRoutedLeg extends RoutedLeg {
  totalDistance: number
  cumulativeDistances: number[]
}

interface CameraTarget {
  center: RouteCoordinate
  zoom: number
  mode?: "follow" | "flight-overview" | "rapid-land-overview"
}

interface CameraTimelineEntry extends CameraTarget {
  time: number
  coordinate: RouteCoordinate
  speedProgress: number
  departureProgress: number
}

interface AutomaticCameraTarget extends CameraTarget {
  speedProgress: number
  departureProgress: number
}

interface ContextualZoomCacheEntry {
  legs: PositionedRoutedLeg[]
  keyframes: Keyframe[]
  time: number
  automaticZoom: number
  zoom: number
}

interface RouteMotionContext {
  leg: PositionedRoutedLeg | null
  progress: number
  remainingSeconds: number
  durationSeconds: number
  distanceKm: number
  speedKmPerSecond: number
  isStationary: boolean
}

type ReachedKeyframeMarker = {
  keyframe: Keyframe
  pointNumber: number
  markerKey: string
}

const mapStyleOptions = [
  { id: "satellite", label: "Satellite", style: "mapbox://styles/mapbox/satellite-streets-v12" },
  { id: "streets", label: "Streets", style: "mapbox://styles/mapbox/streets-v12" },
  { id: "terrain", label: "Terrain", style: "mapbox://styles/mapbox/outdoors-v12" },
] as const

type MapStyleOptionId = (typeof mapStyleOptions)[number]["id"]

interface GeocodingFeature {
  id: string
  place_name: string
  text: string
  center: [number, number]
  bbox?: [number, number, number, number]
}

interface GeocodingResponse {
  features?: GeocodingFeature[]
}

interface LocationSearchBias {
  proximity?: [number, number]
  bbox?: [number, number, number, number]
}

const dynamicCameraLookBehindSeconds = 4
const dynamicCameraLookAheadSeconds = 14
const dynamicCameraSampleCount = 8
const dynamicCameraViewportPaddingRatio = 0.18
const shortLandLegMaxDistanceKm = sharedRapidLandCameraMotion.minDistanceKm
const shortLandLegViewportFraction = 0.7
const shortLandLegPaddingRatio = (1 - shortLandLegViewportFraction) / 2
const dynamicCameraMinZoom = 5.8
const dynamicCameraMaxZoom = 16.5
const defaultFollowZoom = 9.4
const roadFollowMinZoom = 10.8
const fastRoadFollowMinZoom = 8.8
const roadFollowMaxZoom = 13.7
const denseTravelPointMaxZoom = 14.8
const speedTargetZoomWeight = 0.82
const fastMovementDensityRetention = 0.08
const fastMovementAutomaticFitTolerance = 0.35
const fastRoadZoomStartSpeedKmPerSecond = 0.006
const fastRoadZoomFullSpeedKmPerSecond = 0.04
// Keep context work off the 60 FPS path; camera interpolation still runs every frame.
const contextualZoomRefreshSeconds = 0.12
const contextualZoomAutomaticTolerance = 0.25
const contextualZoomTargetDeadband = 0.18
const contextualZoomTargetSmoothingSeconds = 0.85
const contextualZoomOutTargetSmoothingSeconds = 0.4
const contextualZoomSeekResetSeconds = 1
const stopPointFollowZoom = 15.7
const mobileFollowZoomBoost = 0.2
const travelPointDensityRadiusKm = 12
const travelPointDensityFullCount = 5
const cameraSpeedPredictionSeconds = 18
const cameraSpeedPredictionSampleCount = 6
const cameraSpeedPredictionMinWeight = 0.55
const cameraSpeedPredictionLegLookAhead = 4
const stopPointFocusLeadSeconds = 1.25
const finalStopPointFocusDurationSeconds = 8
const cameraMovementZoomOutMinDistanceKm = 1.5
const cameraMovementZoomOutScale = 0.38
const cameraMovementMaxZoomOutOffset = 1.45
const cameraMovementOutOfViewMinZoomOutOffset = 0.85
const cameraLookAheadMinSeconds = 3
const cameraLookAheadMaxSeconds = 16
const cameraLookAheadFullSpeedKmPerSecond = 0.12
const cameraLookAheadMaxWeight = 0.42
const cameraCenterLeadMinWeight = 0.2
const cameraCenterLeadMaxWeight = 0.55
const cameraDepartureSyncSeconds = 1.8
const cameraStationaryZoomInOffset = 0.45
const cameraCenterNormalSmoothingMs = sharedMapNavigationMotion.centerNormalMs
const cameraCenterFastSmoothingMs = sharedMapNavigationMotion.centerFastMs
const cameraCenterCatchUpSmoothingMs = sharedMapNavigationMotion.centerCatchUpMs
const cameraCenterPausedSmoothingMs = sharedMapNavigationMotion.centerPausedMs
const cameraCenterSnapThreshold = 0.000002
const cameraCenterCatchUpStartDistance = 0.004
const cameraCenterCatchUpFullDistance = 0.025
const cameraZoomOutSmoothingMs = sharedMapNavigationMotion.zoomOutMs
const cameraZoomInSmoothingMs = sharedMapNavigationMotion.zoomInMs
const cameraZoomCatchUpSmoothingMs = sharedMapNavigationMotion.zoomCatchUpMs
const cameraZoomDeadband = 0.08
const manualCameraOverrideDurationMs = 6500
const visualPlaybackExtrapolationMaxSeconds = 0.24
const visualPlaybackNormalSmoothingMs = 170
const visualPlaybackCatchUpSmoothingMs = 85
const visualPlaybackPausedSmoothingMs = 130
const visualCoordinateNormalSmoothingMs = 120
const visualCoordinateCatchUpSmoothingMs = 60
const visualCoordinatePausedSmoothingMs = 90
const visualPlaybackPlayingSnapThresholdSeconds = 0.003
const visualPlaybackPausedSnapThresholdSeconds = 0.01
const visualCatchUpDurationMs = 1100
const routeDataReconcileCatchUpDurationMs = 420
const visualHardSeekSnapSeconds = 18
const visualHardSeekSnapDistanceKm = 18
const markerHighlightDurationMs = 1000
const pointKeyframeMarkerColor = "#ea580c"
const stopKeyframeMarkerColor = "#0f766e"
const flightKeyframeMarkerColor = "#0284c7"
const travelerMarkerColor = "#ef4444"
const travelerMarkerMinSize = 13
const travelerMarkerMaxSize = 21
const travelerMarkerMinZoom = 5
const travelerMarkerMaxZoom = 13
const routeLineColor = pointKeyframeMarkerColor
const keyframeMarkerMinZoom = 5
const keyframeMarkerMaxZoom = 16
const keyframeMarkerMinSize = 12
const keyframeMarkerMaxSize = 24
const compactKeyframeMarkerScale = 0.62
const compactKeyframeMarkerMinSize = 9
const compactKeyframeMarkerMaxSize = 15
const keyframeMarkerZoomStops = [
  { zoom: 5, size: 12, fontSize: 6.5, borderWidth: 1, opacity: 0.76 },
  { zoom: 6, size: 12.5, fontSize: 6.75, borderWidth: 1, opacity: 0.78 },
  { zoom: 7, size: 13, fontSize: 7, borderWidth: 1.05, opacity: 0.8 },
  { zoom: 8, size: 13.5, fontSize: 7.15, borderWidth: 1.1, opacity: 0.82 },
  { zoom: 9, size: 14, fontSize: 7.25, borderWidth: 1.1, opacity: 0.84 },
  { zoom: 10, size: 14.5, fontSize: 7.35, borderWidth: 1.1, opacity: 0.86 },
  { zoom: 11, size: 15, fontSize: 7.2, borderWidth: 1.15, opacity: 0.86 },
  { zoom: 12, size: 15.5, fontSize: 7.4, borderWidth: 1.25, opacity: 0.9 },
  { zoom: 13, size: 18, fontSize: 8, borderWidth: 1.35, opacity: 0.92 },
  { zoom: 14, size: 20.5, fontSize: 8.5, borderWidth: 1.45, opacity: 0.94 },
  { zoom: 15, size: 22.5, fontSize: 9, borderWidth: 1.55, opacity: 0.94 },
  { zoom: 16, size: 24, fontSize: 9.25, borderWidth: 1.6, opacity: 0.94 },
] as const
const playbackJumpSnapThresholdSeconds = 1.25
const keyframeMarkerViewportPaddingPx = Math.ceil(keyframeMarkerMaxSize / 2) + 6
const visibleMapMinTileCacheSize = 96
const visibleMapMaxTileCacheSize = 384
const routePreloadSampleCount = 12
const routePreloadMaxZoom = 13
const playbackRoutePreloadRefreshMs = 1500
const playbackRoutePreloadMaxZoom = 15.5
const mapOverlayWideMinWidth = 760
const cameraTimelineMaxSamples = 240
const cameraTimelineTargetSecondsPerSample = 2
const viewportMarkerRefreshIntervalMs = 80
const keyframeMarkerZoomRefreshStep = 0.08
const playbackSeekDriftToleranceSeconds = 2.75
const followZoomPreferenceMinOffset = -4
const followZoomPreferenceMaxOffset = 4
const routeIntroDurationMs = sharedMapNavigationMotion.routePreviewDurationMs
const routeIntroOverviewPaddingRatio = 0.16
const routeIntroMaxPlaces = 5
const journeyCompleteOverviewDurationMs = 1200
const journeyCompleteOverviewPaddingRatio = 0.08
const travelerMarkerViewportPadding = {
  top: 58,
  right: 28,
  bottom: 12,
  left: 28,
}

interface RouteFeatureSegment {
  coordinates: RouteCoordinate[]
  routeKind: RoutedLeg["routeKind"]
}
const knownRouteIntroLandmarks = [
  { name: "Balakot", coordinate: [73.3507, 34.5479] as RouteCoordinate, radiusKm: 8 },
  { name: "Kiwai", coordinate: [73.4863, 34.6314] as RouteCoordinate, radiusKm: 5 },
  { name: "Naran", coordinate: [73.6507, 34.9096] as RouteCoordinate, radiusKm: 9 },
  { name: "Babusar Top", coordinate: [74.043, 35.145] as RouteCoordinate, radiusKm: 10 },
  { name: "Saif-ul-Malook Lake", coordinate: [73.697, 34.8769] as RouteCoordinate, radiusKm: 6 },
]

function getKeyframeMarkerColor(pointType?: Keyframe["pointType"]) {
  if (pointType === "flight") {
    return flightKeyframeMarkerColor
  }

  return pointType === "stop" ? stopKeyframeMarkerColor : pointKeyframeMarkerColor
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function easeInOutCubic(progress: number) {
  const normalizedProgress = clampNumber(progress, 0, 1)
  return normalizedProgress < 0.5
    ? 4 * normalizedProgress ** 3
    : 1 - (-2 * normalizedProgress + 2) ** 3 / 2
}

function formatRouteIntroDistance(distanceKm: number) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return "0 km"
  }

  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`
  }

  return `${distanceKm >= 100 ? Math.round(distanceKm) : Math.round(distanceKm * 10) / 10} km`
}

function isMeaningfulRouteIntroName(name: string) {
  const trimmedName = name.trim()
  if (!trimmedName) {
    return false
  }

  return !/^(point|stop)\s+at\s+\d/i.test(trimmedName) &&
    !/^traveling\s+to\s+/i.test(trimmedName) &&
    !/^(unknown location|route unavailable)$/i.test(trimmedName)
}

function getUniqueRouteIntroNames(names: string[]) {
  const seenNames = new Set<string>()

  return names.flatMap((name) => {
    const trimmedName = name.trim()
    const key = trimmedName.toLowerCase()
    if (!isMeaningfulRouteIntroName(trimmedName) || seenNames.has(key)) {
      return []
    }

    seenNames.add(key)
    return [trimmedName]
  })
}

function getKnownRouteIntroLandmarkNames(coordinates: RouteCoordinate[]) {
  return knownRouteIntroLandmarks
    .flatMap((landmark) => {
      let closestIndex = -1
      let closestDistance = Number.POSITIVE_INFINITY

      coordinates.forEach((coordinate, index) => {
        const distance = haversineDistance(coordinate, landmark.coordinate)
        if (distance < closestDistance) {
          closestDistance = distance
          closestIndex = index
        }
      })

      if (closestIndex < 0 || closestDistance > landmark.radiusKm) {
        return []
      }

      return [{ name: landmark.name, index: closestIndex }]
    })
    .sort((left, right) => left.index - right.index)
    .map((landmark) => landmark.name)
}

function readStoredFollowZoomOffset(key?: string) {
  return 0
}

function writeStoredFollowZoomOffset(_key: string | undefined, _value: number) {}

function didPlaybackSeek(
  previousTime: number | null,
  nextTime: number,
  previousUpdatedAt: number | null,
  nextUpdatedAt: number,
  isPlaying: boolean,
) {
  if (previousTime === null || previousUpdatedAt === null) {
    return false
  }

  const playbackDeltaSeconds = nextTime - previousTime
  if (playbackDeltaSeconds <= -playbackJumpSnapThresholdSeconds) {
    return true
  }

  if (!isPlaying) {
    return Math.abs(playbackDeltaSeconds) >= playbackJumpSnapThresholdSeconds
  }

  const elapsedSeconds = clampNumber((nextUpdatedAt - previousUpdatedAt) / 1000, 0, 30)
  const driftSeconds = Math.abs(playbackDeltaSeconds - elapsedSeconds)

  return (
    Math.abs(playbackDeltaSeconds) >= playbackJumpSnapThresholdSeconds &&
    driftSeconds >= playbackSeekDriftToleranceSeconds
  )
}

function getMapStyleUrl(styleId: MapStyleOptionId) {
  return mapStyleOptions.find((option) => option.id === styleId)?.style ?? mapStyleOptions[1].style
}

async function fetchLocationSuggestions(query: string, bias: LocationSearchBias = {}, signal?: AbortSignal) {
  const coordinateResult = getCoordinateSearchResult(query)
  if (coordinateResult) {
    return [coordinateResult]
  }

  const url = new URL("/api/location-search", window.location.origin)
  url.searchParams.set("q", query)

  if (bias.proximity) {
    url.searchParams.set("proximity", bias.proximity.map((value) => value.toFixed(6)).join(","))
  }

  if (bias.bbox) {
    url.searchParams.set("bbox", bias.bbox.map((value) => value.toFixed(6)).join(","))
  }

  const response = await fetch(url.toString(), {
    cache: "no-store",
    signal,
  })
  if (!response.ok) {
    throw new Error("Search failed")
  }

  const data = (await response.json()) as GeocodingResponse
  return data.features ?? []
}

function getSearchResultZoom(feature: GeocodingFeature, currentZoom: number) {
  if (!feature.bbox) {
    return Math.max(currentZoom, 15)
  }

  const [west, south, east, north] = feature.bbox
  const span = Math.max(Math.abs(east - west), Math.abs(north - south))

  if (span > 1) {
    return Math.max(currentZoom, 9)
  }

  if (span > 0.2) {
    return Math.max(currentZoom, 12)
  }

  return Math.max(currentZoom, 15)
}

function getKeyframeMarkerZoomProgress(zoom: number) {
  return (
    (clampNumber(zoom, keyframeMarkerMinZoom, keyframeMarkerMaxZoom) - keyframeMarkerMinZoom) /
    (keyframeMarkerMaxZoom - keyframeMarkerMinZoom)
  )
}

function getTravelerMarkerZoomProgress(zoom: number) {
  return (
    (clampNumber(zoom, travelerMarkerMinZoom, travelerMarkerMaxZoom) - travelerMarkerMinZoom) /
    (travelerMarkerMaxZoom - travelerMarkerMinZoom)
  )
}

function getKeyframeMarkerStyleForZoom(zoom: number) {
  const normalizedZoom = clampNumber(zoom, keyframeMarkerMinZoom, keyframeMarkerMaxZoom)
  const lowerStopIndex = keyframeMarkerZoomStops.findLastIndex((stop) => stop.zoom <= normalizedZoom)
  const lowerStop = keyframeMarkerZoomStops[Math.max(0, lowerStopIndex)]
  const upperStop = keyframeMarkerZoomStops.find((stop) => stop.zoom >= normalizedZoom) ?? lowerStop

  if (!lowerStop || !upperStop || lowerStop.zoom === upperStop.zoom) {
    const size = lowerStop?.size ?? keyframeMarkerMinSize

    return {
      size,
      fontSize: lowerStop?.fontSize ?? 7,
      borderWidth: lowerStop?.borderWidth ?? 0.75,
      opacity: lowerStop?.opacity ?? 0.7,
      showLabel: true,
    }
  }

  const stopProgress = (normalizedZoom - lowerStop.zoom) / (upperStop.zoom - lowerStop.zoom)
  const size = interpolateNumber(lowerStop.size, upperStop.size, stopProgress)
  const showLabel = true
  const fontSize = interpolateNumber(lowerStop.fontSize, upperStop.fontSize, stopProgress)
  const borderWidth = interpolateNumber(lowerStop.borderWidth, upperStop.borderWidth, stopProgress)
  const opacity = interpolateNumber(lowerStop.opacity, upperStop.opacity, stopProgress)

  return {
    size,
    fontSize,
    borderWidth,
    opacity,
    showLabel,
  }
}

function getTravelerMarkerStyleForZoom(zoom: number) {
  const zoomProgress = getTravelerMarkerZoomProgress(zoom)
  const sizeProgress = 0.18 + 0.82 * zoomProgress ** 1.45
  const size = travelerMarkerMinSize + (travelerMarkerMaxSize - travelerMarkerMinSize) * sizeProgress

  return {
    width: size,
    height: size,
  }
}

function createTravelerMarkerElement(zoom: number) {
  const element = document.createElement("div")
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle")
  const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle")

  element.className = "traveler-marker"
  element.style.cssText = `
    display: block;
    pointer-events: none;
    user-select: none;
    transform-origin: center;
    will-change: transform;
    contain: layout paint style;
    transition: width 120ms ease, height 120ms ease;
  `

  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("aria-hidden", "true")
  svg.style.cssText =
    "display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 1.5px 2.5px rgba(15,23,42,0.5));"

  ring.setAttribute("cx", "12")
  ring.setAttribute("cy", "12")
  ring.setAttribute("r", "9")
  ring.setAttribute("fill", "white")
  ring.setAttribute("opacity", "0.98")

  dot.setAttribute("cx", "12")
  dot.setAttribute("cy", "12")
  dot.setAttribute("r", "6.25")
  dot.setAttribute("fill", travelerMarkerColor)

  svg.append(ring, dot)
  element.append(svg)

  applyTravelerMarkerSize(element, zoom)

  return element
}

function applyTravelerMarkerSize(element: HTMLElement, zoom: number) {
  const markerStyle = getTravelerMarkerStyleForZoom(zoom)

  element.style.width = `${markerStyle.width}px`
  element.style.height = `${markerStyle.height}px`

  return markerStyle
}

function getKeyframeMarkerCollisionDistanceForZoom(zoom: number) {
  const zoomProgress = getKeyframeMarkerZoomProgress(zoom)
  if (zoomProgress >= 1) {
    return 0
  }

  const markerStyle = getKeyframeMarkerStyleForZoom(zoom)
  const farZoomBias = 1 - zoomProgress
  return Math.max(markerStyle.size + 3, 8 + farZoomBias * 10)
}

function shouldTriggerTimestampHighlight(previousTime: number | null, currentTime: number, timestamp: number) {
  if (!Number.isFinite(currentTime) || !Number.isFinite(timestamp)) {
    return false
  }

  if (previousTime !== null && Number.isFinite(previousTime)) {
    const lowerBound = Math.min(previousTime, currentTime)
    const upperBound = Math.max(previousTime, currentTime)

    if (timestamp >= lowerBound && timestamp <= upperBound) {
      return true
    }
  }

  return currentTime >= timestamp && currentTime < timestamp + 1
}

function canRearmTimestampHighlight(currentTime: number, timestamp: number) {
  return currentTime < timestamp - 0.25 || currentTime >= timestamp + 1.25
}

function coordinateDistance(start: RouteCoordinate, end: RouteCoordinate) {
  return Math.hypot(end[0] - start[0], end[1] - start[1])
}

function haversineDistance(start: RouteCoordinate, end: RouteCoordinate) {
  const toRadians = (value: number) => (value * Math.PI) / 180
  const earthRadiusKm = 6371
  const deltaLat = toRadians(end[1] - start[1])
  const deltaLng = toRadians(end[0] - start[0])
  const startLat = toRadians(start[1])
  const endLat = toRadians(end[1])

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function buildPositionedLegs(legs: RoutedLeg[]) {
  return legs.map((leg) => {
    const cumulativeDistances = [0]

    for (let index = 1; index < leg.coordinates.length; index += 1) {
      cumulativeDistances.push(
        cumulativeDistances[index - 1] + haversineDistance(leg.coordinates[index - 1], leg.coordinates[index]),
      )
    }

    return {
      ...leg,
      cumulativeDistances,
      totalDistance: cumulativeDistances[cumulativeDistances.length - 1] ?? 0,
    }
  })
}

function appendRouteCoordinate(coordinates: RouteCoordinate[], coordinate: RouteCoordinate) {
  const previousCoordinate = coordinates[coordinates.length - 1]
  if (previousCoordinate && coordinateDistance(previousCoordinate, coordinate) < 0.000001) {
    return
  }

  coordinates.push(coordinate)
}

function flattenLegCoordinates(legs: RoutedLeg[]) {
  return legs.flatMap((leg, index) => (index === 0 ? leg.coordinates : leg.coordinates.slice(1)))
}

function routeShapePointToCoordinate(point: { lat: number; lng: number }): RouteCoordinate {
  return [point.lng, point.lat]
}

function getRouteShapesSignature(routeShapes?: CreatorRouteShapes) {
  if (!routeShapes) {
    return ""
  }

  return Object.entries(routeShapes.timestampLegs)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, points]) =>
      [
        key,
        ...points.map((point) => `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`),
      ].join(":"),
    )
    .join("|")
}

function getTimestampLegViaCoordinates(routeShapes: CreatorRouteShapes | undefined, startKeyframe: Keyframe, endKeyframe?: Keyframe) {
  if (!routeShapes || !startKeyframe.id || !endKeyframe?.id) {
    return undefined
  }

  const points = routeShapes.timestampLegs[getTimestampLegKey(startKeyframe.id, endKeyframe.id)]
  return points?.length ? points.map(routeShapePointToCoordinate) : undefined
}

function getRouteDistanceKm(coordinates: RouteCoordinate[]) {
  if (coordinates.length < 2) {
    return 0
  }

  return coordinates.slice(1).reduce((distance, coordinate, index) => {
    return distance + haversineDistance(coordinates[index], coordinate)
  }, 0)
}

function normalizeRoutedLegsForManualKeyframes(legs: RoutedLeg[], keyframes: Keyframe[]) {
  return legs.map((leg, index) => {
    const startKeyframe = keyframes[index]
    const endKeyframe = keyframes[index + 1]
    if (!startKeyframe || !endKeyframe) {
      return leg
    }

    const startCoordinate: RouteCoordinate = [startKeyframe.lng, startKeyframe.lat]
    const endCoordinate: RouteCoordinate = [endKeyframe.lng, endKeyframe.lat]
    const isFlightLeg = isFlightRouteLeg(startKeyframe.pointType, endKeyframe.pointType)
    if (isFlightLeg) {
      return {
        ...leg,
        isFallback: true,
        routeKind: "flight" as const,
        coordinates: [startCoordinate, endCoordinate],
      }
    }

    if (leg.coordinates.length < 2) {
      return {
        ...leg,
        isFallback: true,
        routeKind: "road" as const,
        coordinates: [startCoordinate, endCoordinate],
      }
    }

    return {
      ...leg,
      isFallback: false,
      routeKind: "road" as const,
      coordinates: leg.coordinates,
    }
  })
}

function getStopEndTime(keyframe: Keyframe, nextKeyframe: Keyframe) {
  if (keyframe.pointType !== "stop") {
    return null
  }

  if (typeof keyframe.stopEndTime === "number" && keyframe.stopEndTime > keyframe.time) {
    return Math.min(keyframe.stopEndTime, nextKeyframe.time)
  }

  return nextKeyframe.time
}

function expandLegsForStopDurations(legs: RoutedLeg[], keyframes: Keyframe[]) {
  return legs.flatMap((leg, index) => {
    const keyframe = keyframes[index]
    const nextKeyframe = keyframes[index + 1]
    if (!keyframe || !nextKeyframe) {
      return [leg]
    }

    const stopEndTime = getStopEndTime(keyframe, nextKeyframe)
    if (stopEndTime === null) {
      return [leg]
    }

    const stationaryLeg: RoutedLeg = {
      fromTime: keyframe.time,
      toTime: stopEndTime,
      isStationary: true,
      routeKind: leg.routeKind,
      coordinates: [
        [keyframe.lng, keyframe.lat],
        [keyframe.lng, keyframe.lat],
      ],
    }

    if (stopEndTime >= nextKeyframe.time) {
      return [stationaryLeg]
    }

    return [
      stationaryLeg,
      {
        ...leg,
        fromTime: stopEndTime,
        toTime: nextKeyframe.time,
        isStationary: false,
      },
    ]
  })
}

function buildPendingRoutedLegs(keyframes: Keyframe[]) {
  if (keyframes.length < 2) {
    return [] as RoutedLeg[]
  }

  return keyframes.slice(0, -1).map((keyframe, index) => {
    const nextKeyframe = keyframes[index + 1]
    const isFlight = isFlightRouteLeg(keyframe.pointType, nextKeyframe.pointType)

    return {
      fromTime: keyframe.time,
      toTime: nextKeyframe.time,
      isFallback: true,
      isStationary: keyframe.pointType === "stop",
      routeKind: isFlight ? "flight" as const : "road" as const,
      coordinates: [
        [keyframe.lng, keyframe.lat],
        [nextKeyframe.lng, nextKeyframe.lat],
      ] as RouteCoordinate[],
    }
  })
}

function interpolateAlongLeg(leg: PositionedRoutedLeg, progress: number): RouteCoordinate {
  if (leg.coordinates.length === 0) {
    return [0, 0]
  }

  if (leg.coordinates.length === 1 || leg.totalDistance <= 0) {
    return leg.coordinates[0]
  }

  const targetDistance = leg.totalDistance * Math.min(Math.max(progress, 0), 1)

  for (let index = 1; index < leg.coordinates.length; index += 1) {
    const previousDistance = leg.cumulativeDistances[index - 1]
    const nextDistance = leg.cumulativeDistances[index]

    if (targetDistance <= nextDistance) {
      const segmentDistance = Math.max(nextDistance - previousDistance, 0.000001)
      const segmentProgress = (targetDistance - previousDistance) / segmentDistance
      const start = leg.coordinates[index - 1]
      const end = leg.coordinates[index]

      return [
        start[0] + (end[0] - start[0]) * segmentProgress,
        start[1] + (end[1] - start[1]) * segmentProgress,
      ]
    }
  }

  return leg.coordinates[leg.coordinates.length - 1]
}

function getPartialLegCoordinates(leg: PositionedRoutedLeg, currentTime: number) {
  const coordinates: RouteCoordinate[] = []
  const startCoordinate = leg.coordinates[0]
  if (!startCoordinate) {
    return coordinates
  }

  appendRouteCoordinate(coordinates, startCoordinate)

  if (leg.coordinates.length === 1 || leg.totalDistance <= 0 || leg.isStationary) {
    return coordinates
  }

  const segmentDuration = Math.max(leg.toTime - leg.fromTime, 1)
  const progress = Math.min(Math.max((currentTime - leg.fromTime) / segmentDuration, 0), 1)
  const targetDistance = leg.totalDistance * progress

  for (let index = 1; index < leg.coordinates.length; index += 1) {
    const coordinate = leg.coordinates[index]
    const previousDistance = leg.cumulativeDistances[index - 1]
    const nextDistance = leg.cumulativeDistances[index]

    if (nextDistance < targetDistance) {
      appendRouteCoordinate(coordinates, coordinate)
      continue
    }

    const segmentDistance = Math.max(nextDistance - previousDistance, 0.000001)
    const segmentProgress = (targetDistance - previousDistance) / segmentDistance
    appendRouteCoordinate(coordinates, [
      leg.coordinates[index - 1][0] + (coordinate[0] - leg.coordinates[index - 1][0]) * segmentProgress,
      leg.coordinates[index - 1][1] + (coordinate[1] - leg.coordinates[index - 1][1]) * segmentProgress,
    ])
    break
  }

  return coordinates
}

function getRevealedRouteSegments(legs: PositionedRoutedLeg[], currentTime: number) {
  return legs.flatMap((leg) => {
    if (leg.isStationary || currentTime < leg.fromTime) {
      return []
    }

    const coordinates = currentTime >= leg.toTime ? leg.coordinates : getPartialLegCoordinates(leg, currentTime)
    return coordinates.length >= 2 ? [{ coordinates, routeKind: leg.routeKind } satisfies RouteFeatureSegment] : []
  })
}

function getMovingRouteLegs(legs: PositionedRoutedLeg[]) {
  return legs.filter((leg) => !leg.isStationary && leg.totalDistance > 0.001 && leg.coordinates.length > 1)
}

function getRouteCoordinateAtDistanceProgress(legs: PositionedRoutedLeg[], progress: number) {
  const movingLegs = getMovingRouteLegs(legs)
  if (movingLegs.length === 0) {
    return legs[0]?.coordinates[0] ?? null
  }

  const totalDistance = movingLegs.reduce((distance, leg) => distance + leg.totalDistance, 0)
  let targetDistance = totalDistance * clampNumber(progress, 0, 1)

  for (const leg of movingLegs) {
    if (targetDistance <= leg.totalDistance) {
      return interpolateAlongLeg(leg, targetDistance / Math.max(leg.totalDistance, 0.000001))
    }

    targetDistance -= leg.totalDistance
  }

  const lastLeg = movingLegs[movingLegs.length - 1]
  return lastLeg.coordinates[lastLeg.coordinates.length - 1] ?? null
}

function getRouteTimeAtDistanceProgress(legs: PositionedRoutedLeg[], progress: number) {
  const movingLegs = getMovingRouteLegs(legs)
  if (movingLegs.length === 0) {
    return null
  }

  const totalDistance = movingLegs.reduce((distance, leg) => distance + leg.totalDistance, 0)
  let targetDistance = totalDistance * clampNumber(progress, 0, 1)

  for (const leg of movingLegs) {
    if (targetDistance <= leg.totalDistance) {
      const legProgress = targetDistance / Math.max(leg.totalDistance, 0.000001)
      return leg.fromTime + (leg.toTime - leg.fromTime) * legProgress
    }

    targetDistance -= leg.totalDistance
  }

  return movingLegs[movingLegs.length - 1].toTime
}

function getRevealedRouteSegmentsByDistanceProgress(legs: PositionedRoutedLeg[], progress: number) {
  const movingLegs = getMovingRouteLegs(legs)
  const segments: RouteFeatureSegment[] = []

  if (movingLegs.length === 0) {
    return segments
  }

  const totalDistance = movingLegs.reduce((distance, leg) => distance + leg.totalDistance, 0)
  let remainingDistance = totalDistance * clampNumber(progress, 0, 1)

  for (const leg of movingLegs) {
    if (remainingDistance >= leg.totalDistance) {
      segments.push({ coordinates: leg.coordinates, routeKind: leg.routeKind })
      remainingDistance -= leg.totalDistance
      continue
    }

    const coordinates = getPartialLegCoordinates(
      leg,
      leg.fromTime + (leg.toTime - leg.fromTime) * (remainingDistance / Math.max(leg.totalDistance, 0.000001)),
    )
    if (coordinates.length >= 2) {
      segments.push({ coordinates, routeKind: leg.routeKind })
    }
    break
  }

  return segments
}

function getRouteLegIndexAtTime(legs: PositionedRoutedLeg[], currentTime: number) {
  if (legs.length === 0) {
    return -1
  }

  if (currentTime < legs[0].fromTime) {
    return 0
  }

  const lastLeg = legs[legs.length - 1]
  if (currentTime > lastLeg.toTime) {
    return legs.length - 1
  }

  let low = 0
  let high = legs.length - 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (legs[middle].toTime >= currentTime) {
      high = middle
    } else {
      low = middle + 1
    }
  }

  const candidate = legs[low]
  return currentTime >= candidate.fromTime && currentTime <= candidate.toTime
    ? low
    : legs.length - 1
}

function getRouteLegAtTime(legs: PositionedRoutedLeg[], currentTime: number) {
  const legIndex = getRouteLegIndexAtTime(legs, currentTime)
  return legIndex >= 0 ? legs[legIndex] : null
}

function getRouteCoordinateAtTime(legs: PositionedRoutedLeg[], currentTime: number) {
  const matchingLeg = getRouteLegAtTime(legs, currentTime)
  if (!matchingLeg) {
    return null
  }

  const segmentDuration = Math.max(matchingLeg.toTime - matchingLeg.fromTime, 1)
  const progress = (currentTime - matchingLeg.fromTime) / segmentDuration

  if (matchingLeg.coordinates.length === 0) {
    return null
  }

  if (matchingLeg.isStationary) {
    return currentTime >= matchingLeg.toTime
      ? (matchingLeg.coordinates[matchingLeg.coordinates.length - 1] ?? matchingLeg.coordinates[0])
      : matchingLeg.coordinates[0]
  }

  return interpolateAlongLeg(matchingLeg, progress)
}

function getRouteTimeBounds(legs: PositionedRoutedLeg[]) {
  if (legs.length === 0) {
    return null
  }

  return {
    start: legs[0].fromTime,
    end: legs[legs.length - 1].toTime,
  }
}

function clampRouteTime(legs: PositionedRoutedLeg[], time: number) {
  const bounds = getRouteTimeBounds(legs)
  if (!bounds) {
    return time
  }

  return clampNumber(time, bounds.start, bounds.end)
}

function getRouteMotionContext(legs: PositionedRoutedLeg[], currentTime: number): RouteMotionContext {
  if (legs.length === 0) {
    return {
      leg: null,
      progress: 0,
      remainingSeconds: 0,
      durationSeconds: 0,
      distanceKm: 0,
      speedKmPerSecond: 0,
      isStationary: true,
    }
  }

  const leg = getRouteLegAtTime(legs, currentTime) ?? legs[legs.length - 1]
  const durationSeconds = Math.max(leg.toTime - leg.fromTime, 1)
  const progress = clampNumber((currentTime - leg.fromTime) / durationSeconds, 0, 1)
  const remainingSeconds = Math.max(leg.toTime - currentTime, 0)
  const isStationary = Boolean(leg.isStationary || leg.totalDistance <= 0.02)
  const speedKmPerSecond = isStationary ? 0 : leg.totalDistance / durationSeconds

  return {
    leg,
    progress,
    remainingSeconds,
    durationSeconds,
    distanceKm: leg.totalDistance,
    speedKmPerSecond,
    isStationary,
  }
}

function getCameraLookAheadSeconds(context: RouteMotionContext) {
  if (!context.leg || context.isStationary) {
    return 0
  }

  const speedProgress = clampNumber(
    context.speedKmPerSecond / cameraLookAheadFullSpeedKmPerSecond,
    0,
    1,
  )
  const desiredLead = interpolateNumber(
    cameraLookAheadMinSeconds,
    cameraLookAheadMaxSeconds,
    speedProgress,
  )

  return clampNumber(
    Math.min(desiredLead, context.remainingSeconds),
    0,
    cameraLookAheadMaxSeconds,
  )
}

function getCameraLookAheadCoordinate(
  legs: PositionedRoutedLeg[],
  currentTime: number,
  currentCoordinate: RouteCoordinate,
  context: RouteMotionContext,
) {
  const lookAheadSeconds = getCameraLookAheadSeconds(context)
  if (lookAheadSeconds <= 0) {
    return currentCoordinate
  }

  return getRouteCoordinateAtTime(legs, currentTime + lookAheadSeconds) ?? currentCoordinate
}

function getCameraFocusCoordinate(
  legs: PositionedRoutedLeg[],
  currentTime: number,
  currentCoordinate: RouteCoordinate,
  context: RouteMotionContext,
) {
  const lookAheadCoordinate = getCameraLookAheadCoordinate(legs, currentTime, currentCoordinate, context)
  const lookAheadDistanceKm = haversineDistance(currentCoordinate, lookAheadCoordinate)
  if (context.isStationary || lookAheadDistanceKm <= 0.02) {
    return currentCoordinate
  }

  const speedProgress = clampNumber(
    context.speedKmPerSecond / cameraLookAheadFullSpeedKmPerSecond,
    0,
    1,
  )
  const distanceProgress = clampNumber(lookAheadDistanceKm / 3, 0, 1)
  const lookAheadWeight = clampNumber(
    0.16 + speedProgress * 0.18 + distanceProgress * 0.12,
    0.16,
    cameraLookAheadMaxWeight,
  )

  return interpolateCoordinate(currentCoordinate, lookAheadCoordinate, lookAheadWeight)
}

function getCameraSpeedProgress(context: RouteMotionContext) {
  if (context.isStationary || context.speedKmPerSecond <= 0) {
    return 0
  }

  const speedProgress = clampNumber(
    (context.speedKmPerSecond - fastRoadZoomStartSpeedKmPerSecond) /
      (fastRoadZoomFullSpeedKmPerSecond - fastRoadZoomStartSpeedKmPerSecond),
    0,
    1,
  )

  return speedProgress * speedProgress * (3 - 2 * speedProgress)
}

function getCameraDepartureProgress(
  legs: PositionedRoutedLeg[],
  currentTime: number,
  context = getRouteMotionContext(legs, currentTime),
) {
  if (!context.leg || context.isStationary) {
    return 0
  }

  const activeLegIndex = getRouteLegIndexAtTime(legs, currentTime)
  const previousLeg = activeLegIndex > 0 ? legs[activeLegIndex - 1] : null
  const followsStop = Boolean(
    !previousLeg ||
      previousLeg.isStationary ||
      previousLeg.totalDistance <= 0.02,
  )
  if (!followsStop) {
    return 1
  }

  const elapsedSeconds = clampNumber(
    currentTime - context.leg.fromTime,
    0,
    cameraDepartureSyncSeconds,
  )
  const progress = elapsedSeconds / cameraDepartureSyncSeconds
  return progress * progress * (3 - 2 * progress)
}

function getPlannedCameraSpeedProgress(
  legs: PositionedRoutedLeg[],
  currentTime: number,
) {
  const bounds = getRouteTimeBounds(legs)
  if (!bounds) {
    return 0
  }

  if (currentTime >= bounds.end) {
    return 0
  }

  const scheduledTime = clampNumber(currentTime, bounds.start, bounds.end)
  let plannedSpeedProgress = getCameraSpeedProgress(
    getRouteMotionContext(legs, scheduledTime),
  )
  const activeLegIndex = getRouteLegIndexAtTime(legs, scheduledTime)
  const predictionEndTime = scheduledTime + cameraSpeedPredictionSeconds

  // Fixed-time samples alone can skip a very short, very fast timestamp leg.
  // Check a small bounded set of adjacent scheduled legs as well. The active-leg
  // lookup stays logarithmic and this work is cached in the camera timeline.
  for (
    let legIndex = activeLegIndex;
    legIndex >= 0 &&
    legIndex < legs.length &&
    legIndex <= activeLegIndex + cameraSpeedPredictionLegLookAhead;
    legIndex += 1
  ) {
    const leg = legs[legIndex]
    if (leg.fromTime > predictionEndTime) {
      break
    }

    const durationSeconds = Math.max(leg.toTime - leg.fromTime, 1)
    const isStationary = Boolean(leg.isStationary || leg.totalDistance <= 0.02)
    const futureSpeedProgress = getCameraSpeedProgress({
      leg,
      progress: 0,
      remainingSeconds: durationSeconds,
      durationSeconds,
      distanceKm: leg.totalDistance,
      speedKmPerSecond: isStationary ? 0 : leg.totalDistance / durationSeconds,
      isStationary,
    })
    const anticipationProgress = clampNumber(
      Math.max(leg.fromTime - scheduledTime, 0) / cameraSpeedPredictionSeconds,
      0,
      1,
    )
    const anticipationWeight = interpolateNumber(
      1,
      cameraSpeedPredictionMinWeight,
      anticipationProgress,
    )
    plannedSpeedProgress = Math.max(
      plannedSpeedProgress,
      futureSpeedProgress * anticipationWeight,
    )
  }

  for (let index = 1; index <= cameraSpeedPredictionSampleCount; index += 1) {
    const predictionProgress = index / cameraSpeedPredictionSampleCount
    const sampleTime = Math.min(
      scheduledTime + cameraSpeedPredictionSeconds * predictionProgress,
      bounds.end,
    )
    const futureSpeedProgress = getCameraSpeedProgress(
      getRouteMotionContext(legs, sampleTime),
    )
    const anticipationWeight = interpolateNumber(
      1,
      cameraSpeedPredictionMinWeight,
      predictionProgress,
    )

    plannedSpeedProgress = Math.max(
      plannedSpeedProgress,
      futureSpeedProgress * anticipationWeight,
    )

    if (sampleTime >= bounds.end) {
      break
    }
  }

  return clampNumber(plannedSpeedProgress, 0, 1)
}

function getMotionWindowCoordinates(legs: PositionedRoutedLeg[], currentTime: number) {
  if (legs.length === 0) {
    return []
  }

  const firstTime = legs[0].fromTime
  const lastTime = legs[legs.length - 1].toTime
  const startTime = clampNumber(currentTime - dynamicCameraLookBehindSeconds, firstTime, lastTime)
  const endTime = clampNumber(currentTime + dynamicCameraLookAheadSeconds, firstTime, lastTime)
  const coordinates: RouteCoordinate[] = []

  if (endTime <= startTime) {
    const coordinate = getRouteCoordinateAtTime(legs, currentTime)
    return coordinate ? [coordinate] : []
  }

  for (let index = 0; index <= dynamicCameraSampleCount; index += 1) {
    const sampleTime = startTime + ((endTime - startTime) * index) / dynamicCameraSampleCount
    const coordinate = getRouteCoordinateAtTime(legs, sampleTime)

    if (coordinate) {
      coordinates.push(coordinate)
    }
  }

  const currentCoordinate = getRouteCoordinateAtTime(legs, currentTime)
  if (currentCoordinate) {
    coordinates.push(currentCoordinate)
  }

  return coordinates
}

function buildCameraBounds(coordinates: RouteCoordinate[]) {
  if (coordinates.length === 0) {
    return null
  }

  const bounds = new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
  coordinates.slice(1).forEach((coordinate) => bounds.extend(coordinate))

  const west = bounds.getWest()
  const east = bounds.getEast()
  const south = bounds.getSouth()
  const north = bounds.getNorth()
  const center = bounds.getCenter()
  const minSpan = 0.002

  if (Math.abs(east - west) < minSpan) {
    bounds.extend([center.lng - minSpan / 2, center.lat])
    bounds.extend([center.lng + minSpan / 2, center.lat])
  }

  if (Math.abs(north - south) < minSpan) {
    bounds.extend([center.lng, center.lat - minSpan / 2])
    bounds.extend([center.lng, center.lat + minSpan / 2])
  }

  return bounds
}

function getCameraPadding(map: mapboxgl.Map, paddingRatio: number) {
  const container = map.getContainer()

  return {
    top: container.clientHeight * paddingRatio,
    bottom: container.clientHeight * paddingRatio,
    left: container.clientWidth * paddingRatio,
    right: container.clientWidth * paddingRatio,
  }
}

function getRouteCoordinateFromMapCenter(center: mapboxgl.LngLatLike | undefined, fallback: RouteCoordinate): RouteCoordinate {
  if (!center) {
    return fallback
  }

  if (Array.isArray(center) && typeof center[0] === "number" && typeof center[1] === "number") {
    return [center[0], center[1]]
  }

  if (typeof center === "object" && "lng" in center && "lat" in center) {
    return [Number(center.lng), Number(center.lat)]
  }

  if (typeof center === "object" && "lon" in center && "lat" in center) {
    return [Number(center.lon), Number(center.lat)]
  }

  return fallback
}

function getCameraTargetForCoordinates(
  map: mapboxgl.Map,
  coordinates: RouteCoordinate[],
  fallbackCenter: RouteCoordinate,
  fallbackZoom: number,
  paddingRatio: number,
  maxZoom = dynamicCameraMaxZoom,
  minZoom = dynamicCameraMinZoom,
): CameraTarget | null {
  const bounds = buildCameraBounds(coordinates)
  if (!bounds) {
    return null
  }

  const boundsCenter = bounds.getCenter()
  const fallbackBoundsCenter: RouteCoordinate = [boundsCenter.lng, boundsCenter.lat]
  const camera = map.cameraForBounds(bounds, {
    padding: getCameraPadding(map, paddingRatio),
    maxZoom,
  })

  const center = getRouteCoordinateFromMapCenter(camera?.center, fallbackBoundsCenter)
  const zoom = typeof camera?.zoom === "number" ? camera.zoom : fallbackZoom

  return {
    center: Number.isFinite(center[0]) && Number.isFinite(center[1]) ? center : fallbackCenter,
    zoom: clampNumber(zoom, minZoom, dynamicCameraMaxZoom),
  }
}

function getFlightOverviewCameraTarget(
  map: mapboxgl.Map,
  legs: PositionedRoutedLeg[],
  currentTime: number,
  currentCoordinate: RouteCoordinate,
  fallbackZoom: number,
) {
  const flightLeg = getFlightOverviewSegment(legs, currentTime)
  if (!flightLeg || flightLeg.coordinates.length < 2) {
    return null
  }

  const flightStart = flightLeg.coordinates[0]
  const flightEnd = flightLeg.coordinates[flightLeg.coordinates.length - 1]
  const fallbackCenter = interpolateCoordinate(flightStart, flightEnd, 0.5)
  const target = getCameraTargetForCoordinates(
    map,
    flightLeg.coordinates,
    fallbackCenter,
    fallbackZoom,
    flightOverviewPaddingRatio,
    sharedFlightCameraMotion.maxZoom,
    map.getMinZoom(),
  )

  const landingApproachProgress = getFlightLandingApproachProgress(flightLeg, currentTime)
  const landingApproachZoom = Math.max(
    target?.zoom ?? map.getMinZoom(),
    Math.min(map.getMaxZoom(), sharedFlightCameraMotion.landingApproachZoom),
  )
  const landingApproachTarget =
    target && landingApproachProgress > 0
      ? getCameraTargetForCoordinates(
          map,
          [currentCoordinate, flightEnd],
          flightEnd,
          landingApproachZoom,
          flightOverviewPaddingRatio,
          landingApproachZoom,
          map.getMinZoom(),
        )
      : null
  const landingCenterProgress = Math.sqrt(landingApproachProgress)
  const landingZoomProgress = clampNumber(
    (landingApproachProgress - 0.18) / 0.82,
    0,
    1,
  )
  const easedLandingZoomProgress =
    landingZoomProgress * landingZoomProgress * (3 - 2 * landingZoomProgress)

  return target
    ? ({
        ...target,
        // Move the camera toward the airport before tightening the zoom. This
        // keeps the landing point visible throughout the final approach instead
        // of zooming into the trailing midpoint and panning to the airport later.
        center: landingApproachTarget
          ? interpolateCoordinate(
              target.center,
              flightEnd,
              landingCenterProgress,
            )
          : target.center,
        zoom: landingApproachTarget
          ? interpolateNumber(
              target.zoom,
              landingApproachTarget.zoom,
              easedLandingZoomProgress,
            )
          : target.zoom,
        mode: "flight-overview",
      } satisfies CameraTarget)
    : null
}

function getRapidLandOverviewCameraTarget(
  map: mapboxgl.Map,
  legs: PositionedRoutedLeg[],
  currentTime: number,
  currentCoordinate: RouteCoordinate,
  fallbackZoom: number,
) {
  const rapidLandLeg = getRapidLandOverviewSegment(legs, currentTime)
  if (!rapidLandLeg || rapidLandLeg.coordinates.length < 2) {
    return null
  }

  const target = getCameraTargetForCoordinates(
    map,
    rapidLandLeg.coordinates,
    currentCoordinate,
    fallbackZoom,
    rapidLandOverviewPaddingRatio,
    sharedRapidLandCameraMotion.maxZoom,
    Math.max(map.getMinZoom(), sharedRapidLandCameraMotion.minZoom),
  )

  return target
    ? ({
        // Hold the full rapid leg in one viewport. The traveler remains tied
        // directly to video time, but Mapbox no longer loads every intermediate
        // region just because the camera was following it frame by frame.
        center: target.center,
        zoom: clampNumber(
          target.zoom,
          Math.max(map.getMinZoom(), sharedRapidLandCameraMotion.minZoom),
          Math.min(map.getMaxZoom(), sharedRapidLandCameraMotion.maxZoom),
        ),
        mode: "rapid-land-overview",
      } satisfies CameraTarget)
    : null
}

function getCameraMovementZoomOutOffset(distanceKm: number) {
  if (!Number.isFinite(distanceKm) || distanceKm <= cameraMovementZoomOutMinDistanceKm) {
    return 0
  }

  return clampNumber(
    Math.log2(distanceKm - cameraMovementZoomOutMinDistanceKm + 1) * cameraMovementZoomOutScale,
    0,
    cameraMovementMaxZoomOutOffset,
  )
}

function getDynamicCameraZoom(
  map: mapboxgl.Map,
  legs: PositionedRoutedLeg[],
  currentTime: number,
  fallbackZoom = defaultFollowZoom,
) {
  const motionContext = getRouteMotionContext(legs, currentTime)
  const shouldFrameActiveShortLandLeg = Boolean(
    motionContext.leg &&
      motionContext.leg.routeKind !== "flight" &&
      !motionContext.isStationary &&
      motionContext.distanceKm < shortLandLegMaxDistanceKm,
  )
  const shortLandLegCoordinates = shouldFrameActiveShortLandLeg
    ? [
        motionContext.leg!.coordinates[0],
        motionContext.leg!.coordinates[motionContext.leg!.coordinates.length - 1],
      ]
    : null
  const target = getCameraTargetForCoordinates(
    map,
    shortLandLegCoordinates ?? getMotionWindowCoordinates(legs, currentTime),
    getRouteCoordinateAtTime(legs, currentTime) ?? [map.getCenter().lng, map.getCenter().lat],
    fallbackZoom,
    shouldFrameActiveShortLandLeg
      ? shortLandLegPaddingRatio
      : dynamicCameraViewportPaddingRatio,
  )

  if (!target) {
    return clampNumber(fallbackZoom, dynamicCameraMinZoom, dynamicCameraMaxZoom)
  }

  return target.zoom
}

function isStopPointFocusTime(keyframes: Keyframe[], currentTime: number) {
  return keyframes.some((keyframe, index) => {
    if (keyframe.pointType !== "stop") {
      return false
    }

    const nextKeyframe = keyframes[index + 1]
    const configuredStopEndTime =
      typeof keyframe.stopEndTime === "number" && keyframe.stopEndTime > keyframe.time
        ? keyframe.stopEndTime
        : (nextKeyframe?.time ?? keyframe.time + finalStopPointFocusDurationSeconds)
    const stopEndTime = nextKeyframe
      ? Math.min(configuredStopEndTime, nextKeyframe.time)
      : configuredStopEndTime

    return (
      currentTime >= keyframe.time - stopPointFocusLeadSeconds &&
      currentTime <= Math.max(stopEndTime, keyframe.time + stopPointFocusLeadSeconds)
    )
  })
}

function getTravelPointDensityProgress(keyframes: Keyframe[], coordinate: RouteCoordinate) {
  const densityWeight = keyframes.reduce((weight, keyframe) => {
    const distanceKm = haversineDistance(coordinate, [keyframe.lng, keyframe.lat])
    const proximity = clampNumber(1 - distanceKm / travelPointDensityRadiusKm, 0, 1)
    const easedProximity = proximity * proximity * (3 - 2 * proximity)
    return weight + easedProximity
  }, 0)

  return clampNumber(
    (densityWeight - 1) / Math.max(travelPointDensityFullCount - 1, 1),
    0,
    1,
  )
}

function getContextualFollowZoom(
  map: mapboxgl.Map,
  legs: PositionedRoutedLeg[],
  keyframes: Keyframe[],
  currentTime: number,
  currentCoordinate: RouteCoordinate,
  automaticZoom: number,
  plannedSpeedProgress: number,
) {
  const motionContext = getRouteMotionContext(legs, currentTime)
  const isStopPoint =
    Boolean(motionContext.leg && motionContext.isStationary) ||
    isStopPointFocusTime(keyframes, currentTime)
  const mobileBoost = map.getContainer().clientWidth <= 640 ? mobileFollowZoomBoost : 0

  if (isStopPoint) {
    const stopZoom = clampNumber(
      stopPointFollowZoom + mobileBoost,
      dynamicCameraMinZoom,
      dynamicCameraMaxZoom,
    )
    if (!motionContext.isStationary || plannedSpeedProgress <= 0.01) {
      return stopZoom
    }

    // A stopped traveler should remain the focus, but an already-scheduled fast
    // departure needs visual preparation. The speed signal comes from the cached
    // camera timeline, so this transition adds no route scanning to the frame loop.
    const departureSpeedZoom = interpolateNumber(
      roadFollowMaxZoom,
      fastRoadFollowMinZoom,
      plannedSpeedProgress,
    )
    const departureFitZoom = clampNumber(
      automaticZoom,
      dynamicCameraMinZoom,
      roadFollowMaxZoom,
    )
    const departureZoom = Math.min(
      stopZoom,
      interpolateNumber(departureFitZoom, departureSpeedZoom, speedTargetZoomWeight) +
        mobileBoost,
    )
    const departureProgress =
      plannedSpeedProgress *
      plannedSpeedProgress *
      (3 - 2 * plannedSpeedProgress)

    return clampNumber(
      interpolateNumber(stopZoom, departureZoom, departureProgress),
      dynamicCameraMinZoom,
      dynamicCameraMaxZoom,
    )
  }

  if (motionContext.leg?.routeKind === "flight") {
    return clampNumber(automaticZoom, dynamicCameraMinZoom, defaultFollowZoom + mobileBoost)
  }

  if (
    motionContext.leg &&
    !motionContext.isStationary &&
    motionContext.distanceKm < shortLandLegMaxDistanceKm
  ) {
    return clampNumber(automaticZoom + mobileBoost, dynamicCameraMinZoom, dynamicCameraMaxZoom)
  }

  const densityProgress = getTravelPointDensityProgress(keyframes, currentCoordinate)
  const densityZoom = interpolateNumber(
    roadFollowMinZoom,
    denseTravelPointMaxZoom,
    densityProgress,
  )
  const speedTargetZoom = interpolateNumber(
    roadFollowMaxZoom,
    fastRoadFollowMinZoom,
    plannedSpeedProgress,
  )
  const fitZoom = clampNumber(automaticZoom, dynamicCameraMinZoom, roadFollowMaxZoom)
  const movementZoom = interpolateNumber(fitZoom, speedTargetZoom, speedTargetZoomWeight)
  const densityInfluence = interpolateNumber(
    1,
    fastMovementDensityRetention,
    plannedSpeedProgress * (2 - plannedSpeedProgress),
  )
  const densityAwareZoom = interpolateNumber(
    movementZoom,
    Math.max(movementZoom, densityZoom),
    densityInfluence,
  )
  const motionWindowZoomCeiling = interpolateNumber(
    dynamicCameraMaxZoom,
    fitZoom + fastMovementAutomaticFitTolerance,
    plannedSpeedProgress,
  )

  return clampNumber(
    Math.min(densityAwareZoom, motionWindowZoomCeiling) + mobileBoost,
    dynamicCameraMinZoom,
    dynamicCameraMaxZoom,
  )
}

function getStabilizedContextualZoom(
  previous: ContextualZoomCacheEntry | null,
  rawZoom: number,
  currentTime: number,
  legs: PositionedRoutedLeg[],
  keyframes: Keyframe[],
) {
  if (!previous || previous.legs !== legs || previous.keyframes !== keyframes) {
    return rawZoom
  }

  const elapsedSeconds = currentTime - previous.time
  if (elapsedSeconds <= 0 || elapsedSeconds >= contextualZoomSeekResetSeconds) {
    return rawZoom
  }

  const zoomDelta = rawZoom - previous.zoom
  if (Math.abs(zoomDelta) <= contextualZoomTargetDeadband) {
    return previous.zoom
  }

  const smoothingSeconds =
    rawZoom < previous.zoom
      ? contextualZoomOutTargetSmoothingSeconds
      : contextualZoomTargetSmoothingSeconds
  const smoothing =
    1 -
    Math.exp(
      -Math.max(elapsedSeconds, contextualZoomRefreshSeconds) /
        smoothingSeconds,
    )

  return previous.zoom + zoomDelta * smoothing
}

function getDynamicCameraTarget(
  map: mapboxgl.Map,
  legs: PositionedRoutedLeg[],
  currentTime: number,
  currentCoordinate: RouteCoordinate,
  fallbackZoom = defaultFollowZoom,
): CameraTarget {
  const motionContext = getRouteMotionContext(legs, currentTime)
  const focusCoordinate = getCameraFocusCoordinate(legs, currentTime, currentCoordinate, motionContext)

  return {
    center: focusCoordinate,
    zoom: getDynamicCameraZoom(map, legs, currentTime, fallbackZoom),
    mode: "follow",
  }
}

function getActiveFlightMotion(legs: PositionedRoutedLeg[], currentTime: number) {
  const context = getRouteMotionContext(legs, currentTime)
  if (!context.leg || context.leg.routeKind !== "flight" || context.isStationary) {
    return null
  }

  return {
    leg: context.leg,
    progress: context.progress,
  }
}

function getRoutePreloadTimes(legs: PositionedRoutedLeg[]) {
  if (legs.length === 0) {
    return [] as number[]
  }

  const firstTime = legs[0].fromTime
  const lastTime = legs[legs.length - 1].toTime
  const duration = Math.max(lastTime - firstTime, 0)
  const times = new Set<number>()

  legs.forEach((leg) => {
    times.add(leg.fromTime)
    times.add(leg.toTime)
    times.add(leg.fromTime + Math.max(leg.toTime - leg.fromTime, 0) / 2)
  })

  if (duration > 0) {
    for (let index = 0; index <= routePreloadSampleCount; index += 1) {
      times.add(firstTime + (duration * index) / routePreloadSampleCount)
    }
  }

  return [...times]
    .filter((time) => Number.isFinite(time))
    .sort((left, right) => left - right)
}

function getFlightPathPreloadTargets(
  map: mapboxgl.Map,
  legs: PositionedRoutedLeg[],
  flightLeg: PositionedRoutedLeg,
) {
  if (
    flightLeg.routeKind !== "flight" ||
    flightLeg.isStationary ||
    flightLeg.coordinates.length < 2
  ) {
    return [] as CameraTarget[]
  }

  const overviewTarget = getFlightOverviewCameraTarget(
    map,
    legs,
    flightLeg.fromTime,
    flightLeg.coordinates[0],
    map.getZoom(),
  )
  if (!overviewTarget) {
    return [] as CameraTarget[]
  }

  const preloadZoom = clampNumber(
    overviewTarget.zoom,
    map.getMinZoom(),
    routePreloadMaxZoom,
  )
  let landingCenter = flightLeg.coordinates[flightLeg.coordinates.length - 1]
  let landingZoom = Math.min(defaultFollowZoom, routePreloadMaxZoom)

  const flightIndex = legs.indexOf(flightLeg)
  const landingLeg = flightIndex >= 0 ? legs[flightIndex + 1] : null
  if (landingLeg) {
    const landingSampleTime = Math.min(
      landingLeg.fromTime + 0.25,
      landingLeg.toTime,
    )
    const landingCoordinate = getRouteCoordinateAtTime(legs, landingSampleTime)
    if (landingCoordinate) {
      const landingTarget = getDynamicCameraTarget(
        map,
        legs,
        landingSampleTime,
        landingCoordinate,
        defaultFollowZoom,
      )
      landingCenter = landingTarget.center
      landingZoom = clampNumber(
        landingTarget.zoom,
        landingTarget.mode === "flight-overview" ||
          landingTarget.mode === "rapid-land-overview"
          ? map.getMinZoom()
          : dynamicCameraMinZoom,
        routePreloadMaxZoom,
      )
    }
  }

  const flightTargets = getFlightCameraPreloadTargets({
      overview: { center: overviewTarget.center, zoom: preloadZoom },
      takeoffCenter: flightLeg.coordinates[0],
      landingCenter,
      takeoffZoom: Math.min(defaultFollowZoom, routePreloadMaxZoom),
      landingZoom,
    }).map<CameraTarget>((target, index) => ({
      center: [target.center[0], target.center[1]] as RouteCoordinate,
      zoom: clampNumber(target.zoom, map.getMinZoom(), routePreloadMaxZoom),
      mode: index === 0 ? "flight-overview" : "follow",
    }))
  const rapidLandingTargets =
    landingLeg && isRapidLandNavigationSegment(landingLeg)
      ? getRapidLandPathPreloadTargets(map, legs, landingLeg)
      : []

  return dedupeRoutePreloadTargets([...flightTargets, ...rapidLandingTargets])
}

function getInitialFlightPreloadTargets(
  map: mapboxgl.Map,
  legs: PositionedRoutedLeg[],
) {
  const firstFlight = legs.find(
    (leg) =>
      leg.routeKind === "flight" &&
      !leg.isStationary &&
      leg.coordinates.length >= 2,
  )

  return firstFlight
    ? getFlightPathPreloadTargets(map, legs, firstFlight)
    : []
}

function getRapidLandPathPreloadTargets(
  map: mapboxgl.Map,
  legs: PositionedRoutedLeg[],
  rapidLandLeg: PositionedRoutedLeg,
) {
  if (
    !isRapidLandNavigationSegment(rapidLandLeg)
  ) {
    return [] as CameraTarget[]
  }

  const sampleTimes = [
    rapidLandLeg.fromTime,
    rapidLandLeg.fromTime + (rapidLandLeg.toTime - rapidLandLeg.fromTime) / 2,
    rapidLandLeg.toTime,
  ]
  return dedupeRoutePreloadTargets(
    sampleTimes.flatMap((sampleTime): CameraTarget[] => {
      const coordinate = getRouteCoordinateAtTime(legs, sampleTime)
      if (!coordinate) {
        return []
      }

      const target = getRapidLandOverviewCameraTarget(
        map,
        legs,
        sampleTime,
        coordinate,
        map.getZoom(),
      )
      return target ? [target] : []
    }),
  )
}

function dedupeRoutePreloadTargets(targets: CameraTarget[]) {
  const seenTargets = new Set<string>()

  return targets.filter((target) => {
    const key = `${target.center[0].toFixed(4)}:${target.center[1].toFixed(4)}:${target.zoom.toFixed(1)}`
    if (seenTargets.has(key)) {
      return false
    }

    seenTargets.add(key)
    return true
  })
}

function getRoutePreloadTargets(map: mapboxgl.Map, legs: PositionedRoutedLeg[]) {
  const targets = getRoutePreloadTimes(legs).flatMap((time) => {
    const coordinate = getRouteCoordinateAtTime(legs, time)
    if (!coordinate) {
      return []
    }

    const target = getDynamicCameraTarget(map, legs, time, coordinate, map.getZoom())
    return [
      {
        center: target.center,
        zoom: clampNumber(
          target.zoom,
          target.mode === "flight-overview" || target.mode === "rapid-land-overview"
            ? map.getMinZoom()
            : dynamicCameraMinZoom,
          routePreloadMaxZoom,
        ),
        mode: target.mode,
      },
    ]
  })
  const flightTargets = legs.flatMap((leg) =>
    getFlightPathPreloadTargets(map, legs, leg),
  )
  const rapidLandTargets = legs.flatMap((leg) =>
    getRapidLandPathPreloadTargets(map, legs, leg),
  )

  return dedupeRoutePreloadTargets([...flightTargets, ...rapidLandTargets, ...targets])
}

function getPlaybackRoutePreloadTargets(
  map: mapboxgl.Map,
  legs: PositionedRoutedLeg[],
  keyframes: Keyframe[],
  cameraTimeline: CameraTimelineEntry[],
  currentTime: number,
  policy = readMapPreloadPolicy(),
) {
  const bounds = getRouteTimeBounds(legs)
  if (!bounds || currentTime >= bounds.end || policy.samples === 0) {
    return [] as CameraTarget[]
  }

  const windowStart = clampNumber(currentTime, bounds.start, bounds.end)
  const windowEnd = Math.min(windowStart + policy.seconds, bounds.end)
  const times = new Set<number>()

  // Warm imminent views first so distant tiles cannot displace the next view.
  for (let index = 1; index <= policy.samples; index += 1) {
    times.add(
      windowStart +
        ((windowEnd - windowStart) * index) / policy.samples,
    )
  }

  const seenTargets = new Set<string>()
  const playbackTargets = [...times].flatMap((time): CameraTarget[] => {
    const coordinate = getRouteCoordinateAtTime(legs, time)
    if (!coordinate) {
      return []
    }

    const timelineTarget = getCameraTimelineTargetAtTime(cameraTimeline, time)
    const automaticTarget: AutomaticCameraTarget = timelineTarget
      ? {
          center: timelineTarget.center,
          zoom: timelineTarget.zoom,
          mode: timelineTarget.mode,
          speedProgress: timelineTarget.speedProgress,
          departureProgress: timelineTarget.departureProgress,
        }
      : {
          ...getDynamicCameraTarget(map, legs, time, coordinate, map.getZoom()),
          speedProgress: getPlannedCameraSpeedProgress(legs, time),
          departureProgress: getCameraDepartureProgress(legs, time),
        }
    const isOverview =
      automaticTarget.mode === "flight-overview" ||
      automaticTarget.mode === "rapid-land-overview"
    const contextualZoom = isOverview
      ? automaticTarget.zoom
      : getContextualFollowZoom(
          map,
          legs,
          keyframes,
          time,
          coordinate,
          automaticTarget.zoom,
          automaticTarget.speedProgress,
        )
    const center = isOverview
      ? automaticTarget.center
      : interpolateCoordinate(
          coordinate,
          automaticTarget.center,
          interpolateNumber(
            cameraCenterLeadMinWeight,
            cameraCenterLeadMaxWeight,
            automaticTarget.speedProgress,
          ) * automaticTarget.departureProgress,
        )
    const target = {
      center,
      zoom: clampNumber(
        contextualZoom,
        isOverview ? map.getMinZoom() : dynamicCameraMinZoom,
        playbackRoutePreloadMaxZoom,
      ),
      mode: automaticTarget.mode,
    }
    const key = `${target.center[0].toFixed(4)}:${target.center[1].toFixed(4)}:${target.zoom.toFixed(1)}`
    if (seenTargets.has(key)) {
      return []
    }

    seenTargets.add(key)
    return [target]
  })
  return dedupeRoutePreloadTargets(playbackTargets)
}

function interpolateNumber(left: number, right: number, progress: number) {
  return left + (right - left) * progress
}

function interpolateCoordinate(left: RouteCoordinate, right: RouteCoordinate, progress: number): RouteCoordinate {
  return [
    interpolateNumber(left[0], right[0], progress),
    interpolateNumber(left[1], right[1], progress),
  ]
}

function getCameraTimelineTimes(legs: PositionedRoutedLeg[]) {
  if (legs.length === 0) {
    return [] as number[]
  }

  const firstTime = legs[0].fromTime
  const lastTime = legs[legs.length - 1].toTime
  const duration = Math.max(lastTime - firstTime, 0)
  const sampleCount = clampNumber(
    Math.ceil(duration / cameraTimelineTargetSecondsPerSample),
    1,
    cameraTimelineMaxSamples,
  )
  const times = new Set<number>()

  legs.forEach((leg, index) => {
    times.add(leg.fromTime)
    times.add(leg.toTime)
    times.add(leg.fromTime + Math.max(leg.toTime - leg.fromTime, 0) / 2)

    if (leg.routeKind === "flight" && !leg.isStationary) {
      times.add(Math.max(firstTime, leg.fromTime - sharedFlightCameraMotion.preflightLeadSeconds))
      times.add(
        Math.max(
          firstTime,
          leg.fromTime - sharedFlightCameraMotion.preflightLeadSeconds / 2,
        ),
      )

      const approachStart = getFlightLandingApproachStartTime(leg)
      const approachDuration = Math.max(leg.toTime - approachStart, 0)
      times.add(approachStart)
      times.add(approachStart + approachDuration * 0.25)
      times.add(approachStart + approachDuration * 0.5)
      times.add(approachStart + approachDuration * 0.75)
    }

    if (isRapidLandNavigationSegment(leg)) {
      times.add(
        Math.max(
          firstTime,
          leg.fromTime - sharedRapidLandCameraMotion.preframeLeadSeconds,
        ),
      )
      times.add(leg.fromTime)
      times.add(leg.toTime)
      times.add(
        Math.min(
          lastTime,
          leg.toTime + sharedRapidLandCameraMotion.recoverySeconds,
        ),
      )
    }

    const previousLeg = index > 0 ? legs[index - 1] : null
    const isMoving = !leg.isStationary && leg.totalDistance > 0.02
    const followsStop =
      !previousLeg ||
      previousLeg.isStationary ||
      previousLeg.totalDistance <= 0.02
    if (isMoving && followsStop) {
      times.add(Math.min(leg.fromTime + cameraDepartureSyncSeconds, leg.toTime))
    }
  })

  if (duration > 0) {
    for (let index = 0; index <= sampleCount; index += 1) {
      times.add(firstTime + (duration * index) / sampleCount)
    }
  }

  return [...times]
    .filter((time) => Number.isFinite(time))
    .sort((left, right) => left - right)
}

function buildCameraTimeline(map: mapboxgl.Map, legs: PositionedRoutedLeg[]) {
  return getCameraTimelineTimes(legs).flatMap((time): CameraTimelineEntry[] => {
    const coordinate = getRouteCoordinateAtTime(legs, time)
    if (!coordinate) {
      return []
    }

    const target = getDynamicCameraTarget(map, legs, time, coordinate, map.getZoom())
    return [
      {
        time,
        coordinate,
        center: target.center,
        zoom: target.zoom,
        mode: target.mode,
        speedProgress: getPlannedCameraSpeedProgress(legs, time),
        departureProgress: getCameraDepartureProgress(legs, time),
      },
    ]
  })
}

function getCameraTimelineTargetAtTime(timeline: CameraTimelineEntry[], currentTime: number) {
  if (timeline.length === 0) {
    return null
  }

  if (timeline.length === 1 || currentTime <= timeline[0].time) {
    return timeline[0]
  }

  const lastEntry = timeline[timeline.length - 1]
  if (currentTime >= lastEntry.time) {
    return lastEntry
  }

  let low = 1
  let high = timeline.length - 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (timeline[middle].time >= currentTime) {
      high = middle
    } else {
      low = middle + 1
    }
  }

  const nextIndex = low
  const previousEntry = timeline[nextIndex - 1]
  const nextEntry = timeline[nextIndex]
  const progress = clampNumber(
    (currentTime - previousEntry.time) / Math.max(nextEntry.time - previousEntry.time, 0.001),
    0,
    1,
  )

  return {
    time: currentTime,
    coordinate: interpolateCoordinate(previousEntry.coordinate, nextEntry.coordinate, progress),
    center: interpolateCoordinate(previousEntry.center, nextEntry.center, progress),
    zoom: interpolateNumber(previousEntry.zoom, nextEntry.zoom, progress),
    mode:
      previousEntry.mode === "flight-overview" || nextEntry.mode === "flight-overview"
        ? "flight-overview"
        : previousEntry.mode === "rapid-land-overview" ||
            nextEntry.mode === "rapid-land-overview"
          ? "rapid-land-overview"
        : "follow",
    speedProgress: interpolateNumber(
      previousEntry.speedProgress,
      nextEntry.speedProgress,
      progress,
    ),
    departureProgress: interpolateNumber(
      previousEntry.departureProgress,
      nextEntry.departureProgress,
      progress,
    ),
  } satisfies CameraTimelineEntry
}

function buildRouteFeatureCollection(segments: RouteFeatureSegment[]) {
  return {
    type: "FeatureCollection" as const,
    features: segments
      .filter((segment) => segment.coordinates.length >= 2)
      .map((segment) => ({
        type: "Feature" as const,
        properties: { routeKind: segment.routeKind },
        geometry: {
          type: "LineString" as const,
          coordinates: segment.coordinates,
        },
      })),
  }
}

function isFiniteCoordinateValue(value: number) {
  return Number.isFinite(value)
}

function isValidKeyframe(keyframe: Pick<Keyframe, "lat" | "lng" | "time">) {
  return (
    isFiniteCoordinateValue(keyframe.time) &&
    isFiniteCoordinateValue(keyframe.lat) &&
    isFiniteCoordinateValue(keyframe.lng) &&
    Math.abs(keyframe.lat) <= 90 &&
    Math.abs(keyframe.lng) <= 180
  )
}

function getFallbackKeyframe(currentTime = 0): Keyframe {
  return {
    time: currentTime,
    lat: 0,
    lng: 0,
    location: "Route unavailable",
    description: "Add valid route points to render the live map.",
  }
}

function isPointWithinMapViewport(
  map: mapboxgl.Map,
  coordinate: RouteCoordinate,
  padding:
    | number
    | {
        top?: number
        right?: number
        bottom?: number
        left?: number
      } = 0,
) {
  if (!hasUsableMapSize(map)) {
    return false
  }

  const container = map.getContainer()
  const point = map.project(coordinate)
  const resolvedPadding =
    typeof padding === "number"
      ? {
          top: padding,
          right: padding,
          bottom: padding,
          left: padding,
        }
      : padding

  return (
    point.x >= (resolvedPadding.left ?? 0) &&
    point.x <= container.clientWidth - (resolvedPadding.right ?? 0) &&
    point.y >= (resolvedPadding.top ?? 0) &&
    point.y <= container.clientHeight - (resolvedPadding.bottom ?? 0)
  )
}

function runWhenStyleReady(map: mapboxgl.Map, callback: () => void) {
  if (map.isStyleLoaded()) {
    callback()
    return
  }

  map.once("style.load", callback)
}

function hasUsableMapSize(map: mapboxgl.Map) {
  const container = map.getContainer()
  return container.clientWidth > 0 && container.clientHeight > 0
}

function canUpdateCamera(map: mapboxgl.Map) {
  // isStyleLoaded also waits for source tiles. Camera transforms must continue
  // while tiles load, otherwise each new viewport stalls video tracking.
  return hasUsableMapSize(map)
}

function hasOriginalMapEvent(event: unknown) {
  return Boolean(
    typeof event === "object" &&
      event !== null &&
      "originalEvent" in event &&
      (event as { originalEvent?: unknown }).originalEvent,
  )
}

export function MapboxTravelMap({
  keyframes,
  markerKeyframes,
  routeShapes,
  currentKeyframe,
  liveCurrentTimeRef,
  isPlaying = true,
  isJourneyComplete = false,
  followZoomPreferenceKey,
  autoResumeTracking = true,
  trackingResumeDelayMs = manualCameraOverrideDurationMs,
  onLocationClick,
  className = "w-full h-full",
}: MapboxTravelMapProps) {
  if (hasMapboxAccessToken) {
    mapboxgl.accessToken = mapboxAccessToken
  }

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null)
  const routePreloadTimerRef = useRef<number | null>(null)
  const routePreloadIdleCleanupRef = useRef<(() => void) | null>(null)
  const routePreloadQueueRef = useRef<CameraTarget[]>([])
  const routePreloadSignatureRef = useRef("")
  const routePreloadGenerationRef = useRef(0)
  const markerRef = useRef<mapboxgl.Marker | null>(null)
  const flightAirplaneMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const isFlightAirplaneActiveRef = useRef(false)
  const travelerMarkerSizeRef = useRef<string | null>(null)
  const keyframeMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const keyframeMarkerElementsRef = useRef<Map<string, { element: HTMLButtonElement; time: number }>>(new Map())
  const reachedKeyframeMarkersRef = useRef<ReachedKeyframeMarker[]>([])
  const visibleKeyframeMarkersSignatureRef = useRef("")
  const highlightedKeyframeKeysRef = useRef<Set<string>>(new Set())
  const keyframeHighlightTimeoutsRef = useRef<Map<string, number>>(new Map())
  const viewportMarkerFrameRef = useRef<number | null>(null)
  const lastViewportMarkerRefreshRef = useRef(0)
  const lastKeyframeMarkerZoomRef = useRef<number | null>(null)
  const previousHighlightTimeRef = useRef<number | null>(null)
  const onLocationClickRef = useRef(onLocationClick)
  const routeIntroAnimationFrameRef = useRef<number | null>(null)
  const routeIntroAutoStartTimerRef = useRef<number | null>(null)
  const startTrackingFromRouteIntroRef = useRef<() => void>(() => {})
  const routeIntroStartedAtRef = useRef<number | null>(null)
  const isRouteIntroActiveRef = useRef(hasMapboxAccessToken)
  const routeIntroDismissedRef = useRef(false)
  const routeIntroAutoStartCancelledRef = useRef(false)
  const keyframesRef = useRef<Keyframe[]>([])
  const markerKeyframesRef = useRef<Keyframe[]>([])
  const routeCoordinatesRef = useRef<RouteCoordinate[]>([])
  const positionedLegsRef = useRef<PositionedRoutedLeg[]>([])
  const cameraTimelineRef = useRef<CameraTimelineEntry[]>([])
  const cameraZoomPlanRef = useRef<CameraZoomWindow[]>([])
  const contextualZoomCacheRef = useRef<ContextualZoomCacheEntry | null>(null)
  const routeLayersReadyRef = useRef(false)
  const routeRevealTimeRef = useRef(0)
  const targetRouteTimeRef = useRef(0)
  const animatedRouteTimeRef = useRef(0)
  const liveRouteCoordinateRef = useRef<RouteCoordinate>([0, 0])
  const targetRouteCoordinateRef = useRef<RouteCoordinate>([0, 0])
  const animatedRouteCoordinateRef = useRef<RouteCoordinate>([0, 0])
  const targetCameraCenterRef = useRef<RouteCoordinate>([0, 0])
  const animatedCameraCenterRef = useRef<RouteCoordinate>([0, 0])
  const targetCameraZoomRef = useRef(defaultFollowZoom)
  const animatedCameraZoomRef = useRef(defaultFollowZoom)
  const targetCameraSpeedProgressRef = useRef(0)
  const targetCameraModeRef = useRef<CameraTarget["mode"]>("follow")
  const followZoomOffsetRef = useRef(readStoredFollowZoomOffset(followZoomPreferenceKey))
  const isAutomatedCameraUpdateRef = useRef(false)
  const isUserZoomingWhileFollowingRef = useRef(false)
  const isPlayingRef = useRef(isPlaying)
  const isJourneyCompleteRef = useRef(isJourneyComplete)
  const animationFrameRef = useRef<number | null>(null)
  const previousAnimationTimestampRef = useRef<number | null>(null)
  const previousPlaybackTimeRef = useRef<number | null>(null)
  const previousPlaybackUpdatedAtRef = useRef<number | null>(null)
  const latestPlaybackTimeRef = useRef(0)
  const targetPlaybackUpdatedAtRef = useRef(0)
  const visualCatchUpUntilRef = useRef(0)
  const lastAnimatedRouteDrawTimestampRef = useRef(0)
  const lastRouteDataReconcileSignatureRef = useRef("")
  const hasFocusedCurrentLocationRef = useRef(false)
  const isFollowingRef = useRef(true)
  const isTrackingEnabledRef = useRef(true)
  const isManualCameraOverrideRef = useRef(false)
  const manualFollowResumeTimerRef = useRef<number | null>(null)
  const autoResumeTrackingRef = useRef(autoResumeTracking)
  const trackingResumeDelayMsRef = useRef(trackingResumeDelayMs)
  const appliedMapStyleRef = useRef<MapStyleOptionId>("streets")
  const isProgrammaticCameraMoveRef = useRef(false)
  const programmaticCameraMoveTimeoutRef = useRef<number | null>(null)
  const programmaticCameraMoveMapRef = useRef<mapboxgl.Map | null>(null)
  const finishProgrammaticCameraMoveRef = useRef<(() => void) | null>(null)
  const trackingLoadingTimeoutRef = useRef<number | null>(null)
  const trackingLoadingMapRef = useRef<mapboxgl.Map | null>(null)
  const finishTrackingLoadingRef = useRef<(() => void) | null>(null)
  const searchAbortRef = useRef<AbortController | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressAutocompleteRef = useRef(false)
  const [mapStyle, setMapStyle] = useState<MapStyleOptionId>("streets")
  const [isLoaded, setIsLoaded] = useState(false)
  const [isTrackingEnabled, setIsTrackingEnabled] = useState(true)
  const [isTrackingLoading, setIsTrackingLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<GeocodingFeature[]>([])
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [routedLegs, setRoutedLegs] = useState<RoutedLeg[]>([])
  const [isRouteResolving, setIsRouteResolving] = useState(false)
  const [isMapOverlayWide, setIsMapOverlayWide] = useState(false)
  const [isRouteIntroActive, setIsRouteIntroActive] = useState(hasMapboxAccessToken)
  const [isRouteIntroAutoStartCancelled, setIsRouteIntroAutoStartCancelled] = useState(false)
  const [routeIntroCountdownCycle, setRouteIntroCountdownCycle] = useState(0)

  isPlayingRef.current = isPlaying
  isJourneyCompleteRef.current = isJourneyComplete

  const updateTrackingEnabled = (enabled: boolean) => {
    isTrackingEnabledRef.current = enabled
    setIsTrackingEnabled(enabled)
  }

  const getPreferredFollowZoom = (automaticZoom: number) => {
    const offset = followZoomOffsetRef.current
    const positiveOffsetScale = clampNumber(
      (automaticZoom - dynamicCameraMinZoom) / 2,
      0.35,
      1,
    )
    const scaledOffset = offset > 0 ? offset * positiveOffsetScale : offset

    return clampNumber(
      automaticZoom + scaledOffset,
      dynamicCameraMinZoom,
      dynamicCameraMaxZoom,
    )
  }

  const getAutomaticCameraTarget = (
    map: mapboxgl.Map,
    legs: PositionedRoutedLeg[],
    currentTime: number,
    currentCoordinate: RouteCoordinate,
    fallbackZoom = defaultFollowZoom,
  ) => {
    const plannedZoom = getCameraPlanZoom(cameraZoomPlanRef.current, currentTime)
    if (plannedZoom !== null) {
      return {
        center: currentCoordinate,
        zoom: plannedZoom,
        mode: "flight-overview",
        speedProgress: 1,
        departureProgress: 1,
      } satisfies AutomaticCameraTarget
    }
    const timelineTarget = getCameraTimelineTargetAtTime(cameraTimelineRef.current, currentTime)
    const automaticTarget: AutomaticCameraTarget = timelineTarget
      ? ({
          center: timelineTarget.center,
          zoom: timelineTarget.zoom,
          mode: timelineTarget.mode,
          speedProgress: timelineTarget.speedProgress,
          departureProgress: timelineTarget.departureProgress,
        } satisfies AutomaticCameraTarget)
      : {
          ...getDynamicCameraTarget(map, legs, currentTime, currentCoordinate, fallbackZoom),
          speedProgress: getPlannedCameraSpeedProgress(legs, currentTime),
          departureProgress: getCameraDepartureProgress(legs, currentTime),
        }
    if (
      automaticTarget.mode === "flight-overview" ||
      automaticTarget.mode === "rapid-land-overview"
    ) {
      contextualZoomCacheRef.current = null
      return automaticTarget
    }

    const activeKeyframes = keyframesRef.current
    const cachedZoom = contextualZoomCacheRef.current
    const canReuseContextualZoom = Boolean(
      cachedZoom &&
        cachedZoom.legs === legs &&
        cachedZoom.keyframes === activeKeyframes &&
        Math.abs(currentTime - cachedZoom.time) < contextualZoomRefreshSeconds &&
        Math.abs(automaticTarget.zoom - cachedZoom.automaticZoom) <
          contextualZoomAutomaticTolerance,
    )
    const rawContextualZoom = canReuseContextualZoom
      ? cachedZoom!.zoom
      : getContextualFollowZoom(
          map,
          legs,
          activeKeyframes,
          currentTime,
          currentCoordinate,
          automaticTarget.zoom,
          automaticTarget.speedProgress,
        )
    const contextualZoom = canReuseContextualZoom
      ? rawContextualZoom
      : getStabilizedContextualZoom(
          cachedZoom,
          rawContextualZoom,
          currentTime,
          legs,
          activeKeyframes,
        )

    if (!canReuseContextualZoom) {
      contextualZoomCacheRef.current = {
        legs,
        keyframes: activeKeyframes,
        time: currentTime,
        automaticZoom: automaticTarget.zoom,
        zoom: contextualZoom,
      }
    }

    return {
      ...automaticTarget,
      zoom: contextualZoom,
    } satisfies AutomaticCameraTarget
  }

  const rebuildCameraTimeline = (map: mapboxgl.Map) => {
    if (!canUpdateCamera(map)) {
      return
    }

    cameraTimelineRef.current = buildCameraTimeline(map, positionedLegsRef.current)
    const container = map.getContainer()
    cameraZoomPlanRef.current = buildCameraZoomPlan(positionedLegsRef.current, {
      width: container.clientWidth, height: container.clientHeight,
      minZoom: map.getMinZoom(), maxZoom: map.getMaxZoom(),
    }, (time) => {
      const coordinate = getRouteCoordinateAtTime(positionedLegsRef.current, time)
      if (!coordinate) return defaultFollowZoom
      return getPreferredFollowZoom(getContextualFollowZoom(
        map, positionedLegsRef.current, keyframesRef.current, time, coordinate,
        getDynamicCameraZoom(map, positionedLegsRef.current, time, defaultFollowZoom),
        getPlannedCameraSpeedProgress(positionedLegsRef.current, time),
      ))
    })
    contextualZoomCacheRef.current = null
  }

  const rememberFollowZoomFromMap = (map: mapboxgl.Map) => {
    if ((!isFollowingRef.current && !isManualCameraOverrideRef.current) || !canUpdateCamera(map)) {
      return false
    }

    const currentZoom = map.getZoom()
    const routeTime = Number.isFinite(animatedRouteTimeRef.current)
      ? animatedRouteTimeRef.current
      : targetRouteTimeRef.current
    const currentCoordinate = animatedRouteCoordinateRef.current ?? liveRouteCoordinateRef.current
    const automaticTarget = getAutomaticCameraTarget(
      map,
      positionedLegsRef.current,
      routeTime,
      currentCoordinate,
      currentZoom,
    )
    if (
      automaticTarget.mode === "flight-overview" ||
      automaticTarget.mode === "rapid-land-overview"
    ) {
      return false
    }

    followZoomOffsetRef.current = clampNumber(
      currentZoom - automaticTarget.zoom,
      followZoomPreferenceMinOffset,
      followZoomPreferenceMaxOffset,
    )
    writeStoredFollowZoomOffset(followZoomPreferenceKey, followZoomOffsetRef.current)
    targetCameraZoomRef.current = getPreferredFollowZoom(automaticTarget.zoom)
    animatedCameraZoomRef.current = currentZoom
    return true
  }

  const runAutomatedCameraUpdate = (update: () => void) => {
    isAutomatedCameraUpdateRef.current = true
    try {
      update()
    } finally {
      window.queueMicrotask(() => {
        isAutomatedCameraUpdateRef.current = false
      })
    }
  }

  const clearManualFollowResume = (clearOverride = true) => {
    if (manualFollowResumeTimerRef.current !== null) {
      window.clearTimeout(manualFollowResumeTimerRef.current)
      manualFollowResumeTimerRef.current = null
    }

    if (clearOverride) {
      isManualCameraOverrideRef.current = false
    }
  }

  const clearRouteIntroFrame = () => {
    if (routeIntroAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(routeIntroAnimationFrameRef.current)
      routeIntroAnimationFrameRef.current = null
    }

    routeIntroStartedAtRef.current = null
  }

  const clearRouteIntroAnimation = (deactivate = true) => {
    clearRouteIntroFrame()

    if (routeIntroAutoStartTimerRef.current !== null) {
      window.clearTimeout(routeIntroAutoStartTimerRef.current)
      routeIntroAutoStartTimerRef.current = null
    }

    if (deactivate) {
      isRouteIntroActiveRef.current = false
      setIsRouteIntroActive(false)
    }
  }

  const cancelRouteIntroAutoStart = () => {
    const hasPendingRouteIntro =
      isRouteIntroActiveRef.current ||
      routeIntroAutoStartTimerRef.current !== null ||
      routeIntroAnimationFrameRef.current !== null
    if (
      !hasPendingRouteIntro ||
      routeIntroDismissedRef.current ||
      routeIntroAutoStartCancelledRef.current
    ) {
      return false
    }

    routeIntroAutoStartCancelledRef.current = true
    setIsRouteIntroAutoStartCancelled(true)
    setRouteIntroCountdownCycle(0)
    if (routeIntroAutoStartTimerRef.current !== null) {
      window.clearTimeout(routeIntroAutoStartTimerRef.current)
      routeIntroAutoStartTimerRef.current = null
    }
    isFollowingRef.current = false
    updateTrackingEnabled(false)
    return true
  }

  const updateFollowCameraTarget = (
    map: mapboxgl.Map,
    routeTime: number,
    routeCoordinate: RouteCoordinate,
    fallbackZoom = map.getZoom(),
    options: { forceTravelerFocus?: boolean } = {},
  ) => {
    const cameraTarget = getAutomaticCameraTarget(
      map,
      positionedLegsRef.current,
      routeTime,
      routeCoordinate,
      fallbackZoom,
    )
    const isOverview =
      cameraTarget.mode === "flight-overview" ||
      cameraTarget.mode === "rapid-land-overview"
    // Pausing or seeking should focus an ordinary road/stop position, but an
    // active flight must retain its overview camera so rewinding cannot leave
    // the map stranded at the previous close zoom.
    if (options.forceTravelerFocus && !isOverview) {
      targetCameraCenterRef.current = routeCoordinate
      targetCameraZoomRef.current = getPreferredFollowZoom(
        cameraTarget.zoom,
      )
      targetCameraSpeedProgressRef.current = 0
      targetCameraModeRef.current = "follow"
      return
    }
    targetCameraCenterRef.current = isOverview
      ? cameraTarget.center
      : interpolateCoordinate(
          routeCoordinate,
          cameraTarget.center,
          cameraTarget.departureProgress *
            interpolateNumber(
              cameraCenterLeadMinWeight,
              cameraCenterLeadMaxWeight,
              cameraTarget.speedProgress,
            ),
        )
    targetCameraZoomRef.current = isOverview
      ? cameraTarget.zoom
      : getPreferredFollowZoom(cameraTarget.zoom)
    targetCameraSpeedProgressRef.current = cameraTarget.speedProgress
    targetCameraModeRef.current = cameraTarget.mode ?? "follow"
  }

  const getFramePlaybackTargetTime = (timestamp: number) => {
    const livePlaybackTime = liveCurrentTimeRef?.current
    if (
      livePlaybackTime !== undefined &&
      Number.isFinite(livePlaybackTime) &&
      livePlaybackTime !== latestPlaybackTimeRef.current
    ) {
      latestPlaybackTimeRef.current = livePlaybackTime
      targetRouteTimeRef.current = livePlaybackTime
      targetPlaybackUpdatedAtRef.current = timestamp
    }

    const targetTime = targetRouteTimeRef.current
    if (!isPlayingRef.current) {
      return targetTime
    }

    const elapsedSincePlaybackUpdateSeconds = clampNumber(
      (timestamp - targetPlaybackUpdatedAtRef.current) / 1000,
      0,
      visualPlaybackExtrapolationMaxSeconds,
    )

    return clampRouteTime(
      positionedLegsRef.current,
      targetTime + elapsedSincePlaybackUpdateSeconds,
    )
  }

  const resumeFollowFromManualOverride = () => {
    const map = mapInstanceRef.current
    if (
      !map ||
      !hasUsableMapSize(map) ||
      !autoResumeTrackingRef.current ||
      !isTrackingEnabledRef.current ||
      !isManualCameraOverrideRef.current
    ) {
      clearManualFollowResume()
      return
    }

    clearManualFollowResume()
    isFollowingRef.current = true
    updateTrackingEnabled(true)

    const currentCenter = map.getCenter()
    animatedCameraCenterRef.current = [currentCenter.lng, currentCenter.lat]
    animatedCameraZoomRef.current = map.getZoom()
    const routeTime = animatedRouteTimeRef.current || targetRouteTimeRef.current
    const routeCoordinate = animatedRouteCoordinateRef.current ?? liveRouteCoordinateRef.current
    updateFollowCameraTarget(map, routeTime, routeCoordinate, map.getZoom())
    visualCatchUpUntilRef.current = window.performance.now() + visualCatchUpDurationMs
    startMarkerAnimation()
  }

  const scheduleManualFollowResume = () => {
    if (
      !autoResumeTrackingRef.current ||
      !isTrackingEnabledRef.current ||
      !isManualCameraOverrideRef.current
    ) {
      return
    }

    clearManualFollowResume(false)
    manualFollowResumeTimerRef.current = window.setTimeout(
      resumeFollowFromManualOverride,
      trackingResumeDelayMsRef.current,
    )
  }

  const suspendFollowForManualInteraction = (map: mapboxgl.Map) => {
    if (
      !isTrackingEnabledRef.current &&
      !isFollowingRef.current &&
      !isManualCameraOverrideRef.current
    ) {
      return
    }

    const didCancelRouteIntroAutoStart = cancelRouteIntroAutoStart()
    clearManualFollowResume(false)
    clearRouteIntroAnimation()
    clearTrackingLoading()
    clearProgrammaticCameraMove()
    const shouldAutoResume =
      !didCancelRouteIntroAutoStart &&
      autoResumeTrackingRef.current &&
      isTrackingEnabledRef.current
    isManualCameraOverrideRef.current = shouldAutoResume
    isFollowingRef.current = false
    if (!shouldAutoResume) {
      updateTrackingEnabled(false)
    }

    const currentCenter = map.getCenter()
    animatedCameraCenterRef.current = [currentCenter.lng, currentCenter.lat]
    animatedCameraZoomRef.current = map.getZoom()

  }

  useEffect(() => {
    autoResumeTrackingRef.current = autoResumeTracking
    trackingResumeDelayMsRef.current = Math.max(1000, trackingResumeDelayMs)

    if (!isManualCameraOverrideRef.current) {
      return
    }

    if (!autoResumeTracking) {
      clearManualFollowResume()
      isFollowingRef.current = false
      updateTrackingEnabled(false)
      return
    }

    scheduleManualFollowResume()
  }, [autoResumeTracking, trackingResumeDelayMs])

  useEffect(() => {
    onLocationClickRef.current = onLocationClick
  }, [onLocationClick])

  useEffect(() => {
    followZoomOffsetRef.current = readStoredFollowZoomOffset(followZoomPreferenceKey)
  }, [followZoomPreferenceKey])

  const safeKeyframes = useMemo(() => {
    return getFlightRouteKeyframes(keyframes.filter(isValidKeyframe))
  }, [keyframes])
  const safeMarkerKeyframes = useMemo(
    () => [...(markerKeyframes ?? keyframes)].filter(isValidKeyframe).sort((left, right) => left.time - right.time),
    [keyframes, markerKeyframes],
  )
  const routeShapesSignature = useMemo(() => getRouteShapesSignature(routeShapes), [routeShapes])
  const routableKeyframes = useMemo(
    () =>
      safeKeyframes.map((keyframe, index) => ({
        ...keyframe,
        via: getTimestampLegViaCoordinates(routeShapes, keyframe, safeKeyframes[index + 1]),
      })),
    [routeShapes, routeShapesSignature, safeKeyframes],
  )

  const safeCurrentKeyframe = useMemo(() => {
    if (isValidKeyframe(currentKeyframe)) {
      return currentKeyframe
    }

    return safeKeyframes[0] ?? getFallbackKeyframe()
  }, [currentKeyframe, safeKeyframes])
  const routeSignature = useMemo(
    () => {
      const keyframeSignature = safeKeyframes
        .map((keyframe) =>
          [
            keyframe.time,
            keyframe.stopEndTime ?? "",
            keyframe.lat.toFixed(6),
            keyframe.lng.toFixed(6),
            keyframe.pointType ?? "point",
          ].join(":"),
        )
        .join("|")
      const markerSignature = safeMarkerKeyframes
        .map((keyframe) =>
          [
            keyframe.time,
            keyframe.lat.toFixed(6),
            keyframe.lng.toFixed(6),
            keyframe.pointType ?? "point",
          ].join(":"),
        )
        .join("|")

      return `${keyframeSignature}|markers:${markerSignature}|routes:${routeShapesSignature}`
    },
    [routeShapesSignature, safeKeyframes, safeMarkerKeyframes],
  )

  useEffect(() => {
    let isMounted = true
    const pendingLegs = buildPendingRoutedLegs(safeKeyframes)

    if (routableKeyframes.length < 2) {
      setIsRouteResolving(false)
      setRoutedLegs(pendingLegs)

      return () => {
        isMounted = false
      }
    }

    setIsRouteResolving(true)
    setRoutedLegs(pendingLegs)

    fetchRoutedLegsForKeyframes(routableKeyframes)
      .then((nextLegs) => {
        if (isMounted) {
          setRoutedLegs(nextLegs)
        }
      })
      .catch(() => {
        if (isMounted) {
          setRoutedLegs(pendingLegs)
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsRouteResolving(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [routableKeyframes, safeKeyframes])

  const manualAwareRoutedLegs = useMemo(
    () => normalizeRoutedLegsForManualKeyframes(routedLegs, safeKeyframes),
    [routedLegs, safeKeyframes],
  )
  const stopAwareRoutedLegs = useMemo(
    () => expandLegsForStopDurations(manualAwareRoutedLegs, safeKeyframes),
    [manualAwareRoutedLegs, safeKeyframes],
  )
  const activeRoutedLegs = useMemo(() => {
    return stopAwareRoutedLegs
  }, [stopAwareRoutedLegs])
  const positionedLegs = useMemo(
    () => buildPositionedLegs(activeRoutedLegs),
    [activeRoutedLegs],
  )
  const routeCoordinates = useMemo(() => {
    if (activeRoutedLegs.length > 0) {
      return flattenLegCoordinates(activeRoutedLegs)
    }

    if (isRouteResolving) {
      return [] as RouteCoordinate[]
    }

    return safeKeyframes.length === 1
      ? ([[safeKeyframes[0].lng, safeKeyframes[0].lat]] as RouteCoordinate[])
      : ([] as RouteCoordinate[])
  }, [activeRoutedLegs, isRouteResolving, safeKeyframes])

  const liveRouteCoordinate =
    getRouteCoordinateAtTime(positionedLegs, safeCurrentKeyframe.time) ??
    ([safeCurrentKeyframe.lng, safeCurrentKeyframe.lat] as RouteCoordinate)
  const hasResolvedRoutedLegs = !isRouteResolving && (routedLegs.length > 0 || safeKeyframes.length < 2)
  const routeIntroStats = useMemo(() => {
    const savedDestinationNames = getUniqueRouteIntroNames(safeKeyframes.map((keyframe) => keyframe.location))
    const landmarkDestinationNames = getKnownRouteIntroLandmarkNames(routeCoordinates)
    const destinationNames =
      savedDestinationNames.length > 0
        ? savedDestinationNames
        : landmarkDestinationNames

    return {
      distanceLabel: formatRouteIntroDistance(getRouteDistanceKm(routeCoordinates)),
      destinationNames: destinationNames.slice(0, routeIntroMaxPlaces),
    }
  }, [routeCoordinates, safeKeyframes])

  keyframesRef.current = safeKeyframes
  markerKeyframesRef.current = safeMarkerKeyframes
  routeCoordinatesRef.current = routeCoordinates
  positionedLegsRef.current = positionedLegs
  const renderedLivePlaybackTime = liveCurrentTimeRef?.current
  const observedPlaybackTime = renderedLivePlaybackTime !== undefined && Number.isFinite(renderedLivePlaybackTime)
    ? renderedLivePlaybackTime
    : safeCurrentKeyframe.time
  latestPlaybackTimeRef.current = observedPlaybackTime
  targetRouteTimeRef.current = observedPlaybackTime
  liveRouteCoordinateRef.current = liveRouteCoordinate
  targetRouteCoordinateRef.current = liveRouteCoordinate

  useEffect(() => {
    stopMarkerAnimation()
    clearRouteIntroAnimation(routeIntroDismissedRef.current)
    routeIntroAutoStartCancelledRef.current = false
    setIsRouteIntroAutoStartCancelled(false)
    clearManualFollowResume()
    clearKeyframeMarkers()
    previousPlaybackTimeRef.current = null
    previousPlaybackUpdatedAtRef.current = null
    previousHighlightTimeRef.current = null
    highlightedKeyframeKeysRef.current.clear()
    lastRouteDataReconcileSignatureRef.current = ""
    cameraTimelineRef.current = []
    cameraZoomPlanRef.current = []
    contextualZoomCacheRef.current = null
    routeLayersReadyRef.current = false
    hasFocusedCurrentLocationRef.current = false
    routeRevealTimeRef.current = safeCurrentKeyframe.time
    targetRouteTimeRef.current = safeCurrentKeyframe.time
    animatedRouteTimeRef.current = safeCurrentKeyframe.time
    latestPlaybackTimeRef.current = safeCurrentKeyframe.time
    targetPlaybackUpdatedAtRef.current = window.performance.now()
    visualCatchUpUntilRef.current = 0
    liveRouteCoordinateRef.current = liveRouteCoordinate
    targetRouteCoordinateRef.current = liveRouteCoordinate
    animatedRouteCoordinateRef.current = liveRouteCoordinate
    targetCameraCenterRef.current = liveRouteCoordinate
    animatedCameraCenterRef.current = liveRouteCoordinate
    targetCameraSpeedProgressRef.current = 0
    targetCameraModeRef.current = "follow"
    isFollowingRef.current = true
    updateTrackingEnabled(true)

    const map = mapInstanceRef.current
    const marker = markerRef.current
    if (!map || !marker) {
      return
    }

    syncTravelerMarker(map, safeCurrentKeyframe.time, liveRouteCoordinate)
    runWhenStyleReady(map, () => {
      drawRoute(map)
      syncTravelerMarkerVisibility(map)
    })
  }, [routeSignature])

  const syncKeyframeMarkerTextColor = (element: HTMLElement) => {
    const isLabelVisible = element.dataset.labelVisible === "true"
    const isHighlighted = element.dataset.highlighted === "true"
    element.style.color = isLabelVisible ? (isHighlighted ? "#0f172a" : "white") : "transparent"
  }

  const resetKeyframeMarkerElement = (element: HTMLElement) => {
    element.style.backgroundColor = element.dataset.normalBackground ?? pointKeyframeMarkerColor
    delete element.dataset.highlighted
    syncKeyframeMarkerTextColor(element)
  }

  const highlightKeyframeMarker = (markerKey: string, element: HTMLElement) => {
    const existingTimeout = keyframeHighlightTimeoutsRef.current.get(markerKey)
    if (existingTimeout) {
      window.clearTimeout(existingTimeout)
    }

    element.dataset.highlighted = "true"
    element.style.backgroundColor = "#facc15"
    syncKeyframeMarkerTextColor(element)

    keyframeHighlightTimeoutsRef.current.set(
      markerKey,
      window.setTimeout(() => {
        resetKeyframeMarkerElement(element)
        keyframeHighlightTimeoutsRef.current.delete(markerKey)
      }, markerHighlightDurationMs),
    )
  }

  const removeKeyframeMarker = (markerKey: string) => {
    const highlightTimeout = keyframeHighlightTimeoutsRef.current.get(markerKey)
    if (highlightTimeout) {
      window.clearTimeout(highlightTimeout)
      keyframeHighlightTimeoutsRef.current.delete(markerKey)
    }

    highlightedKeyframeKeysRef.current.delete(markerKey)
    keyframeMarkerElementsRef.current.delete(markerKey)
    keyframeMarkersRef.current.get(markerKey)?.remove()
    keyframeMarkersRef.current.delete(markerKey)
  }

  const clearKeyframeMarkers = () => {
    Array.from(keyframeMarkersRef.current.keys()).forEach(removeKeyframeMarker)
    reachedKeyframeMarkersRef.current = []
    visibleKeyframeMarkersSignatureRef.current = ""
  }

  const updateKeyframeMarkerElementSize = (element: HTMLButtonElement, zoom: number) => {
    const markerStyle = getKeyframeMarkerStyleForZoom(zoom)
    const shadowOpacity = 0.04 + getKeyframeMarkerZoomProgress(zoom) * 0.16
    const routeEndpoint = element.dataset.routeEndpoint
    const isEndpoint = routeEndpoint === "start" || routeEndpoint === "end"
    const isLabelVisible = element.dataset.labelVisible === "true"
    const compactMarkerSize = clampNumber(
      markerStyle.size * compactKeyframeMarkerScale,
      compactKeyframeMarkerMinSize,
      compactKeyframeMarkerMaxSize,
    )
    const markerSize = isLabelVisible
      ? markerStyle.size + (isEndpoint ? 5 : 0)
      : compactMarkerSize + (isEndpoint ? 2 : 0)

    element.style.width = `${markerSize}px`
    element.style.height = `${markerSize}px`
    element.style.fontSize = isLabelVisible ? `${markerStyle.fontSize}px` : "0px"
    element.style.borderWidth = `${
      isLabelVisible
        ? markerStyle.borderWidth + (isEndpoint ? 1 : 0)
        : Math.max(1, markerStyle.borderWidth * 0.8)
    }px`
    element.style.opacity = `${markerStyle.opacity}`
    element.style.boxShadow = isEndpoint
      ? `0 0 0 2px rgba(15,23,42,0.82), 0 4px 10px rgba(0,0,0,${shadowOpacity + 0.18})`
      : `0 ${isLabelVisible ? 2 : 1}px ${isLabelVisible ? 4 : 2}px rgba(0,0,0,${shadowOpacity})`
    syncKeyframeMarkerTextColor(element)
  }

  const updateKeyframeMarkerSizes = (map: mapboxgl.Map, force = false) => {
    const zoom = map.getZoom()
    if (
      !force &&
      lastKeyframeMarkerZoomRef.current !== null &&
      Math.abs(zoom - lastKeyframeMarkerZoomRef.current) < keyframeMarkerZoomRefreshStep
    ) {
      return
    }

    lastKeyframeMarkerZoomRef.current = zoom
    keyframeMarkerElementsRef.current.forEach(({ element }) => {
      updateKeyframeMarkerElementSize(element, zoom)
    })
  }

  const getVisibleReachedKeyframeMarkers = (map: mapboxgl.Map, reachedKeyframes: ReachedKeyframeMarker[]) => {
    const viewportReachedKeyframes = reachedKeyframes.filter(({ keyframe }) =>
      isPointWithinMapViewport(
        map,
        [keyframe.lng, keyframe.lat],
        keyframeMarkerViewportPaddingPx,
      ),
    )
    if (isJourneyCompleteRef.current) {
      return viewportReachedKeyframes
    }

    const collisionDistance = getKeyframeMarkerCollisionDistanceForZoom(map.getZoom())
    if (collisionDistance <= 0 || viewportReachedKeyframes.length <= 1) {
      return viewportReachedKeyframes
    }

    const acceptedMarkers: Array<{ markerKey: string; point: { x: number; y: number } }> = []
    const acceptedMarkerKeys = new Set<string>()

    for (let index = viewportReachedKeyframes.length - 1; index >= 0; index -= 1) {
      const marker = viewportReachedKeyframes[index]
      const point = map.project([marker.keyframe.lng, marker.keyframe.lat])
      const overlapsAcceptedMarker = acceptedMarkers.some(({ point: acceptedPoint }) => {
        return Math.hypot(point.x - acceptedPoint.x, point.y - acceptedPoint.y) < collisionDistance
      })

      if (!overlapsAcceptedMarker) {
        acceptedMarkers.push({ markerKey: marker.markerKey, point })
        acceptedMarkerKeys.add(marker.markerKey)
      }
    }

    return viewportReachedKeyframes.filter(({ markerKey }) => acceptedMarkerKeys.has(markerKey))
  }

  const syncTravelerMarkerVisibility = (map: mapboxgl.Map) => {
    const marker = markerRef.current
    if (!marker) {
      return
    }

    const markerLngLat = marker.getLngLat()
    const isVisible = isPointWithinMapViewport(
      map,
      [markerLngLat.lng, markerLngLat.lat],
      travelerMarkerViewportPadding,
    )

    marker.getElement().style.display = !isFlightAirplaneActiveRef.current && isVisible ? "" : "none"
    if (flightAirplaneMarkerRef.current) {
      flightAirplaneMarkerRef.current.getElement().style.display =
        isFlightAirplaneActiveRef.current && isVisible ? "" : "none"
    }
  }

  const syncTravelerMarker = (
    map: mapboxgl.Map,
    currentTime: number,
    coordinate: RouteCoordinate,
  ) => {
    const marker = markerRef.current
    marker?.setLngLat(coordinate)

    const flightMotion = getActiveFlightMotion(positionedLegsRef.current, currentTime)
    isFlightAirplaneActiveRef.current = Boolean(flightMotion)

    if (!flightMotion) {
      flightAirplaneMarkerRef.current?.getElement().style.setProperty("display", "none")
      syncTravelerMarkerVisibility(map)
      return
    }

    if (!flightAirplaneMarkerRef.current) {
      const travelerMarkerSize = getTravelerMarkerStyleForZoom(map.getZoom()).width
      flightAirplaneMarkerRef.current = new mapboxgl.Marker({
        element: createFlightAirplaneMarkerElement(travelerMarkerSize),
        anchor: "center",
        rotationAlignment: "map",
      })
        .setLngLat(coordinate)
        .addTo(map)
      flightAirplaneMarkerRef.current.getElement().style.zIndex = "8"
    }

    const airplaneMarker = flightAirplaneMarkerRef.current
    airplaneMarker.setLngLat(coordinate)
    const routeBearing = getRouteBearingAtProgress(
      flightMotion.leg.coordinates,
      flightMotion.leg.cumulativeDistances,
      flightMotion.leg.totalDistance,
      flightMotion.progress,
    )
    if (routeBearing !== null) {
      airplaneMarker.setRotation(routeBearing)
    }
    updateFlightAirplaneMarkerElement(airplaneMarker.getElement(), flightMotion.progress)
    syncTravelerMarkerVisibility(map)
  }

  const updateTravelerMarkerSize = (map: mapboxgl.Map) => {
    const marker = markerRef.current
    if (!marker) {
      return
    }

    const markerStyle = getTravelerMarkerStyleForZoom(map.getZoom())
    const nextSizeKey = `${Math.round(markerStyle.width * 10)}:${Math.round(markerStyle.height * 10)}`
    if (travelerMarkerSizeRef.current === nextSizeKey) {
      return
    }

    travelerMarkerSizeRef.current = nextSizeKey
    applyTravelerMarkerSize(marker.getElement(), map.getZoom())
    if (flightAirplaneMarkerRef.current) {
      applyFlightAirplaneMarkerSize(
        flightAirplaneMarkerRef.current.getElement(),
        markerStyle.width,
      )
    }
  }

  const createKeyframeMarker = (
    map: mapboxgl.Map,
    keyframe: Keyframe,
    pointNumber: number,
    markerKey: string,
  ) => {
    const el = document.createElement("button")
    const markerColor = getKeyframeMarkerColor(keyframe.pointType)
    const totalPoints = markerKeyframesRef.current.length
    const routeEndpoint = pointNumber === 1 ? "start" : pointNumber === totalPoints && totalPoints > 1 ? "end" : null
    el.type = "button"
    el.className = "keyframe-marker"
    el.dataset.normalBackground = markerColor
    el.dataset.labelVisible = "false"
    if (routeEndpoint) {
      el.dataset.routeEndpoint = routeEndpoint
    }
    el.style.cssText = `
      border-radius: ${routeEndpoint === "start" ? "6px" : routeEndpoint === "end" ? "4px" : "50%"};
      background-color: ${markerColor};
      border: 2px solid white;
      padding: 0;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      line-height: 1;
      overflow: hidden;
      user-select: none;
      contain: layout paint style;
      clip-path: ${routeEndpoint === "end" ? "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" : "none"};
      transition: width 120ms ease, height 120ms ease, border-width 120ms ease, font-size 120ms ease, opacity 120ms ease, box-shadow 120ms ease, background-color 160ms ease, color 160ms ease;
      z-index: ${totalPoints - pointNumber + 1};
    `
    updateKeyframeMarkerElementSize(el, map.getZoom())
    el.textContent = pointNumber.toString()
    el.setAttribute(
      "aria-label",
      routeEndpoint === "start"
        ? `Jump to start point ${pointNumber}`
        : routeEndpoint === "end"
          ? `Jump to end point ${pointNumber}`
          : `Jump to route point ${pointNumber}`,
    )
    el.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      onLocationClickRef.current?.(keyframe)
    })
    const setLabelVisibility = (isVisible: boolean) => {
      el.dataset.labelVisible = isVisible ? "true" : "false"
      updateKeyframeMarkerElementSize(el, map.getZoom())
    }
    el.addEventListener("mouseenter", () => setLabelVisibility(true))
    el.addEventListener("mouseleave", () => setLabelVisibility(false))
    el.addEventListener("focus", () => setLabelVisibility(true))
    el.addEventListener("blur", () => setLabelVisibility(false))
    keyframeMarkerElementsRef.current.set(markerKey, { element: el, time: keyframe.time })

    const marker = new mapboxgl.Marker(el).setLngLat([keyframe.lng, keyframe.lat]).addTo(map)
    keyframeMarkersRef.current.set(markerKey, marker)
    return marker
  }

  const syncReachedKeyframeMarkers = (
    map: mapboxgl.Map,
    reachedKeyframes: ReachedKeyframeMarker[],
  ) => {
    reachedKeyframeMarkersRef.current = reachedKeyframes

    const visibleReachedKeyframes = getVisibleReachedKeyframeMarkers(map, reachedKeyframes)
    const nextSignature = visibleReachedKeyframes
      .map(({ keyframe, markerKey, pointNumber }) =>
        [
          markerKey,
          pointNumber,
          keyframe.time,
          keyframe.lat.toFixed(6),
          keyframe.lng.toFixed(6),
          keyframe.pointType ?? "point",
        ].join(":"),
      )
      .join("|")

    if (nextSignature === visibleKeyframeMarkersSignatureRef.current) {
      return
    }

    const visibleMarkerKeys = new Set(visibleReachedKeyframes.map(({ markerKey }) => markerKey))
    Array.from(keyframeMarkersRef.current.keys()).forEach((markerKey) => {
      if (!visibleMarkerKeys.has(markerKey)) {
        removeKeyframeMarker(markerKey)
      }
    })

    visibleReachedKeyframes.forEach(({ keyframe, markerKey, pointNumber }) => {
      const existingMarker = keyframeMarkersRef.current.get(markerKey)
      if (existingMarker) {
        existingMarker.setLngLat([keyframe.lng, keyframe.lat])
        return
      }

      createKeyframeMarker(map, keyframe, pointNumber, markerKey)
    })

    updateKeyframeMarkerSizes(map)
    visibleKeyframeMarkersSignatureRef.current = nextSignature
  }

  const refreshViewportMarkers = (map: mapboxgl.Map) => {
    if (!hasUsableMapSize(map)) {
      return
    }

    updateTravelerMarkerSize(map)
    syncReachedKeyframeMarkers(map, reachedKeyframeMarkersRef.current)
    syncTravelerMarkerVisibility(map)
  }

  const scheduleViewportMarkerRefresh = (map: mapboxgl.Map, force = false) => {
    if (viewportMarkerFrameRef.current !== null) {
      return
    }

    viewportMarkerFrameRef.current = window.requestAnimationFrame((timestamp) => {
      viewportMarkerFrameRef.current = null
      if (!force && timestamp - lastViewportMarkerRefreshRef.current < viewportMarkerRefreshIntervalMs) {
        return
      }

      lastViewportMarkerRefreshRef.current = timestamp
      refreshViewportMarkers(map)
    })
  }

  const cancelViewportMarkerRefresh = () => {
    if (viewportMarkerFrameRef.current !== null) {
      window.cancelAnimationFrame(viewportMarkerFrameRef.current)
      viewportMarkerFrameRef.current = null
    }
  }

  const stopMarkerAnimation = () => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    previousAnimationTimestampRef.current = null
  }

  const clearProgrammaticCameraMove = () => {
    if (programmaticCameraMoveTimeoutRef.current !== null) {
      window.clearTimeout(programmaticCameraMoveTimeoutRef.current)
      programmaticCameraMoveTimeoutRef.current = null
    }

    if (programmaticCameraMoveMapRef.current && finishProgrammaticCameraMoveRef.current) {
      programmaticCameraMoveMapRef.current.off("moveend", finishProgrammaticCameraMoveRef.current)
    }

    programmaticCameraMoveMapRef.current = null
    finishProgrammaticCameraMoveRef.current = null
    isProgrammaticCameraMoveRef.current = false
  }

  const beginProgrammaticCameraMove = (map: mapboxgl.Map, durationMs = 0) => {
    clearProgrammaticCameraMove()
    isProgrammaticCameraMoveRef.current = true

    const finishProgrammaticCameraMove = () => {
      map.off("moveend", finishProgrammaticCameraMove)
      if (programmaticCameraMoveTimeoutRef.current !== null) {
        window.clearTimeout(programmaticCameraMoveTimeoutRef.current)
        programmaticCameraMoveTimeoutRef.current = null
      }

      if (finishProgrammaticCameraMoveRef.current === finishProgrammaticCameraMove) {
        finishProgrammaticCameraMoveRef.current = null
        programmaticCameraMoveMapRef.current = null
        isProgrammaticCameraMoveRef.current = false
      }
    }

    programmaticCameraMoveMapRef.current = map
    finishProgrammaticCameraMoveRef.current = finishProgrammaticCameraMove
    map.once("moveend", finishProgrammaticCameraMove)
    programmaticCameraMoveTimeoutRef.current = window.setTimeout(
      finishProgrammaticCameraMove,
      Math.max(durationMs + 120, 120),
    )
  }

  const clearTrackingLoading = (updateState = true) => {
    if (trackingLoadingTimeoutRef.current !== null) {
      window.clearTimeout(trackingLoadingTimeoutRef.current)
      trackingLoadingTimeoutRef.current = null
    }

    if (trackingLoadingMapRef.current && finishTrackingLoadingRef.current) {
      trackingLoadingMapRef.current.off("moveend", finishTrackingLoadingRef.current)
    }

    trackingLoadingMapRef.current = null
    finishTrackingLoadingRef.current = null
    if (updateState) {
      setIsTrackingLoading(false)
    }
  }

  const showTrackingLoadingDuringMove = (map: mapboxgl.Map, durationMs: number) => {
    clearTrackingLoading()
    setIsTrackingLoading(true)

    const finishTrackingLoading = () => {
      if (trackingLoadingTimeoutRef.current !== null) {
        window.clearTimeout(trackingLoadingTimeoutRef.current)
        trackingLoadingTimeoutRef.current = null
      }

      map.off("moveend", finishTrackingLoading)

      if (finishTrackingLoadingRef.current === finishTrackingLoading) {
        trackingLoadingMapRef.current = null
        finishTrackingLoadingRef.current = null
        setIsTrackingLoading(false)
      }
    }

    trackingLoadingMapRef.current = map
    finishTrackingLoadingRef.current = finishTrackingLoading
    map.once("moveend", finishTrackingLoading)
    trackingLoadingTimeoutRef.current = window.setTimeout(
      finishTrackingLoading,
      Math.max(durationMs + 450, 700),
    )
  }

  const animateMarker = (timestamp: number) => {
    const map = mapInstanceRef.current
    const marker = markerRef.current

    if (!map || !marker || !hasUsableMapSize(map)) {
      stopMarkerAnimation()
      return
    }

    const previousTimestamp = previousAnimationTimestampRef.current ?? timestamp
    const deltaMs = Math.max(timestamp - previousTimestamp, 16)
    previousAnimationTimestampRef.current = timestamp

    const currentTime = animatedRouteTimeRef.current
    const targetTime = getFramePlaybackTargetTime(timestamp)
    const target = getRouteCoordinateAtTime(positionedLegsRef.current, targetTime) ?? targetRouteCoordinateRef.current
    // Performance budget: one allocation-free O(log n) leg lookup per frame.
    // It replaces seconds of stale interpolation on the product's fastest legs.
    const targetLeg = getRouteLegAtTime(positionedLegsRef.current, targetTime)
    const plannedZoom = getCameraPlanZoom(cameraZoomPlanRef.current, targetTime)
    const isRealtimeMotion = Boolean(
      plannedZoom !== null || (targetLeg && isRealtimeNavigationSegment(targetLeg)),
    )
    const isCatchUp = timestamp < visualCatchUpUntilRef.current
    const playbackSmoothingMs = isCatchUp
      ? visualPlaybackCatchUpSmoothingMs
      : isPlayingRef.current
        ? visualPlaybackNormalSmoothingMs
        : visualPlaybackPausedSmoothingMs
    const smoothing = getMapNavigationSmoothing(deltaMs, playbackSmoothingMs)
    const nextTime = currentTime + (targetTime - currentTime) * smoothing
    const playbackSnapThreshold = isPlayingRef.current
      ? visualPlaybackPlayingSnapThresholdSeconds
      : visualPlaybackPausedSnapThresholdSeconds
    const snappedTime =
      isRealtimeMotion || Math.abs(nextTime - targetTime) < playbackSnapThreshold
        ? targetTime
        : nextTime
    const routeCoordinate = getRouteCoordinateAtTime(positionedLegsRef.current, snappedTime) ?? target
    const coordinateSmoothingMs = isCatchUp
      ? visualCoordinateCatchUpSmoothingMs
      : isPlayingRef.current
        ? visualCoordinateNormalSmoothingMs
        : visualCoordinatePausedSmoothingMs
    const coordinateSmoothing = getMapNavigationSmoothing(deltaMs, coordinateSmoothingMs)
    const smoothedCoordinate = interpolateCoordinate(
      animatedRouteCoordinateRef.current,
      routeCoordinate,
      coordinateSmoothing,
    )
    const snappedCoordinate =
      isRealtimeMotion || coordinateDistance(smoothedCoordinate, routeCoordinate) < 0.000001
        ? routeCoordinate
        : smoothedCoordinate

    animatedRouteTimeRef.current = snappedTime
    routeRevealTimeRef.current = snappedTime
    animatedRouteCoordinateRef.current = snappedCoordinate
    syncTravelerMarker(map, snappedTime, snappedCoordinate)

    if (isFollowingRef.current && canUpdateCamera(map)) {
      updateFollowCameraTarget(
        map,
        snappedTime,
        snappedCoordinate,
        animatedCameraZoomRef.current,
        { forceTravelerFocus: !isPlayingRef.current },
      )
    }

    const shouldDrawRoute =
      timestamp - lastAnimatedRouteDrawTimestampRef.current >= 50 ||
      (!isPlayingRef.current && Math.abs(snappedTime - targetTime) < 0.08)
    if (shouldDrawRoute) {
      drawRoute(map)
      lastAnimatedRouteDrawTimestampRef.current = timestamp
    }

    let snappedZoom = animatedCameraZoomRef.current
    let effectiveCameraCenterTarget = targetCameraCenterRef.current
    let effectiveCameraZoomTarget = targetCameraZoomRef.current
    if (isFollowingRef.current && canUpdateCamera(map)) {
      const isFlightCameraOverview = targetCameraModeRef.current === "flight-overview"
      const isRapidLandCameraOverview = targetCameraModeRef.current === "rapid-land-overview"
      const isCameraOverview = isFlightCameraOverview || isRapidLandCameraOverview
      const currentZoom = animatedCameraZoomRef.current
      const desiredCenter = targetCameraCenterRef.current
      const targetZoom = targetCameraZoomRef.current
      const followsVideoTime = isRealtimeMotion
      effectiveCameraZoomTarget =
        !isCatchUp &&
        !isCameraOverview &&
        isPlayingRef.current &&
        Math.abs(targetZoom - currentZoom) < cameraZoomDeadband
          ? currentZoom
          : targetZoom
      const zoomSmoothing = getMapNavigationSmoothing(
        deltaMs,
        isFlightCameraOverview
          ? sharedFlightCameraMotion.zoomSmoothingMs
          : isRapidLandCameraOverview
            ? sharedRapidLandCameraMotion.zoomSmoothingMs
          : isCatchUp
          ? cameraZoomCatchUpSmoothingMs
          : effectiveCameraZoomTarget < currentZoom
            ? cameraZoomOutSmoothingMs
            : cameraZoomInSmoothingMs,
      )
      const nextZoom = currentZoom + (effectiveCameraZoomTarget - currentZoom) * zoomSmoothing
      snappedZoom =
        (followsVideoTime && plannedZoom !== null) ||
        Math.abs(nextZoom - effectiveCameraZoomTarget) < 0.015
          ? effectiveCameraZoomTarget
          : nextZoom
      const previousCameraCenter = animatedCameraCenterRef.current
      const previousCameraZoom = animatedCameraZoomRef.current
      animatedCameraZoomRef.current = snappedZoom
      effectiveCameraCenterTarget = desiredCenter
      const plannedCenterSmoothingMs = interpolateNumber(
        cameraCenterNormalSmoothingMs,
        cameraCenterFastSmoothingMs,
        targetCameraSpeedProgressRef.current,
      )
      const centerGap = coordinateDistance(
        animatedCameraCenterRef.current,
        effectiveCameraCenterTarget,
      )
      const centerGapCatchUpProgress = clampNumber(
        (centerGap - cameraCenterCatchUpStartDistance) /
          (cameraCenterCatchUpFullDistance - cameraCenterCatchUpStartDistance),
        0,
        1,
      )
      const centerSmoothingMs = isFlightCameraOverview
        ? sharedFlightCameraMotion.centerSmoothingMs
        : isRapidLandCameraOverview
          ? sharedRapidLandCameraMotion.centerSmoothingMs
        : isCatchUp
          ? cameraCenterCatchUpSmoothingMs
          : isPlayingRef.current
            ? interpolateNumber(
                plannedCenterSmoothingMs,
                cameraCenterCatchUpSmoothingMs,
                centerGapCatchUpProgress,
              )
            : cameraCenterPausedSmoothingMs
      const centerSmoothing = getMapNavigationSmoothing(deltaMs, centerSmoothingMs)
      const nextCenter = interpolateCoordinate(
        animatedCameraCenterRef.current,
        effectiveCameraCenterTarget,
        centerSmoothing,
      )
      const snappedCenter =
        followsVideoTime ||
        coordinateDistance(nextCenter, effectiveCameraCenterTarget) < cameraCenterSnapThreshold
          ? effectiveCameraCenterTarget
          : nextCenter
      animatedCameraCenterRef.current = snappedCenter

      const cameraChanged =
        coordinateDistance(previousCameraCenter, snappedCenter) >= 0.000001 ||
        Math.abs(previousCameraZoom - snappedZoom) >= 0.001

      if (cameraChanged) {
        try {
          runAutomatedCameraUpdate(() => {
            map.jumpTo({ center: snappedCenter, zoom: snappedZoom })
          })
        } catch {
          // Skip this frame and let the next one retry once the map settles.
        }
      }
    } else if (map) {
      const center = map.getCenter()
      animatedCameraCenterRef.current = [center.lng, center.lat]
      animatedCameraZoomRef.current = map.getZoom()
      snappedZoom = animatedCameraZoomRef.current
    }

    syncTravelerMarkerVisibility(map)

    const hasSettledPausedNavigation = isPausedMapNavigationSettled({
      routeTimeDeltaSeconds: snappedTime - targetTime,
      routeCoordinateDeltaDegrees: coordinateDistance(snappedCoordinate, target),
      cameraCenterDeltaDegrees: coordinateDistance(
        animatedCameraCenterRef.current,
        effectiveCameraCenterTarget,
      ),
      cameraZoomDelta: snappedZoom - effectiveCameraZoomTarget,
      isFollowing: isFollowingRef.current,
    })
    if (
      !isPlayingRef.current &&
      hasSettledPausedNavigation
    ) {
      stopMarkerAnimation()
      return
    }

    animationFrameRef.current = window.requestAnimationFrame(animateMarker)
  }

  const startMarkerAnimation = () => {
    if (animationFrameRef.current !== null) {
      return
    }

    previousAnimationTimestampRef.current = null
    animationFrameRef.current = window.requestAnimationFrame(animateMarker)
  }

  const snapTravelerToPlaybackTime = (
    map: mapboxgl.Map,
    nextTime: number,
    nextCoordinate: RouteCoordinate,
    options: { forceTravelerSnap?: boolean; catchUpDurationMs?: number; snapCamera?: boolean } = {},
  ) => {
    stopMarkerAnimation()
    clearTrackingLoading()
    clearProgrammaticCameraMove()
    const previousCoordinate = animatedRouteCoordinateRef.current
    const routeJumpDistanceKm = haversineDistance(previousCoordinate, nextCoordinate)
    const routeJumpSeconds = Math.abs(nextTime - animatedRouteTimeRef.current)
    const shouldHardSnapTraveler =
      Boolean(options.forceTravelerSnap || options.snapCamera) ||
      routeJumpSeconds >= visualHardSeekSnapSeconds ||
      routeJumpDistanceKm >= visualHardSeekSnapDistanceKm

    targetRouteTimeRef.current = nextTime
    targetRouteCoordinateRef.current = nextCoordinate
    targetPlaybackUpdatedAtRef.current = window.performance.now()
    visualCatchUpUntilRef.current =
      targetPlaybackUpdatedAtRef.current + (options.catchUpDurationMs ?? visualCatchUpDurationMs)

    if (shouldHardSnapTraveler) {
      animatedRouteTimeRef.current = nextTime
      routeRevealTimeRef.current = nextTime
      animatedRouteCoordinateRef.current = nextCoordinate
      syncTravelerMarker(map, nextTime, nextCoordinate)
    }

    if (isFollowingRef.current && canUpdateCamera(map)) {
      if (options.snapCamera) contextualZoomCacheRef.current = null
      updateFollowCameraTarget(map, nextTime, nextCoordinate, map.getZoom(), {
        forceTravelerFocus: options.snapCamera || !isPlayingRef.current,
      })
      const currentCenter = map.getCenter()
      animatedCameraCenterRef.current = [currentCenter.lng, currentCenter.lat]
      animatedCameraZoomRef.current = map.getZoom()
      try {
        map.stop()
        if (options.snapCamera) {
          // A seek selects a frame; it must not replay travel between frames.
          animatedCameraCenterRef.current = nextCoordinate
          targetCameraCenterRef.current = nextCoordinate
          animatedCameraZoomRef.current = targetCameraZoomRef.current
          runAutomatedCameraUpdate(() => map.jumpTo({
            center: nextCoordinate,
            zoom: targetCameraZoomRef.current,
          }))
        }
        startMarkerAnimation()
        setMapError(null)
      } catch {
        setMapError("The map view could not center on the traveler yet.")
      }
    } else {
      const currentCenter = map.getCenter()
      animatedCameraCenterRef.current = [currentCenter.lng, currentCenter.lat]
      animatedCameraZoomRef.current = map.getZoom()
    }

    drawRoute(map)
    syncTravelerMarkerVisibility(map)
    startMarkerAnimation()
  }

  const updateRouteSource = (map: mapboxgl.Map, segments: RouteFeatureSegment[]) => {
    const routeFeature = buildRouteFeatureCollection(segments)
    const existingSource = map.getSource("route") as mapboxgl.GeoJSONSource | undefined

    if (existingSource) {
      existingSource.setData(routeFeature)
      return
    }

    map.addSource("route", {
      type: "geojson",
      data: routeFeature,
    })
  }

  const ensureRouteLayer = (map: mapboxgl.Map) => {
    if (
      routeLayersReadyRef.current &&
      !map.getSource("route-planned") &&
      map.getLayer("route")
    ) {
      return
    }

    const obsoletePlannedLayerIds = [
      "route-planned-non-road",
      "route-planned-non-road-outline",
      "route-planned",
      "route-planned-outline",
    ]
    obsoletePlannedLayerIds.forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId)
      }
    })
    if (map.getSource("route-planned")) {
      map.removeSource("route-planned")
    }

    if (!map.getLayer("route-outline")) {
      map.addLayer({
        id: "route-outline",
        type: "line",
        source: "route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        filter: ["==", ["get", "routeKind"], "road"],
        paint: {
          "line-color": "#fff7ed",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            4.4,
            10,
            4.8,
            14,
            5.4,
            18,
            6,
          ],
          "line-opacity": 0.88,
        },
      })
    } else {
      map.setFilter("route-outline", ["==", ["get", "routeKind"], "road"])
    }

    if (!map.getLayer("route")) {
      map.addLayer({
        id: "route",
        type: "line",
        source: "route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        filter: ["==", ["get", "routeKind"], "road"],
        paint: {
          "line-color": routeLineColor,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            5,
            2.2,
            10,
            2.5,
            14,
            2.9,
            18,
            3.3,
          ],
          "line-opacity": 0.92,
        },
      })
    } else {
      map.setFilter("route", ["==", ["get", "routeKind"], "road"])
    }

    const nonRoadFilter: mapboxgl.Expression = ["==", ["get", "routeKind"], "flight"]
    if (!map.getLayer("route-non-road-outline")) {
      map.addLayer({
        id: "route-non-road-outline",
        type: "line",
        source: "route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        filter: nonRoadFilter,
        paint: {
          "line-color": "#e0f2fe",
          "line-width": flightPathOutlineWidth,
          "line-opacity": 0.92,
        },
      })
    } else {
      map.setFilter("route-non-road-outline", nonRoadFilter)
      map.setPaintProperty("route-non-road-outline", "line-width", flightPathOutlineWidth)
      map.setPaintProperty("route-non-road-outline", "line-dasharray", [1, 0])
    }

    if (!map.getLayer("route-non-road")) {
      map.addLayer({
        id: "route-non-road",
        type: "line",
        source: "route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        filter: nonRoadFilter,
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "routeKind"], "flight"],
            flightKeyframeMarkerColor,
            "#0ea5e9",
          ],
          "line-width": flightPathLineWidth,
          "line-opacity": 0.98,
        },
      })
    } else {
      map.setFilter("route-non-road", nonRoadFilter)
      map.setPaintProperty("route-non-road", "line-width", flightPathLineWidth)
      map.setPaintProperty("route-non-road", "line-dasharray", [1, 0])
    }

    try {
      ;[
        "route-outline",
        "route",
        "route-non-road-outline",
        "route-non-road",
      ].forEach((layerId) => {
        map.moveLayer(layerId)
      })
      routeLayersReadyRef.current = true
    } catch {
      routeLayersReadyRef.current = false
      // Some style reload phases briefly reject layer moves; the next draw will retry.
    }
  }

  const drawRoute = (map: mapboxgl.Map) => {
    const activeKeyframes = markerKeyframesRef.current
    const activePositionedLegs = positionedLegsRef.current
    const revealTime = routeRevealTimeRef.current
    const revealedRouteSegments = getRevealedRouteSegments(activePositionedLegs, revealTime)

    if (!map.isStyleLoaded()) {
      return
    }

    try {
      updateRouteSource(map, revealedRouteSegments)
      ensureRouteLayer(map)
    } catch {
      return
    }

    const reachedKeyframes = activeKeyframes
      .map((keyframe, index) => ({
        keyframe,
        pointNumber: index + 1,
        markerKey: `${keyframe.time}:${index + 1}`,
      }))
      .filter(({ keyframe }) => keyframe.time <= revealTime)

    syncReachedKeyframeMarkers(map, reachedKeyframes)
  }

  const drawFullRoutePreview = (map: mapboxgl.Map) => {
    const activeKeyframes = markerKeyframesRef.current
    const activePositionedLegs = positionedLegsRef.current

    if (!map.isStyleLoaded()) {
      return
    }

    try {
      updateRouteSource(map, activePositionedLegs)
      ensureRouteLayer(map)
    } catch {
      return
    }

    syncReachedKeyframeMarkers(
      map,
      activeKeyframes.map((keyframe, index) => ({
        keyframe,
        pointNumber: index + 1,
        markerKey: `${keyframe.time}:${index + 1}`,
      })),
    )
  }

  const drawRouteIntroProgress = (map: mapboxgl.Map, progress: number, introTime: number) => {
    const activeKeyframes = markerKeyframesRef.current
    const activePositionedLegs = positionedLegsRef.current
    const revealedRouteSegments = getRevealedRouteSegmentsByDistanceProgress(activePositionedLegs, progress)

    if (!map.isStyleLoaded()) {
      return
    }

    try {
      updateRouteSource(map, revealedRouteSegments)
      ensureRouteLayer(map)
    } catch {
      return
    }

    syncReachedKeyframeMarkers(
      map,
      activeKeyframes
        .map((keyframe, index) => ({
          keyframe,
          pointNumber: index + 1,
          markerKey: `${keyframe.time}:${index + 1}`,
        }))
        .filter(({ keyframe }) => keyframe.time <= introTime),
    )
  }

  const startRouteIntroAnimation = (map: mapboxgl.Map) => {
    clearRouteIntroFrame()
    stopMarkerAnimation()
    clearTrackingLoading()
    isRouteIntroActiveRef.current = true
    setIsRouteIntroActive(true)
    routeIntroStartedAtRef.current = null

    const firstTime = keyframesRef.current[0]?.time ?? 0
    const lastTime = keyframesRef.current[keyframesRef.current.length - 1]?.time ?? firstTime
    const routeDuration = Math.max(lastTime - firstTime, 1)

    const animateRouteIntro = (timestamp: number) => {
      const currentMap = mapInstanceRef.current
      const marker = markerRef.current
      if (!currentMap || !marker || !isRouteIntroActiveRef.current || !canUpdateCamera(currentMap)) {
        routeIntroAnimationFrameRef.current = null
        return
      }

      if (routeIntroStartedAtRef.current === null) {
        routeIntroStartedAtRef.current = timestamp
      }

      const elapsed = timestamp - routeIntroStartedAtRef.current
      const progress = elapsed <= routeIntroDurationMs ? easeInOutCubic(elapsed / routeIntroDurationMs) : 1
      const introTime = firstTime + routeDuration * progress
      const introCoordinate =
        getRouteCoordinateAtDistanceProgress(positionedLegsRef.current, progress) ??
        getRouteCoordinateAtTime(positionedLegsRef.current, introTime) ??
        routeCoordinatesRef.current[0] ??
        liveRouteCoordinateRef.current
      const introMarkerTime =
        getRouteTimeAtDistanceProgress(positionedLegsRef.current, progress) ?? introTime

      targetRouteTimeRef.current = introTime
      animatedRouteTimeRef.current = introTime
      routeRevealTimeRef.current = introTime
      targetRouteCoordinateRef.current = introCoordinate
      animatedRouteCoordinateRef.current = introCoordinate
      syncTravelerMarker(currentMap, introMarkerTime, introCoordinate)
      drawRouteIntroProgress(currentMap, progress, introTime)
      syncTravelerMarkerVisibility(currentMap)

      if (progress >= 1) {
        routeRevealTimeRef.current = lastTime
        drawFullRoutePreview(currentMap)
        routeIntroAnimationFrameRef.current = null
        return
      }

      routeIntroAnimationFrameRef.current = window.requestAnimationFrame(animateRouteIntro)
    }

    routeIntroAnimationFrameRef.current = window.requestAnimationFrame(animateRouteIntro)
  }

  const beginRouteIntroPreview = (
    map: mapboxgl.Map,
    fallbackPlaybackTime: number,
    fallbackCoordinate: RouteCoordinate,
  ) => {
    const marker = markerRef.current
    if (routeIntroDismissedRef.current || !marker || !hasUsableMapSize(map)) {
      return false
    }

    const firstTime = keyframesRef.current[0]?.time ?? fallbackPlaybackTime
    const startCoordinate = routeCoordinatesRef.current[0] ?? fallbackCoordinate
    targetRouteTimeRef.current = firstTime
    animatedRouteTimeRef.current = firstTime
    routeRevealTimeRef.current = firstTime
    targetRouteCoordinateRef.current = startCoordinate
    animatedRouteCoordinateRef.current = startCoordinate
    const currentCenter = map.getCenter()
    animatedCameraCenterRef.current = [currentCenter.lng, currentCenter.lat]
    animatedCameraZoomRef.current = map.getZoom()
    syncTravelerMarker(map, firstTime, startCoordinate)
    drawRoute(map)
    syncTravelerMarkerVisibility(map)

    if (!canUpdateCamera(map)) {
      return false
    }

    try {
      clearProgrammaticCameraMove()
      map.stop()
      const previewCoordinates = routeCoordinatesRef.current.length > 1 ? routeCoordinatesRef.current : [startCoordinate]
      const previewBounds = buildCameraBounds(previewCoordinates)

      if (previewBounds) {
        beginProgrammaticCameraMove(map, 1200)
        runAutomatedCameraUpdate(() => {
          map.fitBounds(previewBounds, {
            padding: getCameraPadding(map, routeIntroOverviewPaddingRatio),
            duration: 1200,
            maxZoom: Math.min(defaultFollowZoom, routePreloadMaxZoom),
          })
        })
      }

      startRouteIntroAnimation(map)
      hasFocusedCurrentLocationRef.current = true
      setMapError(null)
      return true
    } catch {
      clearProgrammaticCameraMove()
      return false
    }
  }

  const startTrackingFromRouteIntro = () => {
    const map = mapInstanceRef.current
    const marker = markerRef.current
    routeIntroDismissedRef.current = true
    clearRouteIntroAnimation()

    // Commit the follow intent before touching the map. On slower devices the
    // preview timer can finish while the style or viewport is still settling;
    // later map effects will finish the camera work without losing tracking.
    isFollowingRef.current = true
    updateTrackingEnabled(true)

    if (!map || !marker || !hasUsableMapSize(map)) {
      return
    }

    const latestPlaybackTime = latestPlaybackTimeRef.current
    const latestRouteCoordinate =
      getRouteCoordinateAtTime(positionedLegsRef.current, latestPlaybackTime) ??
      liveRouteCoordinateRef.current

    targetRouteTimeRef.current = latestPlaybackTime
    targetRouteCoordinateRef.current = latestRouteCoordinate
    routeRevealTimeRef.current = latestPlaybackTime
    animatedRouteTimeRef.current = latestPlaybackTime
    animatedRouteCoordinateRef.current = latestRouteCoordinate
    syncTravelerMarker(map, latestPlaybackTime, latestRouteCoordinate)
    targetPlaybackUpdatedAtRef.current = window.performance.now()
    visualCatchUpUntilRef.current = targetPlaybackUpdatedAtRef.current + visualCatchUpDurationMs

    if (canUpdateCamera(map)) {
      const currentCenter = map.getCenter()
      animatedCameraCenterRef.current = [currentCenter.lng, currentCenter.lat]
      animatedCameraZoomRef.current = map.getZoom()
      updateFollowCameraTarget(map, latestPlaybackTime, latestRouteCoordinate, map.getZoom())
    }

    try {
      map.stop()
      drawRoute(map)
      syncTravelerMarkerVisibility(map)
      startMarkerAnimation()
      setMapError(null)
    } catch {
      clearProgrammaticCameraMove()
    }
  }

  startTrackingFromRouteIntroRef.current = startTrackingFromRouteIntro

  useEffect(() => {
    if (
      !isRouteIntroActive ||
      routeIntroDismissedRef.current ||
      routeIntroAutoStartCancelledRef.current
    ) {
      return
    }

    setRouteIntroCountdownCycle((cycle) => cycle + 1)
    routeIntroAutoStartTimerRef.current = window.setTimeout(() => {
      routeIntroAutoStartTimerRef.current = null
      startTrackingFromRouteIntroRef.current()
    }, routeIntroDurationMs)

    return () => {
      if (routeIntroAutoStartTimerRef.current !== null) {
        window.clearTimeout(routeIntroAutoStartTimerRef.current)
        routeIntroAutoStartTimerRef.current = null
      }
    }
  }, [isRouteIntroActive, routeSignature])

  const fitMapToRoute = (map: mapboxgl.Map, duration?: number) => {
    const activeRouteCoordinates = routeCoordinatesRef.current

    if (activeRouteCoordinates.length <= 1 || !canUpdateCamera(map)) {
      return
    }

    const bounds = new mapboxgl.LngLatBounds()
    activeRouteCoordinates.forEach((coordinate) => bounds.extend(coordinate))
    try {
      map.fitBounds(bounds, { padding: 50, duration })
      setMapError(null)
    } catch {
      setMapError("The map view could not fit the route yet.")
    }
  }

  const showJourneyCompleteOverview = (
    map: mapboxgl.Map,
    duration = journeyCompleteOverviewDurationMs,
  ) => {
    const activeKeyframes = keyframesRef.current
    const activeMarkerKeyframes = markerKeyframesRef.current
    const activeRouteCoordinates = routeCoordinatesRef.current
    const finalKeyframe = activeKeyframes[activeKeyframes.length - 1]
    const finalCoordinate =
      activeRouteCoordinates[activeRouteCoordinates.length - 1] ??
      (finalKeyframe
        ? ([finalKeyframe.lng, finalKeyframe.lat] as RouteCoordinate)
        : animatedRouteCoordinateRef.current)
    const finalTime = finalKeyframe?.time ?? animatedRouteTimeRef.current
    const overviewCoordinates = [
      ...activeRouteCoordinates,
      ...activeMarkerKeyframes.map(
        (keyframe) => [keyframe.lng, keyframe.lat] as RouteCoordinate,
      ),
    ]
    const bounds = buildCameraBounds(overviewCoordinates)

    if (!bounds || !canUpdateCamera(map)) {
      return
    }

    clearManualFollowResume()
    clearRouteIntroAnimation()
    clearTrackingLoading()
    stopMarkerAnimation()
    isFollowingRef.current = false
    updateTrackingEnabled(false)
    routeRevealTimeRef.current = finalTime
    targetRouteTimeRef.current = finalTime
    animatedRouteTimeRef.current = finalTime
    targetRouteCoordinateRef.current = finalCoordinate
    animatedRouteCoordinateRef.current = finalCoordinate
    syncTravelerMarker(map, finalTime, finalCoordinate)
    drawFullRoutePreview(map)

    const padding = getCameraPadding(map, journeyCompleteOverviewPaddingRatio)
    const overviewCamera = map.cameraForBounds(bounds, {
      padding,
      maxZoom: routePreloadMaxZoom,
    })
    if (overviewCamera?.center && typeof overviewCamera.zoom === "number") {
      const overviewCenter = getRouteCoordinateFromMapCenter(
        overviewCamera.center,
        finalCoordinate,
      )
      targetCameraCenterRef.current = overviewCenter
      animatedCameraCenterRef.current = overviewCenter
      targetCameraZoomRef.current = overviewCamera.zoom
      animatedCameraZoomRef.current = overviewCamera.zoom
    }

    try {
      clearProgrammaticCameraMove()
      map.stop()
      beginProgrammaticCameraMove(map, duration + 250)
      runAutomatedCameraUpdate(() => {
        map.fitBounds(bounds, {
          padding,
          duration,
          maxZoom: routePreloadMaxZoom,
        })
      })
      map.once("moveend", () => {
        if (isJourneyCompleteRef.current) {
          drawFullRoutePreview(map)
          refreshViewportMarkers(map)
        }
      })
      setMapError(null)
    } catch {
      clearProgrammaticCameraMove()
      setMapError("The completed journey overview could not be shown yet.")
    }
  }

  const clearRoutePreloadTimer = () => {
    routePreloadIdleCleanupRef.current?.()
    routePreloadIdleCleanupRef.current = null
    if (routePreloadTimerRef.current !== null) {
      window.clearTimeout(routePreloadTimerRef.current)
      routePreloadTimerRef.current = null
    }
  }

  const scheduleRoutePreloadStep = (delay = readMapPreloadPolicy().delayMs) => {
    clearRoutePreloadTimer()
    routePreloadTimerRef.current = window.setTimeout(() => {
      routePreloadTimerRef.current = null
      runRoutePreloadStep(routePreloadGenerationRef.current)
    }, delay)
  }

  function runRoutePreloadStep(generation: number) {
    if (generation !== routePreloadGenerationRef.current || routePreloadQueueRef.current.length === 0) {
      return
    }

    const preloadMap = mapInstanceRef.current
    if (!preloadMap) {
      return
    }

    const policy = readMapPreloadPolicy()
    if (policy.maxTargets === 0 || document.hidden || !preloadMap.isStyleLoaded() || !preloadMap.areTilesLoaded()) {
      // Poll: loading tiles can make isStyleLoaded false without a style.load event.
      scheduleRoutePreloadStep(Math.max(policy.delayMs, 1000))
      return
    }
    routePreloadQueueRef.current = routePreloadQueueRef.current.slice(0, policy.maxTargets)

    const target = routePreloadQueueRef.current.shift()
    if (!target) {
      return
    }

    try {
      preloadMap.flyTo({
        center: target.center,
        zoom: target.zoom,
        bearing: 0,
        pitch: 0,
        duration: 1400,
        curve: 1,
        essential: true,
        preloadOnly: true,
      })
    } catch {
      scheduleRoutePreloadStep()
      return
    }

    let didScheduleNextStep = false
    const scheduleNextStep = () => {
      if (didScheduleNextStep || generation !== routePreloadGenerationRef.current) {
        return
      }

      didScheduleNextStep = true
      scheduleRoutePreloadStep()
    }

    clearRoutePreloadTimer()
    preloadMap.once("idle", scheduleNextStep)
    routePreloadIdleCleanupRef.current = () => preloadMap.off("idle", scheduleNextStep)
    routePreloadTimerRef.current = window.setTimeout(scheduleNextStep, 1600)
  }

  const resetRoutePreloader = () => {
    routePreloadGenerationRef.current += 1
    clearRoutePreloadTimer()
    routePreloadQueueRef.current = []
    routePreloadSignatureRef.current = ""
  }

  const destroyRoutePreloader = () => {
    resetRoutePreloader()
  }

  useEffect(() => {
    if (!hasMapboxAccessToken) {
      setMapError("Mapbox is not configured. Add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to .env.local and restart the dev server.")
      setIsLoaded(true)
      return
    }

    if (!mapRef.current || mapInstanceRef.current) {
      return
    }

    let map: mapboxgl.Map
    try {
      mapboxgl.prewarm()
      map = new mapboxgl.Map({
        container: mapRef.current,
        style: getMapStyleUrl(mapStyle),
        center: liveRouteCoordinateRef.current,
        zoom: 6,
        attributionControl: false,
        fadeDuration: 0,
        minTileCacheSize: visibleMapMinTileCacheSize,
        maxTileCacheSize: visibleMapMaxTileCacheSize,
      })
    } catch {
      setMapError("The map could not be initialized.")
      return
    }

    map.addControl(new mapboxgl.NavigationControl(), "bottom-left")
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")
    map
      .getContainer()
      .querySelectorAll<HTMLElement>(".mapboxgl-ctrl-bottom-left .mapboxgl-ctrl-group")
      .forEach((controlGroup) => {
        controlGroup.style.marginBottom = "28px"
      })

    const marker = new mapboxgl.Marker({
      element: createTravelerMarkerElement(map.getZoom()),
      anchor: "center",
    })
      .setLngLat(liveRouteCoordinateRef.current)
      .addTo(map)
    marker.getElement().style.pointerEvents = "none"

    mapInstanceRef.current = map
    markerRef.current = marker
    animatedRouteCoordinateRef.current = liveRouteCoordinateRef.current
    targetRouteCoordinateRef.current = liveRouteCoordinateRef.current
    targetCameraCenterRef.current = liveRouteCoordinateRef.current
    animatedCameraCenterRef.current = liveRouteCoordinateRef.current
    targetCameraZoomRef.current = map.getZoom()
    animatedCameraZoomRef.current = map.getZoom()
    targetCameraSpeedProgressRef.current = 0
    targetCameraModeRef.current = "follow"
    hasFocusedCurrentLocationRef.current = false
    isFollowingRef.current = true
    updateTrackingEnabled(true)

    const handleUserMapDrag = (event: unknown) => {
      if (hasOriginalMapEvent(event)) {
        suspendFollowForManualInteraction(map)
      }
    }

    const handleUserMapInteractionEnd = () => {
      scheduleManualFollowResume()
    }

    const handleUserMapPointerDown = () => {
      const didCancelRouteIntro = cancelRouteIntroAutoStart()
      if (!didCancelRouteIntro && isTrackingEnabledRef.current) {
        suspendFollowForManualInteraction(map)
      }
    }

    const handleUserMapPointerUp = () => {
      scheduleManualFollowResume()
    }

    const handleUserMapWheel = () => {
      if (isTrackingEnabledRef.current) {
        isUserZoomingWhileFollowingRef.current = true
        suspendFollowForManualInteraction(map)
      }
    }

    const handleMapMove = () => {
      scheduleViewportMarkerRefresh(map)
    }

    const handleMapZoomStart = () => {
      if (
        isTrackingEnabledRef.current &&
        !isAutomatedCameraUpdateRef.current &&
        !isProgrammaticCameraMoveRef.current
      ) {
        isUserZoomingWhileFollowingRef.current = true
        suspendFollowForManualInteraction(map)
      }
    }

    const handleMapZoom = () => {
      updateKeyframeMarkerSizes(map)
      updateTravelerMarkerSize(map)
      scheduleViewportMarkerRefresh(map)
    }

    const handleMapZoomEnd = () => {
      updateKeyframeMarkerSizes(map, true)
      updateTravelerMarkerSize(map)
      scheduleViewportMarkerRefresh(map, true)
      if (isUserZoomingWhileFollowingRef.current) {
        rememberFollowZoomFromMap(map)
        scheduleManualFollowResume()
      }
      isUserZoomingWhileFollowingRef.current = false
    }

    const handleInitialLoad = () => {
      setMapError(null)
      setIsLoaded(true)
      appliedMapStyleRef.current = mapStyle
      if (!hasUsableMapSize(map)) {
        return
      }

      map.resize()
      rebuildCameraTimeline(map)
      if (isJourneyCompleteRef.current) {
        showJourneyCompleteOverview(map, 0)
      } else {
        drawRoute(map)
        updateKeyframeMarkerSizes(map)
        refreshViewportMarkers(map)
      }
      if (
        !isJourneyCompleteRef.current &&
        !routeIntroAutoStartCancelledRef.current
      ) {
        isFollowingRef.current = true
        updateTrackingEnabled(true)
      }
    }

    const handleStyleLoad = () => {
      setMapError(null)
      setIsLoaded(true)
      if (!canUpdateCamera(map)) {
        return
      }

      map.resize()
      rebuildCameraTimeline(map)
      if (isJourneyCompleteRef.current) {
        showJourneyCompleteOverview(map, 0)
        return
      }

      drawRoute(map)
      updateKeyframeMarkerSizes(map)
      syncTravelerMarker(map, animatedRouteTimeRef.current, animatedRouteCoordinateRef.current)
      refreshViewportMarkers(map)

      try {
        beginProgrammaticCameraMove(map)
        runAutomatedCameraUpdate(() => {
          map.jumpTo({ center: animatedCameraCenterRef.current, zoom: animatedCameraZoomRef.current })
        })
      } catch {
        clearProgrammaticCameraMove()
        // Let the next interaction retry after style work finishes.
      }
    }

    map.on("load", handleInitialLoad)
    map.on("style.load", handleStyleLoad)
    map.on("dragstart", handleUserMapDrag)
    map.on("dragend", handleUserMapInteractionEnd)
    map.on("rotatestart", handleUserMapDrag)
    map.on("rotateend", handleUserMapInteractionEnd)
    map.on("pitchstart", handleUserMapDrag)
    map.on("pitchend", handleUserMapInteractionEnd)
    map.getCanvas().addEventListener("pointerdown", handleUserMapPointerDown)
    map.getCanvas().addEventListener("pointerup", handleUserMapPointerUp)
    map.getCanvas().addEventListener("pointercancel", handleUserMapPointerUp)
    map.getCanvas().addEventListener("wheel", handleUserMapWheel, { passive: true })
    map.on("zoomstart", handleMapZoomStart)
    map.on("move", handleMapMove)
    map.on("zoom", handleMapZoom)
    map.on("zoomend", handleMapZoomEnd)

    return () => {
      stopMarkerAnimation()
      cancelViewportMarkerRefresh()
      clearRouteIntroAnimation(routeIntroDismissedRef.current)
      clearManualFollowResume()
      clearTrackingLoading(false)
      clearProgrammaticCameraMove()
      destroyRoutePreloader()
      clearKeyframeMarkers()
      flightAirplaneMarkerRef.current?.remove()
      map.off("load", handleInitialLoad)
      map.off("style.load", handleStyleLoad)
      map.off("dragstart", handleUserMapDrag)
      map.off("dragend", handleUserMapInteractionEnd)
      map.off("rotatestart", handleUserMapDrag)
      map.off("rotateend", handleUserMapInteractionEnd)
      map.off("pitchstart", handleUserMapDrag)
      map.off("pitchend", handleUserMapInteractionEnd)
      map.getCanvas().removeEventListener("pointerdown", handleUserMapPointerDown)
      map.getCanvas().removeEventListener("pointerup", handleUserMapPointerUp)
      map.getCanvas().removeEventListener("pointercancel", handleUserMapPointerUp)
      map.getCanvas().removeEventListener("wheel", handleUserMapWheel)
      map.off("zoomstart", handleMapZoomStart)
      map.off("move", handleMapMove)
      map.off("zoom", handleMapZoom)
      map.off("zoomend", handleMapZoomEnd)
      map.remove()
      mapInstanceRef.current = null
      markerRef.current = null
      flightAirplaneMarkerRef.current = null
      isFlightAirplaneActiveRef.current = false
      travelerMarkerSizeRef.current = null
      routeLayersReadyRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded) {
      return
    }

    runWhenStyleReady(mapInstanceRef.current, () => {
      if (!hasUsableMapSize(mapInstanceRef.current!)) {
        return
      }

      drawRoute(mapInstanceRef.current!)
    })
  }, [isLoaded, positionedLegs, routeCoordinates])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !isLoaded) {
      return
    }

    // Planning uses the transform and route data, not loaded source tiles.
    // Waiting for style.load here can strand a new route indefinitely: tile
    // requests make isStyleLoaded false without emitting another style.load.
    if (canUpdateCamera(map)) rebuildCameraTimeline(map)
  }, [isLoaded, mapStyle, positionedLegs, routeSignature])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !isLoaded || positionedLegs.length === 0) {
      return
    }

    let playbackRefreshTimer: number | null = null
    let isCancelled = false
    let basePreloadSignature = ""
    let previousPlaybackTime = latestPlaybackTimeRef.current
    let previousPolicy = ""

    const schedulePlaybackRefresh = () => {
      if (isCancelled) {
        return
      }

      playbackRefreshTimer = window.setTimeout(
        queuePlaybackWindow,
        playbackRoutePreloadRefreshMs,
      )
    }

    const queuePlaybackWindow = () => {
      if (isCancelled) {
        return
      }

      const playbackTime = latestPlaybackTimeRef.current
      const policy = readMapPreloadPolicy()
      const policySignature = `${policy.seconds}:${policy.maxTargets}`
      if (
        policySignature !== previousPolicy ||
        playbackTime < previousPlaybackTime - 0.5 ||
        playbackTime > previousPlaybackTime + 5
      ) {
        resetRoutePreloader()
      }
      previousPolicy = policySignature
      previousPlaybackTime = playbackTime
      if (policy.maxTargets === 0 || document.hidden) {
        schedulePlaybackRefresh()
        return
      }
      const flightLeg = getFlightPreloadSegment(positionedLegs, playbackTime)
      const bufferWindow = Math.floor(playbackTime / Math.max(3, policy.seconds / 2))
      const flightSignature = flightLeg
        ? `${basePreloadSignature}:flight:${flightLeg.fromTime}:${flightLeg.toTime}:${bufferWindow}`
        : null
      const rapidLandLeg = !flightLeg
        ? getRapidLandPreloadSegment(positionedLegs, playbackTime)
        : null
      const rapidLandSignature = rapidLandLeg
        ? `${basePreloadSignature}:rapid-land:${rapidLandLeg.fromTime}:${rapidLandLeg.toTime}:${bufferWindow}`
        : null
      const specialSignature = flightSignature ?? rapidLandSignature

      if (
        (flightLeg || rapidLandLeg) &&
        specialSignature !== routePreloadSignatureRef.current
      ) {
        routePreloadGenerationRef.current += 1
        clearRoutePreloadTimer()
        routePreloadSignatureRef.current = specialSignature!
        const transitionTargets = flightLeg
          ? getFlightPathPreloadTargets(map, positionedLegs, flightLeg)
          : getRapidLandPathPreloadTargets(map, positionedLegs, rapidLandLeg!)
        routePreloadQueueRef.current = dedupeRoutePreloadTargets([
          ...transitionTargets,
          ...getPlaybackRoutePreloadTargets(map, positionedLegs, safeKeyframes, cameraTimelineRef.current, playbackTime, policy),
        ]).slice(0, policy.maxTargets)
        if (routePreloadQueueRef.current.length > 0) {
          scheduleRoutePreloadStep(0)
        }
        schedulePlaybackRefresh()
        return
      }

      // Refresh the adaptive window outside the animation loop.
      if (
        routePreloadQueueRef.current.length === 0 &&
        routePreloadTimerRef.current === null
      ) {
        const preloadSignature = specialSignature
          ? specialSignature
          : `${basePreloadSignature}:playback:${Math.floor(
              (playbackTime * 1000) / playbackRoutePreloadRefreshMs,
            )}`

        if (preloadSignature !== routePreloadSignatureRef.current) {
          routePreloadSignatureRef.current = preloadSignature
          routePreloadGenerationRef.current += 1
          routePreloadQueueRef.current = getPlaybackRoutePreloadTargets(
            map,
            positionedLegs,
            safeKeyframes,
            cameraTimelineRef.current,
            playbackTime,
            policy,
          )
          if (routePreloadQueueRef.current.length > 0) {
            scheduleRoutePreloadStep(0)
          }
        }
      }

      schedulePlaybackRefresh()
    }

    const startPreloading = () => {
      if (isCancelled || !hasUsableMapSize(map)) {
        return
      }

      const container = map.getContainer()
      basePreloadSignature = [
        routeSignature,
        mapStyle,
        container.clientWidth,
        container.clientHeight,
      ].join(":")
      resetRoutePreloader()

      queuePlaybackWindow()
    }

    startPreloading()

    return () => {
      isCancelled = true
      if (playbackRefreshTimer !== null) {
        window.clearTimeout(playbackRefreshTimer)
      }
      resetRoutePreloader()
    }
  }, [isLoaded, isPlaying, mapStyle, positionedLegs, routeSignature, safeKeyframes])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (
      !map ||
      !isLoaded ||
      !hasResolvedRoutedLegs ||
      !hasFocusedCurrentLocationRef.current ||
      isRouteIntroActiveRef.current
    ) {
      return
    }

    const routeDataSignature = [
      routeSignature,
      routedLegs.length,
      ...routedLegs.map((leg) =>
        [
          leg.fromTime,
          leg.toTime,
          leg.coordinates.length,
          leg.isFallback ? "fallback" : "routed",
        ].join(":"),
      ),
    ].join("|")

    if (routeDataSignature === lastRouteDataReconcileSignatureRef.current) {
      return
    }

    lastRouteDataReconcileSignatureRef.current = routeDataSignature

    runWhenStyleReady(map, () => {
      const currentMap = mapInstanceRef.current
      if (!currentMap || !canUpdateCamera(currentMap)) {
        return
      }

      currentMap.resize()
      rebuildCameraTimeline(currentMap)
      if (isJourneyCompleteRef.current) {
        showJourneyCompleteOverview(currentMap, 0)
        return
      }

      const latestPlaybackTime = latestPlaybackTimeRef.current
      const latestRouteCoordinate =
        getRouteCoordinateAtTime(positionedLegsRef.current, latestPlaybackTime) ??
        liveRouteCoordinateRef.current

      snapTravelerToPlaybackTime(currentMap, latestPlaybackTime, latestRouteCoordinate, {
        forceTravelerSnap: !isPlayingRef.current,
        catchUpDurationMs: routeDataReconcileCatchUpDurationMs,
      })
    })
  }, [hasResolvedRoutedLegs, isLoaded, positionedLegs, routeSignature, routedLegs])

  useEffect(() => {
    const currentTime = safeCurrentKeyframe.time
    const previousTime = previousHighlightTimeRef.current
    const reachedMarkers: Array<{ markerKey: string; element: HTMLElement; time: number }> = []

    keyframeMarkerElementsRef.current.forEach(({ element, time }, markerKey) => {
      if (canRearmTimestampHighlight(currentTime, time)) {
        highlightedKeyframeKeysRef.current.delete(markerKey)
      }

      if (highlightedKeyframeKeysRef.current.has(markerKey)) {
        return
      }

      if (shouldTriggerTimestampHighlight(previousTime, currentTime, time)) {
        reachedMarkers.push({ markerKey, element, time })
      }
    })

    if (reachedMarkers.length > 0) {
      const closestDistance = Math.min(...reachedMarkers.map(({ time }) => Math.abs(time - currentTime)))

      reachedMarkers.forEach(({ markerKey, element, time }) => {
        if (Math.abs(time - currentTime) <= closestDistance + 0.001) {
          highlightedKeyframeKeysRef.current.add(markerKey)
          highlightKeyframeMarker(markerKey, element)
        }
      })
    }

    previousHighlightTimeRef.current = currentTime
  }, [safeCurrentKeyframe.time])

  useEffect(() => {
    if (
      !isRouteIntroActive ||
      !isLoaded ||
      !hasResolvedRoutedLegs ||
      hasFocusedCurrentLocationRef.current ||
      routeIntroDismissedRef.current
    ) {
      return
    }

    const map = mapInstanceRef.current
    if (!map || !markerRef.current) {
      return
    }

    runWhenStyleReady(map, () => {
      const currentMap = mapInstanceRef.current
      if (
        !currentMap ||
        hasFocusedCurrentLocationRef.current ||
        routeIntroDismissedRef.current ||
        !hasUsableMapSize(currentMap)
      ) {
        return
      }

      currentMap.resize()
      rebuildCameraTimeline(currentMap)
      beginRouteIntroPreview(currentMap, safeCurrentKeyframe.time, liveRouteCoordinate)
    })
  }, [hasResolvedRoutedLegs, isLoaded, isRouteIntroActive, liveRouteCoordinate, routeSignature, safeCurrentKeyframe.time])

  useEffect(() => {
    if (
      !isRouteIntroActive ||
      !isLoaded ||
      !hasResolvedRoutedLegs ||
      hasFocusedCurrentLocationRef.current ||
      routeIntroDismissedRef.current
    ) {
      return
    }

    let attempts = 0
    const retryRouteIntro = () => {
      attempts += 1
      const map = mapInstanceRef.current
      if (
        !map ||
        !markerRef.current ||
        hasFocusedCurrentLocationRef.current ||
        routeIntroDismissedRef.current
      ) {
        return
      }

      if (canUpdateCamera(map)) {
        map.resize()
        rebuildCameraTimeline(map)
        beginRouteIntroPreview(map, safeCurrentKeyframe.time, liveRouteCoordinate)
      }
    }

    retryRouteIntro()
    const retryTimer = window.setInterval(() => {
      retryRouteIntro()
      if (attempts >= 20 || hasFocusedCurrentLocationRef.current || routeIntroDismissedRef.current) {
        window.clearInterval(retryTimer)
      }
    }, 500)

    return () => {
      window.clearInterval(retryTimer)
    }
  }, [hasResolvedRoutedLegs, isLoaded, isRouteIntroActive, liveRouteCoordinate, routeSignature, safeCurrentKeyframe.time])

  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current && isLoaded) {
      const syncPlaybackCamera = () => {
        const map = mapInstanceRef.current
        if (!map || !hasUsableMapSize(map)) {
          return
        }

        if (isJourneyCompleteRef.current) {
          return
        }

        if (isRouteIntroActiveRef.current && hasFocusedCurrentLocationRef.current) {
          return
        }

        const nextPlaybackTime = safeCurrentKeyframe.time
        const previousPlaybackTime = previousPlaybackTimeRef.current
        const previousPlaybackUpdatedAt = previousPlaybackUpdatedAtRef.current
        const playbackUpdatedAt = window.performance.now()
        const didJumpPlayback = didPlaybackSeek(
          previousPlaybackTime,
          nextPlaybackTime,
          previousPlaybackUpdatedAt,
          playbackUpdatedAt,
          isPlaying,
        )
        previousPlaybackTimeRef.current = nextPlaybackTime
        previousPlaybackUpdatedAtRef.current = playbackUpdatedAt
        targetPlaybackUpdatedAtRef.current = playbackUpdatedAt

        map.resize()
        targetRouteCoordinateRef.current = liveRouteCoordinate
        updateFollowCameraTarget(map, nextPlaybackTime, liveRouteCoordinate, map.getZoom())

        if (!hasFocusedCurrentLocationRef.current) {
          if (isFollowingRef.current && !routeIntroDismissedRef.current) {
            beginRouteIntroPreview(map, nextPlaybackTime, liveRouteCoordinate)
            return
          }

          hasFocusedCurrentLocationRef.current = true
        }

        if (didJumpPlayback) {
          snapTravelerToPlaybackTime(map, nextPlaybackTime, liveRouteCoordinate, {
            snapCamera: true,
          })
          return
        }

        startMarkerAnimation()
      }
      syncPlaybackCamera()
    }
  }, [isLoaded, isPlaying, liveRouteCoordinate, positionedLegs, safeCurrentKeyframe.time])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !markerRef.current || !isLoaded) {
      return
    }

    runWhenStyleReady(map, () => {
      const currentMap = mapInstanceRef.current
      if (!currentMap || !canUpdateCamera(currentMap)) {
        return
      }

      currentMap.resize()
      if (isJourneyComplete) {
        resetRoutePreloader()
        showJourneyCompleteOverview(currentMap)
        return
      }

      const playbackTime = latestPlaybackTimeRef.current
      const playbackCoordinate =
        getRouteCoordinateAtTime(positionedLegsRef.current, playbackTime) ??
        liveRouteCoordinateRef.current
      clearProgrammaticCameraMove()
      routeRevealTimeRef.current = playbackTime
      targetRouteTimeRef.current = playbackTime
      animatedRouteTimeRef.current = playbackTime
      targetRouteCoordinateRef.current = playbackCoordinate
      animatedRouteCoordinateRef.current = playbackCoordinate
      isFollowingRef.current = true
      updateTrackingEnabled(true)
      syncTravelerMarker(currentMap, playbackTime, playbackCoordinate)
      updateFollowCameraTarget(
        currentMap,
        playbackTime,
        playbackCoordinate,
        currentMap.getZoom(),
      )
      drawRoute(currentMap)
      refreshViewportMarkers(currentMap)
      startMarkerAnimation()
    })
  }, [
    isJourneyComplete,
    isLoaded,
    routeSignature,
  ])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || appliedMapStyleRef.current === mapStyle) {
      return
    }

    appliedMapStyleRef.current = mapStyle
    setIsLoaded(false)
    stopMarkerAnimation()
    clearRouteIntroAnimation()
    clearProgrammaticCameraMove()
    map.stop()
    map.setStyle(getMapStyleUrl(mapStyle))
  }, [mapStyle])

  const getLocationSearchBias = (): LocationSearchBias => {
    const map = mapInstanceRef.current
    if (!map) {
      return {}
    }

    const zoom = map.getZoom()
    const center = map.getCenter()
    const bias: LocationSearchBias = {}

    if (zoom >= 4) {
      bias.proximity = [center.lng, center.lat]
    }

    if (zoom >= 7) {
      const bounds = map.getBounds()
      if (!bounds) {
        return bias
      }

      const west = bounds.getWest()
      const south = bounds.getSouth()
      const east = bounds.getEast()
      const north = bounds.getNorth()
      const lngPadding = Math.min(Math.abs(east - west), 12)
      const latPadding = Math.min(Math.abs(north - south), 8)

      if (east > west && north > south) {
        bias.bbox = [
          Math.max(-180, west - lngPadding),
          Math.max(-90, south - latPadding),
          Math.min(180, east + lngPadding),
          Math.min(90, north + latPadding),
        ]
      }
    }

    return bias
  }

  useEffect(() => {
    if (suppressAutocompleteRef.current) {
      suppressAutocompleteRef.current = false
      return
    }

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }
    searchAbortRef.current?.abort()

    const query = searchQuery.trim()
    if (query.length < 2) {
      setSearchResults([])
      setActiveSearchIndex(-1)
      setSearchError(null)
      setIsSearching(false)
      return
    }

    const controller = new AbortController()
    searchAbortRef.current = controller
    setSearchError(null)
    setIsSearching(true)

    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await fetchLocationSuggestions(query, getLocationSearchBias(), controller.signal)
        if (controller.signal.aborted) {
          return
        }

        setSearchResults(results)
        setActiveSearchIndex(results.length > 0 ? 0 : -1)
        setSearchError(results.length === 0 ? "No matches found" : null)
      } catch {
        if (!controller.signal.aborted) {
          setSearchResults([])
          setActiveSearchIndex(-1)
          setSearchError("Search unavailable")
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false)
        }
      }
    }, 250)

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
      }
      controller.abort()
    }
  }, [searchQuery])

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
      }
      searchAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    const container = mapRef.current
    if (!container) {
      return
    }

    const updateOverlayLayout = () => {
      const nextIsWide = container.clientWidth >= mapOverlayWideMinWidth
      setIsMapOverlayWide((currentIsWide) => (currentIsWide === nextIsWide ? currentIsWide : nextIsWide))
    }

    updateOverlayLayout()

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateOverlayLayout)
      return () => window.removeEventListener("resize", updateOverlayLayout)
    }

    const observer = new ResizeObserver(updateOverlayLayout)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    const container = mapRef.current

    if (!map || !container || typeof ResizeObserver === "undefined") {
      return
    }

    const observer = new ResizeObserver(() => {
      if (!hasUsableMapSize(map)) {
        return
      }

      map.resize()

      if (isLoaded) {
        rebuildCameraTimeline(map)
        if (isJourneyCompleteRef.current) {
          showJourneyCompleteOverview(map, 0)
          return
        }

        drawRoute(map)
        refreshViewportMarkers(map)
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [isLoaded])

  const changeMapStyle = (style: MapStyleOptionId) => {
    setMapStyle(style)
  }

  const getCurrentTravelerCenter = (): RouteCoordinate => {
    const markerLngLat = markerRef.current?.getLngLat()
    if (markerLngLat) {
      return [markerLngLat.lng, markerLngLat.lat]
    }

    return animatedRouteCoordinateRef.current ?? liveRouteCoordinate
  }

  const searchLocations = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()

    const query = searchQuery.trim()
    if (!query) {
      setSearchResults([])
      setActiveSearchIndex(-1)
      setSearchError(null)
      return
    }

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }
    searchAbortRef.current?.abort()

    const controller = new AbortController()
    searchAbortRef.current = controller
    setIsSearching(true)
    setSearchError(null)

    try {
      const results = await fetchLocationSuggestions(query, getLocationSearchBias(), controller.signal)
      setSearchResults(results)
      setActiveSearchIndex(results.length > 0 ? 0 : -1)
      setSearchError(results.length === 0 ? "No matches found" : null)
    } catch {
      if (!controller.signal.aborted) {
        setSearchResults([])
        setActiveSearchIndex(-1)
        setSearchError("Search unavailable")
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false)
      }
    }
  }

  const selectSearchResult = (feature: GeocodingFeature) => {
    const map = mapInstanceRef.current
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }
    searchAbortRef.current?.abort()
    suppressAutocompleteRef.current = true
    setSearchQuery(feature.place_name)
    setSearchResults([])
    setActiveSearchIndex(-1)
    setSearchError(null)
    setIsSearching(false)

    if (!map) {
      return
    }

    clearTrackingLoading()
    clearManualFollowResume()
    clearRouteIntroAnimation()
    isFollowingRef.current = false
    updateTrackingEnabled(false)
    map.stop()
    map.flyTo({
      center: feature.center,
      zoom: getSearchResultZoom(feature, map.getZoom()),
      essential: true,
      duration: 900,
    })
  }

  const clearSearch = () => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }
    searchAbortRef.current?.abort()
    setSearchQuery("")
    setSearchResults([])
    setActiveSearchIndex(-1)
    setSearchError(null)
    setIsSearching(false)
  }

  const openGoogleMapsSearch = () => {
    const query = searchQuery.trim()
    if (!query) {
      return
    }

    const url = new URL("https://www.google.com/maps/search/")
    url.searchParams.set("api", "1")
    url.searchParams.set("query", query)
    window.open(url.toString(), "_blank", "noopener,noreferrer")
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      if (searchResults.length === 0) {
        return
      }

      setActiveSearchIndex((currentIndex) => (currentIndex + 1) % searchResults.length)
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      if (searchResults.length === 0) {
        return
      }

      setActiveSearchIndex((currentIndex) => (currentIndex <= 0 ? searchResults.length - 1 : currentIndex - 1))
      return
    }

    if (event.key === "Enter" && activeSearchIndex >= 0 && searchResults[activeSearchIndex]) {
      event.preventDefault()
      selectSearchResult(searchResults[activeSearchIndex])
      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      setSearchResults([])
      setActiveSearchIndex(-1)
      setSearchError(null)
    }
  }

  const centerOnCurrentLocation = () => {
    const map = mapInstanceRef.current
    if (!map) {
      return
    }

    clearManualFollowResume()
    clearRouteIntroAnimation()
    const followTime = Number.isFinite(animatedRouteTimeRef.current)
      ? animatedRouteTimeRef.current
      : safeCurrentKeyframe.time

    // Commit the user's intent immediately. Camera work can safely wait for a
    // usable style, but the first click must always activate tracking.
    isFollowingRef.current = true
    updateTrackingEnabled(true)
    targetRouteTimeRef.current = safeCurrentKeyframe.time
    targetRouteCoordinateRef.current = liveRouteCoordinate
    const currentCenter = map.getCenter()
    animatedCameraCenterRef.current = [currentCenter.lng, currentCenter.lat]
    animatedCameraZoomRef.current = map.getZoom()
    visualCatchUpUntilRef.current = window.performance.now() + visualCatchUpDurationMs
    startMarkerAnimation()

    if (!canUpdateCamera(map)) {
      return
    }

    try {
      updateFollowCameraTarget(map, followTime, getCurrentTravelerCenter(), map.getZoom())
      clearProgrammaticCameraMove()
      map.stop()
      setMapError(null)
    } catch {
      clearTrackingLoading()
      clearProgrammaticCameraMove()
      setMapError("The map view could not center on the traveler yet.")
    }
  }

  const toggleTravelerTracking = () => {
    if (isTrackingEnabledRef.current) {
      clearManualFollowResume()
      clearRouteIntroAnimation()
      clearTrackingLoading()
      isFollowingRef.current = false
      updateTrackingEnabled(false)
      return
    }

    centerOnCurrentLocation()
  }

  const fitToRoute = () => {
    if (mapInstanceRef.current) {
      clearManualFollowResume()
      clearRouteIntroAnimation()
      clearTrackingLoading()
      isFollowingRef.current = false
      updateTrackingEnabled(false)
      fitMapToRoute(mapInstanceRef.current, 1000)
    }
  }

  useEffect(() => {
    if (isPlaying || !isLoaded || isRouteIntroActive) {
      return
    }

    const map = mapInstanceRef.current
    if (!map || !markerRef.current) {
      return
    }

    if (!hasUsableMapSize(map) || !isFollowingRef.current) return
    snapTravelerToPlaybackTime(map, safeCurrentKeyframe.time, liveRouteCoordinate, {
      snapCamera: true,
    })
  }, [isLoaded, isPlaying, liveRouteCoordinate, safeCurrentKeyframe.time])

  const isMapBusy = !isLoaded || isTrackingLoading
  const googleMapsQuery = searchQuery.trim()

  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      <div
        ref={mapRef}
        className={`relative z-0 h-full w-full overflow-hidden transition duration-200 ${isMapBusy ? "blur-sm" : ""}`}
      />
      {mapError && (
        <div className="absolute inset-x-4 bottom-4 z-20">
          <div className="flex items-center justify-between gap-4 bg-white/95 p-3 text-sm text-slate-700 shadow-lg backdrop-blur-sm">
            <span>{mapError}</span>
            {hasMapboxAccessToken && (
              <Button variant="secondary" size="sm" onClick={fitToRoute}>
                Fit route
              </Button>
            )}
          </div>
        </div>
      )}

      {isRouteIntroActive && (
        <div className="pointer-events-none absolute inset-0 z-40 flex flex-col justify-between bg-gradient-to-b from-slate-950/10 via-transparent to-slate-950/45 p-3 text-white sm:p-4">
          <div className="w-full max-w-sm rounded-lg border border-white/10 bg-slate-950/35 p-3 shadow-lg backdrop-blur-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase text-white/60">Route intro</p>
                <h2 className="mt-0.5 text-base font-semibold sm:text-lg">Journey preview</h2>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/10 px-2.5 py-1.5 text-right">
                <p className="text-[10px] font-semibold uppercase text-white/55">Distance</p>
                <p className="text-sm font-semibold">{routeIntroStats.distanceLabel}</p>
              </div>
            </div>

            {routeIntroStats.destinationNames.length > 0 && (
              <div className="mt-2.5">
                <p className="text-[10px] font-semibold uppercase text-white/60">Major places</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {routeIntroStats.destinationNames.map((name, index) => (
                    <span
                      key={`${name}-${index}`}
                      className="max-w-full truncate rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs font-medium text-white/90"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex w-full self-stretch sm:w-56 sm:self-end">
            <Button
              type="button"
              onClick={startTrackingFromRouteIntro}
              aria-label={
                isRouteIntroAutoStartCancelled
                  ? "Start tracking manually; automatic tracking was canceled by map interaction"
                  : `Start tracking now; tracking starts automatically after ${routeIntroDurationMs / 1000} seconds`
              }
              className="pointer-events-auto relative h-11 w-full overflow-hidden rounded-lg border border-white/25 bg-slate-950/75 px-4 text-white shadow-lg hover:bg-slate-950/75"
            >
              {routeIntroCountdownCycle > 0 && !isRouteIntroAutoStartCancelled ? (
                <span
                  key={routeIntroCountdownCycle}
                  aria-hidden="true"
                  className="route-intro-countdown-fill absolute inset-0 origin-left bg-orange-600"
                  style={{ animationDuration: `${routeIntroDurationMs}ms` }}
                />
              ) : null}
              <span className="relative z-10 flex items-center justify-center">
                <Play className="mr-2 h-4 w-4" />
                Start Tracking
              </span>
            </Button>
          </div>
        </div>
      )}

      {hasMapboxAccessToken && !isRouteIntroActive && (
        <div
          className={`pointer-events-none absolute inset-x-2 top-2 z-30 flex gap-1.5 sm:inset-x-3 sm:top-3 sm:gap-2 ${
            isMapOverlayWide ? "flex-row items-start justify-between" : "flex-col"
          }`}
        >
        <form onSubmit={searchLocations} className="pointer-events-auto w-full max-w-full sm:w-[18rem] 2xl:w-[21rem]">
          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-950/60 p-1 shadow-lg backdrop-blur-md sm:gap-2 sm:rounded-xl">
            <Search className="ml-2 h-4 w-4 shrink-0 text-white/60" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search nearby places"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchResults.length > 0 || Boolean(searchError) || isSearching || Boolean(googleMapsQuery)}
              aria-controls="watch-map-search-suggestions"
              aria-activedescendant={
                activeSearchIndex >= 0 ? `watch-map-search-suggestion-${activeSearchIndex}` : undefined
              }
              className="h-8 border-0 bg-transparent px-0 text-sm text-white shadow-none placeholder:text-white/60 focus-visible:ring-0 focus-visible:ring-offset-0 sm:h-9"
            />
            {searchQuery && (
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-white/75 hover:bg-white/10 hover:text-white" onClick={clearSearch}>
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={isSearching}
              className="h-8 bg-white/20 px-3 text-white hover:bg-white/25 disabled:bg-white/10 disabled:text-white/50 sm:h-9"
            >
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Go"}
            </Button>
          </div>

          {(searchResults.length > 0 || searchError || isSearching || googleMapsQuery) && (
            <div
              id="watch-map-search-suggestions"
              role="listbox"
              className="mt-1.5 max-h-[min(18rem,calc(100dvh-9rem))] overflow-y-auto rounded-lg border border-white/10 bg-slate-950/75 shadow-lg backdrop-blur-md sm:mt-2 sm:rounded-xl"
            >
              {isSearching && searchResults.length === 0 && (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-white/70">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching...
                </div>
              )}
              {searchResults.map((feature, index) => (
                <button
                  key={feature.id}
                  id={`watch-map-search-suggestion-${index}`}
                  type="button"
                  role="option"
                  aria-selected={activeSearchIndex === index}
                  className={`block w-full px-3 py-2 text-left text-sm text-white/75 ${
                    activeSearchIndex === index ? "bg-white/20" : "hover:bg-white/10"
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectSearchResult(feature)}
                >
                  <span className="line-clamp-1 font-medium text-white">{feature.text}</span>
                  <span className="line-clamp-1 text-xs text-white/60">{feature.place_name}</span>
                </button>
              ))}
              {searchError && <p className="px-3 py-2 text-sm text-white/70">{searchError}</p>}
              {googleMapsQuery && (
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 border-t border-white/10 px-3 py-2 text-left text-sm font-medium text-white hover:bg-white/10"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={openGoogleMapsSearch}
                >
                  <span className="truncate">Search Google Maps</span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-white/60" />
                </button>
              )}
            </div>
          )}
        </form>

        <div
          className={`pointer-events-auto flex max-w-full flex-wrap justify-end gap-1 sm:gap-2 ${
            isMapOverlayWide ? "self-start" : "self-end"
          }`}
        >
          <div className="flex shrink-0 items-center rounded-lg border border-white/10 bg-slate-950/60 p-1 shadow-lg backdrop-blur-md sm:rounded-xl">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={`relative h-8 w-8 overflow-visible rounded-lg border transition-all duration-200 ${
                isTrackingEnabled
                  ? "border-emerald-200 bg-emerald-500 text-slate-950 shadow-[0_0_0_2px_rgba(16,185,129,0.28),0_0_18px_rgba(16,185,129,0.8)] hover:bg-emerald-400 hover:text-slate-950"
                  : "border-transparent text-white/75 hover:bg-white/10 hover:text-white"
              }`}
              aria-pressed={isTrackingEnabled}
              aria-label={isTrackingEnabled ? "Stop tracking traveler" : "Track traveler"}
              title={isTrackingEnabled ? "Stop tracking traveler" : "Track traveler"}
              style={isTrackingEnabled ? { color: "#03120c" } : undefined}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                toggleTravelerTracking()
              }}
            >
              <Crosshair className={`h-4 w-4 ${isTrackingEnabled ? "stroke-[2.5]" : ""}`} />
            </Button>
          </div>
          <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1 rounded-lg border border-white/10 bg-slate-950/60 p-1 shadow-lg backdrop-blur-md sm:rounded-xl">
            {mapStyleOptions.map((option) => (
              <Button
                key={option.id}
                type="button"
                size="sm"
                variant={mapStyle === option.id ? "default" : "ghost"}
                className={`h-8 shrink-0 rounded-lg px-2 text-[11px] sm:h-9 sm:px-3 sm:text-xs 2xl:text-sm ${
                  mapStyle === option.id
                    ? "bg-white/20 text-white hover:bg-white/25"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
                onClick={() => changeMapStyle(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
        </div>
      )}

      {isMapBusy && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-100/70 backdrop-blur-sm">
          <div className="text-center">
            <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-orange-600"></div>
            <p className="text-sm text-slate-700">{isLoaded ? "Centering traveler..." : "Loading map..."}</p>
          </div>
        </div>
      )}
    </div>
  )
}
