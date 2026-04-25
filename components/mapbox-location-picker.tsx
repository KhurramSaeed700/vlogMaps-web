"use client"

import { useEffect, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { mapboxAccessToken } from "@/lib/mapbox"
import type { CreatorMapPoint } from "@/lib/creator-points"

const mapStyleOptions = [
  { id: "satellite", label: "Satellite", style: "mapbox://styles/mapbox/satellite-streets-v12" },
  { id: "streets", label: "Streets", style: "mapbox://styles/mapbox/streets-v12" },
  { id: "terrain", label: "Terrain", style: "mapbox://styles/mapbox/outdoors-v12" },
] as const

type MapStyleOptionId = (typeof mapStyleOptions)[number]["id"]

interface MapboxLocationPickerProps {
  value: { lat: number; lng: number } | null
  points: CreatorMapPoint[]
  onChange: (value: { lat: number; lng: number }) => void
  className?: string
  isAwaitingPlacement?: boolean
  selectedTimestampLabel?: string | null
}

function removeRouteLayer(map: mapboxgl.Map) {
  if (map.getLayer("editor-route")) {
    map.removeLayer("editor-route")
  }

  if (map.getSource("editor-route")) {
    map.removeSource("editor-route")
  }
}

export function MapboxLocationPicker({
  value,
  points,
  onChange,
  className = "h-full w-full",
  isAwaitingPlacement = false,
  selectedTimestampLabel = null,
}: MapboxLocationPickerProps) {
  mapboxgl.accessToken = mapboxAccessToken

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null)
  const activeMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const pointMarkersRef = useRef<mapboxgl.Marker[]>([])
  const onChangeRef = useRef(onChange)
  const pointsRef = useRef(points)
  const valueRef = useRef(value)
  const hasSetInitialViewRef = useRef(false)
  const appliedMapStyleRef = useRef<MapStyleOptionId>("satellite")
  const [isLoaded, setIsLoaded] = useState(false)
  const [mapStyle, setMapStyle] = useState<MapStyleOptionId>("satellite")

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    pointsRef.current = points
  }, [points])

  useEffect(() => {
    valueRef.current = value
  }, [value])

  const clearPointMarkers = () => {
    pointMarkersRef.current.forEach((marker) => marker.remove())
    pointMarkersRef.current = []
  }

  const drawSavedPoints = (map: mapboxgl.Map) => {
    clearPointMarkers()
    removeRouteLayer(map)

    if (pointsRef.current.length > 1) {
      const coordinates = pointsRef.current.map((point) => [point.lng, point.lat] as [number, number])
      map.addSource("editor-route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates,
          },
        },
      })

      map.addLayer({
        id: "editor-route",
        type: "line",
        source: "editor-route",
        paint: {
          "line-color": "#f97316",
          "line-width": 4,
          "line-opacity": 0.9,
        },
      })
    }

    pointMarkersRef.current = pointsRef.current.map((point, index) => {
      const el = document.createElement("div")
      el.style.cssText = `
        width: 18px;
        height: 18px;
        border-radius: 9999px;
        background: #0f766e;
        border: 2px solid white;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
        font-weight: 700;
        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
      `
      el.textContent = String(index + 1)
      return new mapboxgl.Marker(el).setLngLat([point.lng, point.lat]).addTo(map)
    })
  }

  const syncActiveMarker = (map: mapboxgl.Map) => {
    if (!valueRef.current) {
      activeMarkerRef.current?.remove()
      activeMarkerRef.current = null
      return
    }

    const nextValue = valueRef.current

    if (!activeMarkerRef.current) {
      activeMarkerRef.current = new mapboxgl.Marker({ color: "#ef4444", draggable: true })
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
    }

    activeMarkerRef.current.setLngLat([nextValue.lng, nextValue.lat])
  }

  const fitMapToAvailablePoints = (map: mapboxgl.Map) => {
    const coordinates = [
      ...pointsRef.current.map((point) => [point.lng, point.lat] as [number, number]),
      ...(valueRef.current ? [[valueRef.current.lng, valueRef.current.lat] as [number, number]] : []),
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

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) {
      return
    }

    const fallbackCenter = value ? [value.lng, value.lat] : points[0] ? [points[0].lng, points[0].lat] : [0, 20]
    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: mapStyleOptions.find((option) => option.id === mapStyle)?.style ?? mapStyleOptions[0].style,
      center: fallbackCenter as [number, number],
      zoom: value || points[0] ? 4 : 1.5,
      attributionControl: false,
    })

    map.addControl(new mapboxgl.NavigationControl(), "top-right")

    const handleStyleReady = () => {
      setIsLoaded(true)
      drawSavedPoints(map)
      syncActiveMarker(map)
      if (!hasSetInitialViewRef.current) {
        fitMapToAvailablePoints(map)
        hasSetInitialViewRef.current = true
      }
    }

    map.on("load", handleStyleReady)
    map.on("style.load", handleStyleReady)
    map.on("click", (event) => {
      onChangeRef.current({ lat: event.lngLat.lat, lng: event.lngLat.lng })
    })

    mapInstanceRef.current = map

    return () => {
      clearPointMarkers()
      activeMarkerRef.current?.remove()
      removeRouteLayer(map)
      map.remove()
      mapInstanceRef.current = null
      activeMarkerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !isLoaded) {
      return
    }

    drawSavedPoints(map)
  }, [isLoaded, points])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !isLoaded) {
      return
    }

    syncActiveMarker(map)

    if (!value) {
      return
    }

    map.easeTo({
      center: [value.lng, value.lat],
      duration: 500,
      zoom: Math.max(map.getZoom(), 6),
    })
  }, [isLoaded, value])

  useEffect(() => {
    const styleUrl = mapStyleOptions.find((option) => option.id === mapStyle)?.style
    const map = mapInstanceRef.current
    if (!map || !styleUrl || appliedMapStyleRef.current === mapStyle) {
      return
    }

    appliedMapStyleRef.current = mapStyle
    setIsLoaded(false)
    map.setStyle(styleUrl)
  }, [mapStyle])

  const helperTitle = isAwaitingPlacement
    ? "Move the map and click to pin this timestamp."
    : value
      ? "Click again or drag the marker to refine this point."
      : "Capture a timestamp, then place it on the map."

  const helperBody = selectedTimestampLabel
    ? `Selected time: ${selectedTimestampLabel}`
    : "Satellite view is on by default, and you can switch map styles anytime."

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      <div ref={mapRef} className="h-full w-full" />

      <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2 rounded-2xl bg-white/92 p-1 shadow-lg backdrop-blur-sm">
        {mapStyleOptions.map((option) => (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={mapStyle === option.id ? "default" : "ghost"}
            className="rounded-xl"
            onClick={() => setMapStyle(option.id)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10">
        <div className="rounded-2xl bg-white/92 p-4 shadow-lg backdrop-blur-sm">
          <div className="flex items-start gap-3 text-sm text-slate-700">
            <MapPin className="mt-0.5 h-5 w-5 text-orange-500" />
            <div>
              <p className="font-medium text-slate-900">{helperTitle}</p>
              <p className="mt-1 text-xs text-slate-600">{helperBody}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
