"use client"

import { useEffect, useRef } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { MapPin } from "lucide-react"
import { mapboxAccessToken } from "@/lib/mapbox"

interface MapPreviewProps {
  keyframes?: Array<{
    lat: number
    lng: number
    location: string
  }>
  className?: string
}

export function MapPreview({ keyframes = [], className = "w-full h-32" }: MapPreviewProps) {
  mapboxgl.accessToken = mapboxAccessToken
  const mapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mapRef.current || keyframes.length === 0) return

    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [keyframes[0].lng, keyframes[0].lat],
      zoom: 4,
      interactive: false,
      attributionControl: false,
    })

    map.on("load", () => {
      if (keyframes.length > 1) {
        // Add route line
        const coordinates = keyframes.map((kf) => [kf.lng, kf.lat])

        map.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: coordinates,
            },
          },
        })

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
            "line-width": 3,
            "line-opacity": 0.8,
          },
        })

        // Fit to show all keyframes
        const bounds = new mapboxgl.LngLatBounds()
        keyframes.forEach((kf) => bounds.extend([kf.lng, kf.lat]))
        map.fitBounds(bounds, { padding: 20 })
      }

      // Add markers for start and end
      new mapboxgl.Marker({ color: "#22c55e", scale: 0.8 }).setLngLat([keyframes[0].lng, keyframes[0].lat]).addTo(map)

      if (keyframes.length > 1) {
        const lastKeyframe = keyframes[keyframes.length - 1]
        new mapboxgl.Marker({ color: "#ef4444", scale: 0.8 }).setLngLat([lastKeyframe.lng, lastKeyframe.lat]).addTo(map)
      }
    })

    return () => map.remove()
  }, [keyframes])

  if (keyframes.length === 0) {
    return (
      <div className={`${className} bg-gray-100 rounded-lg flex items-center justify-center`}>
        <div className="text-center text-gray-500">
          <MapPin className="h-6 w-6 mx-auto mb-1" />
          <p className="text-xs">No route data</p>
        </div>
      </div>
    )
  }

  return <div ref={mapRef} className={`${className} rounded-lg overflow-hidden`} />
}
