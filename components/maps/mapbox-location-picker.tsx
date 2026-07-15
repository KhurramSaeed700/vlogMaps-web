"use client"

import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { Crosshair, ExternalLink, Loader2, Redo2, Search, Undo2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { hasMapboxAccessToken, mapboxAccessToken } from "@/lib/mapbox"
import { getInterpolatedPointAtTime, type CreatorMapPoint } from "@/lib/creator-points"
import type { CreatorTripEndpoint, CreatorTripRoute } from "@/lib/creator-trip-route"
import { getTimestampLegKey, type CreatorRouteShapePoint, type CreatorRouteShapes } from "@/lib/creator-route-shapes"
import { fetchRoutedLegsForKeyframes, type RouteCoordinate } from "@/lib/mapbox-directions"

const mapStyleOptions = [
  { id: "satellite", label: "Satellite", style: "mapbox://styles/mapbox/satellite-streets-v12" },
  { id: "streets", label: "Streets", style: "mapbox://styles/mapbox/streets-v12" },
  { id: "terrain", label: "Terrain", style: "mapbox://styles/mapbox/outdoors-v12" },
] as const
const editorRouteLayerIds = ["editor-route-hit", "editor-route-flight", "editor-route"] as const
const editorTripRouteLayerIds = ["editor-trip-route-hit", "editor-trip-route", "editor-trip-route-casing"] as const
const editorTimestampPointSourceId = "editor-timestamp-points"
const editorTimestampPointLayerIds = [
  "editor-timestamp-point-label",
  "editor-timestamp-point-circle",
  "editor-timestamp-point-hit",
] as const
const markerHighlightDurationMs = 1000
const pointTimestampMarkerColor = "#ea580c"
const stopTimestampMarkerColor = "#0f766e"
const flightTimestampMarkerColor = "#0284c7"
const editorTravelerMarkerColor = "#ef4444"
const editorTravelerMarkerScale = 1.12
const editorTimestampRouteWidth = 5
const editorTripRouteWidth = editorTimestampRouteWidth
const editorTripRouteOffset = 4
const editorTripRouteCasingWidth = editorTripRouteWidth + 2
const editorTravelerTrackingMinZoom = 7.5
const editorTravelerTrackingMaxZoom = 10.8
const editorTravelerTrackingCloseMaxZoom = 14.2
const editorTravelerTrackingWindowSeconds = 20
const editorTravelerTrackingWindowFill = 0.35
const editorTravelerTrackingSlowSpeedKmh = 8
const editorTravelerTrackingFastSpeedKmh = 45
const editorTravelerTrackingSlowZoomBoost = 0.8
const editorTravelerTrackingFastZoomDrop = 1.15
const editorTravelerTrackingClusterRadiusKm = 1.6
const editorTravelerTrackingClusterOverlapPx = 34
const editorTravelerTrackingClusterSpanPx = 120
const editorTravelerTrackingClusterZoomBoost = 1.15
const editorTravelerTrackingStopZoomDelaySeconds = 3
const editorTravelerTrackingStopZoomOutLeadSeconds = 3
const editorTravelerTrackingStopZoomTransitionSeconds = 2
const editorTravelerTrackingStopZoomBoost = 1.55
const editorTravelerTrackingLoadingMinMs = 450
const editorTravelerTrackingLoadingFallbackMs = 6500
const editorTravelerTrackingTargetRefreshMs = 120
const mapKeyboardZoomDelta = 1
const mapKeyboardZoomDurationMs = 240

type MapStyleOptionId = (typeof mapStyleOptions)[number]["id"]

function isMapStyleOptionId(value: unknown): value is MapStyleOptionId {
  return typeof value === "string" && mapStyleOptions.some((option) => option.id === value)
}

function readStoredMapView(key?: string): Partial<PersistedMapView> | null {
  return null
}

function loadPersistedMapStyle(key?: string): MapStyleOptionId | null {
  return null
}

function savePersistedMapStyle(_key: string | undefined, _style: MapStyleOptionId) {}

function loadPersistedMapView(key?: string): PersistedMapView | null {
  if (!key || typeof window === "undefined") {
    return null
  }

  try {
    const parsed = readStoredMapView(key)
    if (!parsed) {
      return null
    }

    const center = parsed.center
    if (
      !isMapStyleOptionId(parsed.style) ||
      !Array.isArray(center) ||
      center.length < 2 ||
      center.some((value) => typeof value !== "number" || !Number.isFinite(value)) ||
      typeof parsed.zoom !== "number" ||
      !Number.isFinite(parsed.zoom) ||
      typeof parsed.bearing !== "number" ||
      !Number.isFinite(parsed.bearing) ||
      typeof parsed.pitch !== "number" ||
      !Number.isFinite(parsed.pitch)
    ) {
      return null
    }

    return {
      style: parsed.style,
      center: [center[0], center[1]],
      zoom: parsed.zoom,
      bearing: parsed.bearing,
      pitch: parsed.pitch,
    }
  } catch {
    return null
  }
}

function savePersistedMapView(_key: string | undefined, _view: PersistedMapView) {}

function getTimestampMarkerColor(pointType?: CreatorMapPoint["pointType"]) {
  if (pointType === "flight") {
    return flightTimestampMarkerColor
  }

  return pointType === "stop" ? stopTimestampMarkerColor : pointTimestampMarkerColor
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

interface MapboxLocationPickerProps {
  value: { lat: number; lng: number } | null
  points: CreatorMapPoint[]
  onChange: (value: { lat: number; lng: number }) => void
  activePointNumber?: number | null
  activePointType?: CreatorMapPoint["pointType"]
  tripRoute?: CreatorTripRoute
  routeShapes?: CreatorRouteShapes
  routeProgressTime?: number | null
  liveRouteProgressTimeRef?: { readonly current: number | null }
  isRouteShapingDisabled?: boolean
  activeTripEndpoint?: CreatorTripEndpoint | null
  onTripEndpointChange?: (endpoint: CreatorTripEndpoint, value: { lat: number; lng: number; name?: string }) => void
  onTripRouteShapeChange?: (points: CreatorRouteShapePoint[]) => void
  onTimestampRouteShapeChange?: (legKey: string, points: CreatorRouteShapePoint[]) => void
  onTimestampClick?: (point: CreatorMapPoint) => void
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  persistentViewKey?: string
  className?: string
}

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

interface PersistedMapView {
  style: MapStyleOptionId
  center: [number, number]
  zoom: number
  bearing: number
  pitch: number
}

interface TimestampRouteSegment {
  legKey: string
  fromTime: number
  toTime: number
  coordinates: RouteCoordinate[]
  cumulativeDistances: number[]
  totalDistance: number
  isStationary?: boolean
  isFallback?: boolean
  routeKind?: "road" | "flight"
}

interface TimestampRouteSegmentInput {
  legKey: string
  fromTime: number
  toTime: number
  coordinates: RouteCoordinate[]
  startCoordinate: RouteCoordinate
  endCoordinate: RouteCoordinate
  isStationary?: boolean
  isFallback?: boolean
  routeKind?: "road" | "flight"
}

type RouteShapeTarget =
  | {
      type: "trip"
      color: string
    }
  | {
      type: "timestamp"
      color: string
      legKey: string
    }

interface RouteSnapResult {
  coordinate: RouteCoordinate
  distancePx: number
}

interface TrackingStopZoomState {
  legKey: string
  baseZoom: number
}

interface TrackingLoadingState {
  label: string
  detail: string
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

function removeRouteLayer(map: mapboxgl.Map) {
  editorRouteLayerIds.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId)
    }
  })

  if (map.getSource("editor-route")) {
    map.removeSource("editor-route")
  }
}

function removeTripRouteLayer(map: mapboxgl.Map) {
  editorTripRouteLayerIds.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId)
    }
  })

  if (map.getSource("editor-trip-route")) {
    map.removeSource("editor-trip-route")
  }
}

function removeTimestampPointLayer(map: mapboxgl.Map) {
  editorTimestampPointLayerIds.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId)
    }
  })

  if (map.getSource(editorTimestampPointSourceId)) {
    map.removeSource(editorTimestampPointSourceId)
  }
}

function buildRouteFeatureCollection(
  segments: Array<{
    coordinates: RouteCoordinate[]
    properties?: Record<string, string>
  }>,
) {
  return {
    type: "FeatureCollection" as const,
    features: segments.map((segment) => ({
      type: "Feature" as const,
      properties: segment.properties ?? {},
      geometry: {
        type: "LineString" as const,
        coordinates: segment.coordinates,
      },
    })),
  }
}

function buildTimestampPointFeatureCollection(points: CreatorMapPoint[]) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((point, index) => ({
      type: "Feature" as const,
      id: point.id,
      properties: {
        pointId: point.id,
        label: String(index + 1),
        markerColor: getTimestampMarkerColor(point.pointType),
        pointType: point.pointType,
        time: point.time,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [point.lng, point.lat] as RouteCoordinate,
      },
    })),
  }
}

function orderEditorTimestampPointLayers(map: mapboxgl.Map) {
  const orderedLayerIds = ["editor-timestamp-point-hit", "editor-timestamp-point-circle", "editor-timestamp-point-label"]
  orderedLayerIds.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.moveLayer(layerId)
    }
  })
}

