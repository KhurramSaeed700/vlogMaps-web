import type { CreatorVideoState } from "@/lib/creator-video-state"
import { emptyCreatorRouteShapes, type CreatorRouteShapes } from "@/lib/creator-route-shapes"
import { emptyCreatorTripRoute, type CreatorTripRoute } from "@/lib/creator-trip-route"
import { toCreatorMapPoints, type CreatorMapPoint } from "@/lib/creator-points"
import { uploadCreatorVideoToCloud } from "@/lib/creator-videos-cloud-client"
import type { TravelVideo } from "@/lib/demo-data"

const legacyCreatorVideosStorageKey = "travelmap:creator-videos"

function legacyCreatorPointsStorageKey(videoId: string) {
  return `travelmap:creator-points:${videoId}`
}

function legacyCreatorTripRouteStorageKey(videoId: string) {
  return `travelmap:creator-trip-route:${videoId}`
}

function legacyCreatorRouteShapesStorageKey(videoId: string) {
  return `travelmap:creator-route-shapes:${videoId}`
}

function readLegacyJson<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function readLegacyCreatorVideos() {
  const videos = readLegacyJson<TravelVideo[]>(legacyCreatorVideosStorageKey)
  return Array.isArray(videos) ? videos : []
}

function readLegacyCreatorState(video: TravelVideo): CreatorVideoState {
  const points = readLegacyJson<CreatorMapPoint[]>(legacyCreatorPointsStorageKey(video.id))
  const tripRoute = readLegacyJson<CreatorTripRoute>(legacyCreatorTripRouteStorageKey(video.id))
  const routeShapes = readLegacyJson<CreatorRouteShapes>(legacyCreatorRouteShapesStorageKey(video.id))

  return {
    points: Array.isArray(points) && points.length > 0 ? points : toCreatorMapPoints(video.id, video.keyframes),
    tripRoute: tripRoute ?? emptyCreatorTripRoute,
    routeShapes: routeShapes ?? video.routeShapes ?? emptyCreatorRouteShapes,
    savedPlaces: [],
  }
}

function clearLegacyCreatorStorage(videos: TravelVideo[]) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.removeItem(legacyCreatorVideosStorageKey)
  for (const video of videos) {
    window.localStorage.removeItem(legacyCreatorPointsStorageKey(video.id))
    window.localStorage.removeItem(legacyCreatorTripRouteStorageKey(video.id))
    window.localStorage.removeItem(legacyCreatorRouteShapesStorageKey(video.id))
  }
}

export async function migrateLegacyCreatorStorageToDatabase() {
  const videos = readLegacyCreatorVideos()
  if (videos.length === 0) {
    return { attempted: 0, migrated: 0, failed: 0 }
  }

  let migrated = 0
  for (const video of videos) {
    const state = readLegacyCreatorState(video)
    const response = await uploadCreatorVideoToCloud(video, state, { publish: video.status === "published" })
    if (response.saved && response.video) {
      migrated += 1
    }
  }

  const failed = videos.length - migrated
  if (failed === 0) {
    clearLegacyCreatorStorage(videos)
  }

  return {
    attempted: videos.length,
    migrated,
    failed,
  }
}
