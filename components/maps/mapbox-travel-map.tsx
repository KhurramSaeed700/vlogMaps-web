"use client"

import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { Crosshair, ExternalLink, Loader2, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fetchRoutedLegsForKeyframes, type RouteCoordinate, type RoutedLeg } from "@/lib/mapbox-directions"
import { mapboxAccessToken } from "@/lib/mapbox"
import { getTimestampLegKey, type CreatorRouteShapes } from "@/lib/creator-route-shapes"

interface Keyframe {
  id?: string
  time: number
  stopEndTime?: number
  lat: number
  lng: number
  location: string
  description: string
  pointType?: "point" | "stop"
}

interface MapboxTravelMapProps {
  keyframes: Keyframe[]
  routeShapes?: CreatorRouteShapes
  currentKeyframe: Keyframe
  isPlaying?: boolean
  followZoomPreferenceKey?: string
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
}

interface CameraTimelineEntry extends CameraTarget {
  time: number
  coordinate: RouteCoordinate
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
const dynamicCameraMinZoom = 5.8
const dynamicCameraMaxZoom = 16.5
const defaultFollowZoom = 10
const birdEyeMovementMinDistanceKm = 8
const birdEyeMovementMaxDurationSeconds = 90
const birdEyeMovementMinSpeedKmPerSecond = 0.12
const birdEyeMovementPreframeMinSeconds = 3
const birdEyeMovementPreframeMaxSeconds = 8
const birdEyeMovementPaddingRatio = 0.2
const birdEyeMovementZoomOutOffset = 0.55
const cameraMovementZoomOutMinDistanceKm = 1.5
const cameraMovementZoomOutScale = 0.38
const cameraMovementMaxZoomOutOffset = 1.45
const cameraMovementOutOfViewMinZoomOutOffset = 0.85
const cameraLookAheadMinSeconds = 3
const cameraLookAheadMaxSeconds = 16
const cameraLookAheadMaxWeight = 0.42
const cameraSpeedZoomOutScale = 0.45
const cameraSpeedZoomOutMaxOffset = 1.15
const cameraStationaryZoomInOffset = 0.45
const cameraFollowDeadZoneMinPx = 36
const cameraFollowDeadZoneRatio = 0.085
const cameraFollowSoftPaddingRatio = 0.22
const cameraCenterSmoothingMs = 980
const cameraCenterCatchUpSmoothingMs = 460
const cameraZoomOutSmoothingMs = 620
const cameraZoomInSmoothingMs = 1650
const cameraZoomCatchUpSmoothingMs = 420
const cameraZoomDeadband = 0.08
const manualCameraOverrideDurationMs = 6500
const visualPlaybackExtrapolationMaxSeconds = 0.24
const visualPlaybackNormalSmoothingMs = 170
const visualPlaybackCatchUpSmoothingMs = 85
const visualPlaybackPausedSmoothingMs = 130
const visualCatchUpDurationMs = 1100
const routeDataReconcileCatchUpDurationMs = 420
const visualHardSeekSnapSeconds = 18
const visualHardSeekSnapDistanceKm = 18
const manualTrailMaxDirectDistanceKm = 30
const manualTrailMinRouteDetourKm = 1
const manualTrailDetourRatio = 3
const manualTrailSnapDistanceKm = 0.15
const manualTrailRoadPathMinDirectDistanceKm = 2.5
const manualTrailRoadPathMinRouteDistanceKm = 1
const markerHighlightDurationMs = 1000
const pointKeyframeMarkerColor = "#ea580c"
const stopKeyframeMarkerColor = "#0f766e"
const travelerMarkerColor = "#ef4444"
const travelerMarkerMinWidth = 16
const travelerMarkerMaxWidth = 29
const travelerMarkerMinHeight = 24
const travelerMarkerMaxHeight = 44
const routeLineColor = pointKeyframeMarkerColor
const keyframeMarkerMinZoom = 5
const keyframeMarkerMaxZoom = 13
const keyframeMarkerMinSize = 5
const keyframeMarkerMaxSize = 30
const keyframeMarkerLabelMinSize = 13
const playbackJumpSnapThresholdSeconds = 1.25
const keyframeMarkerViewportPaddingPx = Math.ceil(keyframeMarkerMaxSize / 2) + 6
const visibleMapMinTileCacheSize = 384
const visibleMapMaxTileCacheSize = 1400
const routePreloadMinTileCacheSize = 192
const routePreloadMaxTileCacheSize = 768
const routePreloadSampleCount = 32
const routePreloadStepDelayMs = 220
const routePreloadMaxZoom = 13
const mapOverlayWideMinWidth = 760
const cameraTimelineMaxSamples = 240
const cameraTimelineTargetSecondsPerSample = 2
const followZoomPreferenceMinOffset = -4
const followZoomPreferenceMaxOffset = 4
const travelerMarkerViewportPadding = {
  top: 58,
  right: 28,
  bottom: 12,
  left: 28,
}

function getKeyframeMarkerColor(pointType?: Keyframe["pointType"]) {
  return pointType === "stop" ? stopKeyframeMarkerColor : pointKeyframeMarkerColor
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getFollowZoomPreferenceStorageKey(key?: string) {
  return key ? `travelmap:follow-zoom-preference:${key}` : null
}

function readStoredFollowZoomOffset(key?: string) {
  const storageKey = getFollowZoomPreferenceStorageKey(key)
  if (!storageKey || typeof window === "undefined") {
    return 0
  }

  try {
    const value = Number(window.localStorage.getItem(storageKey))
    return Number.isFinite(value)
      ? clampNumber(value, followZoomPreferenceMinOffset, followZoomPreferenceMaxOffset)
      : 0
  } catch {
    return 0
  }
}

function writeStoredFollowZoomOffset(key: string | undefined, value: number) {
  const storageKey = getFollowZoomPreferenceStorageKey(key)
  if (!storageKey || typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(storageKey, String(Math.round(value * 100) / 100))
  } catch {
    // Follow zoom preference is a convenience; tracking still works without storage.
  }
}

function getMapStyleUrl(styleId: MapStyleOptionId) {
  return mapStyleOptions.find((option) => option.id === styleId)?.style ?? mapStyleOptions[1].style
}

async function fetchLocationSuggestions(query: string, bias: LocationSearchBias = {}, signal?: AbortSignal) {
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

function getKeyframeMarkerStyleForZoom(zoom: number) {
  const zoomProgress = getKeyframeMarkerZoomProgress(zoom)
  const sizeProgress = zoomProgress ** 2.35
  const size = keyframeMarkerMinSize + (keyframeMarkerMaxSize - keyframeMarkerMinSize) * sizeProgress
  const showLabel = size >= keyframeMarkerLabelMinSize
  const fontSize = showLabel ? clampNumber(size * 0.42, 6, 12) : 0
  const borderWidth = size < 8 ? 0.75 : clampNumber(size * 0.07, 1, 2)
  const opacity = 0.68 + 0.3 * zoomProgress ** 0.75

  return {
    size,
    fontSize,
    borderWidth,
    opacity,
    showLabel,
  }
}

function getTravelerMarkerStyleForZoom(zoom: number) {
  const zoomProgress = getKeyframeMarkerZoomProgress(zoom)
  const sizeProgress = 0.18 + 0.82 * zoomProgress ** 1.45
  const width = travelerMarkerMinWidth + (travelerMarkerMaxWidth - travelerMarkerMinWidth) * sizeProgress
  const height = travelerMarkerMinHeight + (travelerMarkerMaxHeight - travelerMarkerMinHeight) * sizeProgress

  return {
    width,
    height,
  }
}

function createTravelerMarkerElement(zoom: number) {
  const element = document.createElement("div")
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle")

  element.className = "traveler-marker"
  element.style.cssText = `
    display: block;
    pointer-events: none;
    user-select: none;
    transform-origin: bottom center;
    contain: layout paint style;
    transition: width 120ms ease, height 120ms ease;
  `

  svg.setAttribute("viewBox", "0 0 27 41")
  svg.setAttribute("aria-hidden", "true")
  svg.style.cssText = "display:block;width:100%;height:100%;overflow:visible;"

  path.setAttribute(
    "d",
    "M13.5 0C6.1 0 0 6.1 0 13.5C0 23.6 13.5 41 13.5 41C13.5 41 27 23.6 27 13.5C27 6.1 20.9 0 13.5 0Z",
  )
  path.setAttribute("fill", travelerMarkerColor)
  path.setAttribute("stroke", "white")
  path.setAttribute("stroke-width", "2")

  circle.setAttribute("cx", "13.5")
  circle.setAttribute("cy", "13.5")
  circle.setAttribute("r", "4.4")
  circle.setAttribute("fill", "white")
  circle.setAttribute("opacity", "0.95")

  svg.append(path, circle)
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

function shouldUseDirectManualTrailLeg(
  leg: RoutedLeg,
  startCoordinate: RouteCoordinate,
  endCoordinate: RouteCoordinate,
  routeDistance: number,
  directDistance: number,
) {
  if (leg.isFallback || leg.coordinates.length < 2) {
    return true
  }

  const firstRouteCoordinate = leg.coordinates[0]
  const lastRouteCoordinate = leg.coordinates[leg.coordinates.length - 1]
  if (!firstRouteCoordinate || !lastRouteCoordinate) {
    return true
  }

  if (directDistance > manualTrailMaxDirectDistanceKm) {
    return false
  }

  const hasMeaningfulRoadPath =
    directDistance >= manualTrailRoadPathMinDirectDistanceKm &&
    routeDistance >= manualTrailRoadPathMinRouteDistanceKm
  if (hasMeaningfulRoadPath) {
    return false
  }

  const startSnapDistance = haversineDistance(startCoordinate, firstRouteCoordinate)
  const endSnapDistance = haversineDistance(lastRouteCoordinate, endCoordinate)
  const hasLargeDetour =
    routeDistance >= directDistance * manualTrailDetourRatio &&
    routeDistance - directDistance >= manualTrailMinRouteDetourKm
  const isFarFromRoad = Math.max(startSnapDistance, endSnapDistance) >= manualTrailSnapDistanceKm

  return hasLargeDetour || isFarFromRoad
}

function alignRouteLegToKeyframes(leg: RoutedLeg, startCoordinate: RouteCoordinate, endCoordinate: RouteCoordinate) {
  const coordinates: RouteCoordinate[] = []
  appendRouteCoordinate(coordinates, startCoordinate)
  leg.coordinates.forEach((coordinate) => appendRouteCoordinate(coordinates, coordinate))
  appendRouteCoordinate(coordinates, endCoordinate)
  return coordinates
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
    const directDistance = haversineDistance(startCoordinate, endCoordinate)
    const routeDistance = getRouteDistanceKm(leg.coordinates)
    const shouldUseManualTrail = shouldUseDirectManualTrailLeg(
      leg,
      startCoordinate,
      endCoordinate,
      routeDistance,
      directDistance,
    )

    return {
      ...leg,
      isFallback: leg.isFallback || shouldUseManualTrail,
      coordinates: shouldUseManualTrail
        ? [startCoordinate, endCoordinate]
        : alignRouteLegToKeyframes(leg, startCoordinate, endCoordinate),
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

function buildStraightLineLegs(keyframes: Keyframe[]) {
  if (keyframes.length < 2) {
    return [] as RoutedLeg[]
  }

  return expandLegsForStopDurations(keyframes.slice(0, -1).map((keyframe, index) => ({
    fromTime: keyframe.time,
    toTime: keyframes[index + 1].time,
    coordinates: [
      [keyframe.lng, keyframe.lat],
      [keyframes[index + 1].lng, keyframes[index + 1].lat],
    ] as RouteCoordinate[],
  })), keyframes)
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

function getRevealedRouteCoordinates(legs: PositionedRoutedLeg[], currentTime: number) {
  const coordinates: RouteCoordinate[] = []

  legs.forEach((leg) => {
    if (currentTime < leg.fromTime) {
      return
    }

    if (currentTime >= leg.toTime) {
      leg.coordinates.forEach((coordinate) => appendRouteCoordinate(coordinates, coordinate))
      return
    }

    getPartialLegCoordinates(leg, currentTime).forEach((coordinate) => appendRouteCoordinate(coordinates, coordinate))
  })

  return coordinates
}

function getRouteCoordinateAtTime(legs: PositionedRoutedLeg[], currentTime: number) {
  if (legs.length === 0) {
    return null
  }

  const matchingLeg =
    legs.find((leg) => currentTime >= leg.fromTime && currentTime <= leg.toTime) ??
    (currentTime < legs[0].fromTime ? legs[0] : legs[legs.length - 1])

  const segmentDuration = Math.max(matchingLeg.toTime - matchingLeg.fromTime, 1)
  const progress = (currentTime - matchingLeg.fromTime) / segmentDuration

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

  const leg =
    legs.find((routeLeg) => currentTime >= routeLeg.fromTime && currentTime <= routeLeg.toTime) ??
    (currentTime < legs[0].fromTime ? legs[0] : legs[legs.length - 1])
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
    context.speedKmPerSecond / birdEyeMovementMinSpeedKmPerSecond,
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
    context.speedKmPerSecond / birdEyeMovementMinSpeedKmPerSecond,
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

function getCameraSpeedZoomOutOffset(context: RouteMotionContext) {
  if (context.isStationary || context.speedKmPerSecond <= 0) {
    return 0
  }

  return clampNumber(
    Math.log2(context.speedKmPerSecond / 0.035 + 1) * cameraSpeedZoomOutScale,
    0,
    cameraSpeedZoomOutMaxOffset,
  )
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
    zoom: clampNumber(zoom, dynamicCameraMinZoom, dynamicCameraMaxZoom),
  }
}

function isBirdEyeMovementLeg(leg: PositionedRoutedLeg) {
  if (leg.isStationary || leg.coordinates.length < 2) {
    return false
  }

  const durationSeconds = Math.max(leg.toTime - leg.fromTime, 1)
  const speedKmPerSecond = leg.totalDistance / durationSeconds

  return (
    leg.totalDistance >= birdEyeMovementMinDistanceKm &&
    durationSeconds <= birdEyeMovementMaxDurationSeconds &&
    speedKmPerSecond >= birdEyeMovementMinSpeedKmPerSecond
  )
}

function getBirdEyeMovementPreframeSeconds(leg: PositionedRoutedLeg) {
  const durationSeconds = Math.max(leg.toTime - leg.fromTime, 1)

  return clampNumber(
    durationSeconds * 0.35,
    birdEyeMovementPreframeMinSeconds,
    birdEyeMovementPreframeMaxSeconds,
  )
}

function getBirdEyeMovementLegForTime(legs: PositionedRoutedLeg[], currentTime: number) {
  return legs.find((leg) => {
    if (!isBirdEyeMovementLeg(leg)) {
      return false
    }

    const preframeSeconds = getBirdEyeMovementPreframeSeconds(leg)
    return currentTime >= leg.fromTime - preframeSeconds && currentTime <= leg.toTime
  })
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
  const target = getCameraTargetForCoordinates(
    map,
    getMotionWindowCoordinates(legs, currentTime),
    getRouteCoordinateAtTime(legs, currentTime) ?? [map.getCenter().lng, map.getCenter().lat],
    fallbackZoom,
    dynamicCameraViewportPaddingRatio,
  )

  if (!target) {
    return clampNumber(fallbackZoom, dynamicCameraMinZoom, dynamicCameraMaxZoom)
  }

  return target.zoom
}

function getDynamicCameraTarget(
  map: mapboxgl.Map,
  legs: PositionedRoutedLeg[],
  currentTime: number,
  currentCoordinate: RouteCoordinate,
  fallbackZoom = defaultFollowZoom,
): CameraTarget {
  const motionContext = getRouteMotionContext(legs, currentTime)
  const birdEyeLeg = getBirdEyeMovementLegForTime(legs, currentTime)
  if (birdEyeLeg) {
    const birdEyeTarget = getCameraTargetForCoordinates(
      map,
      birdEyeLeg.coordinates,
      currentCoordinate,
      fallbackZoom,
      birdEyeMovementPaddingRatio,
      dynamicCameraMaxZoom,
    )

    if (birdEyeTarget) {
      return {
        ...birdEyeTarget,
        zoom: clampNumber(
          birdEyeTarget.zoom - birdEyeMovementZoomOutOffset,
          dynamicCameraMinZoom,
          dynamicCameraMaxZoom,
        ),
      }
    }
  }

  const focusCoordinate = getCameraFocusCoordinate(legs, currentTime, currentCoordinate, motionContext)
  const dynamicZoom = getDynamicCameraZoom(map, legs, currentTime, fallbackZoom)
  const motionZoomOffset = motionContext.isStationary
    ? -cameraStationaryZoomInOffset
    : getCameraSpeedZoomOutOffset(motionContext)

  return {
    center: focusCoordinate,
    zoom: clampNumber(
      dynamicZoom - motionZoomOffset,
      dynamicCameraMinZoom,
      dynamicCameraMaxZoom,
    ),
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
        zoom: clampNumber(target.zoom, dynamicCameraMinZoom, routePreloadMaxZoom),
      },
    ]
  })
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

  legs.forEach((leg) => {
    times.add(leg.fromTime)
    times.add(leg.toTime)
    times.add(leg.fromTime + Math.max(leg.toTime - leg.fromTime, 0) / 2)
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

  const nextIndex = timeline.findIndex((entry) => entry.time >= currentTime)
  if (nextIndex <= 0) {
    return timeline[0]
  }

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
  } satisfies CameraTimelineEntry
}

function buildRouteFeature(coordinates: RouteCoordinate[]) {
  const routeCoordinates =
    coordinates.length === 0
      ? ([[0, 0], [0, 0]] as RouteCoordinate[])
      : coordinates.length === 1
      ? ([coordinates[0], coordinates[0]] as RouteCoordinate[])
      : coordinates

  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: routeCoordinates,
    },
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

function getCameraFollowSoftPadding(map: mapboxgl.Map) {
  const container = map.getContainer()
  const horizontalPadding = Math.max(72, container.clientWidth * cameraFollowSoftPaddingRatio)
  const verticalPadding = Math.max(72, container.clientHeight * cameraFollowSoftPaddingRatio)

  return {
    top: Math.max(96, verticalPadding),
    right: horizontalPadding,
    bottom: verticalPadding,
    left: horizontalPadding,
  }
}

function shouldMoveCameraCenter(
  map: mapboxgl.Map,
  currentCenter: RouteCoordinate,
  desiredCenter: RouteCoordinate,
  travelerCoordinate: RouteCoordinate,
  forceMove: boolean,
) {
  if (forceMove) {
    return true
  }

  if (!isPointWithinMapViewport(map, travelerCoordinate, getCameraFollowSoftPadding(map))) {
    return true
  }

  const container = map.getContainer()
  const desiredPoint = map.project(desiredCenter)
  const centerPoint = map.project(currentCenter)
  const pixelDistance = Math.hypot(desiredPoint.x - centerPoint.x, desiredPoint.y - centerPoint.y)
  const deadZonePx = Math.max(
    cameraFollowDeadZoneMinPx,
    Math.min(container.clientWidth, container.clientHeight) * cameraFollowDeadZoneRatio,
  )

  return pixelDistance >= deadZonePx
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
  return hasUsableMapSize(map) && map.isStyleLoaded()
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
  routeShapes,
  currentKeyframe,
  isPlaying = true,
  followZoomPreferenceKey,
  onLocationClick,
  className = "w-full h-full",
}: MapboxTravelMapProps) {
  mapboxgl.accessToken = mapboxAccessToken

  const mapRef = useRef<HTMLDivElement>(null)
  const routePreloadMapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null)
  const routePreloadMapRef = useRef<mapboxgl.Map | null>(null)
  const routePreloadMapStyleRef = useRef<MapStyleOptionId>("streets")
  const routePreloadTimerRef = useRef<number | null>(null)
  const routePreloadQueueRef = useRef<CameraTarget[]>([])
  const routePreloadSignatureRef = useRef("")
  const routePreloadGenerationRef = useRef(0)
  const markerRef = useRef<mapboxgl.Marker | null>(null)
  const travelerMarkerSizeRef = useRef<string | null>(null)
  const keyframeMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const keyframeMarkerElementsRef = useRef<Map<string, { element: HTMLButtonElement; time: number }>>(new Map())
  const reachedKeyframeMarkersRef = useRef<ReachedKeyframeMarker[]>([])
  const visibleKeyframeMarkersSignatureRef = useRef("")
  const highlightedKeyframeKeysRef = useRef<Set<string>>(new Set())
  const keyframeHighlightTimeoutsRef = useRef<Map<string, number>>(new Map())
  const viewportMarkerFrameRef = useRef<number | null>(null)
  const previousHighlightTimeRef = useRef<number | null>(null)
  const onLocationClickRef = useRef(onLocationClick)
  const keyframesRef = useRef<Keyframe[]>([])
  const routeCoordinatesRef = useRef<RouteCoordinate[]>([])
  const positionedLegsRef = useRef<PositionedRoutedLeg[]>([])
  const cameraTimelineRef = useRef<CameraTimelineEntry[]>([])
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
  const followZoomOffsetRef = useRef(readStoredFollowZoomOffset(followZoomPreferenceKey))
  const isAutomatedCameraUpdateRef = useRef(false)
  const isUserZoomingWhileFollowingRef = useRef(false)
  const isPlayingRef = useRef(isPlaying)
  const animationFrameRef = useRef<number | null>(null)
  const previousAnimationTimestampRef = useRef<number | null>(null)
  const previousPlaybackTimeRef = useRef<number | null>(null)
  const latestPlaybackTimeRef = useRef(0)
  const targetPlaybackUpdatedAtRef = useRef(0)
  const visualCatchUpUntilRef = useRef(0)
  const lastAnimatedRouteDrawTimestampRef = useRef(0)
  const lastRouteDataReconcileSignatureRef = useRef("")
  const hasFocusedCurrentLocationRef = useRef(false)
  const isFollowingRef = useRef(true)
  const isManualCameraOverrideRef = useRef(false)
  const manualFollowResumeTimerRef = useRef<number | null>(null)
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
  const [isFollowingTraveler, setIsFollowingTraveler] = useState(true)
  const [isTrackingLoading, setIsTrackingLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<GeocodingFeature[]>([])
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [routedLegs, setRoutedLegs] = useState<RoutedLeg[]>([])
  const [isMapOverlayWide, setIsMapOverlayWide] = useState(false)

  isPlayingRef.current = isPlaying

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
    const timelineTarget = getCameraTimelineTargetAtTime(cameraTimelineRef.current, currentTime)
    if (timelineTarget) {
      return {
        center: timelineTarget.center,
        zoom: timelineTarget.zoom,
      } satisfies CameraTarget
    }

    return getDynamicCameraTarget(map, legs, currentTime, currentCoordinate, fallbackZoom)
  }

  const rebuildCameraTimeline = (map: mapboxgl.Map) => {
    if (!canUpdateCamera(map)) {
      return
    }

    cameraTimelineRef.current = buildCameraTimeline(map, positionedLegsRef.current)
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
      window.setTimeout(() => {
        isAutomatedCameraUpdateRef.current = false
      }, 0)
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

  const updateFollowCameraTarget = (
    map: mapboxgl.Map,
    routeTime: number,
    routeCoordinate: RouteCoordinate,
    fallbackZoom = map.getZoom(),
  ) => {
    const cameraTarget = getAutomaticCameraTarget(
      map,
      positionedLegsRef.current,
      routeTime,
      routeCoordinate,
      fallbackZoom,
    )
    targetCameraCenterRef.current = cameraTarget.center
    targetCameraZoomRef.current = getPreferredFollowZoom(cameraTarget.zoom)
  }

  const getFramePlaybackTargetTime = (timestamp: number) => {
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
    if (!map || !hasUsableMapSize(map)) {
      clearManualFollowResume()
      return
    }

    clearManualFollowResume()
    isFollowingRef.current = true
    setIsFollowingTraveler(true)

    const currentCenter = map.getCenter()
    animatedCameraCenterRef.current = [currentCenter.lng, currentCenter.lat]
    animatedCameraZoomRef.current = map.getZoom()
    const routeTime = animatedRouteTimeRef.current || targetRouteTimeRef.current
    const routeCoordinate = animatedRouteCoordinateRef.current ?? liveRouteCoordinateRef.current
    updateFollowCameraTarget(map, routeTime, routeCoordinate, map.getZoom())
    visualCatchUpUntilRef.current = window.performance.now() + visualCatchUpDurationMs
    startMarkerAnimation()
  }

  const suspendFollowForManualInteraction = (
    map: mapboxgl.Map,
    durationMs = manualCameraOverrideDurationMs,
  ) => {
    if (!isFollowingRef.current && !isManualCameraOverrideRef.current) {
      return
    }

    clearManualFollowResume(false)
    clearTrackingLoading()
    clearProgrammaticCameraMove()
    isManualCameraOverrideRef.current = true
    isFollowingRef.current = false
    setIsFollowingTraveler(false)

    const currentCenter = map.getCenter()
    animatedCameraCenterRef.current = [currentCenter.lng, currentCenter.lat]
    animatedCameraZoomRef.current = map.getZoom()

    manualFollowResumeTimerRef.current = window.setTimeout(
      resumeFollowFromManualOverride,
      durationMs,
    )
  }

  useEffect(() => {
    onLocationClickRef.current = onLocationClick
  }, [onLocationClick])

  useEffect(() => {
    followZoomOffsetRef.current = readStoredFollowZoomOffset(followZoomPreferenceKey)
  }, [followZoomPreferenceKey])

  const safeKeyframes = useMemo(() => {
    return [...keyframes].filter(isValidKeyframe).sort((left, right) => left.time - right.time)
  }, [keyframes])
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

      return `${keyframeSignature}|routes:${routeShapesSignature}`
    },
    [routeShapesSignature, safeKeyframes],
  )

  useEffect(() => {
    let isMounted = true

    fetchRoutedLegsForKeyframes(routableKeyframes).then((nextLegs) => {
      if (isMounted) {
        setRoutedLegs(nextLegs)
      }
    })

    return () => {
      isMounted = false
    }
  }, [routableKeyframes])

  const fallbackRoutedLegs = useMemo(() => buildStraightLineLegs(safeKeyframes), [safeKeyframes])
  const manualAwareRoutedLegs = useMemo(
    () => normalizeRoutedLegsForManualKeyframes(routedLegs, safeKeyframes),
    [routedLegs, safeKeyframes],
  )
  const stopAwareRoutedLegs = useMemo(
    () => expandLegsForStopDurations(manualAwareRoutedLegs, safeKeyframes),
    [manualAwareRoutedLegs, safeKeyframes],
  )
  const positionedLegs = useMemo(
    () => buildPositionedLegs(stopAwareRoutedLegs.length > 0 ? stopAwareRoutedLegs : fallbackRoutedLegs),
    [fallbackRoutedLegs, stopAwareRoutedLegs],
  )
  const routeCoordinates = useMemo(() => {
    const activeLegs = stopAwareRoutedLegs.length > 0 ? stopAwareRoutedLegs : fallbackRoutedLegs
    if (activeLegs.length > 0) {
      return flattenLegCoordinates(activeLegs)
    }

    return safeKeyframes.map((keyframe) => [keyframe.lng, keyframe.lat] as RouteCoordinate)
  }, [fallbackRoutedLegs, safeKeyframes, stopAwareRoutedLegs])

  const liveRouteCoordinate =
    getRouteCoordinateAtTime(positionedLegs, safeCurrentKeyframe.time) ??
    ([safeCurrentKeyframe.lng, safeCurrentKeyframe.lat] as RouteCoordinate)
  const hasResolvedRoutedLegs = routedLegs.length > 0 || safeKeyframes.length < 2

  keyframesRef.current = safeKeyframes
  routeCoordinatesRef.current = routeCoordinates
  positionedLegsRef.current = positionedLegs
  latestPlaybackTimeRef.current = safeCurrentKeyframe.time
  targetRouteTimeRef.current = safeCurrentKeyframe.time
  liveRouteCoordinateRef.current = liveRouteCoordinate
  targetRouteCoordinateRef.current = liveRouteCoordinate

  useEffect(() => {
    stopMarkerAnimation()
    clearManualFollowResume()
    clearKeyframeMarkers()
    previousPlaybackTimeRef.current = null
    previousHighlightTimeRef.current = null
    highlightedKeyframeKeysRef.current.clear()
    lastRouteDataReconcileSignatureRef.current = ""
    cameraTimelineRef.current = []
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
    isFollowingRef.current = true
    setIsFollowingTraveler(true)

    const map = mapInstanceRef.current
    const marker = markerRef.current
    if (!map || !marker) {
      return
    }

    marker.setLngLat(liveRouteCoordinate)
    runWhenStyleReady(map, () => {
      drawRoute(map)
      syncTravelerMarkerVisibility(map)
    })
  }, [routeSignature])

  const resetKeyframeMarkerElement = (element: HTMLElement) => {
    element.style.backgroundColor = element.dataset.normalBackground ?? pointKeyframeMarkerColor
    element.style.color = "white"
  }

  const highlightKeyframeMarker = (markerKey: string, element: HTMLElement) => {
    const existingTimeout = keyframeHighlightTimeoutsRef.current.get(markerKey)
    if (existingTimeout) {
      window.clearTimeout(existingTimeout)
    }

    element.style.backgroundColor = "#facc15"
    element.style.color = "#0f172a"

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

    element.style.width = `${markerStyle.size}px`
    element.style.height = `${markerStyle.size}px`
    element.style.fontSize = `${markerStyle.fontSize}px`
    element.style.borderWidth = `${markerStyle.borderWidth}px`
    element.style.opacity = `${markerStyle.opacity}`
    element.style.boxShadow = `0 ${markerStyle.showLabel ? 2 : 1}px ${markerStyle.showLabel ? 4 : 2}px rgba(0,0,0,${shadowOpacity})`
  }

  const updateKeyframeMarkerSizes = (map: mapboxgl.Map) => {
    const zoom = map.getZoom()
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

    marker.getElement().style.display = isVisible ? "" : "none"
  }

  const updateTravelerMarkerSize = (map: mapboxgl.Map) => {
    const marker = markerRef.current
    if (!marker) {
      return
    }

    const markerStyle = applyTravelerMarkerSize(marker.getElement(), map.getZoom())
    const nextSizeKey = `${Math.round(markerStyle.width * 10)}:${Math.round(markerStyle.height * 10)}`
    if (travelerMarkerSizeRef.current === nextSizeKey) {
      return
    }

    travelerMarkerSizeRef.current = nextSizeKey
  }

  const createKeyframeMarker = (
    map: mapboxgl.Map,
    keyframe: Keyframe,
    pointNumber: number,
    markerKey: string,
  ) => {
    const el = document.createElement("button")
    const markerColor = getKeyframeMarkerColor(keyframe.pointType)
    el.type = "button"
    el.className = "keyframe-marker"
    el.dataset.normalBackground = markerColor
    el.style.cssText = `
      border-radius: 50%;
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
      transition: width 120ms ease, height 120ms ease, border-width 120ms ease, font-size 120ms ease, opacity 120ms ease, box-shadow 120ms ease, background-color 160ms ease, color 160ms ease;
    `
    updateKeyframeMarkerElementSize(el, map.getZoom())
    el.textContent = pointNumber.toString()
    el.setAttribute("aria-label", `Jump to route point ${pointNumber}`)
    el.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      onLocationClickRef.current?.(keyframe)
    })
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

  const scheduleViewportMarkerRefresh = (map: mapboxgl.Map) => {
    if (viewportMarkerFrameRef.current !== null) {
      return
    }

    viewportMarkerFrameRef.current = window.requestAnimationFrame(() => {
      viewportMarkerFrameRef.current = null
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
    const isCatchUp = timestamp < visualCatchUpUntilRef.current
    const playbackSmoothingMs = isCatchUp
      ? visualPlaybackCatchUpSmoothingMs
      : isPlayingRef.current
        ? visualPlaybackNormalSmoothingMs
        : visualPlaybackPausedSmoothingMs
    const smoothing = 1 - Math.exp(-deltaMs / playbackSmoothingMs)
    const nextTime = currentTime + (targetTime - currentTime) * smoothing
    const snappedTime = Math.abs(nextTime - targetTime) < (isPlayingRef.current ? 0.025 : 0.01) ? targetTime : nextTime
    const snappedCoordinate = getRouteCoordinateAtTime(positionedLegsRef.current, snappedTime) ?? target

    animatedRouteTimeRef.current = snappedTime
    routeRevealTimeRef.current = snappedTime
    animatedRouteCoordinateRef.current = snappedCoordinate
    marker.setLngLat(snappedCoordinate)

    if (isFollowingRef.current && canUpdateCamera(map)) {
      updateFollowCameraTarget(map, snappedTime, snappedCoordinate, animatedCameraZoomRef.current)
    }

    const shouldDrawRoute =
      timestamp - lastAnimatedRouteDrawTimestampRef.current >= 50 ||
      Math.abs(snappedTime - targetTime) < 0.08
    if (shouldDrawRoute) {
      drawRoute(map)
      lastAnimatedRouteDrawTimestampRef.current = timestamp
    }

    let snappedZoom = animatedCameraZoomRef.current
    let effectiveCameraCenterTarget = targetCameraCenterRef.current
    let effectiveCameraZoomTarget = targetCameraZoomRef.current
    let isCameraCenterHeld = false
    if (isFollowingRef.current && canUpdateCamera(map)) {
      const currentZoom = animatedCameraZoomRef.current
      const currentCenter = animatedCameraCenterRef.current
      const desiredCenter = targetCameraCenterRef.current
      const distanceToTargetKm = haversineDistance(currentCenter, desiredCenter)
      const targetZoom = targetCameraZoomRef.current
      const isTravelerVisible = isPointWithinMapViewport(
        map,
        snappedCoordinate,
        travelerMarkerViewportPadding,
      )
      const zoomOutOffset = Math.max(
        getCameraMovementZoomOutOffset(distanceToTargetKm),
        isTravelerVisible ? 0 : cameraMovementOutOfViewMinZoomOutOffset,
      )
      const movementAwareTargetZoom = clampNumber(
        targetZoom - zoomOutOffset,
        dynamicCameraMinZoom,
        dynamicCameraMaxZoom,
      )
      effectiveCameraZoomTarget =
        !isCatchUp &&
        isPlayingRef.current &&
        Math.abs(movementAwareTargetZoom - currentZoom) < cameraZoomDeadband
          ? currentZoom
          : movementAwareTargetZoom
      const zoomSmoothing = 1 - Math.exp(
        -deltaMs /
          (isCatchUp
            ? cameraZoomCatchUpSmoothingMs
            : effectiveCameraZoomTarget < currentZoom
              ? cameraZoomOutSmoothingMs
              : cameraZoomInSmoothingMs),
      )
      const nextZoom = currentZoom + (effectiveCameraZoomTarget - currentZoom) * zoomSmoothing
      snappedZoom =
        Math.abs(nextZoom - effectiveCameraZoomTarget) < 0.015
          ? effectiveCameraZoomTarget
          : nextZoom
      animatedCameraZoomRef.current = snappedZoom
      const shouldMoveCenter = shouldMoveCameraCenter(
        map,
        currentCenter,
        desiredCenter,
        snappedCoordinate,
        isCatchUp || !isPlayingRef.current,
      )
      effectiveCameraCenterTarget = shouldMoveCenter ? desiredCenter : currentCenter
      isCameraCenterHeld = !shouldMoveCenter
      const centerSmoothing = 1 - Math.exp(
        -deltaMs / (isCatchUp ? cameraCenterCatchUpSmoothingMs : cameraCenterSmoothingMs),
      )
      const nextCenter: RouteCoordinate = [
        currentCenter[0] + (effectiveCameraCenterTarget[0] - currentCenter[0]) * centerSmoothing,
        currentCenter[1] + (effectiveCameraCenterTarget[1] - currentCenter[1]) * centerSmoothing,
      ]
      const snappedCenter =
        coordinateDistance(nextCenter, effectiveCameraCenterTarget) < 0.00001
          ? effectiveCameraCenterTarget
          : nextCenter
      animatedCameraCenterRef.current = snappedCenter

      try {
        runAutomatedCameraUpdate(() => {
          map.jumpTo({ center: snappedCenter, zoom: snappedZoom })
        })
      } catch {
        // Skip this frame and let the next one retry once the map settles.
      }
    } else if (map) {
      const center = map.getCenter()
      animatedCameraCenterRef.current = [center.lng, center.lat]
      animatedCameraZoomRef.current = map.getZoom()
      snappedZoom = animatedCameraZoomRef.current
    }

    syncTravelerMarkerVisibility(map)

    const hasReachedCoordinate = Math.abs(snappedTime - targetTime) < 0.08 || coordinateDistance(snappedCoordinate, target) < 0.00001
    const hasReachedCenter =
      !isFollowingRef.current ||
      isCameraCenterHeld ||
      coordinateDistance(animatedCameraCenterRef.current, effectiveCameraCenterTarget) < 0.00001
    const hasReachedZoom =
      !isFollowingRef.current ||
      Math.abs(snappedZoom - effectiveCameraZoomTarget) < 0.015
    if (hasReachedCoordinate && hasReachedCenter && hasReachedZoom) {
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
    options: { forceTravelerSnap?: boolean; catchUpDurationMs?: number } = {},
  ) => {
    stopMarkerAnimation()
    clearTrackingLoading()
    clearProgrammaticCameraMove()
    const previousCoordinate = animatedRouteCoordinateRef.current
    const routeJumpDistanceKm = haversineDistance(previousCoordinate, nextCoordinate)
    const routeJumpSeconds = Math.abs(nextTime - animatedRouteTimeRef.current)
    const shouldHardSnapTraveler =
      Boolean(options.forceTravelerSnap) ||
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
      markerRef.current?.setLngLat(nextCoordinate)
    }

    if (isFollowingRef.current && canUpdateCamera(map)) {
      updateFollowCameraTarget(map, nextTime, nextCoordinate, map.getZoom())
      const currentCenter = map.getCenter()
      animatedCameraCenterRef.current = [currentCenter.lng, currentCenter.lat]
      animatedCameraZoomRef.current = map.getZoom()

      try {
        map.stop()
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

  const updateRouteSource = (map: mapboxgl.Map, coordinates: RouteCoordinate[]) => {
    const routeFeature = buildRouteFeature(coordinates)
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
    if (map.getLayer("route")) {
      try {
        map.moveLayer("route")
      } catch {
        // Some style reload phases briefly reject layer moves; the next draw will retry.
      }
      return
    }

    map.addLayer({
      id: "route",
      type: "line",
      source: "route",
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": routeLineColor,
        "line-width": 4.5,
        "line-opacity": 0.92,
      },
    })

    try {
      map.moveLayer("route")
    } catch {
      // Some style reload phases briefly reject layer moves; the next draw will retry.
    }
  }

  const drawRoute = (map: mapboxgl.Map) => {
    const activeKeyframes = keyframesRef.current
    const activePositionedLegs = positionedLegsRef.current
    const revealTime = routeRevealTimeRef.current
    const revealedRouteCoordinates = getRevealedRouteCoordinates(activePositionedLegs, revealTime)

    if (!map.isStyleLoaded()) {
      return
    }

    try {
      updateRouteSource(map, revealedRouteCoordinates)
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

  const clearRoutePreloadTimer = () => {
    if (routePreloadTimerRef.current !== null) {
      window.clearTimeout(routePreloadTimerRef.current)
      routePreloadTimerRef.current = null
    }
  }

  const getOrCreateRoutePreloadMap = () => {
    if (routePreloadMapRef.current) {
      return routePreloadMapRef.current
    }

    const container = routePreloadMapContainerRef.current
    if (!container) {
      return null
    }

    try {
      mapboxgl.prewarm()
      const preloadMap = new mapboxgl.Map({
        container,
        style: getMapStyleUrl(mapStyle),
        center: liveRouteCoordinateRef.current,
        zoom: Math.min(defaultFollowZoom, routePreloadMaxZoom),
        attributionControl: false,
        interactive: false,
        fadeDuration: 0,
        minTileCacheSize: routePreloadMinTileCacheSize,
        maxTileCacheSize: routePreloadMaxTileCacheSize,
      })

      preloadMap.on("error", () => undefined)
      routePreloadMapRef.current = preloadMap
      routePreloadMapStyleRef.current = mapStyle
      return preloadMap
    } catch {
      return null
    }
  }

  const scheduleRoutePreloadStep = (delay = routePreloadStepDelayMs) => {
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

    const preloadMap = getOrCreateRoutePreloadMap()
    if (!preloadMap) {
      return
    }

    if (routePreloadMapStyleRef.current !== mapStyle) {
      try {
        preloadMap.setStyle(getMapStyleUrl(mapStyle))
        routePreloadMapStyleRef.current = mapStyle
      } catch {
        return
      }
    }

    if (!preloadMap.isStyleLoaded()) {
      preloadMap.once("style.load", () => {
        if (generation === routePreloadGenerationRef.current) {
          scheduleRoutePreloadStep(0)
        }
      })
      return
    }

    const target = routePreloadQueueRef.current.shift()
    if (!target) {
      return
    }

    try {
      preloadMap.jumpTo({
        center: target.center,
        zoom: target.zoom,
        bearing: 0,
        pitch: 0,
      })
    } catch {
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

    preloadMap.once("idle", scheduleNextStep)
    clearRoutePreloadTimer()
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
    routePreloadMapRef.current?.remove()
    routePreloadMapRef.current = null
  }

  useEffect(() => {
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
      anchor: "bottom",
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
    hasFocusedCurrentLocationRef.current = false
    isFollowingRef.current = true
    setIsFollowingTraveler(true)

    const handleUserMapDrag = (event: unknown) => {
      if (hasOriginalMapEvent(event)) {
        suspendFollowForManualInteraction(map)
      }
    }

    const handleMapMove = () => {
      scheduleViewportMarkerRefresh(map)
    }

    const keepTravelerCenteredDuringFollowZoom = () => {
      if (!isUserZoomingWhileFollowingRef.current || !canUpdateCamera(map)) {
        return
      }

      const travelerCenter = animatedRouteCoordinateRef.current ?? liveRouteCoordinateRef.current
      targetCameraCenterRef.current = travelerCenter
      animatedCameraCenterRef.current = travelerCenter
      animatedCameraZoomRef.current = map.getZoom()

      try {
        runAutomatedCameraUpdate(() => {
          map.jumpTo({ center: travelerCenter, zoom: map.getZoom() })
        })
      } catch {
        // The next zoom frame or follow animation will re-center when the map is ready.
      }
    }

    const handleMapZoomStart = () => {
      if (
        isFollowingRef.current &&
        !isAutomatedCameraUpdateRef.current &&
        !isProgrammaticCameraMoveRef.current
      ) {
        isUserZoomingWhileFollowingRef.current = true
        clearManualFollowResume()
        clearTrackingLoading()
        clearProgrammaticCameraMove()
        stopMarkerAnimation()
        keepTravelerCenteredDuringFollowZoom()
      }
    }

    const handleMapZoom = () => {
      keepTravelerCenteredDuringFollowZoom()
      updateKeyframeMarkerSizes(map)
      updateTravelerMarkerSize(map)
      scheduleViewportMarkerRefresh(map)
    }

    const handleMapZoomEnd = () => {
      keepTravelerCenteredDuringFollowZoom()
      updateKeyframeMarkerSizes(map)
      updateTravelerMarkerSize(map)
      scheduleViewportMarkerRefresh(map)
      if (isUserZoomingWhileFollowingRef.current && rememberFollowZoomFromMap(map)) {
        startMarkerAnimation()
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
      drawRoute(map)
      updateKeyframeMarkerSizes(map)
      refreshViewportMarkers(map)
      isFollowingRef.current = true
      setIsFollowingTraveler(true)
    }

    const handleStyleLoad = () => {
      setMapError(null)
      setIsLoaded(true)
      if (!canUpdateCamera(map)) {
        return
      }

      map.resize()
      rebuildCameraTimeline(map)
      drawRoute(map)
      updateKeyframeMarkerSizes(map)
      marker.setLngLat(animatedRouteCoordinateRef.current)
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
    map.on("zoomstart", handleMapZoomStart)
    map.on("move", handleMapMove)
    map.on("zoom", handleMapZoom)
    map.on("zoomend", handleMapZoomEnd)

    return () => {
      stopMarkerAnimation()
      cancelViewportMarkerRefresh()
      clearManualFollowResume()
      clearTrackingLoading(false)
      clearProgrammaticCameraMove()
      destroyRoutePreloader()
      clearKeyframeMarkers()
      map.off("load", handleInitialLoad)
      map.off("style.load", handleStyleLoad)
      map.off("dragstart", handleUserMapDrag)
      map.off("zoomstart", handleMapZoomStart)
      map.off("move", handleMapMove)
      map.off("zoom", handleMapZoom)
      map.off("zoomend", handleMapZoomEnd)
      map.remove()
      mapInstanceRef.current = null
      markerRef.current = null
      travelerMarkerSizeRef.current = null
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

    runWhenStyleReady(map, () => {
      const currentMap = mapInstanceRef.current
      if (!currentMap || !canUpdateCamera(currentMap)) {
        return
      }

      currentMap.resize()
      rebuildCameraTimeline(currentMap)
    })
  }, [isLoaded, mapStyle, positionedLegs, routeSignature])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !isLoaded || positionedLegs.length === 0 || !canUpdateCamera(map)) {
      return
    }

    const container = map.getContainer()
    const preloadSignature = [
      routeSignature,
      mapStyle,
      container.clientWidth,
      container.clientHeight,
    ].join(":")

    if (preloadSignature === routePreloadSignatureRef.current) {
      return
    }

    routePreloadSignatureRef.current = preloadSignature
    routePreloadGenerationRef.current += 1
    clearRoutePreloadTimer()
    routePreloadQueueRef.current = getRoutePreloadTargets(map, positionedLegs)
    scheduleRoutePreloadStep(0)

    return () => {
      routePreloadGenerationRef.current += 1
      clearRoutePreloadTimer()
    }
  }, [isLoaded, mapStyle, positionedLegs, routeSignature])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !isLoaded || !hasResolvedRoutedLegs || !hasFocusedCurrentLocationRef.current) {
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
    if (mapInstanceRef.current && markerRef.current && isLoaded) {
      runWhenStyleReady(mapInstanceRef.current, () => {
        const map = mapInstanceRef.current
        if (!map || !hasUsableMapSize(map)) {
          return
        }

        const nextPlaybackTime = safeCurrentKeyframe.time
        const previousPlaybackTime = previousPlaybackTimeRef.current
        previousPlaybackTimeRef.current = nextPlaybackTime
        targetPlaybackUpdatedAtRef.current = window.performance.now()

        map.resize()
        targetRouteCoordinateRef.current = liveRouteCoordinate
        updateFollowCameraTarget(map, nextPlaybackTime, liveRouteCoordinate, map.getZoom())

        if (!hasFocusedCurrentLocationRef.current) {
          targetRouteTimeRef.current = nextPlaybackTime
          animatedRouteTimeRef.current = nextPlaybackTime
          routeRevealTimeRef.current = nextPlaybackTime
          animatedRouteCoordinateRef.current = liveRouteCoordinate
          const currentCenter = map.getCenter()
          animatedCameraCenterRef.current = [currentCenter.lng, currentCenter.lat]
          animatedCameraZoomRef.current = map.getZoom()
          markerRef.current?.setLngLat(liveRouteCoordinate)
          drawRoute(map)
          syncTravelerMarkerVisibility(map)

          if (isFollowingRef.current && canUpdateCamera(map)) {
            try {
              clearProgrammaticCameraMove()
              map.stop()
              startMarkerAnimation()
              setMapError(null)
            } catch {
              clearProgrammaticCameraMove()
              // The next playback tick will retry once the map is ready.
            }
          }

          hasFocusedCurrentLocationRef.current = true
          return
        }

        const didJumpPlayback =
          previousPlaybackTime !== null &&
          Math.abs(nextPlaybackTime - previousPlaybackTime) >= playbackJumpSnapThresholdSeconds

        if (didJumpPlayback) {
          snapTravelerToPlaybackTime(map, nextPlaybackTime, liveRouteCoordinate)
          return
        }

        startMarkerAnimation()
      })
    }
  }, [isLoaded, isPlaying, liveRouteCoordinate, positionedLegs, safeCurrentKeyframe.time])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || appliedMapStyleRef.current === mapStyle) {
      return
    }

    appliedMapStyleRef.current = mapStyle
    setIsLoaded(false)
    stopMarkerAnimation()
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
    isFollowingRef.current = false
    setIsFollowingTraveler(false)
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

    const centerMapOnTraveler = () => {
      if (!hasUsableMapSize(map)) {
        return
      }

      clearManualFollowResume()
      const followTime = Number.isFinite(animatedRouteTimeRef.current)
        ? animatedRouteTimeRef.current
        : safeCurrentKeyframe.time

      isFollowingRef.current = true
      setIsFollowingTraveler(true)
      targetRouteTimeRef.current = safeCurrentKeyframe.time
      targetRouteCoordinateRef.current = liveRouteCoordinate
      updateFollowCameraTarget(map, followTime, getCurrentTravelerCenter(), map.getZoom())
      const currentCenter = map.getCenter()
      animatedCameraCenterRef.current = [currentCenter.lng, currentCenter.lat]
      animatedCameraZoomRef.current = map.getZoom()

      try {
        clearProgrammaticCameraMove()
        map.stop()
        startMarkerAnimation()
        setMapError(null)
      } catch {
        clearTrackingLoading()
        clearProgrammaticCameraMove()
        setMapError("The map view could not center on the traveler yet.")
      }
    }

    if (map.isStyleLoaded()) {
      centerMapOnTraveler()
      return
    }

    runWhenStyleReady(map, centerMapOnTraveler)
  }

  const toggleTravelerTracking = () => {
    if (isFollowingRef.current) {
      clearManualFollowResume()
      clearTrackingLoading()
      isFollowingRef.current = false
      setIsFollowingTraveler(false)
      return
    }

    centerOnCurrentLocation()
  }

  const fitToRoute = () => {
    if (mapInstanceRef.current) {
      clearManualFollowResume()
      clearTrackingLoading()
      isFollowingRef.current = false
      setIsFollowingTraveler(false)
      fitMapToRoute(mapInstanceRef.current, 1000)
    }
  }

  useEffect(() => {
    if (isPlaying || !isLoaded) {
      return
    }

    const map = mapInstanceRef.current
    if (!map || !markerRef.current) {
      return
    }

    const continuePausedTracking = () => {
      if (!hasUsableMapSize(map)) {
        return
      }

      if (!isFollowingRef.current) {
        return
      }

      isFollowingRef.current = true
      setIsFollowingTraveler(true)
      targetRouteTimeRef.current = safeCurrentKeyframe.time
      targetRouteCoordinateRef.current = liveRouteCoordinate

      updateFollowCameraTarget(map, safeCurrentKeyframe.time, liveRouteCoordinate, map.getZoom())

      const currentCenter = map.getCenter()
      animatedCameraCenterRef.current = [currentCenter.lng, currentCenter.lat]
      animatedCameraZoomRef.current = map.getZoom()

      try {
        clearProgrammaticCameraMove()
        startMarkerAnimation()
        setMapError(null)
      } catch {
        clearProgrammaticCameraMove()
      }
    }

    if (map.isStyleLoaded()) {
      continuePausedTracking()
      return
    }

    runWhenStyleReady(map, continuePausedTracking)
  }, [isLoaded, isPlaying, liveRouteCoordinate, safeCurrentKeyframe.time])

  const isMapBusy = !isLoaded || isTrackingLoading
  const googleMapsQuery = searchQuery.trim()

  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      <div
        ref={mapRef}
        className={`relative z-0 h-full w-full overflow-hidden transition duration-200 ${isMapBusy ? "blur-sm" : ""}`}
      />
      <div
        ref={routePreloadMapContainerRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 h-80 w-80 opacity-0"
      />

      {mapError && (
        <div className="absolute inset-x-4 bottom-4 z-20">
          <div className="flex items-center justify-between gap-4 bg-white/95 p-3 text-sm text-slate-700 shadow-lg backdrop-blur-sm">
            <span>{mapError}</span>
            <Button variant="secondary" size="sm" onClick={fitToRoute}>
              Fit route
            </Button>
          </div>
        </div>
      )}

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
              className={`h-8 w-8 rounded-lg hover:text-white ${
                isFollowingTraveler
                  ? "bg-white/20 text-white hover:bg-white/25"
                  : "text-white/75 hover:bg-white/10"
              }`}
              aria-pressed={isFollowingTraveler}
              aria-label={isFollowingTraveler ? "Stop tracking traveler" : "Track traveler"}
              title={isFollowingTraveler ? "Stop tracking traveler" : "Track traveler"}
              onClick={toggleTravelerTracking}
            >
              <Crosshair className="h-4 w-4" />
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
