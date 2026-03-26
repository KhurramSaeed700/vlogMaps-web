import type { TravelVideo } from "@/lib/demo-data"
import { creatorProfile, getTravelVideoById, getCreatorVideos } from "@/lib/demo-data"
import { extractYouTubeId, getYouTubeThumbnailUrl } from "@/lib/youtube"
import type { VideoKeyframe } from "@/lib/demo-data"

const creatorVideosStorageKey = "travelmap:creator-videos"

export function isLocalCreatorVideoId(id: string) {
  return id.startsWith("custom-")
}

export function loadLocalCreatorVideos() {
  if (typeof window === "undefined") {
    return [] as TravelVideo[]
  }

  const raw = window.localStorage.getItem(creatorVideosStorageKey)
  if (!raw) {
    return [] as TravelVideo[]
  }

  try {
    const parsed = JSON.parse(raw) as TravelVideo[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveLocalCreatorVideos(videos: TravelVideo[]) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(creatorVideosStorageKey, JSON.stringify(videos))
}

export function getAllCreatorVideosClient() {
  return [...getCreatorVideos(), ...loadLocalCreatorVideos()]
}

export function getTravelVideoByIdClient(id: string) {
  const demoVideo = getTravelVideoById(id)
  if (demoVideo) {
    return demoVideo
  }

  return loadLocalCreatorVideos().find((video) => video.id === id)
}

export function createLocalCreatorVideo({
  youtubeUrl,
  title,
  description,
}: {
  youtubeUrl: string
  title?: string
  description?: string
}) {
  const youtubeId = extractYouTubeId(youtubeUrl)

  if (!youtubeId) {
    throw new Error("Please paste a valid YouTube URL.")
  }

  const existingVideo = loadLocalCreatorVideos().find((video) => video.youtubeId === youtubeId)
  if (existingVideo) {
    return existingVideo
  }

  const now = new Date().toISOString()
  const video: TravelVideo = {
    id: `custom-${youtubeId}-${Date.now()}`,
    title: title?.trim() || `New travel video (${youtubeId})`,
    creator: creatorProfile.name,
    creatorChannelUrl: creatorProfile.channelUrl,
    youtubeId,
    thumbnail: getYouTubeThumbnailUrl(youtubeId),
    durationSeconds: 0,
    views: 0,
    mapViews: 0,
    likes: 0,
    status: "draft",
    createdAt: now,
    description: description?.trim() || "Creator-added travel video. Add timestamped route points to bring the map to life.",
    locations: [],
    keyframes: [],
  }

  const nextVideos = [video, ...loadLocalCreatorVideos()]
  saveLocalCreatorVideos(nextVideos)
  return video
}

export function updateLocalCreatorVideo(videoId: string, updates: Partial<TravelVideo>) {
  if (!isLocalCreatorVideoId(videoId)) {
    return getTravelVideoById(videoId) ?? null
  }

  const videos = loadLocalCreatorVideos()
  const nextVideos = videos.map((video) => {
    if (video.id !== videoId) {
      return video
    }

    return {
      ...video,
      ...updates,
    }
  })

  saveLocalCreatorVideos(nextVideos)
  return nextVideos.find((video) => video.id === videoId) ?? null
}

export function syncVideoRouteMetadata(videoId: string, keyframes: VideoKeyframe[]) {
  if (!isLocalCreatorVideoId(videoId)) {
    return
  }

  updateLocalCreatorVideo(videoId, {
    keyframes,
    locations: keyframes.map((point) => point.location),
  })
}