function orderEditorRouteLayers(map: mapboxgl.Map) {
  const hasTripRoute = map.getLayer("editor-trip-route")
  const hasTripCasing = map.getLayer("editor-trip-route-casing")
  const hasTimestampRoute = map.getLayer("editor-route")
  const hasTimestampFlightRoute = map.getLayer("editor-route-flight")

  if (hasTripRoute && hasTimestampRoute) {
    map.moveLayer("editor-trip-route", "editor-route")
  } else if (hasTripRoute) {
    map.moveLayer("editor-trip-route")
  }

  if (hasTripCasing && hasTripRoute) {
    map.moveLayer("editor-trip-route-casing", "editor-trip-route")
  }

  if (hasTimestampRoute) {
    map.moveLayer("editor-route")
  }

  if (hasTimestampFlightRoute) {
    map.moveLayer("editor-route-flight")
  }

  if (map.getLayer("editor-trip-route-hit")) {
    map.moveLayer("editor-trip-route-hit")
  }

  if (map.getLayer("editor-route-hit")) {
    map.moveLayer("editor-route-hit")
  }

  orderEditorTimestampPointLayers(map)
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

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function interpolateRouteCoordinate(start: RouteCoordinate, end: RouteCoordinate, amount: number): RouteCoordinate {
  const clampedAmount = clampNumber(amount, 0, 1)
  return [
    start[0] + (end[0] - start[0]) * clampedAmount,
    start[1] + (end[1] - start[1]) * clampedAmount,
  ]
}

function easeInOut(value: number) {
  const clampedValue = clampNumber(value, 0, 1)
  return clampedValue * clampedValue * (3 - 2 * clampedValue)
}

function getRouteSegmentAtTime(segments: TimestampRouteSegment[], routeProgressTime: number) {
  if (segments.length === 0 || !Number.isFinite(routeProgressTime)) {
    return null
  }

  let startIndex = 0
  let endIndex = segments.length - 1

  while (startIndex <= endIndex) {
    const middleIndex = Math.floor((startIndex + endIndex) / 2)
    const segment = segments[middleIndex]

    if (routeProgressTime < segment.fromTime) {
      endIndex = middleIndex - 1
      continue
    }

    if (routeProgressTime > segment.toTime) {
      startIndex = middleIndex + 1
      continue
    }

    return segment
  }

  return null
}

function getActiveStationarySegment(segments: TimestampRouteSegment[], routeProgressTime: number) {
  const segment = getRouteSegmentAtTime(segments, routeProgressTime)
  return segment?.isStationary ? segment : null
}

function getStopZoomAmount(segment: TimestampRouteSegment, routeProgressTime: number) {
  const duration = segment.toTime - segment.fromTime
  if (duration < 2.5) {
    return 0
  }

  const delay = Math.min(editorTravelerTrackingStopZoomDelaySeconds, duration * 0.25)
  const zoomOutLead = Math.min(editorTravelerTrackingStopZoomOutLeadSeconds, duration * 0.25)
  const transitionSeconds = Math.min(editorTravelerTrackingStopZoomTransitionSeconds, Math.max(0.75, duration * 0.16))
  const zoomInStart = segment.fromTime + delay
  const zoomOutStart = segment.toTime - zoomOutLead

  if (zoomOutStart <= zoomInStart) {
    const availableDuration = Math.max(segment.toTime - zoomInStart, 0.001)
    const stopProgress = clampNumber((routeProgressTime - zoomInStart) / availableDuration, 0, 1)
    return easeInOut(Math.sin(stopProgress * Math.PI))
  }

  const zoomInEnd = Math.min(zoomInStart + transitionSeconds, zoomOutStart)

  if (routeProgressTime <= zoomInStart) {
    return 0
  }

  if (routeProgressTime < zoomInEnd) {
    return easeInOut((routeProgressTime - zoomInStart) / Math.max(zoomInEnd - zoomInStart, 0.001))
  }

  if (routeProgressTime >= zoomOutStart) {
    return 1 - easeInOut((routeProgressTime - zoomOutStart) / Math.max(segment.toTime - zoomOutStart, 0.001))
  }

  return 1
}

function getRouteDistanceIndex(coordinates: RouteCoordinate[]) {
  const cumulativeDistances = [0]
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulativeDistances.push(
      cumulativeDistances[index - 1] + haversineDistance(coordinates[index - 1], coordinates[index]),
    )
  }

  return {
    cumulativeDistances,
    totalDistance: cumulativeDistances[cumulativeDistances.length - 1] ?? 0,
  }
}

function createTimestampRouteSegment(
  segment: Omit<TimestampRouteSegment, "cumulativeDistances" | "totalDistance">,
): TimestampRouteSegment {
  return {
    ...segment,
    ...getRouteDistanceIndex(segment.coordinates),
  }
}

function getPartialRouteCoordinates(
  coordinates: RouteCoordinate[],
  progress: number,
  cumulativeDistances = getRouteDistanceIndex(coordinates).cumulativeDistances,
  totalDistance = cumulativeDistances[cumulativeDistances.length - 1] ?? 0,
) {
  if (coordinates.length < 2) {
    return []
  }

  const clampedProgress = Math.min(Math.max(progress, 0), 1)
  if (clampedProgress <= 0) {
    return []
  }

  if (clampedProgress >= 1) {
    return coordinates
  }

  if (totalDistance <= 0) {
    return coordinates.slice(0, 2)
  }

  const targetDistance = totalDistance * clampedProgress
  const visibleCoordinates: RouteCoordinate[] = [coordinates[0]]

  for (let index = 1; index < coordinates.length; index += 1) {
    const previousDistance = cumulativeDistances[index - 1]
    const nextDistance = cumulativeDistances[index]

    if (targetDistance >= nextDistance) {
      visibleCoordinates.push(coordinates[index])
      continue
    }

    const segmentDistance = Math.max(nextDistance - previousDistance, 0.000001)
    const segmentProgress = (targetDistance - previousDistance) / segmentDistance
    const start = coordinates[index - 1]
    const end = coordinates[index]
    visibleCoordinates.push([
      start[0] + (end[0] - start[0]) * segmentProgress,
      start[1] + (end[1] - start[1]) * segmentProgress,
    ])
    break
  }

  return visibleCoordinates.length >= 2 ? visibleCoordinates : []
}

function getRouteProgressCoordinate(segments: TimestampRouteSegment[], routeProgressTime?: number | null) {
  if (segments.length === 0 || routeProgressTime === null || routeProgressTime === undefined || !Number.isFinite(routeProgressTime)) {
    return null
  }

  if (routeProgressTime <= segments[0].fromTime) {
    return segments[0].coordinates[0] ?? null
  }

  const lastSegment = segments[segments.length - 1]
  if (routeProgressTime >= lastSegment.toTime) {
    return lastSegment.coordinates[lastSegment.coordinates.length - 1] ?? null
  }

  const matchingSegment = getRouteSegmentAtTime(segments, routeProgressTime)
  if (!matchingSegment) {
    return null
  }

  const segmentDuration = Math.max(matchingSegment.toTime - matchingSegment.fromTime, 1)
  if (matchingSegment.isStationary) {
    return routeProgressTime >= matchingSegment.toTime
      ? (matchingSegment.coordinates[matchingSegment.coordinates.length - 1] ?? matchingSegment.coordinates[0] ?? null)
      : (matchingSegment.coordinates[0] ?? null)
  }

  const partialCoordinates = getPartialRouteCoordinates(
    matchingSegment.coordinates,
    (routeProgressTime - matchingSegment.fromTime) / segmentDuration,
    matchingSegment.cumulativeDistances,
    matchingSegment.totalDistance,
  )

  return partialCoordinates[partialCoordinates.length - 1] ?? matchingSegment.coordinates[0] ?? null
}

function getPointProgressCoordinate(points: CreatorMapPoint[], routeProgressTime?: number | null) {
  if (points.length === 0 || routeProgressTime === null || routeProgressTime === undefined || !Number.isFinite(routeProgressTime)) {
    return null
  }

  const point = getInterpolatedPointAtTime(points, routeProgressTime)
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    return null
  }

  return [point.lng, point.lat] as RouteCoordinate
}

function getTravelerProgressCoordinate(
  segments: TimestampRouteSegment[],
  points: CreatorMapPoint[],
  routeProgressTime?: number | null,
) {
  return getRouteProgressCoordinate(segments, routeProgressTime) ?? getPointProgressCoordinate(points, routeProgressTime)
}

function getRouteProgressWindowCoordinates(
  segments: TimestampRouteSegment[],
  routeProgressTime: number,
  windowSeconds = editorTravelerTrackingWindowSeconds,
) {
  const coordinates: RouteCoordinate[] = []
  const halfWindowSeconds = windowSeconds / 2
  const startTime = routeProgressTime - halfWindowSeconds
  const sampleCount = 10

  for (let index = 0; index <= sampleCount; index += 1) {
    const sampleTime = startTime + (windowSeconds * index) / sampleCount
    const coordinate = getRouteProgressCoordinate(segments, sampleTime)
    if (!coordinate) {
      continue
    }

    const previousCoordinate = coordinates[coordinates.length - 1]
    if (!previousCoordinate || haversineDistance(previousCoordinate, coordinate) > 0.001) {
      coordinates.push(coordinate)
    }
  }

  const currentCoordinate = getRouteProgressCoordinate(segments, routeProgressTime)
  if (currentCoordinate && coordinates.every((coordinate) => haversineDistance(coordinate, currentCoordinate) > 0.001)) {
    coordinates.push(currentCoordinate)
  }

  return coordinates
}

function getStopEndTime(point: CreatorMapPoint, nextPoint: CreatorMapPoint) {
  if (point.pointType !== "stop") {
    return null
  }

  if (typeof point.stopEndTime === "number" && point.stopEndTime > point.time) {
    return Math.min(point.stopEndTime, nextPoint.time)
  }

  return nextPoint.time
}

function buildTimestampRouteSegments(legs: TimestampRouteSegmentInput[]) {
  return legs.map((leg) => {
    if (leg.routeKind === "flight") {
      return [
        createTimestampRouteSegment({
          legKey: leg.legKey,
          fromTime: leg.fromTime,
          toTime: leg.toTime,
          routeKind: "flight",
          coordinates: [leg.startCoordinate, leg.endCoordinate],
        }),
      ] satisfies TimestampRouteSegment[]
    }

    if (leg.coordinates.length < 2) {
      return [] satisfies TimestampRouteSegment[]
    }

    return [
      createTimestampRouteSegment({
        legKey: leg.legKey,
        fromTime: leg.fromTime,
        toTime: leg.toTime,
        routeKind: "road",
        isStationary: leg.isStationary,
        coordinates: leg.coordinates,
      }),
    ]
  }).flat()
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

function shouldIgnoreMapKeyboardShortcut(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName.toLowerCase()
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    tagName === "button" ||
    target.isContentEditable ||
    Boolean(target.closest('[role="combobox"]'))
  )
}

function createTimestampMarkerElement(label: string, pointType?: CreatorMapPoint["pointType"]) {
  const el = document.createElement("div")
  const backgroundColor = getTimestampMarkerColor(pointType)
  el.dataset.normalBackground = backgroundColor
  el.style.cssText = `
    width: 18px;
    height: 18px;
    border-radius: 9999px;
    background: ${backgroundColor};
    border: 2px solid white;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 700;
    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    cursor: pointer;
    transition: background-color 160ms ease, color 160ms ease;
  `
  el.textContent = label
  return el
}

