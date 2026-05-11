import type { CreatorVideoState } from "@/lib/creator-video-state"
import type { TravelVideo, VideoKeyframe } from "@/lib/demo-data"

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function readKeyframes(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as VideoKeyframe[]
  }

  return value.flatMap((item): VideoKeyframe[] => {
    if (!isPlainObject(item)) {
      return []
    }

    const time = readNumber(item.time, Number.NaN)
    const lat = readNumber(item.lat, Number.NaN)
    const lng = readNumber(item.lng, Number.NaN)
    if (!Number.isFinite(time) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return []
    }

    const pointType = item.pointType === "stop" ? "stop" : "point"
    const stopEndTime =
      pointType === "stop" && typeof item.stopEndTime === "number" && item.stopEndTime > time
        ? item.stopEndTime
        : undefined

    return [
      {
        time,
        stopEndTime,
        lat,
        lng,
        location: readString(item.location, "Saved location"),
        description: readString(item.description, ""),
        pointType,
      },
    ]
  })
}

export function parseTravelVideoPayload(value: unknown) {
  if (!isPlainObject(value)) {
    return null
  }

  const id = readString(value.id).trim()
  const youtubeId = readString(value.youtubeId).trim()
  const title = readString(value.title).trim()

  if (!id || !youtubeId || !title) {
    return null
  }

  const keyframes = readKeyframes(value.keyframes)
  const status = value.status === "published" ? "published" : "draft"

  return {
    id,
    title,
    creator: readString(value.creator, "Creator"),
    creatorChannelUrl: readString(value.creatorChannelUrl, `https://www.youtube.com/watch?v=${youtubeId}`),
    youtubeId,
    thumbnail: readString(value.thumbnail),
    durationSeconds: Math.max(0, Math.round(readNumber(value.durationSeconds))),
    views: Math.max(0, Math.round(readNumber(value.views))),
    mapViews: Math.max(0, Math.round(readNumber(value.mapViews))),
    likes: Math.max(0, Math.round(readNumber(value.likes))),
    status,
    createdAt: readString(value.createdAt, new Date().toISOString()),
    description: readString(value.description),
    locations: readStringArray(value.locations),
    keyframes,
    tags: readStringArray(value.tags),
  } satisfies TravelVideo
}

export function parseCreatorVideoStatePayload(value: unknown) {
  if (!isPlainObject(value) || !Array.isArray(value.points) || !isPlainObject(value.tripRoute) || !isPlainObject(value.routeShapes)) {
    return null
  }

  const state: CreatorVideoState = {
    points: value.points as CreatorVideoState["points"],
    tripRoute: value.tripRoute as unknown as CreatorVideoState["tripRoute"],
    routeShapes: value.routeShapes as unknown as CreatorVideoState["routeShapes"],
  }

  return state
}
