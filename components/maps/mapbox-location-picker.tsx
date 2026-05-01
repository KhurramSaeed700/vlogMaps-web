"use client"

import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { Crosshair, ExternalLink, Loader2, Redo2, Search, Undo2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { mapboxAccessToken } from "@/lib/mapbox"
import type { CreatorMapPoint } from "@/lib/creator-points"
import type { CreatorTripEndpoint, CreatorTripRoute } from "@/lib/creator-trip-route"
import { getTimestampLegKey, type CreatorRouteShapePoint, type CreatorRouteShapes } from "@/lib/creator-route-shapes"
import { fetchRoutedLegsForKeyframes, type RouteCoordinate } from "@/lib/mapbox-directions"

const mapStyleOptions = [
  { id: "satellite", label: "Satellite", style: "mapbox://styles/mapbox/satellite-streets-v12" },
  { id: "streets", label: "Streets", style: "mapbox://styles/mapbox/streets-v12" },
  { id: "terrain", label: "Terrain", style: "mapbox://styles/mapbox/outdoors-v12" },
] as const
const editorRouteLayerIds = ["editor-route-hit", "editor-route-trail", "editor-route"] as const
const editorTripRouteLayerIds = ["editor-trip-route-hit", "editor-trip-route", "editor-trip-route-casing"] as const
const markerHighlightDurationMs = 1000
const pointTimestampMarkerColor = "#ea580c"
const stopTimestampMarkerColor = "#0f766e"
const editorTimestampRouteWidth = 5
const editorTripRouteWidth = editorTimestampRouteWidth
const editorTripRouteOffset = 4
const editorTripRouteCasingWidth = editorTripRouteWidth + 2
const editorTravelerTrackingMinZoom = 12
const editorTravelerTrackingDurationMs = 420
const editorTrailMaxDirectDistanceKm = 30
const editorTrailMinRouteDetourKm = 5
const editorTrailDetourRatio = 3
const editorTrailSnapDistanceKm = 0.5
const mapKeyboardZoomDelta = 1
const mapKeyboardZoomDurationMs = 240

type MapStyleOptionId = (typeof mapStyleOptions)[number]["id"]

function isMapStyleOptionId(value: unknown): value is MapStyleOptionId {
  return typeof value === "string" && mapStyleOptions.some((option) => option.id === value)
}

function getMapViewStorageKey(key: string) {
  return `vlogmaps:map-view:${key}`
}

function getMapStyleStorageKey(key: string) {
  return `vlogmaps:map-style:${key}`
}

function readStoredMapView(key?: string): Partial<PersistedMapView> | null {
  if (!key || typeof window === "undefined") {
    return null
  }

  try {
    const raw = window.localStorage.getItem(getMapViewStorageKey(key))
    return raw ? (JSON.parse(raw) as Partial<PersistedMapView>) : null
  } catch {
    return null
  }
}

function loadPersistedMapStyle(key?: string): MapStyleOptionId | null {
  if (!key || typeof window === "undefined") {
    return null
  }

  try {
    const rawStyle = window.localStorage.getItem(getMapStyleStorageKey(key))
    if (isMapStyleOptionId(rawStyle)) {
      return rawStyle
    }
  } catch {
    // The full map view can still provide a usable style fallback.
  }

  const storedView = readStoredMapView(key)
  if (!storedView) {
    return null
  }

  return isMapStyleOptionId(storedView.style) ? storedView.style : null
}

function savePersistedMapStyle(key: string | undefined, style: MapStyleOptionId) {
  if (!key || typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(getMapStyleStorageKey(key), style)
  } catch {
    // Map style persistence is a convenience only.
  }
}

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

function savePersistedMapView(key: string | undefined, view: PersistedMapView) {
  if (!key || typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(getMapViewStorageKey(key), JSON.stringify(view))
    savePersistedMapStyle(key, view.style)
  } catch {
    // Map view persistence is a convenience only.
  }
}

function getTimestampMarkerColor(pointType?: CreatorMapPoint["pointType"]) {
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
  isStationary?: boolean
  isFallback?: boolean
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

function orderEditorRouteLayers(map: mapboxgl.Map) {
  const hasTripRoute = map.getLayer("editor-trip-route")
  const hasTripCasing = map.getLayer("editor-trip-route-casing")
  const hasTimestampRoute = map.getLayer("editor-route")
  const hasTimestampTrailRoute = map.getLayer("editor-route-trail")

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

  if (hasTimestampTrailRoute) {
    map.moveLayer("editor-route-trail")
  }

  if (map.getLayer("editor-trip-route-hit")) {
    map.moveLayer("editor-trip-route-hit")
  }

  if (map.getLayer("editor-route-hit")) {
    map.moveLayer("editor-route-hit")
  }
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

function getPartialRouteCoordinates(coordinates: RouteCoordinate[], progress: number) {
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

  const cumulativeDistances = [0]
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulativeDistances.push(
      cumulativeDistances[index - 1] + haversineDistance(coordinates[index - 1], coordinates[index]),
    )
  }

  const totalDistance = cumulativeDistances[cumulativeDistances.length - 1] ?? 0
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

  const matchingSegment = segments.find((segment) => routeProgressTime >= segment.fromTime && routeProgressTime <= segment.toTime)
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
  )

  return partialCoordinates[partialCoordinates.length - 1] ?? matchingSegment.coordinates[0] ?? null
}

function getRouteBearing(start: RouteCoordinate, end: RouteCoordinate) {
  const toRadians = (value: number) => (value * Math.PI) / 180
  const toDegrees = (value: number) => (value * 180) / Math.PI
  const startLat = toRadians(start[1])
  const endLat = toRadians(end[1])
  const deltaLng = toRadians(end[0] - start[0])
  const y = Math.sin(deltaLng) * Math.cos(endLat)
  const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLng)

  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}

