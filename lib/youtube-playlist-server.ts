import "server-only"
import type { YouTubePlaylistPreview } from "@/lib/youtube-playlist"

export class PlaylistLoadError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

interface ItemPage {
  nextPageToken?: string
  items?: Array<{ snippet?: { title?: string; position?: number; videoOwnerChannelTitle?: string; videoOwnerChannelId?: string; resourceId?: { videoId?: string } }; status?: { privacyStatus?: string } }>
}

export async function loadYouTubePlaylist(id: string): Promise<YouTubePlaylistPreview> {
  const key = process.env.YOUTUBE_DATA_API_KEY || process.env.YOUTUBE_API_KEY
  if (!key) throw new PlaylistLoadError("Playlist import needs a YouTube Data API key configured on the server.", 503)
  async function get<T>(resource: string, params: Record<string, string>): Promise<T> {
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
  return { id, title: info.items[0].snippet?.title || "YouTube playlist", items, unavailableCount, truncated: Boolean(pageToken) }
}
