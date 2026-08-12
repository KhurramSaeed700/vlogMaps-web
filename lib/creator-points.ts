import type { VideoKeyframe, VideoKeyframePointType } from "@/lib/demo-data"

export type CreatorMapPointType = VideoKeyframePointType

export interface CreatorMapPoint extends VideoKeyframe {
  id: string
}

function creatorPointsStorageKey(videoId: string) {
  return `travelmap:creator-points:${videoId}`
}

function createPointId(videoId: string, time: number, lat: number, lng: number) {
  return `${videoId}-${time}-${lat.toFixed(4)}-${lng.toFixed(4)}`
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isCreatorMapPoint(value: unknown): value is CreatorMapPoint {
  if (!value || typeof value !== "object") {
    return false
  }

  const point = value as Partial<CreatorMapPoint>
  return (
    typeof point.id === "string" &&
    isFiniteNumber(point.time) &&
    isFiniteNumber(point.lat) &&
    isFiniteNumber(point.lng) &&
    typeof point.location === "string" &&
    typeof point.description === "string"
  )
}

export function sortCreatorPoints(points: CreatorMapPoint[]) {
  return [...points].sort((a, b) => a.time - b.time)
}

export function getCreatorPointType(point: Pick<VideoKeyframe, "pointType">): CreatorMapPointType {
  if (point.pointType === "stop" || point.pointType === "flight") {
    return point.pointType
  }

  return "point"
}

export function toCreatorMapPoints(videoId: string, keyframes: VideoKeyframe[]) {
  return sortCreatorPoints(
    keyframes.map((keyframe) => ({
      ...keyframe,
      pointType: getCreatorPointType(keyframe),
      id: createPointId(videoId, keyframe.time, keyframe.lat, keyframe.lng),
    })),
  )
}

function normalizeCreatorPoint(videoId: string, point: CreatorMapPoint) {
  const normalizedStopEndTime =
    point.pointType === "stop" && typeof point.stopEndTime === "number" && point.stopEndTime > point.time
      ? point.stopEndTime
      : undefined

  return {
    ...point,
    pointType: getCreatorPointType(point),
    stopEndTime: normalizedStopEndTime,
    flightId: point.pointType === "flight" ? point.flightId : undefined,
    flightPhase: point.pointType === "flight" ? point.flightPhase : undefined,
    id: point.id || createPointId(videoId, point.time, point.lat, point.lng),
  }
}

export function loadCreatorPoints(videoId: string, fallback: VideoKeyframe[]) {
  if (typeof window !== "undefined") {
    try {
      const rawPoints = window.localStorage.getItem(creatorPointsStorageKey(videoId))
      const parsedPoints = rawPoints ? (JSON.parse(rawPoints) as unknown) : null
      if (Array.isArray(parsedPoints)) {
        const savedPoints = parsedPoints.filter(isCreatorMapPoint).map((point) => normalizeCreatorPoint(videoId, point))
        return sortCreatorPoints(savedPoints)
      }
    } catch {
      window.localStorage.removeItem(creatorPointsStorageKey(videoId))
    }
  }

  return toCreatorMapPoints(videoId, fallback)
}

export function saveCreatorPoints(videoId: string, points: CreatorMapPoint[]) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(creatorPointsStorageKey(videoId), JSON.stringify(sortCreatorPoints(points)))
}

export function clearCreatorPoints(videoId: string) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.removeItem(creatorPointsStorageKey(videoId))
}

export function upsertCreatorPoint(videoId: string, points: CreatorMapPoint[], point: Omit<CreatorMapPoint, "id"> & { id?: string }) {
  const pointType = getCreatorPointType(point)
  const nextPoint: CreatorMapPoint = {
    ...point,
    pointType,
    stopEndTime:
      pointType === "stop" && typeof point.stopEndTime === "number" && point.stopEndTime > point.time
        ? point.stopEndTime
        : undefined,
    flightId: pointType === "flight" ? point.flightId : undefined,
    flightPhase: pointType === "flight" ? point.flightPhase : undefined,
    id: point.id || createPointId(videoId, point.time, point.lat, point.lng),
  }

  const nextPoints = points.filter((existingPoint) => existingPoint.id !== nextPoint.id)
  nextPoints.push(nextPoint)
  return sortCreatorPoints(nextPoints)
}

export function getInterpolatedPointAtTime(points: VideoKeyframe[], currentTime: number): VideoKeyframe {
  const sortedPoints = [...points].sort((a, b) => a.time - b.time)

  if (sortedPoints.length === 0) {
    return {
      time: currentTime,
      lat: 0,
      lng: 0,
      location: "Unknown location",
      description: "No route points available yet.",
    }
  }

  if (sortedPoints.length === 1 || currentTime <= sortedPoints[0].time) {
    return {
      ...sortedPoints[0],
      time: currentTime,
    }
  }

  const previousPoint =
    sortedPoints
      .slice()
      .reverse()
      .find((point) => currentTime >= point.time) ?? sortedPoints[0]

  const previousIndex = sortedPoints.findIndex((point) => point.time === previousPoint.time)
  const nextPoint = sortedPoints[previousIndex + 1]

  if (!nextPoint) {
    return previousPoint
  }

  const previousStopEndTime =
    getCreatorPointType(previousPoint) === "stop" &&
    typeof previousPoint.stopEndTime === "number" &&
    previousPoint.stopEndTime > previousPoint.time
      ? Math.min(previousPoint.stopEndTime, nextPoint.time)
      : null

  if (previousStopEndTime !== null && currentTime < previousStopEndTime) {
    return {
      ...previousPoint,
      time: currentTime,
      pointType: "stop",
    }
  }

  if (getCreatorPointType(previousPoint) === "stop" && previousStopEndTime === null && currentTime < nextPoint.time) {
    return {
      ...previousPoint,
      time: currentTime,
      pointType: "stop",
    }
  }

  const travelStartTime = previousStopEndTime ?? previousPoint.time
  const segmentDuration = Math.max(nextPoint.time - travelStartTime, 1)
  const progress = Math.min(Math.max((currentTime - travelStartTime) / segmentDuration, 0), 1)

  return {
    time: currentTime,
    lat: previousPoint.lat + (nextPoint.lat - previousPoint.lat) * progress,
    lng: previousPoint.lng + (nextPoint.lng - previousPoint.lng) * progress,
    pointType: "point",
    location: progress < 0.08 ? previousPoint.location : progress > 0.92 ? nextPoint.location : `Traveling to ${nextPoint.location}`,
    description:
      progress < 0.08
        ? previousPoint.description
        : progress > 0.92
          ? nextPoint.description
          : `Moving from ${previousPoint.location} to ${nextPoint.location}.`,
  }
}
