export type CreatorTripEndpoint = "start" | "end"

export interface CreatorTripLocation {
  lat: number
  lng: number
  name?: string
}

export interface CreatorTripRoute {
  start: CreatorTripLocation | null
  end: CreatorTripLocation | null
}

export const emptyCreatorTripRoute: CreatorTripRoute = {
  start: null,
  end: null,
}

function getStorageKey(videoId: string) {
  return `travelmap:creator-trip-route:${videoId}`
}

function isValidLocation(value: unknown): value is CreatorTripLocation {
  if (!value || typeof value !== "object") {
    return false
  }

  const location = value as CreatorTripLocation
  return (
    typeof location.lat === "number" &&
    Number.isFinite(location.lat) &&
    typeof location.lng === "number" &&
    Number.isFinite(location.lng) &&
    (typeof location.name === "undefined" || typeof location.name === "string")
  )
}

export function loadCreatorTripRoute(videoId: string) {
  if (typeof window === "undefined") {
    return emptyCreatorTripRoute
  }

  const raw = window.localStorage.getItem(getStorageKey(videoId))
  if (!raw) {
    return emptyCreatorTripRoute
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CreatorTripRoute>
    return {
      start: isValidLocation(parsed.start) ? parsed.start : null,
      end: isValidLocation(parsed.end) ? parsed.end : null,
    }
  } catch {
    return emptyCreatorTripRoute
  }
}

export function saveCreatorTripRoute(videoId: string, route: CreatorTripRoute) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(getStorageKey(videoId), JSON.stringify(route))
}

export function clearCreatorTripRoute(videoId: string) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.removeItem(getStorageKey(videoId))
}
