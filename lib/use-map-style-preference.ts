"use client"

import { useEffect, useState } from "react"
import { defaultMapStyle, type MapStyle, isMapStyle, mapStyleChangedEvent, mapStyleStorageKey, readDefaultMapStyle, writeDefaultMapStyle } from "@/lib/map-style-preferences"

// Quick map controls change only this map. Settings changes update every open map.
export function useMapStylePreference() {
  const [style, setStyle] = useState<MapStyle | null>(null)
  useEffect(() => {
    setStyle(readDefaultMapStyle())
    const onChange = (event: Event) => {
      const value = (event as CustomEvent).detail
      if (isMapStyle(value)) setStyle(value)
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === mapStyleStorageKey || event.key === null) setStyle(readDefaultMapStyle())
    }
    window.addEventListener(mapStyleChangedEvent, onChange)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener(mapStyleChangedEvent, onChange)
      window.removeEventListener("storage", onStorage)
    }
  }, [])
  return { style: style ?? defaultMapStyle, ready: style !== null, setStyle, saveDefaultStyle: writeDefaultMapStyle }
}
