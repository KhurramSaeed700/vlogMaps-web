"use client"

import { useEffect, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { MapPin } from "lucide-react"
import { mapboxAccessToken } from "@/lib/mapbox"
import type { CreatorMapPoint } from "@/lib/creator-points"

interface MapboxLocationPickerProps {
  value: { lat: number; lng: number } | null
  points: CreatorMapPoint[]
  onChange: (value: { lat: number; lng: number }) => void
  className?: string
}

export function MapboxLocationPicker({ value, points, onChange, className = "h-full w-full" }: MapboxLocationPickerProps) {
  mapboxgl.accessToken = mapboxAccessToken

  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null)
  const activeMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const pointMarkersRef = useRef<mapboxgl.Marker[]>([])
  const [isLoaded, setIsLoaded] = useState(false)

  const clearPointMarkers = () => {
    pointMarkersRef.current.forEach((marker) => marker.remove())
    pointMarkersRef.current = []
  }

  const drawSavedPoints = (map: mapboxgl.Map) => {
    clearPointMarkers()

    if (points.length > 1) {
      const coordinates = points.map((point) => [point.lng, point.lat] as [number, number])
      if (!map.getSource("editor-route")) {
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
      }

      if (!map.getLayer("editor-route")) {
        map.addLayer({
          id: "editor-route",
          type: "line",
          source: "editor-route",
          paint: {
            "line-color": "#0f766e",
            "line-width": 4,
            "line-opacity": 0.75,
          },
        })
      }
    }

    pointMarkersRef.current = points.map((point, index) => {
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

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) {
      return
    }

    const fallbackCenter = value ? [value.lng, value.lat] : points[0] ? [points[0].lng, points[0].lat] : [0, 20]
    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: fallbackCenter as [number, number],
      zoom: value || points[0] ? 4 : 1.5,
      attributionControl: false,
    })

    map.addControl(new mapboxgl.NavigationControl(), "top-right")

    map.on("load", () => {
      setIsLoaded(true)
      drawSavedPoints(map)

      map.on("click", (event) => {
        onChange({ lat: event.lngLat.lat, lng: event.lngLat.lng })
      })
    })

    mapInstanceRef.current = map

    return () => {
      clearPointMarkers()
      activeMarkerRef.current?.remove()
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

    if (map.getLayer("editor-route")) {
      map.removeLayer("editor-route")
    }

    if (map.getSource("editor-route")) {
      map.removeSource("editor-route")
    }

    drawSavedPoints(map)
  }, [isLoaded, points])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !isLoaded || !value) {
      return
    }

    if (!activeMarkerRef.current) {
      activeMarkerRef.current = new mapboxgl.Marker({ color: "#ef4444", draggable: true })
        .setLngLat([value.lng, value.lat])
        .addTo(map)

      activeMarkerRef.current.on("dragend", () => {
        const marker = activeMarkerRef.current
        if (!marker) {
          return
        }

        const lngLat = marker.getLngLat()
        onChange({ lat: lngLat.lat, lng: lngLat.lng })
      })
    }

    activeMarkerRef.current.setLngLat([value.lng, value.lat])
    map.easeTo({
      center: [value.lng, value.lat],
      duration: 500,
      zoom: Math.max(map.getZoom(), 5),
    })
  }, [isLoaded, onChange, value])

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      <div ref={mapRef} className="h-full w-full" />
      {!value && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/75 backdrop-blur-sm">
          <div className="text-center text-sm text-gray-600">
            <MapPin className="mx-auto mb-2 h-6 w-6 text-teal-700" />
            Click the map to place the current timestamp.
          </div>
        </div>
      )}
    </div>
  )
}
