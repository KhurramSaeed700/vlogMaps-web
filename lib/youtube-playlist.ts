export interface YouTubePlaylistItem {
  youtubeId: string
  title: string
  creator: string
  channelId: string
  position: number
}
export interface YouTubePlaylistPreview {
  id: string
  title: string
  items: YouTubePlaylistItem[]
  unavailableCount: number
  truncated: boolean
}

export function extractYouTubePlaylistId(input: string) {
  try {
    const url = new URL(input.trim())
    const host = url.hostname.toLowerCase()
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    if (!["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"].includes(host)) return null
    const id = url.searchParams.get("list")
    return id && /^[A-Za-z0-9_-]{10,150}$/.test(id) ? id : null
  } catch { return null }
}
