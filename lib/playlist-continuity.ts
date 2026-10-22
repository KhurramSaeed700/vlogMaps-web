import { groupCreatorPlaylists } from "@/lib/creator-playlists"
import type { TravelVideo, VideoKeyframe } from "@/lib/demo-data"
import { anonymousRegionMessage, anonymousRegionName, normalizeStopRegion } from "@/lib/stop-regions"

export function getPreviousPlaylistVideo(videos: TravelVideo[], videoId: string, playlistId: string) {
  const playlist = groupCreatorPlaylists(videos).playlists.find(group => group.id === playlistId)
  const index = playlist?.videos.findIndex(video => video.id === videoId) ?? -1
  return index > 0 ? playlist!.videos[index - 1] : null
}

export function createPlaylistStartStop(points: readonly VideoKeyframe[]) {
  const last = [...points].filter(point => Number.isFinite(point.time) && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180)
    .sort((a, b) => a.time - b.time).at(-1)
  if (!last) return null
  const regionCircle = normalizeStopRegion(last)
  const name = last.location.trim()
  return {
    time: 0,
    lat: last.lat, lng: last.lng,
    pointType: "stop" as const,
    location: regionCircle?.anonymous ? anonymousRegionName : /^stay\b/i.test(name) ? name : name ? `Stay at ${name}` : "Stay at previous video's destination",
    description: regionCircle?.anonymous ? anonymousRegionMessage : "Starting at the previous playlist video's final location.",
    ...(regionCircle ? { regionCircle } : {}),
  }
}
export type PlaylistStartStop = NonNullable<ReturnType<typeof createPlaylistStartStop>>
