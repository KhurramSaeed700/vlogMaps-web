"use client"

import { useEffect, useMemo, useRef, type RefObject } from "react"
import type mapboxgl from "mapbox-gl"
import { stopRegionFeatures, stopRegionRadiusFeatures, stopRegionLabels, stopRegionKey, type StopRegionPoint } from "@/lib/stop-regions"
import { isMapStyleReady } from "@/lib/map-loading"

export function getStopRegionKeyAtPoint(map: mapboxgl.Map, point: mapboxgl.PointLike) {
  const layers = ["stop-regions-fill", "stop-regions-outline", "stop-regions-radius-line", "stop-regions-radius"].filter(id => map.getLayer(id))
  if (!layers.length) return null
  const feature = map.queryRenderedFeatures(point, { layers }).find(item => typeof item.properties?.pointKey === "string")
  return feature?.properties?.pointKey as string | undefined ?? null
}

export function useStopRegions(mapRef: RefObject<mapboxgl.Map | null>, ready: boolean, style: string,
  points: readonly StopRegionPoint[], onRegionClick?: (point: StopRegionPoint) => void) {
  const collection = useMemo(() => stopRegionFeatures(points), [points])
  const labels = useMemo(() => stopRegionLabels(points), [points])
  const radii = useMemo(() => stopRegionRadiusFeatures(points), [points])
  const clickRef = useRef(onRegionClick)
  useEffect(() => { clickRef.current = onRegionClick }, [onRegionClick])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const draw = () => {
      if (!isMapStyleReady(map)) return
      const source = map.getSource("stop-regions") as mapboxgl.GeoJSONSource | undefined
      if (source) source.setData(collection)
      else map.addSource("stop-regions", { type: "geojson", data: collection })
      const radiusSource = map.getSource("stop-region-radii") as mapboxgl.GeoJSONSource | undefined
      if (radiusSource) radiusSource.setData(radii)
      else map.addSource("stop-region-radii", { type: "geojson", data: radii })
      const labelSource = map.getSource("stop-region-labels") as mapboxgl.GeoJSONSource | undefined
      if (labelSource) labelSource.setData(labels)
      else map.addSource("stop-region-labels", { type: "geojson", data: labels })
      if (!map.getLayer("stop-regions-fill")) map.addLayer({ id: "stop-regions-fill", type: "fill", source: "stop-regions",
        paint: { "fill-color": "#f97316", "fill-opacity": 0.14 } })
      if (!map.getLayer("stop-regions-outline")) map.addLayer({ id: "stop-regions-outline", type: "line", source: "stop-regions",
        paint: { "line-color": "#f97316", "line-width": 1.5, "line-dasharray": [2, 2] } })
      if (!map.getLayer("stop-regions-radius-line")) map.addLayer({ id: "stop-regions-radius-line", type: "line", source: "stop-region-radii",
        layout: { "line-cap": "round" },
        paint: { "line-color": "#f97316", "line-width": 1.5, "line-dasharray": [0.2, 2.5] } })
      if (!map.getLayer("stop-regions-radius")) map.addLayer({ id: "stop-regions-radius", type: "symbol", source: "stop-region-labels",
        layout: { "text-field": ["get", "radiusLabel"], "text-size": 13, "text-offset": [0, -0.9], "text-allow-overlap": true },
        paint: { "text-color": "#9a3412", "text-halo-color": "#fff7ed", "text-halo-width": 2 } })
      else map.setLayoutProperty("stop-regions-radius", "text-offset", [0, -0.9])
    }
    const click = (event: mapboxgl.MapMouseEvent) => {
      if (!clickRef.current) return
      const key = getStopRegionKeyAtPoint(map, event.point)
      const point = points.find(candidate => stopRegionKey(candidate) === key)
      if (!point) return
      event.preventDefault()
      clickRef.current(point)
    }
    const move = (event: mapboxgl.MapMouseEvent) => {
      if (clickRef.current && getStopRegionKeyAtPoint(map, event.point)) map.getCanvas().style.cursor = "pointer"
    }
    draw()
    map.on("style.load", draw)
    map.on("click", click)
    map.on("mousemove", move)
    return () => {
      map.off("style.load", draw)
      map.off("click", click)
      map.off("mousemove", move)
    }
  }, [mapRef, ready, style, collection, labels, radii, points])
}
