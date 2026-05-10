"use client"

import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { Crosshair, ExternalLink, Loader2, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { fetchRoutedLegsForKeyframes, type RouteCoordinate, type RoutedLeg } from "@/lib/mapbox-directions"
import { mapboxAccessToken } from "@/lib/mapbox"

interface Keyframe {
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
  currentKeyframe: Keyframe
  onLocationClick?: (keyframe: Keyframe) => void
  className?: string
}

interface PositionedRoutedLeg extends RoutedLeg {
  totalDistance: number
  cumulativeDistances: number[]
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
const dynamicCameraViewportPaddingRatio = 0.2
const dynamicCameraMinZoom = 5
const dynamicCameraMaxZoom = 16.5
const defaultFollowZoom = 10
const markerHighlightDurationMs = 1000
const pointKeyframeMarkerColor = "#ea580c"
const stopKeyframeMarkerColor = "#0f766e"
const routeLineColor = pointKeyframeMarkerColor
const keyframeMarkerMinZoom = 5
const keyframeMarkerMaxZoom = 13
const keyframeMarkerMinSize = 15
const keyframeMarkerMaxSize = 30
const playbackJumpSnapThresholdSeconds = 1.25

function getKeyframeMarkerColor(pointType?: Keyframe["pointType"]) {
  return pointType === "stop" ? stopKeyframeMarkerColor : pointKeyframeMarkerColor
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
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

function getKeyframeMarkerSizeForZoom(zoom: number) {
  const zoomProgress =
    (clampNumber(zoom, keyframeMarkerMinZoom, keyframeMarkerMaxZoom) - keyframeMarkerMinZoom) /
    (keyframeMarkerMaxZoom - keyframeMarkerMinZoom)
  const easedProgress = zoomProgress * zoomProgress * (3 - 2 * zoomProgress)

  return keyframeMarkerMinSize + (keyframeMarkerMaxSize - keyframeMarkerMinSize) * easedProgress
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

function getDynamicCameraZoom(
  map: mapboxgl.Map,
  legs: PositionedRoutedLeg[],
  currentTime: number,
  fallbackZoom = defaultFollowZoom,
) {
  const bounds = buildCameraBounds(getMotionWindowCoordinates(legs, currentTime))
  if (!bounds) {
    return clampNumber(fallbackZoom, dynamicCameraMinZoom, dynamicCameraMaxZoom)
  }

  const container = map.getContainer()
  const padding = {
    top: container.clientHeight * dynamicCameraViewportPaddingRatio,
    bottom: container.clientHeight * dynamicCameraViewportPaddingRatio,
    left: container.clientWidth * dynamicCameraViewportPaddingRatio,
    right: container.clientWidth * dynamicCameraViewportPaddingRatio,
  }
  const camera = map.cameraForBounds(bounds, {
    padding,
    maxZoom: dynamicCameraMaxZoom,
  })
  const zoom = typeof camera?.zoom === "number" ? camera.zoom : fallbackZoom

  return clampNumber(zoom, dynamicCameraMinZoom, dynamicCameraMaxZoom)
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

export function MapboxTravelMap({
  keyframes,
  currentKeyframe,
  onLocationClick,
  className = "w-full h-full",
}: MapboxTravelMapProps) {
  mapboxgl.accessToken = mapboxAccessToken

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)
  const keyframeMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const keyframeMarkerElementsRef = useRef<Map<string, { element: HTMLButtonElement; time: number }>>(new Map())
  const visibleKeyframeMarkersSignatureRef = useRef("")
  const highlightedKeyframeKeysRef = useRef<Set<string>>(new Set())
  const keyframeHighlightTimeoutsRef = useRef<Map<string, number>>(new Map())
  const previousHighlightTimeRef = useRef<number | null>(null)
  const onLocationClickRef = useRef(onLocationClick)
  const keyframesRef = useRef<Keyframe[]>([])
  const routeCoordinatesRef = useRef<RouteCoordinate[]>([])
  const positionedLegsRef = useRef<PositionedRoutedLeg[]>([])
  const routeRevealTimeRef = useRef(0)
  const targetRouteTimeRef = useRef(0)
  const animatedRouteTimeRef = useRef(0)
  const liveRouteCoordinateRef = useRef<RouteCoordinate>([0, 0])
  const targetRouteCoordinateRef = useRef<RouteCoordinate>([0, 0])
  const animatedRouteCoordinateRef = useRef<RouteCoordinate>([0, 0])
  const targetCameraZoomRef = useRef(defaultFollowZoom)
  const animatedCameraZoomRef = useRef(defaultFollowZoom)
  const animationFrameRef = useRef<number | null>(null)
  const previousAnimationTimestampRef = useRef<number | null>(null)
  const previousPlaybackTimeRef = useRef<number | null>(null)
  const lastAnimatedRouteDrawTimestampRef = useRef(0)
  const hasFocusedCurrentLocationRef = useRef(false)
  const isFollowingRef = useRef(true)
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

  useEffect(() => {
    onLocationClickRef.current = onLocationClick
  }, [onLocationClick])

  const safeKeyframes = useMemo(() => {
    return [...keyframes].filter(isValidKeyframe).sort((left, right) => left.time - right.time)
  }, [keyframes])

  const safeCurrentKeyframe = useMemo(() => {
    if (isValidKeyframe(currentKeyframe)) {
      return currentKeyframe
    }

    return safeKeyframes[0] ?? getFallbackKeyframe()
  }, [currentKeyframe, safeKeyframes])
  const routeSignature = useMemo(
    () =>
      safeKeyframes
        .map((keyframe) =>
          [
            keyframe.time,
            keyframe.stopEndTime ?? "",
            keyframe.lat.toFixed(6),
            keyframe.lng.toFixed(6),
            keyframe.pointType ?? "point",
          ].join(":"),
        )
        .join("|"),
    [safeKeyframes],
  )

  useEffect(() => {
    let isMounted = true

    fetchRoutedLegsForKeyframes(safeKeyframes).then((nextLegs) => {
      if (isMounted) {
        setRoutedLegs(nextLegs)
      }
    })

    return () => {
      isMounted = false
    }
  }, [safeKeyframes])

  const fallbackRoutedLegs = useMemo(() => buildStraightLineLegs(safeKeyframes), [safeKeyframes])
  const stopAwareRoutedLegs = useMemo(
    () => expandLegsForStopDurations(routedLegs, safeKeyframes),
    [routedLegs, safeKeyframes],
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

  keyframesRef.current = safeKeyframes
  routeCoordinatesRef.current = routeCoordinates
  positionedLegsRef.current = positionedLegs
  targetRouteTimeRef.current = safeCurrentKeyframe.time
  liveRouteCoordinateRef.current = liveRouteCoordinate
  targetRouteCoordinateRef.current = liveRouteCoordinate

  useEffect(() => {
    stopMarkerAnimation()
    clearKeyframeMarkers()
    previousPlaybackTimeRef.current = null
    previousHighlightTimeRef.current = null
    highlightedKeyframeKeysRef.current.clear()
    hasFocusedCurrentLocationRef.current = false
    routeRevealTimeRef.current = safeCurrentKeyframe.time
    targetRouteTimeRef.current = safeCurrentKeyframe.time
    animatedRouteTimeRef.current = safeCurrentKeyframe.time
    liveRouteCoordinateRef.current = liveRouteCoordinate
    targetRouteCoordinateRef.current = liveRouteCoordinate
    animatedRouteCoordinateRef.current = liveRouteCoordinate
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
    visibleKeyframeMarkersSignatureRef.current = ""
  }

  const updateKeyframeMarkerElementSize = (element: HTMLButtonElement, zoom: number) => {
    const size = getKeyframeMarkerSizeForZoom(zoom)
    const fontSize = clampNumber(size * 0.42, 7, 12)
    const borderWidth = clampNumber(size * 0.075, 1.25, 2)

    element.style.width = `${size}px`
    element.style.height = `${size}px`
    element.style.fontSize = `${fontSize}px`
    element.style.borderWidth = `${borderWidth}px`
  }

  const updateKeyframeMarkerSizes = (map: mapboxgl.Map) => {
    const zoom = map.getZoom()
    keyframeMarkerElementsRef.current.forEach(({ element }) => {
      updateKeyframeMarkerElementSize(element, zoom)
    })
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
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      transition: width 120ms ease, height 120ms ease, border-width 120ms ease, font-size 120ms ease, background-color 160ms ease, color 160ms ease;
    `
    updateKeyframeMarkerElementSize(el, map.getZoom())
    el.textContent = pointNumber.toString()
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
    reachedKeyframes: Array<{ keyframe: Keyframe; pointNumber: number; markerKey: string }>,
  ) => {
    const nextSignature = reachedKeyframes
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

    const reachedMarkerKeys = new Set(reachedKeyframes.map(({ markerKey }) => markerKey))
    Array.from(keyframeMarkersRef.current.keys()).forEach((markerKey) => {
      if (!reachedMarkerKeys.has(markerKey)) {
        removeKeyframeMarker(markerKey)
      }
    })

    reachedKeyframes.forEach(({ keyframe, markerKey, pointNumber }) => {
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
    const targetTime = targetRouteTimeRef.current
    const target = targetRouteCoordinateRef.current
    const smoothing = 1 - Math.exp(-deltaMs / 180)
    const nextTime = currentTime + (targetTime - currentTime) * smoothing
    const snappedTime = Math.abs(nextTime - targetTime) < 0.08 ? targetTime : nextTime
    const snappedCoordinate = getRouteCoordinateAtTime(positionedLegsRef.current, snappedTime) ?? target

    animatedRouteTimeRef.current = snappedTime
    routeRevealTimeRef.current = snappedTime
    animatedRouteCoordinateRef.current = snappedCoordinate
    marker.setLngLat(snappedCoordinate)
    const shouldDrawRoute =
      timestamp - lastAnimatedRouteDrawTimestampRef.current >= 50 ||
      Math.abs(snappedTime - targetTime) < 0.08
    if (shouldDrawRoute) {
      drawRoute(map)
      lastAnimatedRouteDrawTimestampRef.current = timestamp
    }

    let snappedZoom = animatedCameraZoomRef.current
    if (isFollowingRef.current && canUpdateCamera(map)) {
      const currentZoom = animatedCameraZoomRef.current
      const targetZoom = targetCameraZoomRef.current
      const zoomSmoothing = 1 - Math.exp(-deltaMs / 680)
      const nextZoom = currentZoom + (targetZoom - currentZoom) * zoomSmoothing
      snappedZoom = Math.abs(nextZoom - targetZoom) < 0.015 ? targetZoom : nextZoom
      animatedCameraZoomRef.current = snappedZoom

      try {
        map.jumpTo({ center: snappedCoordinate, zoom: snappedZoom })
      } catch {
        // Skip this frame and let the next one retry once the map settles.
      }
    } else if (map) {
      animatedCameraZoomRef.current = map.getZoom()
      snappedZoom = animatedCameraZoomRef.current
    }

    const hasReachedCoordinate = Math.abs(snappedTime - targetTime) < 0.08 || coordinateDistance(snappedCoordinate, target) < 0.00001
    const hasReachedZoom = !isFollowingRef.current || Math.abs(snappedZoom - targetCameraZoomRef.current) < 0.015
    if (hasReachedCoordinate && hasReachedZoom) {
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

  const snapTravelerToPlaybackTime = (map: mapboxgl.Map, nextTime: number, nextCoordinate: RouteCoordinate) => {
    stopMarkerAnimation()
    targetRouteTimeRef.current = nextTime
    animatedRouteTimeRef.current = nextTime
    routeRevealTimeRef.current = nextTime
    targetRouteCoordinateRef.current = nextCoordinate
    animatedRouteCoordinateRef.current = nextCoordinate
    markerRef.current?.setLngLat(nextCoordinate)
    drawRoute(map)

    if (isFollowingRef.current && canUpdateCamera(map)) {
      targetCameraZoomRef.current = getDynamicCameraZoom(
        map,
        positionedLegsRef.current,
        nextTime,
        map.getZoom(),
      )
      animatedCameraZoomRef.current = targetCameraZoomRef.current

      try {
        clearProgrammaticCameraMove()
        beginProgrammaticCameraMove(map)
        map.jumpTo({
          center: nextCoordinate,
          zoom: targetCameraZoomRef.current,
        })
        setMapError(null)
      } catch {
        clearProgrammaticCameraMove()
        setMapError("The map view could not center on the traveler yet.")
      }
    }
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
        "line-width": 4,
        "line-opacity": 0.8,
      },
    })
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

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) {
      return
    }

    let map: mapboxgl.Map
    try {
      map = new mapboxgl.Map({
        container: mapRef.current,
        style: getMapStyleUrl(mapStyle),
        center: liveRouteCoordinateRef.current,
        zoom: 6,
        attributionControl: false,
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
      color: "#ef4444",
      scale: 1.2,
    })
      .setLngLat(liveRouteCoordinateRef.current)
      .addTo(map)
    marker.getElement().style.pointerEvents = "none"

    mapInstanceRef.current = map
    markerRef.current = marker
    animatedRouteCoordinateRef.current = liveRouteCoordinateRef.current
    targetRouteCoordinateRef.current = liveRouteCoordinateRef.current
    targetCameraZoomRef.current = map.getZoom()
    animatedCameraZoomRef.current = map.getZoom()
    hasFocusedCurrentLocationRef.current = false
    isFollowingRef.current = true
    setIsFollowingTraveler(true)

    const handleUserCameraInterrupt = (event: unknown) => {
      if (typeof event === "object" && event !== null && "originalEvent" in event && event.originalEvent) {
        isFollowingRef.current = false
        setIsFollowingTraveler(false)
        clearProgrammaticCameraMove()
        return
      }

      if (isProgrammaticCameraMoveRef.current) {
        return
      }
    }

    const handleMapZoom = () => {
      updateKeyframeMarkerSizes(map)
    }

    const handleInitialLoad = () => {
      setMapError(null)
      setIsLoaded(true)
      appliedMapStyleRef.current = mapStyle
      if (!hasUsableMapSize(map)) {
        return
      }

      map.resize()
      drawRoute(map)
      updateKeyframeMarkerSizes(map)
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
      drawRoute(map)
      updateKeyframeMarkerSizes(map)
      marker.setLngLat(animatedRouteCoordinateRef.current)

      try {
        beginProgrammaticCameraMove(map)
        map.jumpTo({ center: animatedRouteCoordinateRef.current, zoom: animatedCameraZoomRef.current })
      } catch {
        clearProgrammaticCameraMove()
        // Let the next interaction retry after style work finishes.
      }
    }

    map.on("load", handleInitialLoad)
    map.on("style.load", handleStyleLoad)
    map.on("dragstart", handleUserCameraInterrupt)
    map.on("rotatestart", handleUserCameraInterrupt)
    map.on("pitchstart", handleUserCameraInterrupt)
    map.on("zoomstart", handleUserCameraInterrupt)
    map.on("zoom", handleMapZoom)

    return () => {
      stopMarkerAnimation()
      clearTrackingLoading(false)
      clearProgrammaticCameraMove()
      clearKeyframeMarkers()
      map.off("load", handleInitialLoad)
      map.off("style.load", handleStyleLoad)
      map.off("dragstart", handleUserCameraInterrupt)
      map.off("rotatestart", handleUserCameraInterrupt)
      map.off("pitchstart", handleUserCameraInterrupt)
      map.off("zoomstart", handleUserCameraInterrupt)
      map.off("zoom", handleMapZoom)
      map.remove()
      mapInstanceRef.current = null
      markerRef.current = null
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

        map.resize()
        targetRouteCoordinateRef.current = liveRouteCoordinate
        targetCameraZoomRef.current = getDynamicCameraZoom(
          map,
          positionedLegs,
          nextPlaybackTime,
          map.getZoom(),
        )

        if (!hasFocusedCurrentLocationRef.current) {
          targetRouteTimeRef.current = nextPlaybackTime
          animatedRouteTimeRef.current = nextPlaybackTime
          routeRevealTimeRef.current = nextPlaybackTime
          animatedRouteCoordinateRef.current = liveRouteCoordinate
          animatedCameraZoomRef.current = targetCameraZoomRef.current
          markerRef.current?.setLngLat(liveRouteCoordinate)
          drawRoute(map)

          if (isFollowingRef.current && canUpdateCamera(map)) {
            try {
              beginProgrammaticCameraMove(map, 700)
              map.easeTo({
                center: liveRouteCoordinate,
                zoom: targetCameraZoomRef.current,
                duration: 700,
                essential: true,
              })
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
  }, [isLoaded, liveRouteCoordinate, positionedLegs, safeCurrentKeyframe.time])

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
        drawRoute(map)
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

      const travelerCenter = getCurrentTravelerCenter()
      const followTime = Number.isFinite(animatedRouteTimeRef.current)
        ? animatedRouteTimeRef.current
        : safeCurrentKeyframe.time

      isFollowingRef.current = true
      setIsFollowingTraveler(true)
      targetRouteTimeRef.current = safeCurrentKeyframe.time
      targetRouteCoordinateRef.current = liveRouteCoordinate
      targetCameraZoomRef.current = getDynamicCameraZoom(
        map,
        positionedLegsRef.current,
        followTime,
        map.getZoom(),
      )
      animatedCameraZoomRef.current = map.getZoom()

      try {
        clearProgrammaticCameraMove()
        map.stop()
        showTrackingLoadingDuringMove(map, 500)
        beginProgrammaticCameraMove(map, 500)
        map.easeTo({
          center: travelerCenter,
          zoom: targetCameraZoomRef.current,
          duration: 500,
          essential: true,
        })
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
      clearTrackingLoading()
      isFollowingRef.current = false
      setIsFollowingTraveler(false)
      return
    }

    centerOnCurrentLocation()
  }

  const fitToRoute = () => {
    if (mapInstanceRef.current) {
      clearTrackingLoading()
      isFollowingRef.current = false
      setIsFollowingTraveler(false)
      fitMapToRoute(mapInstanceRef.current, 1000)
    }
  }

  const isMapBusy = !isLoaded || isTrackingLoading
  const googleMapsQuery = searchQuery.trim()

  return (
    <div className={`relative ${className}`}>
      <div
        ref={mapRef}
        className={`h-full w-full overflow-hidden rounded-lg transition duration-200 ${isMapBusy ? "blur-sm" : ""}`}
      />

      {mapError && (
        <div className="absolute inset-x-4 bottom-4 z-20">
          <Card className="border-amber-200 bg-white/95 shadow-lg backdrop-blur-sm">
            <CardContent className="flex items-center justify-between gap-4 p-4 text-sm text-slate-700">
              <span>{mapError}</span>
              <Button variant="secondary" size="sm" onClick={fitToRoute}>
                Fit route
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex flex-col gap-2 min-[1500px]:flex-row min-[1500px]:items-start min-[1500px]:justify-between">
        <form onSubmit={searchLocations} className="pointer-events-auto w-[18rem] max-w-full 2xl:w-[22rem]">
          <div className="flex items-center gap-2 rounded-xl bg-white/95 p-1 shadow-lg backdrop-blur-sm">
            <Search className="ml-2 h-4 w-4 shrink-0 text-slate-500" />
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
              className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            {searchQuery && (
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={clearSearch}>
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={isSearching}
              className="bg-slate-950 text-white hover:bg-slate-800 disabled:bg-slate-800"
            >
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Go"}
            </Button>
          </div>

          {(searchResults.length > 0 || searchError || isSearching || googleMapsQuery) && (
            <div
              id="watch-map-search-suggestions"
              role="listbox"
              className="mt-2 overflow-hidden rounded-xl bg-white/95 shadow-lg backdrop-blur-sm"
            >
              {isSearching && searchResults.length === 0 && (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
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

        <div className="pointer-events-auto flex max-w-full flex-wrap justify-end gap-1 self-end rounded-xl border border-white/15 bg-slate-950/85 p-1 shadow-lg backdrop-blur-md">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={`h-8 w-8 rounded-lg hover:text-white ${
              isFollowingTraveler
                ? "bg-white text-slate-950 hover:bg-white/90"
                : "text-white hover:bg-white/15"
            }`}
            aria-pressed={isFollowingTraveler}
            aria-label={isFollowingTraveler ? "Stop tracking traveler" : "Track traveler"}
            title={isFollowingTraveler ? "Stop tracking traveler" : "Track traveler"}
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
