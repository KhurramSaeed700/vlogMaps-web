import type mapboxgl from "mapbox-gl"
import land from "@/lib/world-land.json"
import { mapboxAccessToken } from "@/lib/mapbox"

const sourceId = "travelmap-world"
const landLayerId = "travelmap-world-land"
const observations = new WeakMap<object, { latencyMs: number; samples: number; pending: Map<string, number> }>()
const styleRequests = new WeakMap<object, number>()

export function createWorldFallbackStyle(): mapboxgl.StyleSpecification {
  return {
    version: 8,
    name: "TravelMap coarse world",
    glyphs: "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
    sources: { [sourceId]: { type: "geojson", data: land as unknown as GeoJSON.FeatureCollection, maxzoom: 5, tolerance: 1 } },
    layers: [
      { id: "travelmap-ocean", type: "background", paint: { "background-color": "#b9dce8" } },
      { id: landLayerId, type: "fill", source: sourceId, paint: { "fill-color": "#d8e3d1", "fill-antialias": false } },
    ],
  }
}

export function isMapStyleReady(map: mapboxgl.Map) {
  // This source is installed at style.load, independently of remote tile readiness.
  return Boolean(map.getSource(sourceId))
}

export function canPreloadMap(map: mapboxgl.Map) {
  return isMapStyleReady(map) && map.getStyle().name !== "TravelMap coarse world"
}

function mergeWorldFallback(style: mapboxgl.StyleSpecification) {
  const fallback = createWorldFallbackStyle()
  const backgrounds = style.layers.filter((layer) => layer.type === "background")
  const details = style.layers.filter((layer) => layer.type !== "background")
  return {
    ...style,
    sources: { ...style.sources, [sourceId]: fallback.sources[sourceId] },
    layers: [
      ...backgrounds.map((layer) => ({ ...layer, paint: { ...layer.paint, "background-color": "#b9dce8" } })),
      fallback.layers[1],
      ...details,
    ],
  } satisfies mapboxgl.StyleSpecification
}

function getStyleApiUrl(url: string) {
  if (!url.startsWith("mapbox://styles/")) return url
  const stylePath = url.slice("mapbox://styles/".length)
  return `https://api.mapbox.com/styles/v1/${stylePath}?access_token=${encodeURIComponent(mapboxAccessToken)}`
}

export async function setDetailedMapStyle(map: mapboxgl.Map, url: string) {
  const request = (styleRequests.get(map) ?? 0) + 1
  styleRequests.set(map, request)
  try {
    const response = await fetch(getStyleApiUrl(url))
    if (!response.ok) throw new Error(`Map style request failed (${response.status})`)
    const style = await response.json() as mapboxgl.StyleSpecification
    if (styleRequests.get(map) !== request || !observations.has(map)) return false
    map.setStyle(mergeWorldFallback(style), {
      diff: false,
      localFontFamily: undefined,
      localIdeographFontFamily: undefined,
    })
    return true
  } catch {
    // Keep the currently rendered fallback or detailed style on network failure.
    return false
  }
}

function installWorldFallback(map: mapboxgl.Map) {
  if (map.getSource(sourceId)) return
  const fallback = createWorldFallbackStyle()
  const layers = map.getStyle().layers ?? []
  const firstDetail = layers.find((layer) => layer.type !== "background")?.id
  for (const layer of layers) {
    if (layer.type === "background") map.setPaintProperty(layer.id, "background-color", "#b9dce8")
  }
  map.addSource(sourceId, fallback.sources[sourceId])
  map.addLayer(fallback.layers[1], firstDetail)
}

export function getMapLoadingObservation(map?: object | null) {
  const observation = map ? observations.get(map) : undefined
  if (!observation) return undefined
  const now = performance.now()
  let oldestMs = 0
  for (const [key, started] of observation.pending) {
    if (now - started > 15000) observation.pending.delete(key)
    else oldestMs = Math.max(oldestMs, now - started)
  }
  return { latencyMs: Math.max(observation.latencyMs, oldestMs), samples: observation.samples, pending: observation.pending.size }
}

export function attachMapLoading(map: mapboxgl.Map, getDetailedStyle: () => string) {
  const observation = { latencyMs: 0, samples: 0, pending: new Map<string, number>() }
  observations.set(map, observation)
  const keyFor = (event: mapboxgl.MapDataEvent) => {
    if (event.dataType !== "source") return null
    if (event.sourceId === sourceId || !event.coord) return null
    const coord = event.coord
    return `${event.sourceId}:${coord.overscaledZ}:${coord.wrap}:${coord.canonical.x}:${coord.canonical.y}`
  }
  const loading = (event: mapboxgl.MapDataEvent) => {
    const key = keyFor(event)
    if (key && observation.pending.size < 256 && !observation.pending.has(key)) observation.pending.set(key, performance.now())
  }
  const loaded = (event: mapboxgl.MapDataEvent) => {
    const key = keyFor(event)
    const start = key ? observation.pending.get(key) : undefined
    if (!key || start === undefined) return
    observation.pending.delete(key)
    const elapsed = performance.now() - start
    observation.latencyMs = observation.samples ? observation.latencyMs * 0.8 + elapsed * 0.2 : elapsed
    observation.samples += 1
  }
  const styleReady = () => {
    observation.pending.clear()
    installWorldFallback(map)
  }
  const detail = () => setDetailedMapStyle(map, getDetailedStyle())
  map.on("style.load", styleReady)
  map.on("sourcedataloading", loading)
  map.on("sourcedata", loaded)
  // Render the bundled geography first, then request the detailed style.
  map.once("load", detail)
  map.once("remove", () => {
    map.off("style.load", styleReady)
    map.off("sourcedataloading", loading)
    map.off("sourcedata", loaded)
    map.off("load", detail)
    observations.delete(map)
    styleRequests.delete(map)
  })
}