export function MapboxLocationPicker({
  value,
  points,
  onChange,
  activePointNumber = null,
  activePointType = "point",
  tripRoute,
  routeShapes,
  routeProgressTime = null,
  liveRouteProgressTimeRef,
  isRouteShapingDisabled = false,
  activeTripEndpoint = null,
  onTripEndpointChange,
  onTripRouteShapeChange,
  onTimestampRouteShapeChange,
  onTimestampClick,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  persistentViewKey,
  className = "h-full w-full",
}: MapboxLocationPickerProps) {
  if (hasMapboxAccessToken) {
    mapboxgl.accessToken = mapboxAccessToken
  }

  const persistedViewRef = useRef<PersistedMapView | null | undefined>(undefined)
  if (persistedViewRef.current === undefined) {
    persistedViewRef.current = loadPersistedMapView(persistentViewKey)
  }
  const persistedMapStyleRef = useRef<MapStyleOptionId | undefined>(undefined)
  if (persistedMapStyleRef.current === undefined) {
    persistedMapStyleRef.current = loadPersistedMapStyle(persistentViewKey) ?? persistedViewRef.current?.style ?? "streets"
  }

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null)
  const activeMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const highlightedPointMarkerKeysRef = useRef<Set<string>>(new Set())
  const pointMarkerHighlightTimeoutsRef = useRef<Map<string, number>>(new Map())
  const previousPointHighlightTimeRef = useRef<number | null>(null)
  const tripStartMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const tripEndMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const hoverRouteShapeMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const activeRouteShapeMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const routeProgressMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const hoverRouteShapeTargetRef = useRef<RouteShapeTarget | null>(null)
  const activeRouteShapeTargetRef = useRef<RouteShapeTarget | null>(null)
  const isRouteShapeMarkerHoveredRef = useRef(false)
  const isRouteShapeMarkerDraggingRef = useRef(false)
  const isTrackingTravelerRef = useRef(false)
  const trackingAnimationFrameRef = useRef<number | null>(null)
  const trackingCameraCenterRef = useRef<RouteCoordinate | null>(null)
  const trackingCameraZoomRef = useRef<number | null>(null)
  const trackingFrameTimeRef = useRef<number | null>(null)
  const trackingTargetZoomRef = useRef<number | null>(null)
  const trackingTargetZoomCalculatedAtRef = useRef<number | null>(null)
  const trackingSpeedSampleRef = useRef<{ coordinate: RouteCoordinate; time: number } | null>(null)
  const trackingSpeedKmhRef = useRef(0)
  const trackingStopZoomRef = useRef<TrackingStopZoomState | null>(null)
  const trackingLoadingStartedAtRef = useRef<number | null>(null)
  const trackingLoadingHasCenteredRef = useRef(false)
  const trackingLoadingFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trackingLoadingFinishRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const routeProgressSampleRef = useRef<{ time: number | null; previousTime: number | null; receivedAt: number }>({
    time: liveRouteProgressTimeRef?.current ?? routeProgressTime ?? null,
    previousTime: null,
    receivedAt: typeof window === "undefined" ? 0 : window.performance.now(),
  })
  const onChangeRef = useRef(onChange)
  const onTripEndpointChangeRef = useRef(onTripEndpointChange)
  const onTripRouteShapeChangeRef = useRef(onTripRouteShapeChange)
  const onTimestampRouteShapeChangeRef = useRef(onTimestampRouteShapeChange)
  const onTimestampClickRef = useRef(onTimestampClick)
  const pointsRef = useRef(points)
  const valueRef = useRef(value)
  const activePointNumberRef = useRef(activePointNumber)
  const activePointTypeRef = useRef(activePointType)
  const tripRouteRef = useRef(tripRoute)
  const routeShapesRef = useRef(routeShapes)
  const routeProgressTimeRef = useRef(routeProgressTime)
  const isRouteShapingDisabledRef = useRef(isRouteShapingDisabled)
  const activeTripEndpointRef = useRef(activeTripEndpoint)
  const hasSetInitialViewRef = useRef(false)
  const skipInitialValueCenterRef = useRef(Boolean(persistedViewRef.current))
  const appliedMapStyleRef = useRef<MapStyleOptionId>(persistedMapStyleRef.current)
  const routeRequestIdRef = useRef(0)
  const timestampRouteSegmentsRef = useRef<TimestampRouteSegment[]>([])
  const tripRouteCoordinatesRef = useRef<RouteCoordinate[]>([])
  const searchAbortRef = useRef<AbortController | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressAutocompleteRef = useRef(false)
  const pendingTripRouteKeyRef = useRef<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [mapStyle, setMapStyle] = useState<MapStyleOptionId>(persistedMapStyleRef.current)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<GeocodingFeature[]>([])
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isTrackingTraveler, setIsTrackingTraveler] = useState(false)
  const [trackingLoadingState, setTrackingLoadingState] = useState<TrackingLoadingState | null>(null)

  const persistCurrentMapView = (map: mapboxgl.Map, style: MapStyleOptionId = appliedMapStyleRef.current) => {
    const center = map.getCenter()
    savePersistedMapView(persistentViewKey, {
      style,
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    })
  }

  const changeMapStyle = (style: MapStyleOptionId) => {
    const map = mapInstanceRef.current
    if (map) {
      persistCurrentMapView(map, style)
    } else {
      savePersistedMapStyle(persistentViewKey, style)
    }

    setMapStyle(style)
  }

  const getTravelerZoomCenter = (map: mapboxgl.Map): RouteCoordinate => {
    const progressCoordinate = getTravelerProgressCoordinate(
      timestampRouteSegmentsRef.current,
      pointsRef.current,
      routeProgressTimeRef.current,
    )
    if (progressCoordinate) {
      return progressCoordinate
    }

    const progressMarkerLngLat = routeProgressMarkerRef.current?.getLngLat()
    if (progressMarkerLngLat) {
      return [progressMarkerLngLat.lng, progressMarkerLngLat.lat]
    }

    const activeValue = valueRef.current
    if (activeValue) {
      return [activeValue.lng, activeValue.lat]
    }

    const center = map.getCenter()
    return [center.lng, center.lat]
  }

  const zoomMapAroundTraveler = (direction: 1 | -1) => {
    const map = mapInstanceRef.current
    if (!map) {
      return
    }

    const currentZoom = map.getZoom()
    const nextZoom = Math.min(
      Math.max(currentZoom + direction * mapKeyboardZoomDelta, map.getMinZoom()),
      map.getMaxZoom(),
    )

    if (Math.abs(nextZoom - currentZoom) < 0.001) {
      return
    }

    map.easeTo({
      center: getTravelerZoomCenter(map),
      zoom: nextZoom,
      duration: mapKeyboardZoomDurationMs,
      essential: true,
    })
  }

  const clearTrackingLoadingFallback = () => {
    if (trackingLoadingFallbackRef.current) {
      clearTimeout(trackingLoadingFallbackRef.current)
      trackingLoadingFallbackRef.current = null
    }
  }

  const clearTrackingLoadingFinish = () => {
    if (trackingLoadingFinishRef.current) {
      clearTimeout(trackingLoadingFinishRef.current)
      trackingLoadingFinishRef.current = null
    }
  }

  const updateTrackingLoadingState = (nextState: TrackingLoadingState) => {
    if (trackingLoadingStartedAtRef.current === null) {
      return
    }

    setTrackingLoadingState((currentState) =>
      currentState?.label === nextState.label && currentState.detail === nextState.detail ? currentState : nextState,
    )
  }

  const startTrackingLoading = () => {
    clearTrackingLoadingFallback()
    clearTrackingLoadingFinish()
    trackingLoadingStartedAtRef.current = window.performance.now()
    trackingLoadingHasCenteredRef.current = false
    setTrackingLoadingState({
      label: "Preparing traveler tracking",
      detail: "Reading the current video time and route.",
    })
    trackingLoadingFallbackRef.current = setTimeout(() => {
      trackingLoadingFallbackRef.current = null
      trackingLoadingStartedAtRef.current = null
      trackingLoadingHasCenteredRef.current = false
      setTrackingLoadingState(null)
    }, editorTravelerTrackingLoadingFallbackMs)
  }

  const finishTrackingLoading = () => {
    const startedAt = trackingLoadingStartedAtRef.current
    if (startedAt === null) {
      return
    }

    clearTrackingLoadingFallback()
    const elapsedMs = window.performance.now() - startedAt
    const remainingMs = Math.max(editorTravelerTrackingLoadingMinMs - elapsedMs, 0)

    clearTrackingLoadingFinish()
    trackingLoadingFinishRef.current = setTimeout(() => {
      if (trackingLoadingStartedAtRef.current !== startedAt) {
        return
      }

      trackingLoadingFinishRef.current = null
      trackingLoadingStartedAtRef.current = null
      trackingLoadingHasCenteredRef.current = false
      setTrackingLoadingState(null)
    }, remainingMs)
  }

  const cancelTrackingLoading = () => {
    clearTrackingLoadingFallback()
    clearTrackingLoadingFinish()
    trackingLoadingStartedAtRef.current = null
    trackingLoadingHasCenteredRef.current = false
    setTrackingLoadingState(null)
  }

  const stopTravelerTrackingLoop = () => {
    if (trackingAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(trackingAnimationFrameRef.current)
      trackingAnimationFrameRef.current = null
    }

    trackingCameraCenterRef.current = null
    trackingCameraZoomRef.current = null
    trackingFrameTimeRef.current = null
    trackingTargetZoomRef.current = null
    trackingTargetZoomCalculatedAtRef.current = null
    trackingSpeedSampleRef.current = null
    trackingSpeedKmhRef.current = 0
    trackingStopZoomRef.current = null
  }

  const setRouteProgressMarker = (map: mapboxgl.Map, coordinate: RouteCoordinate) => {
    if (!routeProgressMarkerRef.current) {
      routeProgressMarkerRef.current = new mapboxgl.Marker({
        color: editorTravelerMarkerColor,
        scale: editorTravelerMarkerScale,
      })
        .setLngLat(coordinate)
        .addTo(map)

      const element = routeProgressMarkerRef.current.getElement()
      element.style.pointerEvents = "none"
      element.style.zIndex = "5"
      element.style.willChange = "transform"
      element.title = "Current traveler location"
      return
    }

    routeProgressMarkerRef.current.setLngLat(coordinate)
  }

  const getRouteProgressSample = (now: number) => {
    const liveTime = liveRouteProgressTimeRef?.current
    const nextTime = liveTime !== null && liveTime !== undefined && Number.isFinite(liveTime)
      ? liveTime
      : routeProgressTimeRef.current
    const sample = routeProgressSampleRef.current

    if (nextTime !== sample.time) {
      const nextSample = {
        time: nextTime ?? null,
        previousTime: sample.time,
        receivedAt: now,
      }
      routeProgressSampleRef.current = nextSample
      return nextSample
    }

    return sample
  }

  const getEstimatedRouteProgressTime = (now: number) => {
    const sample = getRouteProgressSample(now)
    const time = sample.time

    if (time === null || !Number.isFinite(time)) {
      return null
    }

    const previousTime = sample.previousTime
    const sampleAgeSeconds = (now - sample.receivedAt) / 1000
    const isContinuousPlayback =
      previousTime !== null &&
      Number.isFinite(previousTime) &&
      time >= previousTime &&
      time - previousTime <= 0.5 &&
      sampleAgeSeconds <= 0.35

    return isContinuousPlayback ? time + sampleAgeSeconds : time
  }

  const updateTrackingSpeed = (coordinate: RouteCoordinate, progressTime: number) => {
    const previousSample = trackingSpeedSampleRef.current
    trackingSpeedSampleRef.current = { coordinate, time: progressTime }

    if (!previousSample) {
      return trackingSpeedKmhRef.current
    }

    const elapsedSeconds = progressTime - previousSample.time
    if (elapsedSeconds <= 0) {
      trackingSpeedKmhRef.current *= 0.95
      return trackingSpeedKmhRef.current
    }

    if (elapsedSeconds > 1) {
      trackingSpeedKmhRef.current = 0
      return trackingSpeedKmhRef.current
    }

    const elapsedHours = elapsedSeconds / 3600
    const instantSpeedKmh = clampNumber(haversineDistance(previousSample.coordinate, coordinate) / elapsedHours, 0, 220)
    trackingSpeedKmhRef.current = trackingSpeedKmhRef.current * 0.82 + instantSpeedKmh * 0.18
    return trackingSpeedKmhRef.current
  }

  const getMotionTrackingZoom = (map: mapboxgl.Map, progressTime: number) => {
    const coordinates = getRouteProgressWindowCoordinates(timestampRouteSegmentsRef.current, progressTime)
    if (coordinates.length < 2) {
      return editorTravelerTrackingMaxZoom
    }

    const projectedCoordinates = coordinates.map((coordinate) => map.project(coordinate))
    const minX = Math.min(...projectedCoordinates.map((point) => point.x))
    const maxX = Math.max(...projectedCoordinates.map((point) => point.x))
    const minY = Math.min(...projectedCoordinates.map((point) => point.y))
    const maxY = Math.max(...projectedCoordinates.map((point) => point.y))
    const currentSpanPx = Math.max(maxX - minX, maxY - minY)
    const canvas = map.getCanvas()
    const desiredSpanPx = Math.max(140, Math.min(canvas.clientWidth, canvas.clientHeight) * editorTravelerTrackingWindowFill)

    if (!Number.isFinite(currentSpanPx) || currentSpanPx < 1) {
      return editorTravelerTrackingMaxZoom
    }

    return map.getZoom() + Math.log2(desiredSpanPx / currentSpanPx)
  }

  const getTimestampClusterProgress = (map: mapboxgl.Map, targetCoordinate: RouteCoordinate) => {
    const nearbyPoints = pointsRef.current.filter((point) => {
      return haversineDistance([point.lng, point.lat], targetCoordinate) <= editorTravelerTrackingClusterRadiusKm
    })

    if (nearbyPoints.length < 2) {
      return 0
    }

    const projectedPoints = nearbyPoints.map((point) => map.project([point.lng, point.lat]))
    let minimumDistancePx = Number.POSITIVE_INFINITY
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (let index = 0; index < projectedPoints.length; index += 1) {
      const point = projectedPoints[index]
      minX = Math.min(minX, point.x)
      maxX = Math.max(maxX, point.x)
      minY = Math.min(minY, point.y)
      maxY = Math.max(maxY, point.y)

      for (let nextIndex = index + 1; nextIndex < projectedPoints.length; nextIndex += 1) {
        const nextPoint = projectedPoints[nextIndex]
        minimumDistancePx = Math.min(minimumDistancePx, Math.hypot(point.x - nextPoint.x, point.y - nextPoint.y))
      }
    }

    const overlapProgress = 1 - clampNumber(minimumDistancePx / editorTravelerTrackingClusterOverlapPx, 0, 1)
    const spanPx = Math.max(maxX - minX, maxY - minY)
    const densityProgress = nearbyPoints.length >= 3
      ? 1 - clampNumber(spanPx / editorTravelerTrackingClusterSpanPx, 0, 1)
      : 0

    return easeInOut(Math.max(overlapProgress, densityProgress))
  }

  const getTravelerTrackingZoom = (map: mapboxgl.Map, progressTime: number) => {
    const activeStopSegment = getActiveStationarySegment(timestampRouteSegmentsRef.current, progressTime)
    if (activeStopSegment) {
      const minZoom = Math.max(map.getMinZoom(), editorTravelerTrackingMinZoom)
      const maxZoom = Math.min(map.getMaxZoom(), editorTravelerTrackingCloseMaxZoom)
      const existingStopZoom = trackingStopZoomRef.current
      const stopZoomState =
        existingStopZoom?.legKey === activeStopSegment.legKey
          ? existingStopZoom
          : {
              legKey: activeStopSegment.legKey,
              baseZoom: clampNumber(trackingCameraZoomRef.current ?? map.getZoom(), minZoom, maxZoom),
            }
      trackingStopZoomRef.current = stopZoomState

      const stopZoomAmount = getStopZoomAmount(activeStopSegment, progressTime)
      const closeStopZoom = clampNumber(stopZoomState.baseZoom + editorTravelerTrackingStopZoomBoost, minZoom, maxZoom)

      return stopZoomState.baseZoom + (closeStopZoom - stopZoomState.baseZoom) * stopZoomAmount
    }

    trackingStopZoomRef.current = null
    const speedProgress = easeInOut(
      (trackingSpeedKmhRef.current - editorTravelerTrackingSlowSpeedKmh) /
        (editorTravelerTrackingFastSpeedKmh - editorTravelerTrackingSlowSpeedKmh),
    )
    const targetCoordinate = getTravelerProgressCoordinate(timestampRouteSegmentsRef.current, pointsRef.current, progressTime)
    const clusterProgress = targetCoordinate ? getTimestampClusterProgress(map, targetCoordinate) : 0
    const closeZoomProgress = Math.max(clusterProgress, 1 - speedProgress)
    const maxTrackingZoom = editorTravelerTrackingMaxZoom +
      (editorTravelerTrackingCloseMaxZoom - editorTravelerTrackingMaxZoom) * closeZoomProgress
    const speedZoomBias =
      editorTravelerTrackingSlowZoomBoost * (1 - speedProgress) -
      editorTravelerTrackingFastZoomDrop * speedProgress
    const clusterZoomBias = editorTravelerTrackingClusterZoomBoost * clusterProgress * (1 - speedProgress)

    return clampNumber(
      getMotionTrackingZoom(map, progressTime) + speedZoomBias + clusterZoomBias,
      Math.max(map.getMinZoom(), editorTravelerTrackingMinZoom),
      Math.min(map.getMaxZoom(), maxTrackingZoom),
    )
  }

  const startTravelerTrackingLoop = () => {
    if (trackingAnimationFrameRef.current !== null) {
      return
    }

    const map = mapInstanceRef.current
    if (!map) {
      cancelTrackingLoading()
      return
    }

    map.stop()
    const center = map.getCenter()
    trackingCameraCenterRef.current = [center.lng, center.lat]
    trackingCameraZoomRef.current = map.getZoom()
    trackingFrameTimeRef.current = null
    trackingTargetZoomRef.current = null
    trackingTargetZoomCalculatedAtRef.current = null

    const animate = (frameTime: number) => {
      trackingAnimationFrameRef.current = null

      if (!isTrackingTravelerRef.current) {
        stopTravelerTrackingLoop()
        return
      }

      const activeMap = mapInstanceRef.current
      if (!activeMap || !activeMap.isStyleLoaded()) {
        updateTrackingLoadingState({
          label: "Loading map style",
          detail: "Waiting for Mapbox to finish preparing the current map.",
        })
        trackingAnimationFrameRef.current = window.requestAnimationFrame(animate)
        return
      }

      const progressTime = getEstimatedRouteProgressTime(frameTime)
      if (progressTime === null) {
        updateTrackingLoadingState({
          label: "Finding traveler",
          detail: "Waiting for the video timestamp to match the route.",
        })
      }

      const targetCoordinate =
        progressTime === null
          ? null
          : getTravelerProgressCoordinate(timestampRouteSegmentsRef.current, pointsRef.current, progressTime)

      if (targetCoordinate) {
        updateTrackingLoadingState({
          label: "Centering map",
          detail: "Moving the camera to the traveler's current location.",
        })

        const previousFrameTime = trackingFrameTimeRef.current ?? frameTime
        const deltaSeconds = clampNumber((frameTime - previousFrameTime) / 1000, 0.001, 0.08)
        trackingFrameTimeRef.current = frameTime

        setRouteProgressMarker(activeMap, targetCoordinate)

        const currentCenterRef = trackingCameraCenterRef.current
        const currentMapCenter = activeMap.getCenter()
        const currentCenter: RouteCoordinate = currentCenterRef ?? [currentMapCenter.lng, currentMapCenter.lat]
        const targetDistanceKm = haversineDistance(currentCenter, targetCoordinate)
        const centerSmoothing = clampNumber(
          1 - Math.exp(-deltaSeconds * (2.7 + Math.min(targetDistanceKm, 18) * 0.32)),
          0.02,
          targetDistanceKm > 25 ? 0.45 : 0.24,
        )
        const nextCenter = interpolateRouteCoordinate(currentCenter, targetCoordinate, centerSmoothing)
        const currentZoom = trackingCameraZoomRef.current ?? activeMap.getZoom()
        const lastTargetZoomCalculatedAt = trackingTargetZoomCalculatedAtRef.current
        if (
          trackingTargetZoomRef.current === null ||
          lastTargetZoomCalculatedAt === null ||
          frameTime - lastTargetZoomCalculatedAt >= editorTravelerTrackingTargetRefreshMs
        ) {
          updateTrackingSpeed(targetCoordinate, progressTime ?? 0)
          trackingTargetZoomRef.current = clampNumber(
            getTravelerTrackingZoom(activeMap, progressTime ?? 0),
            Math.max(activeMap.getMinZoom(), editorTravelerTrackingMinZoom),
            Math.min(activeMap.getMaxZoom(), editorTravelerTrackingCloseMaxZoom),
          )
          trackingTargetZoomCalculatedAtRef.current = frameTime
        }
        const targetZoom = trackingTargetZoomRef.current ?? currentZoom

        if (trackingLoadingStartedAtRef.current !== null && !trackingLoadingHasCenteredRef.current) {
          trackingLoadingHasCenteredRef.current = true
          trackingCameraCenterRef.current = targetCoordinate
          trackingCameraZoomRef.current = targetZoom
          activeMap.jumpTo({
            center: targetCoordinate,
            zoom: targetZoom,
          })
          finishTrackingLoading()
          trackingAnimationFrameRef.current = window.requestAnimationFrame(animate)
          return
        }

        const zoomSmoothing = clampNumber(1 - Math.exp(-deltaSeconds * 1.5), 0.01, 0.12)
        const nextZoom = currentZoom + (targetZoom - currentZoom) * zoomSmoothing

        trackingCameraCenterRef.current = nextCenter
        trackingCameraZoomRef.current = nextZoom
        activeMap.jumpTo({
          center: nextCenter,
          zoom: nextZoom,
        })
      } else if (trackingLoadingStartedAtRef.current !== null) {
        updateTrackingLoadingState({
          label: "Resolving route",
          detail: "Building the route position for this moment.",
        })
      }

      trackingAnimationFrameRef.current = window.requestAnimationFrame(animate)
    }

    trackingAnimationFrameRef.current = window.requestAnimationFrame(animate)
  }

  const toggleTravelerTracking = () => {
    const nextIsTracking = !isTrackingTravelerRef.current
    isTrackingTravelerRef.current = nextIsTracking
    setIsTrackingTraveler(nextIsTracking)

    if (nextIsTracking) {
      startTrackingLoading()
      startTravelerTrackingLoop()
    } else {
      cancelTrackingLoading()
      stopTravelerTrackingLoop()
    }
  }

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onTripEndpointChangeRef.current = onTripEndpointChange
  }, [onTripEndpointChange])

  useEffect(() => {
    onTripRouteShapeChangeRef.current = onTripRouteShapeChange
  }, [onTripRouteShapeChange])

  useEffect(() => {
    onTimestampRouteShapeChangeRef.current = onTimestampRouteShapeChange
  }, [onTimestampRouteShapeChange])

  useEffect(() => {
    onTimestampClickRef.current = onTimestampClick
  }, [onTimestampClick])

  useEffect(() => {
    pointsRef.current = points
  }, [points])

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    activePointNumberRef.current = activePointNumber
  }, [activePointNumber])

  useEffect(() => {
    activePointTypeRef.current = activePointType
  }, [activePointType])

  useEffect(() => {
    tripRouteRef.current = tripRoute
  }, [tripRoute])

  useEffect(() => {
    routeShapesRef.current = routeShapes
  }, [routeShapes])

  useEffect(() => {
    const previousTime = routeProgressTimeRef.current ?? null
    routeProgressTimeRef.current = routeProgressTime
    const liveTime = liveRouteProgressTimeRef?.current
    const nextTime = liveTime !== null && liveTime !== undefined && Number.isFinite(liveTime)
      ? liveTime
      : routeProgressTime
    routeProgressSampleRef.current = {
      time: nextTime ?? null,
      previousTime,
      receivedAt: window.performance.now(),
    }
  }, [liveRouteProgressTimeRef, routeProgressTime])

  useEffect(() => {
    isRouteShapingDisabledRef.current = isRouteShapingDisabled
  }, [isRouteShapingDisabled])

  useEffect(() => {
    activeTripEndpointRef.current = activeTripEndpoint
  }, [activeTripEndpoint])

  useEffect(() => {
    isTrackingTravelerRef.current = isTrackingTraveler
  }, [isTrackingTraveler])

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        !["KeyI", "KeyO"].includes(event.code) ||
        event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.isComposing ||
        shouldIgnoreMapKeyboardShortcut(event.target)
      ) {
        return
      }

      event.preventDefault()
      zoomMapAroundTraveler(event.code === "KeyI" ? 1 : -1)
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  })

  const setPointMarkerHighlightState = (map: mapboxgl.Map | null, markerKey: string, highlighted: boolean) => {
    if (!map?.getSource(editorTimestampPointSourceId)) {
      return
    }

    try {
      map.setFeatureState({ source: editorTimestampPointSourceId, id: markerKey }, { highlighted })
    } catch {
      // The source may be temporarily unavailable while Mapbox swaps styles.
    }
  }

  const clearPointMarkerHighlights = (map = mapInstanceRef.current) => {
    pointMarkerHighlightTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    pointMarkerHighlightTimeoutsRef.current.clear()
    highlightedPointMarkerKeysRef.current.forEach((markerKey) => {
      setPointMarkerHighlightState(map, markerKey, false)
    })
    highlightedPointMarkerKeysRef.current.clear()
  }

  const clearPointMarkers = (map = mapInstanceRef.current) => {
    clearPointMarkerHighlights(map)
    if (map) {
      removeTimestampPointLayer(map)
    }
  }

  const highlightPointMarker = (map: mapboxgl.Map, markerKey: string) => {
    const existingTimeout = pointMarkerHighlightTimeoutsRef.current.get(markerKey)
    if (existingTimeout) {
      window.clearTimeout(existingTimeout)
    }

    setPointMarkerHighlightState(map, markerKey, true)

    pointMarkerHighlightTimeoutsRef.current.set(
      markerKey,
      window.setTimeout(() => {
        setPointMarkerHighlightState(mapInstanceRef.current, markerKey, false)
        pointMarkerHighlightTimeoutsRef.current.delete(markerKey)
      }, markerHighlightDurationMs),
    )
  }

  const clearHoverRouteShapeMarker = (force = false) => {
    if (!force && (isRouteShapeMarkerDraggingRef.current || isRouteShapeMarkerHoveredRef.current)) {
      return
    }

    hoverRouteShapeMarkerRef.current?.remove()
    hoverRouteShapeMarkerRef.current = null
    hoverRouteShapeTargetRef.current = null
  }

  const clearActiveRouteShapeMarker = () => {
    activeRouteShapeMarkerRef.current?.remove()
    activeRouteShapeMarkerRef.current = null
    activeRouteShapeTargetRef.current = null
    isRouteShapeMarkerHoveredRef.current = false
  }

  const clearRouteShapeMarkers = () => {
    clearHoverRouteShapeMarker(true)
    clearActiveRouteShapeMarker()
  }

  const createTripMarkerElement = (label: string, color: string) => {
    const el = document.createElement("div")
    el.style.cssText = `
      width: 26px;
      height: 26px;
      border-radius: 9999px;
      background: ${color};
      border: 2px solid white;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 800;
      box-shadow: 0 2px 8px rgba(0,0,0,0.22);
    `
    el.textContent = label
    return el
  }

  const createRouteShapeHandleElement = (color: string, isInteractive: boolean) => {
    const el = document.createElement("div")
    el.style.cssText = `
      width: 8px;
      height: 8px;
      border-radius: 9999px;
      background: ${color};
      border: 1.5px solid white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.28);
      cursor: move;
      touch-action: none;
      pointer-events: ${isInteractive ? "auto" : "none"};
    `
    if (isInteractive) {
      el.title = "Drag to reshape route"
      el.addEventListener("click", (event) => event.stopPropagation())
      el.addEventListener("pointerdown", (event) => event.stopPropagation())
      el.addEventListener("mousedown", (event) => event.stopPropagation())
      el.addEventListener("mouseenter", () => {
        isRouteShapeMarkerHoveredRef.current = true
      })
      el.addEventListener("mouseleave", () => {
        isRouteShapeMarkerHoveredRef.current = false
      })
    }
    return el
  }

  const toRouteCoordinate = (point: CreatorRouteShapePoint): RouteCoordinate => [point.lng, point.lat]

  const getClosestPointOnRoute = (map: mapboxgl.Map, coordinates: RouteCoordinate[], event: mapboxgl.MapMouseEvent): RouteSnapResult | null => {
    if (coordinates.length < 2) {
      return coordinates[0] ? { coordinate: coordinates[0], distancePx: 0 } : null
    }

    let closestPoint: [number, number] | null = null
    let closestDistanceSquared = Number.POSITIVE_INFINITY

    coordinates.slice(0, -1).forEach((coordinate, index) => {
      const start = map.project(coordinate)
      const end = map.project(coordinates[index + 1])
      const segmentX = end.x - start.x
      const segmentY = end.y - start.y
      const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY
      const projectedRatio =
        segmentLengthSquared === 0
          ? 0
          : Math.max(
              0,
              Math.min(
                1,
                ((event.point.x - start.x) * segmentX + (event.point.y - start.y) * segmentY) / segmentLengthSquared,
              ),
            )
      const candidate: [number, number] = [start.x + segmentX * projectedRatio, start.y + segmentY * projectedRatio]
      const distanceX = event.point.x - candidate[0]
      const distanceY = event.point.y - candidate[1]
      const distance = distanceX * distanceX + distanceY * distanceY

      if (distance < closestDistanceSquared) {
        closestDistanceSquared = distance
        closestPoint = candidate
      }
    })

    if (!closestPoint) {
      return null
    }

    const lngLat = map.unproject(closestPoint)
    return {
      coordinate: [lngLat.lng, lngLat.lat],
      distancePx: Math.sqrt(closestDistanceSquared),
    }
  }

  const getClosestCoordinateOnRoute = (map: mapboxgl.Map, coordinates: RouteCoordinate[], event: mapboxgl.MapMouseEvent): RouteCoordinate | null => {
    return getClosestPointOnRoute(map, coordinates, event)?.coordinate ?? null
  }

  const getPointPlacementSnapThreshold = (map: mapboxgl.Map) => {
    const zoom = map.getZoom()
    if (zoom <= 7) {
      return 32
    }

    if (zoom <= 10) {
      return 24
    }

    return 16
  }

  const getPointPlacementCoordinate = (map: mapboxgl.Map, event: mapboxgl.MapMouseEvent): RouteCoordinate => {
    const timestampRoutes = timestampRouteSegmentsRef.current
      .filter((segment) => !segment.isStationary && !segment.isFallback)
      .map((segment) => segment.coordinates)
    const candidateRoutes = [...timestampRoutes, tripRouteCoordinatesRef.current].filter((coordinates) => coordinates.length >= 2)
    const threshold = getPointPlacementSnapThreshold(map)

    const snappedPoint = candidateRoutes.reduce<RouteSnapResult | null>((closest, coordinates) => {
      const candidate = getClosestPointOnRoute(map, coordinates, event)
      if (!candidate || candidate.distancePx > threshold) {
        return closest
      }

      if (!closest || candidate.distancePx < closest.distancePx) {
        return candidate
      }

      return closest
    }, null)

    if (snappedPoint) {
      return snappedPoint.coordinate
    }

    return [event.lngLat.lng, event.lngLat.lat]
  }

  const getRouteShapeTargetKey = (target: RouteShapeTarget | null) => {
    if (!target) {
      return null
    }

    return target.type === "trip" ? "trip" : `timestamp:${target.legKey}`
  }

  const saveRouteShapePoint = (target: RouteShapeTarget, point: CreatorRouteShapePoint) => {
    if (target.type === "trip") {
      onTripRouteShapeChangeRef.current?.([point])
    } else {
      onTimestampRouteShapeChangeRef.current?.(target.legKey, [point])
    }

    clearRouteShapeMarkers()
  }

  const setRouteShapeMarker = (
    markerRef: typeof hoverRouteShapeMarkerRef,
    map: mapboxgl.Map,
    coordinate: RouteCoordinate,
    target: RouteShapeTarget,
    isInteractive: boolean,
  ) => {
    markerRef.current?.remove()

    const element = createRouteShapeHandleElement(target.color, isInteractive)
    const marker = new mapboxgl.Marker({
      element,
    })
      .setLngLat(coordinate)
      .addTo(map)

    if (isInteractive) {
      element.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) {
          return
        }

        event.preventDefault()
        event.stopPropagation()

        const startClientX = event.clientX
        const startClientY = event.clientY
        const wasDragPanEnabled = map.dragPan.isEnabled()
        let hasMoved = false

        isRouteShapeMarkerDraggingRef.current = true
        element.style.cursor = "grabbing"
        map.getCanvas().style.cursor = "grabbing"
        if (wasDragPanEnabled) {
          map.dragPan.disable()
        }

        const moveMarkerToPointer = (clientX: number, clientY: number) => {
          const rect = map.getContainer().getBoundingClientRect()
          const lngLat = map.unproject([clientX - rect.left, clientY - rect.top])
          marker.setLngLat([lngLat.lng, lngLat.lat])
        }

        const handlePointerMove = (moveEvent: PointerEvent) => {
          moveEvent.preventDefault()
          moveEvent.stopPropagation()

          if (Math.hypot(moveEvent.clientX - startClientX, moveEvent.clientY - startClientY) > 3) {
            hasMoved = true
          }

          moveMarkerToPointer(moveEvent.clientX, moveEvent.clientY)
        }

        const finishDrag = (endEvent: PointerEvent) => {
          endEvent.preventDefault()
          endEvent.stopPropagation()
          window.removeEventListener("pointermove", handlePointerMove)
          window.removeEventListener("pointercancel", cancelDrag)

          if (wasDragPanEnabled) {
            map.dragPan.enable()
          }

          isRouteShapeMarkerDraggingRef.current = false
          isRouteShapeMarkerHoveredRef.current = false
          element.style.cursor = "move"
          map.getCanvas().style.cursor = ""

          if (hasMoved) {
            moveMarkerToPointer(endEvent.clientX, endEvent.clientY)
            const lngLat = marker.getLngLat()
            saveRouteShapePoint(target, { lat: lngLat.lat, lng: lngLat.lng })
            return
          }

          if (markerRef === hoverRouteShapeMarkerRef) {
            const lngLat = marker.getLngLat()
            activateRouteShapeMarker(map, [lngLat.lng, lngLat.lat], target)
          }
        }

        const cancelDrag = () => {
          window.removeEventListener("pointermove", handlePointerMove)
          window.removeEventListener("pointerup", finishDrag)

          if (wasDragPanEnabled) {
            map.dragPan.enable()
          }

          isRouteShapeMarkerDraggingRef.current = false
          element.style.cursor = "move"
          map.getCanvas().style.cursor = ""
        }

        window.addEventListener("pointermove", handlePointerMove)
        window.addEventListener("pointerup", finishDrag, { once: true })
        window.addEventListener("pointercancel", cancelDrag, { once: true })
      })
    }

    markerRef.current = marker
  }

  const showHoverRouteShapeMarker = (map: mapboxgl.Map, coordinate: RouteCoordinate, target: RouteShapeTarget) => {
    if (activeRouteShapeMarkerRef.current) {
      return
    }

    const nextTargetKey = getRouteShapeTargetKey(target)
    if (hoverRouteShapeMarkerRef.current && getRouteShapeTargetKey(hoverRouteShapeTargetRef.current) === nextTargetKey) {
      hoverRouteShapeMarkerRef.current.setLngLat(coordinate)
    } else {
      setRouteShapeMarker(hoverRouteShapeMarkerRef, map, coordinate, target, true)
    }

    hoverRouteShapeTargetRef.current = target
  }

  const activateRouteShapeMarker = (map: mapboxgl.Map, coordinate: RouteCoordinate, target: RouteShapeTarget) => {
    clearHoverRouteShapeMarker(true)
    setRouteShapeMarker(activeRouteShapeMarkerRef, map, coordinate, target, true)
    activeRouteShapeTargetRef.current = target
  }

  const runWhenMapStyleReady = (map: mapboxgl.Map, callback: () => void) => {
    if (map.isStyleLoaded()) {
      callback()
      return
    }

    map.once("idle", () => {
      if (mapInstanceRef.current === map && map.isStyleLoaded()) {
        callback()
      }
    })
  }

  const updateTimestampPointLayer = (map: mapboxgl.Map, currentPoints: CreatorMapPoint[]) => {
    if (!map.isStyleLoaded()) {
      removeTimestampPointLayer(map)
      return
    }

    if (currentPoints.length === 0) {
      removeTimestampPointLayer(map)
      return
    }

    const pointFeatureCollection = buildTimestampPointFeatureCollection(currentPoints)
    const existingSource = map.getSource(editorTimestampPointSourceId) as mapboxgl.GeoJSONSource | undefined

    if (existingSource) {
      existingSource.setData(pointFeatureCollection)
    } else {
      map.addSource(editorTimestampPointSourceId, {
        type: "geojson",
        data: pointFeatureCollection,
      })
    }

    if (!map.getLayer("editor-timestamp-point-hit")) {
      map.addLayer({
        id: "editor-timestamp-point-hit",
        type: "circle",
        source: editorTimestampPointSourceId,
        paint: {
          "circle-radius": 18,
          "circle-color": "#000000",
          "circle-opacity": 0.01,
        },
      })
    }

    if (!map.getLayer("editor-timestamp-point-circle")) {
      map.addLayer({
        id: "editor-timestamp-point-circle",
        type: "circle",
        source: editorTimestampPointSourceId,
        paint: {
          "circle-radius": ["case", ["boolean", ["feature-state", "highlighted"], false], 11, 9],
          "circle-color": [
            "case",
            ["boolean", ["feature-state", "highlighted"], false],
            "#facc15",
            ["get", "markerColor"],
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
          "circle-opacity": 0.98,
        },
      })
    }

    if (!map.getLayer("editor-timestamp-point-label")) {
      map.addLayer({
        id: "editor-timestamp-point-label",
        type: "symbol",
        source: editorTimestampPointSourceId,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 9,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": ["case", ["boolean", ["feature-state", "highlighted"], false], "#0f172a", "#ffffff"],
        },
      })
    }

    orderEditorTimestampPointLayers(map)
  }

  const updateRouteLayer = (map: mapboxgl.Map, segments: TimestampRouteSegment[]) => {
    if (!map.isStyleLoaded()) {
      removeRouteLayer(map)
      return
    }

    if (segments.length === 0) {
      removeRouteLayer(map)
      orderEditorRouteLayers(map)
      return
    }

    const routeFeature = buildRouteFeatureCollection(
      segments.map((segment) => ({
        coordinates: segment.coordinates,
        properties: { legKey: segment.legKey, routeKind: segment.routeKind ?? "road" },
      })),
    )
    const existingSource = map.getSource("editor-route") as mapboxgl.GeoJSONSource | undefined
    let shouldOrderLayers = !existingSource

    if (existingSource) {
      existingSource.setData(routeFeature)
    } else {
      map.addSource("editor-route", {
        type: "geojson",
        data: routeFeature,
      })
    }

    if (!map.getLayer("editor-route")) {
      shouldOrderLayers = true
      map.addLayer({
        id: "editor-route",
        type: "line",
        source: "editor-route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        filter: ["==", ["get", "routeKind"], "road"],
        paint: {
          "line-color": "#f97316",
          "line-width": editorTimestampRouteWidth,
          "line-opacity": 0.96,
        },
      })
    } else {
      map.setFilter("editor-route", ["==", ["get", "routeKind"], "road"])
      map.setPaintProperty("editor-route", "line-width", editorTimestampRouteWidth)
    }

    if (!map.getLayer("editor-route-flight")) {
      shouldOrderLayers = true
      map.addLayer({
        id: "editor-route-flight",
        type: "line",
        source: "editor-route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        filter: ["==", ["get", "routeKind"], "flight"],
        paint: {
          "line-color": flightTimestampMarkerColor,
          "line-width": editorTimestampRouteWidth,
          "line-opacity": 0.96,
          "line-dasharray": [1.4, 0.8],
        },
      })
    } else {
      map.setFilter("editor-route-flight", ["==", ["get", "routeKind"], "flight"])
      map.setPaintProperty("editor-route-flight", "line-width", editorTimestampRouteWidth)
      map.setPaintProperty("editor-route-flight", "line-dasharray", [1.4, 0.8])
    }

    if (!map.getLayer("editor-route-hit")) {
      shouldOrderLayers = true
      map.addLayer({
        id: "editor-route-hit",
        type: "line",
        source: "editor-route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#000000",
          "line-width": 24,
          "line-opacity": 0.01,
        },
      })
    }

    if (shouldOrderLayers) {
      orderEditorRouteLayers(map)
    }
  }

  const syncRouteProgress = (map: mapboxgl.Map, shouldCenter = false) => {
    const progressCoordinate = getTravelerProgressCoordinate(
      timestampRouteSegmentsRef.current,
      pointsRef.current,
      routeProgressTimeRef.current,
    )

    if (!progressCoordinate || !map.isStyleLoaded()) {
      routeProgressMarkerRef.current?.remove()
      routeProgressMarkerRef.current = null
      return
    }

    setRouteProgressMarker(map, progressCoordinate)

    if (!shouldCenter || activeRouteShapeMarkerRef.current || isRouteShapeMarkerDraggingRef.current) {
      return
    }

    map.easeTo({
      center: progressCoordinate,
      zoom: Math.max(map.getZoom(), editorTravelerTrackingMinZoom),
      duration: 280,
      essential: true,
    })
  }

  const updateTripRouteLayer = (map: mapboxgl.Map, coordinates: RouteCoordinate[]) => {
    if (!map.isStyleLoaded() || coordinates.length < 2) {
      removeTripRouteLayer(map)
      return
    }

    const routeFeature = buildRouteFeatureCollection([{ coordinates }])
    const existingSource = map.getSource("editor-trip-route") as mapboxgl.GeoJSONSource | undefined

    if (existingSource) {
      existingSource.setData(routeFeature)
    } else {
      map.addSource("editor-trip-route", {
        type: "geojson",
        data: routeFeature,
      })
    }

    const beforeRouteLayer = map.getLayer("editor-route") ? "editor-route" : undefined

    if (!map.getLayer("editor-trip-route-casing")) {
      map.addLayer(
        {
          id: "editor-trip-route-casing",
          type: "line",
          source: "editor-trip-route",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#ffffff",
            "line-width": editorTripRouteCasingWidth,
            "line-offset": editorTripRouteOffset,
            "line-opacity": 0.45,
          },
        },
        beforeRouteLayer,
      )
    } else {
      map.setPaintProperty("editor-trip-route-casing", "line-color", "#ffffff")
      map.setPaintProperty("editor-trip-route-casing", "line-width", editorTripRouteCasingWidth)
      map.setPaintProperty("editor-trip-route-casing", "line-offset", editorTripRouteOffset)
      map.setPaintProperty("editor-trip-route-casing", "line-opacity", 0.45)
    }

    if (!map.getLayer("editor-trip-route")) {
      map.addLayer(
        {
          id: "editor-trip-route",
          type: "line",
          source: "editor-trip-route",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#2563eb",
            "line-width": editorTripRouteWidth,
            "line-offset": editorTripRouteOffset,
            "line-opacity": 0.92,
          },
        },
        beforeRouteLayer,
      )
    } else {
      map.setPaintProperty("editor-trip-route", "line-color", "#2563eb")
      map.setPaintProperty("editor-trip-route", "line-width", editorTripRouteWidth)
      map.setPaintProperty("editor-trip-route", "line-offset", editorTripRouteOffset)
      map.setPaintProperty("editor-trip-route", "line-opacity", 0.92)
    }

    if (!map.getLayer("editor-trip-route-hit")) {
      map.addLayer({
        id: "editor-trip-route-hit",
        type: "line",
        source: "editor-trip-route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#000000",
          "line-width": 28,
          "line-offset": editorTripRouteOffset,
          "line-opacity": 0.01,
        },
      })
    }

    orderEditorRouteLayers(map)
  }

  const drawSavedPoints = (map: mapboxgl.Map) => {
    clearPointMarkerHighlights(map)
    removeRouteLayer(map)

    const currentPoints = pointsRef.current
    updateTimestampPointLayer(map, currentPoints)

    const routeRequestId = routeRequestIdRef.current + 1
    routeRequestIdRef.current = routeRequestId
    const routePoints = currentPoints.map((point, index) => {
      const nextPoint = currentPoints[index + 1]
      const legKey = nextPoint ? getTimestampLegKey(point.id, nextPoint.id) : null

      return {
        time: point.time,
        lat: point.lat,
        lng: point.lng,
        pointType: point.pointType,
        via: legKey ? routeShapesRef.current?.timestampLegs[legKey]?.map(toRouteCoordinate) : undefined,
      }
    })

    if (routePoints.length < 2) {
      timestampRouteSegmentsRef.current = []
      syncRouteProgress(map, false)
      return
    }

    fetchRoutedLegsForKeyframes(routePoints)
      .then((legs) => {
        if (routeRequestIdRef.current !== routeRequestId || mapInstanceRef.current !== map) {
          return
        }

      const routeSegments = legs.flatMap((leg, index) => {
        const currentPoint = currentPoints[index]
        const nextPoint = currentPoints[index + 1]
        const legKey = getTimestampLegKey(currentPoint.id, nextPoint.id)
        const stopEndTime = getStopEndTime(currentPoint, nextPoint)
        const isFlightLeg = currentPoint.pointType === "flight" || nextPoint.pointType === "flight"
        const segments: TimestampRouteSegment[] = []

        if (stopEndTime !== null && stopEndTime > currentPoint.time) {
          segments.push(
            createTimestampRouteSegment({
              legKey,
              fromTime: currentPoint.time,
              toTime: stopEndTime,
              isStationary: true,
              coordinates: [
                [currentPoint.lng, currentPoint.lat],
                [currentPoint.lng, currentPoint.lat],
              ],
            }),
          )
        }

        const movementStartTime = stopEndTime ?? leg.fromTime
        if (movementStartTime < nextPoint.time) {
          segments.push(
            ...buildTimestampRouteSegments([
              {
                legKey,
                fromTime: movementStartTime,
                toTime: nextPoint.time,
                isStationary: false,
                isFallback: leg.isFallback,
                routeKind: isFlightLeg ? "flight" : leg.routeKind,
                coordinates: isFlightLeg
                  ? [
                      [currentPoint.lng, currentPoint.lat],
                      [nextPoint.lng, nextPoint.lat],
                    ]
                  : leg.coordinates,
                startCoordinate: [currentPoint.lng, currentPoint.lat],
                endCoordinate: [nextPoint.lng, nextPoint.lat],
              },
            ]),
          )
        }

        return segments
      })

        runWhenMapStyleReady(map, () => {
          if (routeRequestIdRef.current !== routeRequestId || mapInstanceRef.current !== map) {
            return
          }

          timestampRouteSegmentsRef.current = routeSegments
          updateRouteLayer(map, routeSegments)
          syncRouteProgress(map, false)
        })
      })
      .catch(() => {
        if (routeRequestIdRef.current !== routeRequestId || mapInstanceRef.current !== map) {
          return
        }

        timestampRouteSegmentsRef.current = []
        runWhenMapStyleReady(map, () => {
          if (routeRequestIdRef.current === routeRequestId && mapInstanceRef.current === map) {
            updateRouteLayer(map, [])
          }
        })
      })
  }

  const drawTripRoute = (map: mapboxgl.Map) => {
    const route = tripRouteRef.current
    tripStartMarkerRef.current?.remove()
    tripEndMarkerRef.current?.remove()
    tripStartMarkerRef.current = null
    tripEndMarkerRef.current = null
    removeTripRouteLayer(map)

    if (!route?.start && !route?.end) {
      pendingTripRouteKeyRef.current = null
      tripRouteCoordinatesRef.current = []
      return
    }

    if (route.start) {
      tripStartMarkerRef.current = new mapboxgl.Marker(createTripMarkerElement("S", "#2563eb"))
        .setLngLat([route.start.lng, route.start.lat])
        .addTo(map)
    }

    if (route.end) {
      tripEndMarkerRef.current = new mapboxgl.Marker(createTripMarkerElement("E", "#1d4ed8"))
        .setLngLat([route.end.lng, route.end.lat])
        .addTo(map)
    }

    if (!route.start || !route.end) {
      pendingTripRouteKeyRef.current = null
      tripRouteCoordinatesRef.current = []
      return
    }

    const routeStart = route.start
    const routeEnd = route.end
    const tripVia = routeShapesRef.current?.trip.map(toRouteCoordinate) ?? []
    const routeKey = [
      "shortest",
      `${routeStart.lng},${routeStart.lat}`,
      tripVia.map((coordinate) => coordinate.join(",")).join("|"),
      `${routeEnd.lng},${routeEnd.lat}`,
    ].join(":")

    pendingTripRouteKeyRef.current = routeKey
    fetchRoutedLegsForKeyframes([
      { time: 0, lat: routeStart.lat, lng: routeStart.lng, via: tripVia },
      { time: 1, lat: routeEnd.lat, lng: routeEnd.lng },
    ], { routePreference: "shortest" }).then((legs) => {
      if (pendingTripRouteKeyRef.current !== routeKey || mapInstanceRef.current !== map) {
        return
      }

      const routedCoordinates = legs[0]?.coordinates && legs[0].coordinates.length >= 2
        ? legs[0].coordinates
        : []

      runWhenMapStyleReady(map, () => {
        if (pendingTripRouteKeyRef.current !== routeKey || mapInstanceRef.current !== map) {
          return
        }

        tripRouteCoordinatesRef.current = routedCoordinates
        updateTripRouteLayer(map, routedCoordinates)
      })
    })
  }

  const syncActiveMarker = (map: mapboxgl.Map) => {
    if (!valueRef.current) {
      activeMarkerRef.current?.remove()
      activeMarkerRef.current = null
      return
    }

    const nextValue = valueRef.current
    const activePointNumber = activePointNumberRef.current
    const activePointType = activePointTypeRef.current
    const activeMarkerLabel = activePointNumber ? String(activePointNumber) : String(pointsRef.current.length + 1)
    const activeMarkerColor = getTimestampMarkerColor(activePointType)

    if (!activeMarkerRef.current) {
      activeMarkerRef.current = new mapboxgl.Marker({
        element: createTimestampMarkerElement(activeMarkerLabel, activePointType),
        draggable: true,
      })
        .setLngLat([nextValue.lng, nextValue.lat])
        .addTo(map)

      activeMarkerRef.current.on("dragend", () => {
        const marker = activeMarkerRef.current
        if (!marker) {
          return
        }

        const lngLat = marker.getLngLat()
        onChangeRef.current({ lat: lngLat.lat, lng: lngLat.lng })
      })
    } else {
      const element = activeMarkerRef.current.getElement()
      element.textContent = activeMarkerLabel
      element.dataset.normalBackground = activeMarkerColor
      element.style.backgroundColor = activeMarkerColor
    }

    activeMarkerRef.current.setLngLat([nextValue.lng, nextValue.lat])
  }

  const fitMapToAvailablePoints = (map: mapboxgl.Map) => {
    const route = tripRouteRef.current
    const shapes = routeShapesRef.current
    const coordinates = [
      ...pointsRef.current.map((point) => [point.lng, point.lat] as [number, number]),
      ...(valueRef.current ? [[valueRef.current.lng, valueRef.current.lat] as [number, number]] : []),
      ...(route?.start ? [[route.start.lng, route.start.lat] as [number, number]] : []),
      ...(route?.end ? [[route.end.lng, route.end.lat] as [number, number]] : []),
      ...(shapes?.trip.map((point) => [point.lng, point.lat] as [number, number]) ?? []),
      ...(Object.values(shapes?.timestampLegs ?? {}).flatMap((points) =>
        points.map((point) => [point.lng, point.lat] as [number, number]),
      )),
    ]

    if (coordinates.length === 0) {
      return
    }

    if (coordinates.length === 1) {
      map.jumpTo({
        center: coordinates[0],
        zoom: 11,
      })
      return
    }

    const bounds = new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
    coordinates.slice(1).forEach((coordinate) => bounds.extend(coordinate))
    map.fitBounds(bounds, {
      padding: 72,
      duration: 0,
      maxZoom: 13,
    })
  }

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

  const getRouteShapeTargetAtPoint = (map: mapboxgl.Map, event: mapboxgl.MapMouseEvent): RouteShapeTarget | null => {
    if (isRouteShapingDisabledRef.current || activeTripEndpointRef.current) {
      return null
    }

    const layers = [map.getLayer("editor-route-hit") ? "editor-route-hit" : null, map.getLayer("editor-trip-route-hit") ? "editor-trip-route-hit" : null].filter(
      (layerId): layerId is string => Boolean(layerId),
    )

    if (layers.length === 0) {
      return null
    }

    const features = map.queryRenderedFeatures(event.point, { layers })
    const timestampFeature = features.find((feature) => feature.layer?.id === "editor-route-hit" && feature.properties?.legKey)
    const tripFeature = features.find((feature) => feature.layer?.id === "editor-trip-route-hit")

    if (timestampFeature?.properties?.legKey && onTimestampRouteShapeChangeRef.current) {
      return {
        type: "timestamp",
        color: "#f97316",
        legKey: String(timestampFeature.properties.legKey),
      }
    }

    if (tripFeature && onTripRouteShapeChangeRef.current) {
      return {
        type: "trip",
        color: "#2563eb",
      }
    }

    return null
  }

  const getTimestampPointAtEvent = (map: mapboxgl.Map, event: mapboxgl.MapMouseEvent) => {
    if (!map.getLayer("editor-timestamp-point-hit")) {
      return null
    }

    const features = map.queryRenderedFeatures(event.point, { layers: ["editor-timestamp-point-hit"] })
    const pointId = features[0]?.properties?.pointId
    if (typeof pointId !== "string") {
      return null
    }

    return pointsRef.current.find((point) => point.id === pointId) ?? null
  }

  const getRouteShapeCoordinateFromEvent = (map: mapboxgl.Map, event: mapboxgl.MapMouseEvent, target: RouteShapeTarget): RouteCoordinate => {
    const coordinates =
      target.type === "trip"
        ? tripRouteCoordinatesRef.current
        : timestampRouteSegmentsRef.current.find((segment) => segment.legKey === target.legKey)?.coordinates

    return getClosestCoordinateOnRoute(map, coordinates ?? [], event) ?? [event.lngLat.lng, event.lngLat.lat]
  }

  useEffect(() => {
    if (!hasMapboxAccessToken) {
      setIsLoaded(true)
      return
    }

    if (!mapRef.current || mapInstanceRef.current) {
      return
    }

    const fallbackCenter = value
      ? [value.lng, value.lat]
      : points[0]
        ? [points[0].lng, points[0].lat]
        : tripRoute?.start
          ? [tripRoute.start.lng, tripRoute.start.lat]
          : tripRoute?.end
            ? [tripRoute.end.lng, tripRoute.end.lat]
            : [0, 20]
    const persistedView = persistedViewRef.current
    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: mapStyleOptions.find((option) => option.id === mapStyle)?.style ?? mapStyleOptions[0].style,
      center: persistedView?.center ?? (fallbackCenter as [number, number]),
      zoom: persistedView?.zoom ?? (value || points[0] ? 4 : 1.5),
      bearing: persistedView?.bearing ?? 0,
      pitch: persistedView?.pitch ?? 0,
      attributionControl: false,
    })

    map.addControl(new mapboxgl.NavigationControl(), "bottom-right")
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")

    const handleStyleReady = () => {
      setIsLoaded(true)
      drawSavedPoints(map)
      drawTripRoute(map)
      syncActiveMarker(map)
      if (!hasSetInitialViewRef.current) {
        if (!persistedView) {
          fitMapToAvailablePoints(map)
        }
        hasSetInitialViewRef.current = true
      }
    }

    const handleMapMoveEnd = () => {
      if (isTrackingTravelerRef.current) {
        return
      }

      persistCurrentMapView(map)
    }

    map.on("load", handleStyleReady)
    map.on("style.load", handleStyleReady)
    map.on("moveend", handleMapMoveEnd)
    map.on("mousemove", (event) => {
      const timestampPoint = getTimestampPointAtEvent(map, event)
      const routeShapeTarget = timestampPoint ? null : getRouteShapeTargetAtPoint(map, event)
      if (!routeShapeTarget) {
        clearHoverRouteShapeMarker()
        if (!activeRouteShapeMarkerRef.current) {
          map.getCanvas().style.cursor = timestampPoint ? "pointer" : ""
        }
        return
      }

      map.getCanvas().style.cursor = "move"
      showHoverRouteShapeMarker(map, getRouteShapeCoordinateFromEvent(map, event, routeShapeTarget), routeShapeTarget)
    })
    map.on("mouseout", () => {
      clearHoverRouteShapeMarker()
      if (!activeRouteShapeMarkerRef.current) {
        map.getCanvas().style.cursor = ""
      }
    })
    map.on("click", (event) => {
      const timestampPoint = getTimestampPointAtEvent(map, event)
      if (timestampPoint) {
        event.preventDefault()
        onTimestampClickRef.current?.(timestampPoint)
        return
      }

      const routeShapeTarget = getRouteShapeTargetAtPoint(map, event)
      if (routeShapeTarget) {
        event.preventDefault()
        activateRouteShapeMarker(map, getRouteShapeCoordinateFromEvent(map, event, routeShapeTarget), routeShapeTarget)
        return
      }

      if (activeRouteShapeMarkerRef.current) {
        clearActiveRouteShapeMarker()
        map.getCanvas().style.cursor = ""
        return
      }

      const activeTripEndpoint = activeTripEndpointRef.current
      if (activeTripEndpoint) {
        const [lng, lat] = getPointPlacementCoordinate(map, event)
        onTripEndpointChangeRef.current?.(activeTripEndpoint, {
          lat,
          lng,
          name: "Dropped pin",
        })
        return
      }

      const [lng, lat] = getPointPlacementCoordinate(map, event)
      onChangeRef.current({ lat, lng })
    })

    mapInstanceRef.current = map

    return () => {
      persistCurrentMapView(map)
      clearTrackingLoadingFallback()
      clearTrackingLoadingFinish()
      trackingLoadingStartedAtRef.current = null
      trackingLoadingHasCenteredRef.current = false
      stopTravelerTrackingLoop()
      clearPointMarkers()
      clearRouteShapeMarkers()
      activeMarkerRef.current?.remove()
      routeProgressMarkerRef.current?.remove()
      tripStartMarkerRef.current?.remove()
      tripEndMarkerRef.current?.remove()
      removeRouteLayer(map)
      removeTripRouteLayer(map)
      map.remove()
      mapInstanceRef.current = null
      activeMarkerRef.current = null
      routeProgressMarkerRef.current = null
      tripStartMarkerRef.current = null
      tripEndMarkerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !isLoaded) {
      return
    }

    drawSavedPoints(map)
  }, [isLoaded, points, routeShapes])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !isLoaded) {
      return
    }

    const currentTime = routeProgressTime
    const previousTime = previousPointHighlightTimeRef.current

    if (currentTime !== null && currentTime !== undefined && Number.isFinite(currentTime)) {
      const reachedMarkers: Array<{ markerKey: string; time: number }> = []

      pointsRef.current.forEach((point) => {
        const markerKey = point.id
        const time = point.time
        if (canRearmTimestampHighlight(currentTime, time)) {
          setPointMarkerHighlightState(map, markerKey, false)
          highlightedPointMarkerKeysRef.current.delete(markerKey)
        }

        if (highlightedPointMarkerKeysRef.current.has(markerKey)) {
          return
        }

        if (shouldTriggerTimestampHighlight(previousTime, currentTime, time)) {
          reachedMarkers.push({ markerKey, time })
        }
      })

      if (reachedMarkers.length > 0) {
        const closestDistance = Math.min(...reachedMarkers.map(({ time }) => Math.abs(time - currentTime)))

        reachedMarkers.forEach(({ markerKey, time }) => {
          if (Math.abs(time - currentTime) <= closestDistance + 0.001) {
            highlightedPointMarkerKeysRef.current.add(markerKey)
            highlightPointMarker(map, markerKey)
          }
        })
      }

      previousPointHighlightTimeRef.current = currentTime
    }

    syncRouteProgress(map, false)
  }, [isLoaded, routeProgressTime])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !isLoaded) {
      return
    }

    drawTripRoute(map)
  }, [isLoaded, mapStyle, tripRoute, routeShapes])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !isLoaded) {
      return
    }

    syncActiveMarker(map)

    if (!value) {
      skipInitialValueCenterRef.current = false
      return
    }

    if (skipInitialValueCenterRef.current) {
      skipInitialValueCenterRef.current = false
      return
    }

    map.easeTo({
      center: [value.lng, value.lat],
      duration: 500,
      zoom: Math.max(map.getZoom(), 6),
    })
  }, [activePointNumber, isLoaded, value])

  useEffect(() => {
    const styleUrl = mapStyleOptions.find((option) => option.id === mapStyle)?.style
    const map = mapInstanceRef.current
    if (!map || !styleUrl || appliedMapStyleRef.current === mapStyle) {
      return
    }

    appliedMapStyleRef.current = mapStyle
    persistCurrentMapView(map, mapStyle)
    setIsLoaded(false)
    map.setStyle(styleUrl)
  }, [mapStyle])

  useEffect(() => {
    if (suppressAutocompleteRef.current) {
      suppressAutocompleteRef.current = false
      return
    }

    searchDebounceRef.current && clearTimeout(searchDebounceRef.current)
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

  const searchLocations = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()

    const query = searchQuery.trim()
    if (!query) {
      setSearchResults([])
      setActiveSearchIndex(-1)
      setSearchError(null)
      return
    }

    searchDebounceRef.current && clearTimeout(searchDebounceRef.current)
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
    searchDebounceRef.current && clearTimeout(searchDebounceRef.current)
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

    map.stop()
    map.flyTo({
      center: feature.center,
      zoom: getSearchResultZoom(feature, map.getZoom()),
      essential: true,
      duration: 900,
    })

    const activeTripEndpoint = activeTripEndpointRef.current
    if (activeTripEndpoint) {
      onTripEndpointChangeRef.current?.(activeTripEndpoint, {
        lat: feature.center[1],
        lng: feature.center[0],
        name: feature.place_name,
      })
    }
  }

  const clearSearch = () => {
    searchDebounceRef.current && clearTimeout(searchDebounceRef.current)
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

  const googleMapsQuery = searchQuery.trim()

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div ref={mapRef} className="h-full w-full" />

      {!hasMapboxAccessToken && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-100 p-4 text-center text-slate-700">
          <div>
            <p className="text-sm font-semibold text-slate-900">Mapbox is not configured</p>
            <p className="mt-1 max-w-sm text-xs">
              Add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to .env.local and restart the dev server.
            </p>
          </div>
        </div>
      )}

      {trackingLoadingState && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-white/35 text-slate-950 backdrop-blur-[3px]"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-3 text-center drop-shadow-[0_2px_10px_rgba(255,255,255,0.9)]">
            <Loader2 className="h-8 w-8 animate-spin text-slate-950" />
            <div>
              <p className="text-xl font-semibold">Loading map...</p>
              <p className="mt-1 text-sm font-medium text-slate-700">{trackingLoadingState.label}</p>
            </div>
          </div>
        </div>
      )}

      <form
        onSubmit={searchLocations}
        className="absolute left-3 right-3 top-3 z-20 sm:left-4 sm:right-auto sm:w-[22rem]"
      >
        <div className="flex items-center gap-2 rounded-xl bg-white/95 p-1 shadow-lg backdrop-blur-sm">
          <Search className="ml-2 h-4 w-4 shrink-0 text-slate-500" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={
              activeTripEndpoint === "start"
                ? "Search start place"
                : activeTripEndpoint === "end"
                  ? "Search destination"
                  : "Search nearby places"
            }
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={searchResults.length > 0 || Boolean(searchError) || isSearching || Boolean(googleMapsQuery)}
            aria-controls="map-search-suggestions"
            aria-activedescendant={activeSearchIndex >= 0 ? `map-search-suggestion-${activeSearchIndex}` : undefined}
            className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {searchQuery && (
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={clearSearch}>
              <X className="h-4 w-4" />
            </Button>
          )}
          <Button type="submit" size="sm" disabled={isSearching}>
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Go"}
          </Button>
        </div>

        {(searchResults.length > 0 || searchError || isSearching || googleMapsQuery) && (
          <div id="map-search-suggestions" role="listbox" className="mt-2 overflow-hidden rounded-xl bg-white/95 shadow-lg backdrop-blur-sm">
            {isSearching && searchResults.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </div>
            )}
            {searchResults.map((feature, index) => (
              <button
                key={feature.id}
                id={`map-search-suggestion-${index}`}
                type="button"
                role="option"
                aria-selected={activeSearchIndex === index}
                className={`block w-full px-3 py-2 text-left text-sm text-slate-700 ${
                  activeSearchIndex === index ? "bg-slate-100" : "hover:bg-slate-100"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSearchResult(feature)}
              >
                <span className="line-clamp-1 font-medium text-slate-950">{feature.text}</span>
                <span className="line-clamp-1 text-xs text-slate-500">{feature.place_name}</span>
              </button>
            ))}
            {searchError && <p className="px-3 py-2 text-sm text-slate-500">{searchError}</p>}
            {googleMapsQuery && (
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 border-t border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-950 hover:bg-slate-100"
                onMouseDown={(event) => event.preventDefault()}
                onClick={openGoogleMapsSearch}
              >
                <span className="truncate">Search Google Maps</span>
                <ExternalLink className="h-4 w-4 shrink-0 text-slate-500" />
              </button>
            )}
          </div>
        )}
      </form>

      <div className="absolute right-3 top-16 z-40 flex max-w-[calc(100%-1.5rem)] flex-wrap justify-end gap-1 sm:right-4 sm:top-4 sm:gap-2">
        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-white/15 bg-slate-950/85 p-1 shadow-lg backdrop-blur-md">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-lg text-white hover:bg-white/15 hover:text-white disabled:text-white/35"
            aria-label="Undo map click"
            title="Undo"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-lg text-white hover:bg-white/15 hover:text-white disabled:text-white/35"
            aria-label="Redo map click"
            title="Redo"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={`h-8 w-8 rounded-lg hover:text-white ${
              isTrackingTraveler
                ? "bg-white text-slate-950 hover:bg-white/90 hover:text-slate-950"
                : "text-white hover:bg-white/15"
            }`}
            aria-pressed={isTrackingTraveler}
            aria-label={isTrackingTraveler ? "Stop tracking traveler" : "Track traveler"}
            title={isTrackingTraveler ? "Stop tracking traveler" : "Track traveler"}
            onClick={toggleTravelerTracking}
          >
            <Crosshair className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex min-w-0 items-center gap-1 rounded-xl border border-white/15 bg-slate-950/85 p-1 shadow-lg backdrop-blur-md">
          {mapStyleOptions.map((option) => (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={mapStyle === option.id ? "default" : "ghost"}
              className={`rounded-lg ${
                mapStyle === option.id
                  ? "bg-white text-slate-950 hover:bg-white/90"
                  : "text-white/85 hover:bg-white/15 hover:text-white"
              }`}
              onClick={() => changeMapStyle(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