function getRouteProgressBearing(segments: TimestampRouteSegment[], routeProgressTime?: number | null) {
  if (segments.length === 0 || routeProgressTime === null || routeProgressTime === undefined || !Number.isFinite(routeProgressTime)) {
    return 0
  }

  const matchingSegment =
    segments.find((segment) => routeProgressTime >= segment.fromTime && routeProgressTime <= segment.toTime) ??
    (routeProgressTime < segments[0].fromTime ? segments[0] : segments[segments.length - 1])
  const coordinates = matchingSegment.coordinates

  if (coordinates.length < 2) {
    return 0
  }

  const segmentDuration = Math.max(matchingSegment.toTime - matchingSegment.fromTime, 1)
  const progress = matchingSegment.isStationary
    ? 0
    : Math.min(Math.max((routeProgressTime - matchingSegment.fromTime) / segmentDuration, 0), 1)
  const targetIndex = Math.min(Math.max(Math.round(progress * (coordinates.length - 1)), 1), coordinates.length - 1)

  return getRouteBearing(coordinates[targetIndex - 1], coordinates[targetIndex])
}

function getRouteDistanceKm(coordinates: RouteCoordinate[]) {
  if (coordinates.length < 2) {
    return 0
  }

  return coordinates.slice(1).reduce((distance, coordinate, index) => {
    return distance + haversineDistance(coordinates[index], coordinate)
  }, 0)
}

