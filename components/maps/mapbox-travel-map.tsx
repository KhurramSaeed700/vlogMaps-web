"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { Layers, MapIcon, MapPin, Navigation, Satellite } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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

function getKeyframeMarkerColor(pointType?: Keyframe["pointType"]) {
  return pointType === "stop" ? stopKeyframeMarkerColor : pointKeyframeMarkerColor
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
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
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates,
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
  const keyframeMarkersRef = useRef<mapboxgl.Marker[]>([])
  const keyframeMarkerElementsRef = useRef<Map<string, { element: HTMLButtonElement; time: number }>>(new Map())
  const highlightedKeyframeKeysRef = useRef<Set<string>>(new Set())
  const keyframeHighlightTimeoutsRef = useRef<Map<string, number>>(new Map())
  const previousHighlightTimeRef = useRef<number | null>(null)
  const onLocationClickRef = useRef(onLocationClick)
  const keyframesRef = useRef<Keyframe[]>([])
  const routeCoordinatesRef = useRef<RouteCoordinate[]>([])
  const positionedLegsRef = useRef<PositionedRoutedLeg[]>([])
  const liveRouteCoordinateRef = useRef<RouteCoordinate>([0, 0])
  const targetRouteCoordinateRef = useRef<RouteCoordinate>([0, 0])
  const animatedRouteCoordinateRef = useRef<RouteCoordinate>([0, 0])
  const targetCameraZoomRef = useRef(defaultFollowZoom)
  const animatedCameraZoomRef = useRef(defaultFollowZoom)
  const animationFrameRef = useRef<number | null>(null)
  const previousAnimationTimestampRef = useRef<number | null>(null)
  const hasFocusedCurrentLocationRef = useRef(false)
  const isFollowingRef = useRef(true)
  const [mapStyle, setMapStyle] = useState("mapbox://styles/mapbox/streets-v12")
  const [isLoaded, setIsLoaded] = useState(false)
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
  liveRouteCoordinateRef.current = liveRouteCoordinate
  targetRouteCoordinateRef.current = liveRouteCoordinate

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

  const clearKeyframeMarkers = () => {
    keyframeHighlightTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    keyframeHighlightTimeoutsRef.current.clear()
    highlightedKeyframeKeysRef.current.clear()
    keyframeMarkerElementsRef.current.clear()
    keyframeMarkersRef.current.forEach((marker) => marker.remove())
    keyframeMarkersRef.current = []
  }

  const stopMarkerAnimation = () => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    previousAnimationTimestampRef.current = null
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

    const current = animatedRouteCoordinateRef.current
    const target = targetRouteCoordinateRef.current
    const smoothing = 1 - Math.exp(-deltaMs / 180)
    const nextCoordinate: RouteCoordinate = [
      current[0] + (target[0] - current[0]) * smoothing,
      current[1] + (target[1] - current[1]) * smoothing,
    ]
    const snappedCoordinate = coordinateDistance(nextCoordinate, target) < 0.00001 ? target : nextCoordinate

    animatedRouteCoordinateRef.current = snappedCoordinate
    marker.setLngLat(snappedCoordinate)

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

    const hasReachedCoordinate = coordinateDistance(snappedCoordinate, target) < 0.00001
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
        "line-color": "#3b82f6",
        "line-width": 4,
        "line-opacity": 0.8,
      },
    })
  }

  const drawRoute = (map: mapboxgl.Map) => {
    const activeKeyframes = keyframesRef.current
    const activeRouteCoordinates = routeCoordinatesRef.current

    clearKeyframeMarkers()

    if (activeRouteCoordinates.length <= 1) {
      return
    }

    if (!map.isStyleLoaded()) {
      return
    }

    try {
      updateRouteSource(map, activeRouteCoordinates)
      ensureRouteLayer(map)
    } catch {
      return
    }

    keyframeMarkersRef.current = activeKeyframes.map((keyframe, index) => {
      const markerKey = `${keyframe.time}:${index}`
      const el = document.createElement("button")
      const markerColor = getKeyframeMarkerColor(keyframe.pointType)
      el.type = "button"
      el.className = "keyframe-marker"
      el.dataset.normalBackground = markerColor
      el.style.cssText = `
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background-color: ${markerColor};
        border: 2px solid white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 10px;
        font-weight: bold;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        transition: background-color 160ms ease, color 160ms ease;
      `
      el.textContent = (index + 1).toString()
      el.addEventListener("click", () => {
        onLocationClickRef.current?.(keyframe)
      })
      keyframeMarkerElementsRef.current.set(markerKey, { element: el, time: keyframe.time })

      return new mapboxgl.Marker(el).setLngLat([keyframe.lng, keyframe.lat]).addTo(map)
    })
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
        style: mapStyle,
        center: liveRouteCoordinateRef.current,
        zoom: 6,
        attributionControl: false,
      })
    } catch {
      setMapError("The map could not be initialized.")
      return
    }

    map.addControl(new mapboxgl.NavigationControl(), "top-right")
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")

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

    const handleUserCameraInterrupt = (event: unknown) => {
      if (typeof event === "object" && event !== null && "originalEvent" in event && event.originalEvent) {
        isFollowingRef.current = false
      }
    }

    const handleInitialLoad = () => {
      setMapError(null)
      setIsLoaded(true)
      if (!hasUsableMapSize(map)) {
        return
      }

      map.resize()
      drawRoute(map)
      fitMapToRoute(map)
    }

    const handleStyleLoad = () => {
      if (!canUpdateCamera(map)) {
        return
      }

      map.resize()
      drawRoute(map)
      marker.setLngLat(animatedRouteCoordinateRef.current)

      try {
        map.jumpTo({ center: animatedRouteCoordinateRef.current, zoom: animatedCameraZoomRef.current })
      } catch {
        // Let the next interaction retry after style work finishes.
      }
    }

    map.on("load", handleInitialLoad)
    map.on("style.load", handleStyleLoad)
    map.on("dragstart", handleUserCameraInterrupt)
    map.on("rotatestart", handleUserCameraInterrupt)
    map.on("pitchstart", handleUserCameraInterrupt)
    map.on("zoomstart", handleUserCameraInterrupt)

    return () => {
      stopMarkerAnimation()
      clearKeyframeMarkers()
      map.off("load", handleInitialLoad)
      map.off("style.load", handleStyleLoad)
      map.off("dragstart", handleUserCameraInterrupt)
      map.off("rotatestart", handleUserCameraInterrupt)
      map.off("pitchstart", handleUserCameraInterrupt)
      map.off("zoomstart", handleUserCameraInterrupt)
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
  }, [isLoaded, routeCoordinates])

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

        map.resize()
        targetRouteCoordinateRef.current = liveRouteCoordinate
        targetCameraZoomRef.current = getDynamicCameraZoom(
          map,
          positionedLegs,
          safeCurrentKeyframe.time,
          map.getZoom(),
        )

        if (!hasFocusedCurrentLocationRef.current) {
          animatedRouteCoordinateRef.current = liveRouteCoordinate
          animatedCameraZoomRef.current = targetCameraZoomRef.current
          markerRef.current?.setLngLat(liveRouteCoordinate)

          if (isFollowingRef.current && canUpdateCamera(map)) {
            try {
              map.easeTo({
                center: liveRouteCoordinate,
                zoom: targetCameraZoomRef.current,
                duration: 700,
                essential: true,
              })
              setMapError(null)
            } catch {
              // The next playback tick will retry once the map is ready.
            }
          }

          hasFocusedCurrentLocationRef.current = true
          return
        }

        startMarkerAnimation()
      })
    }
  }, [isLoaded, liveRouteCoordinate, positionedLegs, safeCurrentKeyframe.time])

  useEffect(() => {
    if (mapInstanceRef.current && isLoaded) {
      mapInstanceRef.current.setStyle(mapStyle)
    }
  }, [mapStyle, isLoaded])

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

  const toggleMapStyle = () => {
    setMapStyle((current) =>
      current === "mapbox://styles/mapbox/streets-v12"
        ? "mapbox://styles/mapbox/satellite-v9"
        : "mapbox://styles/mapbox/streets-v12",
    )
  }

  const centerOnCurrentLocation = () => {
    if (mapInstanceRef.current && canUpdateCamera(mapInstanceRef.current)) {
      isFollowingRef.current = true
      targetRouteCoordinateRef.current = liveRouteCoordinate
      targetCameraZoomRef.current = getDynamicCameraZoom(
        mapInstanceRef.current,
        positionedLegsRef.current,
        safeCurrentKeyframe.time,
        mapInstanceRef.current.getZoom(),
      )
      animatedCameraZoomRef.current = mapInstanceRef.current.getZoom()
      try {
        mapInstanceRef.current.flyTo({
          center: liveRouteCoordinate,
          zoom: targetCameraZoomRef.current,
          duration: 1000,
        })
        setMapError(null)
      } catch {
        setMapError("The map view could not center on the traveler yet.")
      }
    }
  }

  const fitToRoute = () => {
    if (mapInstanceRef.current) {
      isFollowingRef.current = false
      fitMapToRoute(mapInstanceRef.current, 1000)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <div ref={mapRef} className="w-full h-full overflow-hidden rounded-lg" />

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

      <div className="absolute left-4 top-4 z-10 max-w-sm rounded-lg bg-white/95 p-4 shadow-lg backdrop-blur-sm">
        <div className="mb-2 flex items-center gap-2">
          <MapPin className="h-5 w-5 text-red-500" />
          <h3 className="font-semibold text-gray-900">{safeCurrentKeyframe.location}</h3>
        </div>
        <p className="mb-2 text-sm text-gray-600">{safeCurrentKeyframe.description}</p>
        <div className="text-xs text-gray-500">
          Coordinates: {liveRouteCoordinate[1].toFixed(4)}, {liveRouteCoordinate[0].toFixed(4)}
        </div>
      </div>

      <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
        <Button
          variant="secondary"
          size="icon"
          onClick={toggleMapStyle}
          title="Toggle map style"
          className="bg-white/90 shadow-md hover:bg-white"
        >
          {mapStyle.includes("satellite") ? <MapIcon className="h-4 w-4" /> : <Satellite className="h-4 w-4" />}
        </Button>

        <Button
          variant="secondary"
          size="icon"
          onClick={centerOnCurrentLocation}
          title="Center on current location"
          className="bg-white/90 shadow-md hover:bg-white"
        >
          <Navigation className="h-4 w-4" />
        </Button>

        {routeCoordinates.length > 1 && (
          <Button
            variant="secondary"
            size="icon"
            onClick={fitToRoute}
            title="Fit to route"
            className="bg-white/90 shadow-md hover:bg-white"
          >
            <Layers className="h-4 w-4" />
          </Button>
        )}
      </div>

      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
            <p className="text-sm text-gray-600">Loading map...</p>
          </div>
        </div>
      )}
    </div>
  )
}
