import type { TravelVideo } from "@/lib/demo-data"
import type { YouTubePlaylistPreview } from "@/lib/youtube-playlist"

export function playlistEditorHref(videoId: string, playlistId: string) {
  return `/creator/video/${encodeURIComponent(videoId)}/edit?${new URLSearchParams({ playlist: playlistId })}`
}

export function getPlaylistMappingStep(playlist: YouTubePlaylistPreview, videos: TravelVideo[], youtubeId: string) {
  const byYouTubeId = new Map(videos.map(video => [video.youtubeId, video]))
  const currentIndex = playlist.items.findIndex(item => item.youtubeId === youtubeId)
  if (currentIndex < 0) return null
  const next = playlist.items.slice(currentIndex + 1).find(item => byYouTubeId.has(item.youtubeId))
  return {
    position: currentIndex + 1,
    total: playlist.items.length,
    next: next ? { ...next, id: byYouTubeId.get(next.youtubeId)!.id } : null,
  }
}

export function getVideoPlaylistId(video: Pick<TravelVideo, "tags">) {
  const tag = video.tags?.find(value => /^playlist:[A-Za-z0-9_-]{10,150}$/.test(value))
  return tag?.slice("playlist:".length)
}
