import { normalizeStopRegion, stopRegionFeatures, type StopRegionPoint } from "@/lib/stop-regions"

export interface StopRegionCameraWindow {
  fromTime: number
  toTime: number
  center: [number, number]
  maxZoom: number
}

function mercatorY(latitude: number) {
  const radians = Math.max(-85.051129, Math.min(85.051129, latitude)) * Math.PI / 180
  return (1 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / Math.PI) / 2
}

// Build only when points or viewport dimensions change. Tracking performs one
// binary lookup, with no geometry generation or bounds fitting in its frame loop.
export function buildStopRegionCameraPlan(
  points: readonly (StopRegionPoint & { time: number; stopEndTime?: number })[],
  viewport: { width: number; height: number },
): StopRegionCameraWindow[] {
  const sorted = [...points].sort((a, b) => a.time - b.time)
  const padding = Math.min(80, Math.min(viewport.width, viewport.height) * 0.22)
  const availableDiameter = Math.max(1, Math.min(viewport.width, viewport.height) - padding * 2)
  return sorted.flatMap((point, index) => {
    if (!normalizeStopRegion(point)) return []
    const toTime = Math.min(point.stopEndTime ?? point.time, sorted[index + 1]?.time ?? Infinity)
    if (!Number.isFinite(point.time) || toTime <= point.time) return []
    const ring = stopRegionFeatures([point]).features[0]?.geometry.coordinates[0]
    if (!ring) return []
    const centerY = mercatorY(point.lat)
    // Maximum projected radius fits even when the map is rotated, and keeps
    // the traveler at the circle's center rather than a shifted bounds center.
    const radius = Math.max(...ring.map(([lng, lat]) => Math.hypot(
      (lng - point.lng) / 360, mercatorY(lat) - centerY,
    )))
    if (!(radius > 0)) return []
    // Before the first timestamp the traveler already rests at its location.
    return [{ fromTime: index === 0 ? Math.min(0, point.time) : point.time, toTime, center: [point.lng, point.lat] as [number, number],
      maxZoom: Math.log2(availableDiameter / (1024 * radius)) }]
  })
}

export function getStopRegionCameraAtTime(plan: readonly StopRegionCameraWindow[], time: number) {
  let low = 0, high = plan.length - 1
  while (low <= high) {
    const middle = (low + high) >>> 1
    if (plan[middle].fromTime <= time) low = middle + 1
    else high = middle - 1
  }
  const window = plan[high]
  return window && time < window.toTime ? window : null
}
