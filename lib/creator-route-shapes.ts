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

function creatorRouteShapesStorageKey(videoId: string) {
  return `travelmap:creator-route-shapes:${videoId}`
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isRouteShapePoint(value: unknown): value is CreatorRouteShapePoint {
  if (!value || typeof value !== "object") {
    return false
  }

  const point = value as Partial<CreatorRouteShapePoint>
  return isFiniteNumber(point.lat) && isFiniteNumber(point.lng)
}

function isRouteShapes(value: unknown): value is CreatorRouteShapes {
  if (!value || typeof value !== "object") {
    return false
  }

  const routeShapes = value as Partial<CreatorRouteShapes>
  return (
    Array.isArray(routeShapes.trip) &&
    routeShapes.trip.every(isRouteShapePoint) &&
    Boolean(routeShapes.timestampLegs) &&
    typeof routeShapes.timestampLegs === "object" &&
    Object.values(routeShapes.timestampLegs).every((points) => Array.isArray(points) && points.every(isRouteShapePoint))
  )
}

export function loadCreatorRouteShapes(videoId: string): CreatorRouteShapes {
  if (typeof window !== "undefined") {
    try {
      const rawRouteShapes = window.localStorage.getItem(creatorRouteShapesStorageKey(videoId))
      const parsedRouteShapes = rawRouteShapes ? (JSON.parse(rawRouteShapes) as unknown) : null
      if (isRouteShapes(parsedRouteShapes)) {
        return parsedRouteShapes
      }
    } catch {
      window.localStorage.removeItem(creatorRouteShapesStorageKey(videoId))
    }
  }

  return emptyCreatorRouteShapes
}

export function saveCreatorRouteShapes(videoId: string, routeShapes: CreatorRouteShapes) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(creatorRouteShapesStorageKey(videoId), JSON.stringify(routeShapes))
}

export function clearCreatorRouteShapes(videoId: string) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.removeItem(creatorRouteShapesStorageKey(videoId))
}
