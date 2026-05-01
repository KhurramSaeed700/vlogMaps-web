import type { VideoKeyframe, VideoKeyframePointType } from "@/lib/demo-data"

export type CreatorMapPointType = VideoKeyframePointType

export interface CreatorMapPoint extends VideoKeyframe {
  id: string
}

function createPointId(videoId: string, time: number, lat: number, lng: number) {
  return `${videoId}-${time}-${lat.toFixed(4)}-${lng.toFixed(4)}`
}

export function sortCreatorPoints(points: CreatorMapPoint[]) {
  return [...points].sort((a, b) => a.time - b.time)
}

export function getCreatorPointType(point: Pick<VideoKeyframe, "pointType">): CreatorMapPointType {
  return point.pointType === "stop" ? "stop" : "point"
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
    id: point.id || createPointId(videoId, point.time, point.lat, point.lng),
  }
}

function getStorageKey(videoId: string) {
  return `travelmap:creator-points:${videoId}`
}

export function loadCreatorPoints(videoId: string, fallback: VideoKeyframe[]) {
  if (typeof window === "undefined") {
    return toCreatorMapPoints(videoId, fallback)
  }

  const raw = window.localStorage.getItem(getStorageKey(videoId))
  if (!raw) {
    return toCreatorMapPoints(videoId, fallback)
  }

  try {
    const parsed = JSON.parse(raw) as CreatorMapPoint[]
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return toCreatorMapPoints(videoId, fallback)
    }

    return sortCreatorPoints(parsed.map((point) => normalizeCreatorPoint(videoId, point)))
  } catch {
    return toCreatorMapPoints(videoId, fallback)
  }
}

export function saveCreatorPoints(videoId: string, points: CreatorMapPoint[]) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(getStorageKey(videoId), JSON.stringify(sortCreatorPoints(points)))
}

export function clearCreatorPoints(videoId: string) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.removeItem(getStorageKey(videoId))
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
    return sortedPoints[0]
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