function shouldRenderLegAsTrail(leg: TimestampRouteSegmentInput) {
  if (leg.isFallback || leg.coordinates.length < 2) {
    return true
  }

  const firstRouteCoordinate = leg.coordinates[0]
  const lastRouteCoordinate = leg.coordinates[leg.coordinates.length - 1]
  if (!firstRouteCoordinate || !lastRouteCoordinate) {
    return true
  }

  const directDistance = haversineDistance(leg.startCoordinate, leg.endCoordinate)
  if (directDistance > editorTrailMaxDirectDistanceKm) {
    return false
  }

  const routeDistance = getRouteDistanceKm(leg.coordinates)
  const startSnapDistance = haversineDistance(leg.startCoordinate, firstRouteCoordinate)
  const endSnapDistance = haversineDistance(lastRouteCoordinate, leg.endCoordinate)
  const hasLargeDetour =
    routeDistance >= directDistance * editorTrailDetourRatio &&
    routeDistance - directDistance >= editorTrailMinRouteDetourKm
  const isFarFromRoad = Math.max(startSnapDistance, endSnapDistance) >= editorTrailSnapDistanceKm

  return hasLargeDetour || isFarFromRoad
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
    if (shouldRenderLegAsTrail(leg)) {
      return [
        {
          legKey: leg.legKey,
          fromTime: leg.fromTime,
          toTime: leg.toTime,
          isFallback: true,
          isStationary: leg.isStationary,
          coordinates: [leg.startCoordinate, leg.endCoordinate],
        },
      ] satisfies TimestampRouteSegment[]
    }

    return [
      {
        legKey: leg.legKey,
        fromTime: leg.fromTime,
        toTime: leg.toTime,
        isStationary: leg.isStationary,
        coordinates: leg.coordinates,
      },
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

function createRouteProgressMarkerElement() {
  const el = document.createElement("div")
  el.style.cssText = `
    width: 12px;
    height: 12px;
    border-radius: 9999px;
    background: #2563eb;
    border: 2px solid white;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.32);
    pointer-events: none;
  `
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
  mapboxgl.accessToken = mapboxAccessToken

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
  const pointMarkersRef = useRef<mapboxgl.Marker[]>([])
  const pointMarkerElementsRef = useRef<Map<string, { element: HTMLDivElement; time: number }>>(new Map())
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
    const progressCoordinate = getRouteProgressCoordinate(timestampRouteSegmentsRef.current, routeProgressTimeRef.current)
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

  const toggleTravelerTracking = () => {
    const nextIsTracking = !isTrackingTravelerRef.current
    isTrackingTravelerRef.current = nextIsTracking
    setIsTrackingTraveler(nextIsTracking)

    if (nextIsTracking && mapInstanceRef.current) {
      syncRouteProgress(mapInstanceRef.current, true)
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
    routeProgressTimeRef.current = routeProgressTime
  }, [routeProgressTime])

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

  const clearPointMarkers = () => {
    pointMarkerHighlightTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    pointMarkerHighlightTimeoutsRef.current.clear()
    highlightedPointMarkerKeysRef.current.clear()
    pointMarkerElementsRef.current.clear()
    pointMarkersRef.current.forEach((marker) => marker.remove())
    pointMarkersRef.current = []
  }

  const resetPointMarkerElement = (element: HTMLElement) => {
    element.style.backgroundColor = element.dataset.normalBackground ?? pointTimestampMarkerColor
    element.style.color = "white"
  }

  const highlightPointMarker = (markerKey: string, element: HTMLElement) => {
    const existingTimeout = pointMarkerHighlightTimeoutsRef.current.get(markerKey)
    if (existingTimeout) {
      window.clearTimeout(existingTimeout)
    }

    element.style.backgroundColor = "#facc15"
    element.style.color = "#0f172a"

    pointMarkerHighlightTimeoutsRef.current.set(
      markerKey,
      window.setTimeout(() => {
        resetPointMarkerElement(element)
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
        properties: { legKey: segment.legKey, routeKind: segment.isFallback ? "trail" : "road" },
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
        filter: ["!=", ["get", "routeKind"], "trail"],
        paint: {
          "line-color": "#f97316",
          "line-width": editorTimestampRouteWidth,
          "line-opacity": 0.96,
        },
      })
    } else {
      map.setFilter("editor-route", ["!=", ["get", "routeKind"], "trail"])
      map.setPaintProperty("editor-route", "line-width", editorTimestampRouteWidth)
    }

    if (!map.getLayer("editor-route-trail")) {
      shouldOrderLayers = true
      map.addLayer({
        id: "editor-route-trail",
        type: "line",
        source: "editor-route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        filter: ["==", ["get", "routeKind"], "trail"],
        paint: {
          "line-color": "#f97316",
          "line-width": editorTimestampRouteWidth,
          "line-opacity": 0.96,
          "line-dasharray": [1, 1.4],
        },
      })
    } else {
      map.setFilter("editor-route-trail", ["==", ["get", "routeKind"], "trail"])
      map.setPaintProperty("editor-route-trail", "line-width", editorTimestampRouteWidth)
      map.setPaintProperty("editor-route-trail", "line-dasharray", [1, 1.4])
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
    const progressCoordinate = getRouteProgressCoordinate(timestampRouteSegmentsRef.current, routeProgressTimeRef.current)
    const progressBearing = getRouteProgressBearing(timestampRouteSegmentsRef.current, routeProgressTimeRef.current)

    if (!progressCoordinate || !map.isStyleLoaded()) {
      routeProgressMarkerRef.current?.remove()
      routeProgressMarkerRef.current = null
      return
    }

    if (!routeProgressMarkerRef.current) {
      routeProgressMarkerRef.current = new mapboxgl.Marker({
        element: createRouteProgressMarkerElement(),
        pitchAlignment: "map",
        rotation: progressBearing,
        rotationAlignment: "map",
      })
        .setLngLat(progressCoordinate)
        .addTo(map)
    } else {
      routeProgressMarkerRef.current.setLngLat(progressCoordinate)
      routeProgressMarkerRef.current.setRotation(progressBearing)
    }

    if (!shouldCenter || activeRouteShapeMarkerRef.current || isRouteShapeMarkerDraggingRef.current) {
      return
    }

    map.easeTo({
      center: progressCoordinate,
      zoom: Math.max(map.getZoom(), editorTravelerTrackingMinZoom),
      duration: editorTravelerTrackingDurationMs,
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
    clearPointMarkers()
    removeRouteLayer(map)

    const currentPoints = pointsRef.current

    pointMarkersRef.current = currentPoints.map((point, index) => {
      const element = createTimestampMarkerElement(String(index + 1), point.pointType)
      const markerKey = point.id
      element.title = "Play from this timestamp"
      element.addEventListener("click", (event) => {
        event.stopPropagation()
        onTimestampClickRef.current?.(point)
      })
      pointMarkerElementsRef.current.set(markerKey, { element, time: point.time })

      return new mapboxgl.Marker(element).setLngLat([point.lng, point.lat]).addTo(map)
    })

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
      routeProgressMarkerRef.current?.remove()
      routeProgressMarkerRef.current = null
      return
    }

    fetchRoutedLegsForKeyframes(routePoints).then((legs) => {
      if (routeRequestIdRef.current !== routeRequestId || mapInstanceRef.current !== map) {
        return
      }

      const routeSegments = legs.flatMap((leg, index) => {
        const currentPoint = currentPoints[index]
        const nextPoint = currentPoints[index + 1]
        const legKey = getTimestampLegKey(currentPoint.id, nextPoint.id)
        const stopEndTime = getStopEndTime(currentPoint, nextPoint)
        const segments: TimestampRouteSegment[] = []

        if (stopEndTime !== null && stopEndTime > currentPoint.time) {
          segments.push({
            legKey,
            fromTime: currentPoint.time,
            toTime: stopEndTime,
            isStationary: true,
            coordinates: [
              [currentPoint.lng, currentPoint.lat],
              [currentPoint.lng, currentPoint.lat],
            ],
          })
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
                coordinates: leg.coordinates,
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
        syncRouteProgress(map, isTrackingTravelerRef.current)
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

      const routedCoordinates =
        legs[0]?.coordinates && legs[0].coordinates.length >= 2
          ? legs[0].coordinates
          : ([
              [routeStart.lng, routeStart.lat],
              [routeEnd.lng, routeEnd.lat],
            ] as RouteCoordinate[])

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

  const getRouteShapeCoordinateFromEvent = (map: mapboxgl.Map, event: mapboxgl.MapMouseEvent, target: RouteShapeTarget): RouteCoordinate => {
    const coordinates =
      target.type === "trip"
        ? tripRouteCoordinatesRef.current
        : timestampRouteSegmentsRef.current.find((segment) => segment.legKey === target.legKey)?.coordinates

    return getClosestCoordinateOnRoute(map, coordinates ?? [], event) ?? [event.lngLat.lng, event.lngLat.lat]
  }

  useEffect(() => {
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
      persistCurrentMapView(map)
    }

    map.on("load", handleStyleReady)
    map.on("style.load", handleStyleReady)
    map.on("moveend", handleMapMoveEnd)
    map.on("mousemove", (event) => {
      const routeShapeTarget = getRouteShapeTargetAtPoint(map, event)
      if (!routeShapeTarget) {
        clearHoverRouteShapeMarker()
        if (!activeRouteShapeMarkerRef.current) {
          map.getCanvas().style.cursor = ""
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
      const reachedMarkers: Array<{ markerKey: string; element: HTMLElement; time: number }> = []

      pointMarkerElementsRef.current.forEach(({ element, time }, markerKey) => {
        if (canRearmTimestampHighlight(currentTime, time)) {
          highlightedPointMarkerKeysRef.current.delete(markerKey)
        }

        if (highlightedPointMarkerKeysRef.current.has(markerKey)) {
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
            highlightedPointMarkerKeysRef.current.add(markerKey)
            highlightPointMarker(markerKey, element)
          }
        })
      }

      previousPointHighlightTimeRef.current = currentTime
    }

    syncRouteProgress(map, isTrackingTraveler)
  }, [isLoaded, routeProgressTime, isTrackingTraveler])

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

      <div className="absolute right-3 top-16 z-10 flex flex-wrap justify-end gap-1 rounded-xl border border-white/15 bg-slate-950/85 p-1 shadow-lg backdrop-blur-md sm:right-4 sm:top-4">
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
        <div className="mx-1 h-8 w-px bg-white/20" />
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
  )
}
