import type { VideoKeyframe } from "@/lib/demo-data"

export interface CreatorMapPoint extends VideoKeyframe {
  id: string
}

function createPointId(videoId: string, time: number, lat: number, lng: number) {
  return `${videoId}-${time}-${lat.toFixed(4)}-${lng.toFixed(4)}`
}

export function sortCreatorPoints(points: CreatorMapPoint[]) {
  return [...points].sort((a, b) => a.time - b.time)
}

export function toCreatorMapPoints(videoId: string, keyframes: VideoKeyframe[]) {
  return sortCreatorPoints(
    keyframes.map((keyframe) => ({
      ...keyframe,
      id: createPointId(videoId, keyframe.time, keyframe.lat, keyframe.lng),
    })),
  )
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

    return sortCreatorPoints(parsed)
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

export function upsertCreatorPoint(videoId: string, points: CreatorMapPoint[], point: Omit<CreatorMapPoint, "id"> & { id?: string }) {
  const nextPoint: CreatorMapPoint = {
    ...point,
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

  const segmentDuration = Math.max(nextPoint.time - previousPoint.time, 1)
  const progress = Math.min(Math.max((currentTime - previousPoint.time) / segmentDuration, 0), 1)

  return {
    time: currentTime,
    lat: previousPoint.lat + (nextPoint.lat - previousPoint.lat) * progress,
    lng: previousPoint.lng + (nextPoint.lng - previousPoint.lng) * progress,
    location: progress < 0.08 ? previousPoint.location : progress > 0.92 ? nextPoint.location : `Traveling to ${nextPoint.location}`,
    description:
      progress < 0.08
        ? previousPoint.description
        : progress > 0.92
          ? nextPoint.description
          : `Moving from ${previousPoint.location} to ${nextPoint.location}.`,
  }
}
