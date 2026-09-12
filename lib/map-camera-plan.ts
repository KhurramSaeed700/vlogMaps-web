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
  flightContexts: readonly FlightCameraContext[]
}

export interface FlightCameraContext {
  departure: number
  arrival: number
  center: [number, number]
}

export interface CameraPlanTarget {
  zoom: number
  center: [number, number] | null
}

const ease = (value: number) => {
  const t = Math.min(Math.max(value, 0), 1)
  return t * t * (3 - 2 * t)
}

function normalizeLongitude(longitude: number) {
  return ((longitude + 180) % 360 + 360) % 360 - 180
}

function getFlightContextCenter(
  coordinates: readonly (readonly [number, number])[],
): [number, number] {
  let previousLongitude = coordinates[0][0]
  let west = previousLongitude
  let east = previousLongitude
  let south = coordinates[0][1]
  let north = coordinates[0][1]

  for (let index = 1; index < coordinates.length; index += 1) {
    let longitude = coordinates[index][0]
    while (longitude - previousLongitude > 180) longitude -= 360
    while (longitude - previousLongitude < -180) longitude += 360
    previousLongitude = longitude
    west = Math.min(west, longitude)
    east = Math.max(east, longitude)
    south = Math.min(south, coordinates[index][1])
    north = Math.max(north, coordinates[index][1])
  }

  return [normalizeLongitude((west + east) / 2), (south + north) / 2]
}

/** Build once per route/viewport change, never inside requestAnimationFrame.
 * Adjacent legs transition directly between their regional zoom levels.
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
    // Fast land movement keeps at least four seconds visible within 60% of the
    // short viewport dimension. Flights use the complete route below.
    const isFlight = segment.routeKind === "flight"
    // Flights keep the complete corridor, plus a little surrounding land, in
    // view. Duration-based framing can otherwise leave a long-haul traveler
    // centered over an ocean without either continent visible.
    const visibleKm = Math.max(
      1,
      segment.totalDistance * (isFlight ? 1.25 : Math.min(1, 4 / duration)),
    )
    let latitudeScale = 1
    for (const coordinate of segment.coordinates) {
      latitudeScale = Math.min(latitudeScale, Math.cos(Math.min(80, Math.abs(coordinate[1])) * Math.PI / 180))
    }
    const readableZoom = isFlight ? (segment.totalDistance >= 2500 ? 3 : 4.5) : 5.2
    const zoom = Math.max(viewport.minZoom, Math.min(viewport.maxZoom, Math.max(readableZoom, Math.min(
      viewport.maxZoom, 6.6,
      Math.log2(40075 * latitudeScale * pixels * 0.6 / (512 * visibleKm)),
    ))))
    const lead = Math.min(3.5, Math.max(1, (12 - zoom) / 3))
    const window: CameraZoomWindow = {
      start: segment.fromTime - lead,
      departure: segment.fromTime,
      arrival: segment.toTime,
      end: segment.toTime + 1.5,
      zoom, fromZoom: zoom, toZoom: zoom,
      flightContexts: isFlight
        ? [{
            departure: segment.fromTime,
            arrival: segment.toTime,
            center: getFlightContextCenter(segment.coordinates),
          }]
        : [],
    }
    // Keep each leg's scale. Sharing the widest zoom across a montage can
    // leave a local journey at globe scale long after its flight has ended.
    const previous = windows[windows.length - 1]
    if (previous && window.start <= previous.end) {
      const boundary = Math.max(previous.arrival, window.start)
      previous.end = boundary
      window.start = boundary
    }
    windows.push(window)
  }
  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index]
    window.fromZoom = Math.max(window.zoom, Math.min(viewport.maxZoom, getFollowZoom(window.start)))
    window.toZoom = Math.max(window.zoom, Math.min(viewport.maxZoom, getFollowZoom(window.end)))
    const previous = windows[index - 1]
    if (previous && previous.end === window.start) {
      previous.toZoom = previous.zoom
      window.fromZoom = previous.zoom
    }
  }
  return windows
}

/** O(log n) lookup and constant arithmetic; no wall-clock easing or queued moves.
 * Seeking, pausing and dropped frames evaluate the same video-time trajectory.
 */
export function getCameraPlanZoom(plan: readonly CameraZoomWindow[], time: number): number | null {
  const window = getCameraPlanWindow(plan, time)
  return window ? getWindowZoom(window, time) : null
}

function getCameraPlanWindow(
  plan: readonly CameraZoomWindow[],
  time: number,
) {
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
  return window
}

function getWindowZoom(window: CameraZoomWindow, time: number) {
  let zoom: number
  if (time < window.departure) {
    zoom = window.fromZoom + (window.zoom - window.fromZoom) *
      ease((time - window.start) / (window.departure - window.start))
  } else if (time <= window.arrival) {
    zoom = window.zoom
  } else {
    zoom = window.zoom + (window.toZoom - window.zoom) *
      ease((time - window.arrival) / (window.end - window.arrival))
  }

  return zoom
}

export function getCameraPlanTarget(
  plan: readonly CameraZoomWindow[],
  time: number,
): CameraPlanTarget | null {
  const window = getCameraPlanWindow(plan, time)
  if (!window) return null
  const zoom = getWindowZoom(window, time)
  // Keep the traveler visible at regional scales, including narrow screens.
  return { zoom, center: null }
}
