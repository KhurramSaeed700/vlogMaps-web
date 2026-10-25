import type { RouteCoordinate } from "@/lib/mapbox-directions"

// GeoJSON line tiles use Web Mercator even when draped onto the globe. Feeding
// them polar coordinates collapses the stroke onto the tile edge into a blob.
// Clip only the rendered stroke; flight timing, distances and markers retain
// the original great-circle coordinates. Never flatten a polar flight into a
// false horizontal route. Cut date-line crossings into separate world copies.
export const flightRenderLatitudeLimit = 85.0511287798066 - 0.00001
const cache = new WeakMap<RouteCoordinate[], RouteCoordinate[][]>()
const wrap = (lng: number) => lng >= -180 && lng < 180 ? lng : ((lng + 180) % 360 + 360) % 360 - 180

export function getFlightRenderSegments(coordinates: RouteCoordinate[]): RouteCoordinate[][] {
  const cached = cache.get(coordinates)
  if (cached) return cached
  const segments: RouteCoordinate[][] = []
  let current: RouteCoordinate[] = []
  const flush = () => { if (current.length >= 2) segments.push(current); current = [] }
  const append = (point: RouteCoordinate) => {
    let last = current.at(-1)
    if (last && Math.abs(last[0] - point[0]) > 180) { flush(); last = undefined }
    if (!last || last[0] !== point[0] || last[1] !== point[1]) current.push(point)
  }
  for (let index = 1; index < coordinates.length; index++) {
    const a = coordinates[index - 1], b = coordinates[index]
    if (![...a, ...b].every(Number.isFinite)) { flush(); continue }
    const aLng = wrap(a[0])
    const delta = wrap(b[0] - a[0])
    const dy = b[1] - a[1]
    let from = 0, to = 1
    if (dy === 0) {
      if (Math.abs(a[1]) > flightRenderLatitudeLimit) { flush(); continue }
    } else {
      const lower = (-flightRenderLatitudeLimit - a[1]) / dy
      const upper = (flightRenderLatitudeLimit - a[1]) / dy
      from = Math.max(0, Math.min(lower, upper)); to = Math.min(1, Math.max(lower, upper))
      if (from >= to) { flush(); continue }
    }
    if (from > 0) flush()
    const start: RouteCoordinate = [aLng + delta * from, a[1] + dy * from]
    const end: RouteCoordinate = [aLng + delta * to, a[1] + dy * to]
    // Shift both endpoints together so a segment begins in the canonical world.
    const shift = Math.floor((start[0] + 180) / 360) * 360
    start[0] -= shift; end[0] -= shift
    const boundary = end[0] > 180 ? 180 : end[0] < -180 ? -180 : null
    append(start)
    if (boundary !== null) {
      const progress = (boundary - start[0]) / (end[0] - start[0])
      const latitude = start[1] + (end[1] - start[1]) * progress
      append([boundary, latitude]); flush()
      append([-boundary, latitude]); append([end[0] - Math.sign(boundary) * 360, end[1]])
    } else append(end)
    if (to < 1) flush()
  }
  flush()
  cache.set(coordinates, segments)
  return segments
}
