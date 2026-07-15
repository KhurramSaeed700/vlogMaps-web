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

function creatorTripRouteStorageKey(videoId: string) {
  return `travelmap:creator-trip-route:${videoId}`
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isTripLocation(value: unknown): value is CreatorTripLocation {
  if (!value || typeof value !== "object") {
    return false
  }

  const location = value as Partial<CreatorTripLocation>
  return isFiniteNumber(location.lat) && isFiniteNumber(location.lng)
}

function isTripRoute(value: unknown): value is CreatorTripRoute {
  if (!value || typeof value !== "object") {
    return false
  }

  const route = value as Partial<CreatorTripRoute>
  return (route.start === null || isTripLocation(route.start)) && (route.end === null || isTripLocation(route.end))
}

export function loadCreatorTripRoute(videoId: string) {
  if (typeof window !== "undefined") {
    try {
      const rawRoute = window.localStorage.getItem(creatorTripRouteStorageKey(videoId))
      const parsedRoute = rawRoute ? (JSON.parse(rawRoute) as unknown) : null
      if (isTripRoute(parsedRoute)) {
        return parsedRoute
      }
    } catch {
      window.localStorage.removeItem(creatorTripRouteStorageKey(videoId))
    }
  }

  return emptyCreatorTripRoute
}

export function saveCreatorTripRoute(videoId: string, route: CreatorTripRoute) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(creatorTripRouteStorageKey(videoId), JSON.stringify(route))
}

export function clearCreatorTripRoute(videoId: string) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.removeItem(creatorTripRouteStorageKey(videoId))
}
