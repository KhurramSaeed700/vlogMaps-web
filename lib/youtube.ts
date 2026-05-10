export function extractYouTubeId(input: string) {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  const directIdMatch = trimmed.match(/^[a-zA-Z0-9_-]{11}$/)
  if (directIdMatch) {
    return directIdMatch[0]
  }

  try {
    const url = new URL(trimmed)

    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.split("/").filter(Boolean)[0]
      return id && id.length === 11 ? id : null
    }

    if (url.hostname.includes("youtube.com")) {
      const fromQuery = url.searchParams.get("v")
      if (fromQuery && fromQuery.length === 11) {
        return fromQuery
      }

      const pathParts = url.pathname.split("/").filter(Boolean)
      const embedLikeId = pathParts[pathParts.length - 1]
      if (embedLikeId && embedLikeId.length === 11) {
        return embedLikeId
      }
    }
  } catch {
    return null
  }

  return null
}

export function getYouTubeThumbnailUrl(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}

const youtubeMetadataFetchTimeoutMs = 8000

export interface ResolvedYouTubeMetadata {
  title: string
  description: string | null
  creator: string
  creatorChannelUrl: string
  thumbnail: string
  durationSeconds: number | null
  views: number | null
  likes: number | null
  source: "youtube-data-api" | "youtube-oembed"
}

interface YouTubeThumbnailVariant {
  url: string
}

interface YouTubeDataApiVideo {
  snippet?: {
    title?: string
    description?: string
    channelId?: string
    channelTitle?: string
    thumbnails?: Record<string, YouTubeThumbnailVariant>
  }
  contentDetails?: {
    duration?: string
  }
  statistics?: {
    likeCount?: string
    viewCount?: string
  }
}

interface YouTubeFetchInit extends RequestInit {
  next?: {
    revalidate?: number
  }
}

async function fetchYouTubeJson<T>(url: string | URL) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), youtubeMetadataFetchTimeoutMs)

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
      next: {
        revalidate: 3600,
      },
      signal: controller.signal,
    } as YouTubeFetchInit)

    if (!response.ok) {
      return null
    }

    return (await response.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function parseIso8601Duration(duration: string) {
  const match = duration.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!match) {
    return null
  }

  const days = Number(match[1] || 0)
  const hours = Number(match[2] || 0)
  const minutes = Number(match[3] || 0)
  const seconds = Number(match[4] || 0)

  return days * 86_400 + hours * 3_600 + minutes * 60 + seconds
}

function pickBestThumbnail(thumbnails?: Record<string, YouTubeThumbnailVariant>) {
  if (!thumbnails) {
    return null
  }

  const orderedKeys = ["maxres", "standard", "high", "medium", "default"]
  for (const key of orderedKeys) {
    const candidate = thumbnails[key]
    if (candidate?.url) {
      return candidate.url
    }
  }

  return null
}

async function fetchOEmbedMetadata(videoId: string): Promise<ResolvedYouTubeMetadata | null> {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`
  const payload = await fetchYouTubeJson<{
    author_name?: string
    author_url?: string
    thumbnail_url?: string
    title?: string
  }>(url)

  if (!payload?.title || !payload.author_name) {
    return null
  }

  return {
    title: payload.title,
    description: null,
    creator: payload.author_name,
    creatorChannelUrl: payload.author_url || `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: payload.thumbnail_url || getYouTubeThumbnailUrl(videoId),
    durationSeconds: null,
    views: null,
    likes: null,
    source: "youtube-oembed",
  }
}

async function fetchYouTubeDataApiMetadata(videoId: string, apiKey: string): Promise<ResolvedYouTubeMetadata | null> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos")
  url.searchParams.set("part", "snippet,contentDetails,statistics")
  url.searchParams.set("id", videoId)
  url.searchParams.set("key", apiKey)

  const payload = await fetchYouTubeJson<{
    items?: YouTubeDataApiVideo[]
  }>(url)
  const item = payload?.items?.[0]

  if (!item?.snippet?.title || !item.snippet.channelTitle) {
    return null
  }

  return {
    title: item.snippet.title,
    description: item.snippet.description || null,
    creator: item.snippet.channelTitle,
    creatorChannelUrl: item.snippet.channelId
      ? `https://www.youtube.com/channel/${item.snippet.channelId}`
      : `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: pickBestThumbnail(item.snippet.thumbnails) || getYouTubeThumbnailUrl(videoId),
    durationSeconds: item.contentDetails?.duration ? parseIso8601Duration(item.contentDetails.duration) : null,
    views: item.statistics?.viewCount ? Number(item.statistics.viewCount) : null,
    likes: item.statistics?.likeCount ? Number(item.statistics.likeCount) : null,
    source: "youtube-data-api",
  }
}

export async function fetchResolvedYouTubeMetadata(videoId: string) {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY

  if (apiKey) {
    const apiMetadata = await fetchYouTubeDataApiMetadata(videoId, apiKey).catch(() => null)
    if (apiMetadata) {
      return apiMetadata
    }
  }

  return fetchOEmbedMetadata(videoId).catch(() => null)
}
