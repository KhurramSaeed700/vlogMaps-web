import type { TravelVideo } from "@/lib/demo-data"
import type { YouTubePlaylistPreview } from "@/lib/youtube-playlist"
import { getVideoPlaylistId } from "@/lib/playlist-mapping"

export interface CreatorPlaylist {
  id: string
  title: string
  videos: TravelVideo[]
  mappedCount: number
  uploadedCount: number
}

export function creatorPlaylistHref(id: string) {
  return `/creator/playlists/${encodeURIComponent(id)}`
}

function importedPosition(video: TravelVideo) {
  const tag = video.tags?.find(tag => /^playlist-position:\d+$/.test(tag))
  return tag ? Number(tag.slice("playlist-position:".length)) : null
}

export function groupCreatorPlaylists(videos: readonly TravelVideo[]) {
  const groups = new Map<string, TravelVideo[]>()
  const standalone: TravelVideo[] = []
  for (const video of videos) {
    const id = getVideoPlaylistId(video)
    if (!id) { standalone.push(video); continue }
    const group = groups.get(id) ?? []
    group.push(video)
    groups.set(id, group)
  }
  const playlists: CreatorPlaylist[] = [...groups].map(([id, items]) => {
    const ordered = [...items].sort((a, b) => {
      const left = importedPosition(a), right = importedPosition(b)
      if (left !== null && right !== null) return left - right
      return (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0) || a.id.localeCompare(b.id)
    })
    const title = ordered.map(video => /^Imported from ([\s\S]+)\.$/.exec(video.description)?.[1]).find(Boolean)
      ?? ordered.flatMap(video => video.tags ?? []).find(tag => tag.startsWith("playlist-title:"))?.slice("playlist-title:".length)
      ?? "Imported playlist"
    return { id, title, videos: ordered, mappedCount: ordered.filter(video => video.keyframes.length > 0).length,
      uploadedCount: ordered.filter(video => video.status === "published").length }
  }).sort((a, b) => {
    const latest = (playlist: CreatorPlaylist) => Math.max(...playlist.videos.map(video => Date.parse(video.createdAt) || 0))
    return latest(b) - latest(a) || a.title.localeCompare(b.title)
  })
  return { standalone, playlists }
}

// Show only this creator's imported members; never add other owners' videos
// from the public YouTube response. Retain removed/unavailable imported videos.
export function orderCreatorPlaylistVideos(videos: readonly TravelVideo[], preview: YouTubePlaylistPreview | null) {
  if (!preview) return [...videos]
  const positions = new Map(preview.items.map(item => [item.youtubeId, item.position]))
  return [...videos].sort((a, b) => (positions.get(a.youtubeId) ?? Infinity) - (positions.get(b.youtubeId) ?? Infinity))
}
