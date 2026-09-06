import { isRealtimeNavigationSegment } from "./map-navigation-motion"

interface CameraSegment {
  fromTime: number
  toTime: number
  totalDistance: number
  coordinates: readonly (readonly [number, number])[]
  routeKind?: string
  isStationary?: boolean
}

export interface CameraZoomWindow {
  start: number
  departure: number
  arrival: number
  end: number
  zoom: number
  fromZoom: number
  toZoom: number
}

const ease = (value: number) => {
  const t = Math.min(Math.max(value, 0), 1)
  return t * t * (3 - 2 * t)
}

/** Build once per route/viewport change, never inside requestAnimationFrame.
 * Overlapping preparation/recovery windows share a cruise zoom. This prevents
 * city-level tile requests between tightly edited, consecutive country changes.
 */
export function buildCameraZoomPlan(
  segments: readonly CameraSegment[],
  viewport: { width: number; height: number; minZoom: number; maxZoom: number },
  getFollowZoom: (time: number) => number,
): CameraZoomWindow[] {
  const windows: CameraZoomWindow[] = []
  const pixels = Math.max(128, Math.min(viewport.width, viewport.height))
  for (const segment of segments) {
    if (
      segment.isStationary || segment.coordinates.length < 2 ||
      !isRealtimeNavigationSegment(segment) ||
      !Number.isFinite(segment.totalDistance) || segment.totalDistance <= 0 ||
      !Number.isFinite(segment.fromTime) || !Number.isFinite(segment.toTime) ||
      segment.toTime <= segment.fromTime
    ) continue

    const duration = segment.toTime - segment.fromTime
    // At least four seconds of motion fit within 60% of the short viewport
    // dimension. Short flights fit in full; long flights can retain more detail.
    const visibleKm = Math.max(1, segment.totalDistance * Math.min(1, 4 / duration))
    let latitudeScale = 1
    for (const coordinate of segment.coordinates) {
      latitudeScale = Math.min(latitudeScale, Math.cos(Math.min(80, Math.abs(coordinate[1])) * Math.PI / 180))
    }
    const zoom = Math.max(viewport.minZoom, Math.min(
      viewport.maxZoom, 6.6,
      Math.log2(40075 * latitudeScale * pixels * 0.6 / (512 * visibleKm)),
    ))
    const lead = Math.min(3.5, Math.max(1, (12 - zoom) / 3))
    const window: CameraZoomWindow = {
      start: segment.fromTime - lead,
      departure: segment.fromTime,
      arrival: segment.toTime,
      end: segment.toTime + 1.5,
      zoom, fromZoom: zoom, toZoom: zoom,
    }
    // A later, longer jump can start preparing earlier than its predecessor.
    // Merge backwards too, so windows stay disjoint for binary search.
    while (windows.length && window.start <= windows[windows.length - 1].end) {
      const previous = windows.pop()!
      window.start = Math.min(previous.start, window.start)
      window.departure = Math.min(previous.departure, window.departure)
      window.arrival = Math.max(previous.arrival, window.arrival)
      window.end = Math.max(previous.end, window.end)
      window.zoom = Math.min(previous.zoom, window.zoom)
    }
    windows.push(window)
  }
  for (const window of windows) {
    window.fromZoom = Math.max(window.zoom, Math.min(viewport.maxZoom, getFollowZoom(window.start)))
    window.toZoom = Math.max(window.zoom, Math.min(viewport.maxZoom, getFollowZoom(window.end)))
  }
  return windows
}

/** O(log n) lookup and constant arithmetic; no wall-clock easing or queued moves.
 * Seeking, pausing and dropped frames evaluate the same video-time trajectory.
 */
export function getCameraPlanZoom(plan: readonly CameraZoomWindow[], time: number): number | null {
  if (!Number.isFinite(time)) return null
  let low = 0
  let high = plan.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (plan[middle].end < time) low = middle + 1
    else high = middle
  }
  const window = plan[low]
  if (!window || time < window.start) return null
  if (time < window.departure) {
    return window.fromZoom + (window.zoom - window.fromZoom) *
      ease((time - window.start) / (window.departure - window.start))
  }
  if (time <= window.arrival) return window.zoom
  return window.zoom + (window.toZoom - window.zoom) *
    ease((time - window.arrival) / (window.end - window.arrival))
}
