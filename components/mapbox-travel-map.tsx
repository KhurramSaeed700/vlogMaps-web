"use client"

import { useEffect, useRef, useState } from "react"
import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { Button } from "@/components/ui/button"
import { MapPin, Layers, Navigation, Satellite, MapIcon } from "lucide-react"
import { mapboxAccessToken } from "@/lib/mapbox"

interface Keyframe {
  time: number
  lat: number
  lng: number
  location: string
  description: string
}

interface MapboxTravelMapProps {
  keyframes: Keyframe[]
  currentKeyframe: Keyframe
  onLocationClick?: (keyframe: Keyframe) => void
  className?: string
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
  const onLocationClickRef = useRef(onLocationClick)
  const [mapStyle, setMapStyle] = useState("mapbox://styles/mapbox/streets-v12")
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    onLocationClickRef.current = onLocationClick
  }, [onLocationClick])

  const clearKeyframeMarkers = () => {
    keyframeMarkersRef.current.forEach((marker) => marker.remove())
    keyframeMarkersRef.current = []
  }

  const drawRoute = (map: mapboxgl.Map) => {
    clearKeyframeMarkers()

    if (keyframes.length <= 1) {
      return
    }

    const coordinates = keyframes.map((kf) => [kf.lng, kf.lat] as [number, number])

    if (!map.getSource("route")) {
      map.addSource("route", {
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

    if (!map.getLayer("route")) {
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

    keyframeMarkersRef.current = keyframes.map((keyframe, index) => {
      const el = document.createElement("button")
      el.type = "button"
      el.className = "keyframe-marker"
      el.style.cssText = `
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background-color: #3b82f6;
        border: 2px solid white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 10px;
        font-weight: bold;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      `
      el.textContent = (index + 1).toString()
      el.addEventListener("click", () => {
        onLocationClickRef.current?.(keyframe)
      })

      return new mapboxgl.Marker(el).setLngLat([keyframe.lng, keyframe.lat]).addTo(map)
    })
  }

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: mapStyle,
      center: [currentKeyframe.lng, currentKeyframe.lat],
      zoom: 6,
      attributionControl: false,
    })

    // Add navigation controls
    map.addControl(new mapboxgl.NavigationControl(), "top-right")
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right")

    // Create current location marker
    const marker = new mapboxgl.Marker({
      color: "#ef4444",
      scale: 1.2,
    })
      .setLngLat([currentKeyframe.lng, currentKeyframe.lat])
      .addTo(map)

    mapInstanceRef.current = map
    markerRef.current = marker

    const handleMapLoad = () => {
      setIsLoaded(true)
      drawRoute(map)

      if (keyframes.length > 1) {
        const bounds = new mapboxgl.LngLatBounds()
        keyframes.forEach((kf) => bounds.extend([kf.lng, kf.lat]))
        map.fitBounds(bounds, { padding: 50 })
      }
    }

    map.on("load", handleMapLoad)
    map.on("style.load", handleMapLoad)

    return () => {
      clearKeyframeMarkers()
      map.remove()
      mapInstanceRef.current = null
      markerRef.current = null
    }
  }, [])

  // Update current location
  useEffect(() => {
    if (mapInstanceRef.current && markerRef.current && isLoaded) {
      // Update marker position
      markerRef.current.setLngLat([currentKeyframe.lng, currentKeyframe.lat])

      // Ease the marker across the route for a simple travel-style movement.
      mapInstanceRef.current.easeTo({
        center: [currentKeyframe.lng, currentKeyframe.lat],
        zoom: 10,
        duration: 700,
        essential: true,
      })
    }
  }, [currentKeyframe, isLoaded])

  // Update map style
  useEffect(() => {
    if (mapInstanceRef.current && isLoaded) {
      mapInstanceRef.current.setStyle(mapStyle)
    }
  }, [mapStyle, isLoaded])

  const toggleMapStyle = () => {
    setMapStyle((current) =>
      current === "mapbox://styles/mapbox/streets-v12"
        ? "mapbox://styles/mapbox/satellite-v9"
        : "mapbox://styles/mapbox/streets-v12",
    )
  }

  const centerOnCurrentLocation = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo({
        center: [currentKeyframe.lng, currentKeyframe.lat],
        zoom: 15,
        duration: 1000,
      })
    }
  }

  const fitToRoute = () => {
    if (mapInstanceRef.current && keyframes.length > 1) {
      const bounds = new mapboxgl.LngLatBounds()
      keyframes.forEach((kf) => bounds.extend([kf.lng, kf.lat]))
      mapInstanceRef.current.fitBounds(bounds, { padding: 50, duration: 1000 })
    }
  }

  return (
    <div className={`relative ${className}`}>
      {/* Map Container */}
      <div ref={mapRef} className="w-full h-full rounded-lg overflow-hidden" />

      {/* Current Location Info Overlay */}
      <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg p-4 max-w-sm shadow-lg z-10">
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="h-5 w-5 text-red-500" />
          <h3 className="font-semibold text-gray-900">{currentKeyframe.location}</h3>
        </div>
        <p className="text-sm text-gray-600 mb-2">{currentKeyframe.description}</p>
        <div className="text-xs text-gray-500">
          Coordinates: {currentKeyframe.lat.toFixed(4)}, {currentKeyframe.lng.toFixed(4)}
        </div>
      </div>

      {/* Map Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
        <Button
          variant="secondary"
          size="icon"
          onClick={toggleMapStyle}
          title="Toggle map style"
          className="bg-white/90 hover:bg-white shadow-md"
        >
          {mapStyle.includes("satellite") ? <MapIcon className="h-4 w-4" /> : <Satellite className="h-4 w-4" />}
        </Button>

        <Button
          variant="secondary"
          size="icon"
          onClick={centerOnCurrentLocation}
          title="Center on current location"
          className="bg-white/90 hover:bg-white shadow-md"
        >
          <Navigation className="h-4 w-4" />
        </Button>

        {keyframes.length > 1 && (
          <Button
            variant="secondary"
            size="icon"
            onClick={fitToRoute}
            title="Fit to route"
            className="bg-white/90 hover:bg-white shadow-md"
          >
            <Layers className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Loading indicator */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-600">Loading map...</p>
          </div>
        </div>
      )}
    </div>
  )
}
