export const anonymousRegionName = "Anonymous Region"
export const anonymousRegionMessage = "The current location is somewhere within this region."
export interface StopRegionCircle { radiusKm: number; anonymous?: boolean }
export interface StopRegionPoint {
  id?: string
  time?: number
  lat: number
  lng: number
  pointType?: string
  regionCircle?: StopRegionCircle
}

export function normalizeStopRegion(point: StopRegionPoint): StopRegionCircle | undefined {
  const radiusKm = point.regionCircle?.radiusKm
  return point.pointType === "stop" && typeof radiusKm === "number" && Number.isFinite(radiusKm) && radiusKm >= 0.05 && radiusKm <= 500
    ? { radiusKm, ...(point.regionCircle?.anonymous ? { anonymous: true } : {}) } : undefined
}

export function stopRegionKey(point: StopRegionPoint) {
  return point.id ?? `${point.time ?? 0}:${point.lng}:${point.lat}`
}

export function stopRegionRadiusLabel(radiusKm: number) {
  return `${Number(radiusKm.toFixed(2))} km`
}

export function stopRegionBounds(center: { lat: number; lng: number }, radiusKm: number): [number, number, number, number] | null {
  const ring = stopRegionFeatures([{ ...center, pointType: "stop", regionCircle: { radiusKm } }]).features[0]?.geometry.coordinates[0]
  if (!ring) return null
  return [Math.min(...ring.map(point => point[0])), Math.min(...ring.map(point => point[1])),
    Math.max(...ring.map(point => point[0])), Math.max(...ring.map(point => point[1]))]
}

// Use the same geodesic calculation for the boundary, radius line and label.
// A slightly north-of-east bearing keeps the measurement away from the center pin.
const radiusLineBearing = 75
function destinationCoordinate(center: { lat: number; lng: number }, radiusKm: number, bearingDegrees: number) {
  const lat = center.lat * Math.PI / 180, lng = center.lng * Math.PI / 180
  const distance = radiusKm / 6371, bearing = bearingDegrees * Math.PI / 180
  const nextLat = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing))
  const nextLng = lng + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(lat), Math.cos(distance) - Math.sin(lat) * Math.sin(nextLat))
  return [nextLng * 180 / Math.PI, nextLat * 180 / Math.PI]
}

export function stopRegionRadiusFeatures(points: readonly StopRegionPoint[]): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return { type: "FeatureCollection", features: points.flatMap(point => {
    const circle = normalizeStopRegion(point)
    if (!circle || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return []
    return [{ type: "Feature" as const, properties: { pointKey: stopRegionKey(point) },
      geometry: { type: "LineString" as const, coordinates: Array.from({ length: 17 }, (_, index) => index === 0 ? [point.lng, point.lat] : destinationCoordinate(point, circle.radiusKm * index / 16, radiusLineBearing)) } }]
  }) }
}

export function stopRegionLabels(points: readonly StopRegionPoint[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return { type: "FeatureCollection", features: points.flatMap(point => {
    const circle = normalizeStopRegion(point)
    if (!circle || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return []
    return [{ type: "Feature" as const, properties: { pointKey: stopRegionKey(point), radiusLabel: stopRegionRadiusLabel(circle.radiusKm) },
      geometry: { type: "Point" as const, coordinates: destinationCoordinate(point, circle.radiusKm / 2, radiusLineBearing) } }]
  }) }
}

export function stopRegionFeatures(points: readonly StopRegionPoint[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return { type: "FeatureCollection", features: points.flatMap(point => {
    const circle = normalizeStopRegion(point)
    if (!circle || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return []
    const ring = Array.from({ length: 64 }, (_, index) => destinationCoordinate(point, circle.radiusKm, index * 360 / 64))
    ring.push([...ring[0]])
    return [{ type: "Feature" as const, properties: { radiusKm: circle.radiusKm, pointKey: stopRegionKey(point) }, geometry: { type: "Polygon" as const, coordinates: [ring] } }]
  }) }
}
