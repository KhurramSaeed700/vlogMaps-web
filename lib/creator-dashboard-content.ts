import type { TravelVideo } from "@/lib/demo-data"
import { normalizeVideoVisibility, type VideoVisibility } from "@/lib/video-visibility"

export type DashboardSort = "date" | "views" | "keyframes"
export interface DashboardFilters {
  query: string
  status: "all" | "published" | "draft"
  visibility: "all" | VideoVisibility
  sort: DashboardSort
  ascending: boolean
}
const normalize = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase()

export function filterDashboardVideos(videos: TravelVideo[], filters: DashboardFilters) {
  const terms = normalize(filters.query.trim()).split(/\s+/).filter(Boolean)
  return videos.filter(video => {
    if (filters.status !== "all" && video.status !== filters.status) return false
    if (filters.visibility !== "all" && (video.status !== "published" || normalizeVideoVisibility(video.visibility) !== filters.visibility)) return false
    const text = normalize([video.title, video.description, video.creator, video.youtubeId, ...video.locations, ...(video.tags || [])].join(" "))
    return terms.every(term => text.includes(term))
  }).sort((a, b) => {
    const value = (video: TravelVideo) => filters.sort === "views" ? video.views : filters.sort === "keyframes" ? video.keyframes.length : Date.parse(video.createdAt) || 0
    return (value(a) - value(b)) * (filters.ascending ? 1 : -1) || a.title.localeCompare(b.title)
  })
}
