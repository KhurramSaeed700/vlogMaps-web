export interface CreatorRouteShapePoint {
  lat: number
  lng: number
}

export interface CreatorRouteShapes {
  trip: CreatorRouteShapePoint[]
  timestampLegs: Record<string, CreatorRouteShapePoint[]>
}

export const emptyCreatorRouteShapes: CreatorRouteShapes = {
  trip: [],
  timestampLegs: {},
}

export function getTimestampLegKey(startPointId: string, endPointId: string) {
  return `${startPointId}:${endPointId}`
}

function getStorageKey(videoId: string) {
  return `travelmap:creator-route-shapes:${videoId}`
}

function isValidShapePoint(value: unknown): value is CreatorRouteShapePoint {
  if (!value || typeof value !== "object") {
    return false
  }

  const point = value as CreatorRouteShapePoint
  return (
    typeof point.lat === "number" &&
    Number.isFinite(point.lat) &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lng)
  )
}

function readShapePoints(value: unknown) {
  return Array.isArray(value) ? value.filter(isValidShapePoint) : []
}

export function loadCreatorRouteShapes(videoId: string): CreatorRouteShapes {
  if (typeof window === "undefined") {
    return emptyCreatorRouteShapes
  }

  const raw = window.localStorage.getItem(getStorageKey(videoId))
  if (!raw) {
    return emptyCreatorRouteShapes
  }

  try {
    const parsed = JSON.parse(raw) as Partial<CreatorRouteShapes>
    const timestampLegs = Object.fromEntries(
      Object.entries(parsed.timestampLegs ?? {}).map(([key, value]) => [key, readShapePoints(value)]),
    )

    return {
      trip: readShapePoints(parsed.trip),
      timestampLegs,
    }
  } catch {
    return emptyCreatorRouteShapes
  }
}

export function saveCreatorRouteShapes(videoId: string, routeShapes: CreatorRouteShapes) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(getStorageKey(videoId), JSON.stringify(routeShapes))
}

export function clearCreatorRouteShapes(videoId: string) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.removeItem(getStorageKey(videoId))
}
