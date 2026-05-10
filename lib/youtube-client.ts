import type { TravelVideo } from "@/lib/demo-data"
import type { ResolvedYouTubeMetadata } from "@/lib/youtube"

const metadataFetchTimeoutMs = 8000
const maxConcurrentMetadataRequests = 4

export interface HydratedTravelVideo extends TravelVideo {
  hasLiveLikeCount: boolean
  hasLiveViewCount: boolean
  isMetadataLoading: boolean
}

function withFallbackFlags(video: TravelVideo, isMetadataLoading = false): HydratedTravelVideo {
  return {
    ...video,
    hasLiveLikeCount: false,
    hasLiveViewCount: false,
    isMetadataLoading,
  }
}

function mergeVideoWithMetadata(video: TravelVideo, metadata: ResolvedYouTubeMetadata | null): HydratedTravelVideo {
  if (!metadata) {
    return withFallbackFlags(video)
  }

  return {
    ...video,
    title: metadata.title || video.title,
    description: metadata.description || video.description,
    creator: metadata.creator || video.creator,
    creatorChannelUrl: metadata.creatorChannelUrl || video.creatorChannelUrl,
    thumbnail: metadata.thumbnail || video.thumbnail,
    durationSeconds: metadata.durationSeconds ?? video.durationSeconds,
    views: metadata.views ?? video.views,
    likes: metadata.likes ?? video.likes,
    hasLiveLikeCount: metadata.likes !== null,
    hasLiveViewCount: metadata.views !== null,
    isMetadataLoading: false,
  }
}

async function fetchMetadata(videoId: string) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), metadataFetchTimeoutMs)

  try {
    const response = await fetch(`/api/youtube/video/${videoId}`, {
      cache: "no-store",
      signal: controller.signal,
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as ResolvedYouTubeMetadata
  } catch {
    return null
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}

export function toHydratedTravelVideo(video: TravelVideo) {
  return withFallbackFlags(video, true)
}

export async function hydrateTravelVideo(video: TravelVideo) {
  const metadata = await fetchMetadata(video.youtubeId)
  return mergeVideoWithMetadata(video, metadata)
}

export async function hydrateTravelVideos(videos: TravelVideo[]) {
  const uniqueVideoIds = [...new Set(videos.map((video) => video.youtubeId))]
  const metadataEntries = await mapWithConcurrency(
    uniqueVideoIds,
    maxConcurrentMetadataRequests,
    async (videoId) => [videoId, await fetchMetadata(videoId).catch(() => null)] as const,
  )

  const metadataByVideoId = new Map(metadataEntries)
  return videos.map((video) => mergeVideoWithMetadata(video, metadataByVideoId.get(video.youtubeId) ?? null))
}
