import type { CreatorRouteShapes } from "@/lib/creator-route-shapes"

export type VideoKeyframePointType = "point" | "stop" | "flight"
export type VideoKeyframeFlightPhase = "takeoff" | "landing"

export interface VideoKeyframe {
  time: number
  stopEndTime?: number
  flightId?: string
  flightPhase?: VideoKeyframeFlightPhase
  lat: number
  lng: number
  location: string
  description: string
  pointType?: VideoKeyframePointType
}

export interface TravelVideo {
  id: string
  title: string
  creator: string
  creatorChannelUrl: string
  youtubeId: string
  thumbnail: string
  durationSeconds: number
  views: number
  mapViews: number
  likes: number
  status: "draft" | "published"
  createdAt: string
  description: string
  locations: string[]
  keyframes: VideoKeyframe[]
  routeShapes?: CreatorRouteShapes
  tags?: string[]
  viewerCanEdit?: boolean
  isCatalog?: boolean
}

export const creatorProfile = {
  name: "",
  channelUrl: "",
  description: "",
}

export const travelVideos: TravelVideo[] = []

export function getTravelVideoById(id: string) {
  return travelVideos.find((video) => video.id === id)
}

export function getCreatorVideos() {
  return [] as TravelVideo[]
}

export function getPublishedTravelVideos() {
  return [] as TravelVideo[]
}

export function formatDuration(totalSeconds: number) {
  const normalizedSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(normalizedSeconds / 3600)
  const minutes = Math.floor((normalizedSeconds % 3600) / 60)
  const seconds = normalizedSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

export function formatCompactNumber(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(".0", "")}M`
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(".0", "")}K`
  }

  return value.toString()
}

export function getCreatorStats() {
  return {
    totalVideos: 0,
    totalViews: 0,
    totalMapViews: 0,
    totalLikes: 0,
    avgEngagement: 0,
  }
}
