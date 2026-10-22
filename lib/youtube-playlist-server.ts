import "server-only"
import type { YouTubePlaylistPreview } from "@/lib/youtube-playlist"

export class PlaylistLoadError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

interface ItemPage {
  nextPageToken?: string
  items?: Array<{ snippet?: { title?: string; position?: number; videoOwnerChannelTitle?: string; videoOwnerChannelId?: string; resourceId?: { videoId?: string } }; status?: { privacyStatus?: string } }>
}

async function get<T>(resource: string, params: Record<string, string>): Promise<T> {
  const key = process.env.YOUTUBE_DATA_API_KEY || process.env.YOUTUBE_API_KEY
  if (!key) throw new PlaylistLoadError("Playlist import needs a YouTube Data API key configured on the server.", 503)
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`)
  url.search = new URLSearchParams({ ...params, key: key! }).toString()
  let response: Response
  try { response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) }) }
  catch { throw new PlaylistLoadError("YouTube took too long to respond. Please try again.", 504) }
  if (!response.ok) {
    throw new PlaylistLoadError(response.status === 404 ? "Playlist not found or not accessible." : response.status === 403 ? "YouTube could not load this playlist. Check API quota and playlist access." : "Unable to load the playlist from YouTube. Please try again.", response.status === 404 ? 404 : 502)
  }
  return response.json() as Promise<T>
}

export async function loadYouTubePlaylist(id: string): Promise<YouTubePlaylistPreview> {
  const info = await get<{ items?: Array<{ snippet?: { title?: string } }> }>("playlists", { part: "snippet", id })
  if (!info.items?.length) throw new PlaylistLoadError("Playlist not found. Use a public or unlisted playlist.", 404)
  const items: YouTubePlaylistPreview["items"] = []
  const seen = new Set<string>()
  const pages = new Set<string>()
  let pageToken = "", unavailableCount = 0
  do {
    pages.add(pageToken)
    const page = await get<ItemPage>("playlistItems", { part: "snippet,status", playlistId: id, maxResults: "50", ...(pageToken ? { pageToken } : {}) })
    for (const item of page.items ?? []) {
      const snippet = item.snippet
      const youtubeId = snippet?.resourceId?.videoId
      if (!youtubeId || !/^[A-Za-z0-9_-]{11}$/.test(youtubeId) || item.status?.privacyStatus === "private" || ["Private video", "Deleted video"].includes(snippet?.title ?? "")) { unavailableCount++; continue }
      if (seen.has(youtubeId)) continue
      seen.add(youtubeId)
      items.push({ youtubeId, title: snippet?.title || "Untitled video", creator: snippet?.videoOwnerChannelTitle || "YouTube creator", channelId: snippet?.videoOwnerChannelId || "", position: snippet?.position ?? items.length })
    }
    pageToken = page.nextPageToken || ""
  } while (pageToken && !pages.has(pageToken) && pages.size < 10)
  // Playlist items omit duration; fetch content details in batches of 50.
  for (let offset = 0; offset < items.length; offset += 50) {
    const batch = items.slice(offset, offset + 50)
    try {
      const details = await get<{ items?: Array<{ id?: string; contentDetails?: { duration?: string } }> }>("videos", { part: "contentDetails", id: batch.map(item => item.youtubeId).join(',') })
      const durations = new Map((details.items ?? []).map(item => {
        const match = item.contentDetails?.duration?.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/)
        return [item.id, match ? Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0) : 0]
      }))
      for (const item of batch) item.durationSeconds = durations.get(item.youtubeId) || 0
    } catch { /* Keep importing available entries if content details are unavailable. */ }
  }
  return { id, title: info.items[0].snippet?.title || "YouTube playlist", items, unavailableCount, truncated: Boolean(pageToken) }
}

export async function loadYouTubePlaylistSummary(id: string) {
  const info = await get<{ items?: Array<{ snippet?: { title?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string }> }; contentDetails?: { itemCount?: number } }> }>("playlists", { part: "snippet,contentDetails", id })
  const item = info.items?.[0]
  if (!item) throw new PlaylistLoadError("Playlist not found. Use a public or unlisted playlist.", 404)
  const thumbnails = item.snippet?.thumbnails
  return { title: item.snippet?.title || "YouTube playlist", creator: item.snippet?.channelTitle || "", totalVideos: item.contentDetails?.itemCount ?? null, thumbnail: thumbnails?.medium?.url || thumbnails?.default?.url || null }
}

export async function loadYouTubeVideoDetails(ids: string[]) {
  const result: import("@/lib/youtube-video-details").YouTubeVideoDetails[] = []
  for (let offset = 0; offset < ids.length; offset += 50) {
    const response = await get<{ items?: Array<{ id?: string; contentDetails?: { duration?: string }; statistics?: { viewCount?: string } }> }>("videos", { part: "contentDetails,statistics", id: ids.slice(offset, offset + 50).join(',') })
    for (const item of response.items ?? []) {
      if (!item.id) continue
      const match = item.contentDetails?.duration?.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/)
      const duration = match ? Number(match[1] || 0) * 86400 + Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0) : 0
      const views = item.statistics?.viewCount === undefined ? null : Number(item.statistics.viewCount)
      result.push({ youtubeId: item.id, durationSeconds: duration > 0 ? Math.round(duration) : null, views: views !== null && Number.isFinite(views) && views >= 0 ? views : null })
    }
  }
  return result
}
