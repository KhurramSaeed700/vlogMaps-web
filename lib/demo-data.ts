import { getYouTubeThumbnailUrl } from "@/lib/youtube"
import type { CreatorRouteShapes } from "@/lib/creator-route-shapes"

export type VideoKeyframePointType = "point" | "stop"

export interface VideoKeyframe {
  time: number
  stopEndTime?: number
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
}

const featuredSharanRouteKeyframes: VideoKeyframe[] = [
  {
    time: 80,
    lat: 33.178169964726386,
    lng: 73.36882741101908,
    location: "Sharan Route Point 1",
    description: "1:20 - 33.178169964726386, 73.36882741101908",
  },
  {
    time: 136,
    lat: 34.34635382671203,
    lng: 73.4670507805824,
    location: "Sharan Route Point 2",
    description: "2:16 - 34.34635382671203, 73.4670507805824",
  },
  {
    time: 256,
    lat: 34.6604906720191,
    lng: 73.45861941158378,
    location: "Sharan Route Point 3",
    description: "4:16 - 34.6604906720191, 73.45861941158378",
  },
  {
    time: 469,
    lat: 34.678300371296125,
    lng: 73.43547338066946,
    location: "Sharan Route Point 4",
    description: "7:49 - 34.678300371296125, 73.43547338066946",
  },
  {
    time: 782,
    lat: 34.685225121115664,
    lng: 73.43772451346088,
    location: "Sharan Route Point 5",
    description: "13:02 - 34.685225121115664, 73.43772451346088",
  },
  {
    time: 826,
    lat: 34.68613052367818,
    lng: 73.43821731981907,
    location: "Sharan Route Point 6",
    description: "13:46 - 34.68613052367818, 73.43821731981907",
  },
  {
    time: 1131,
    lat: 34.693297681869154,
    lng: 73.4298275124814,
    location: "Sharan Route Point 7",
    description: "18:51 - 34.693297681869154, 73.4298275124814",
  },
  {
    time: 1296,
    lat: 34.68808002994681,
    lng: 73.43236227268385,
    location: "Sharan Route Point 8",
    description: "21:36 - 34.68808002994681, 73.43236227268385",
  },
  {
    time: 1345,
    lat: 34.68323906090747,
    lng: 73.43627480750276,
    location: "Sharan Route Point 9",
    description: "22:25 - 34.68323906090747, 73.43627480750276",
  },
  {
    time: 1510,
    lat: 34.90615893919412,
    lng: 73.6502731976373,
    location: "Sharan Route Point 10",
    description: "25:10 - 34.90615893919412, 73.6502731976373",
  },
  {
    time: 1580,
    lat: 34.90565661365694,
    lng: 73.68297990055854,
    location: "Sharan Route Point 11",
    description: "26:20 - 34.90565661365694, 73.68297990055854",
  },
  {
    time: 1707,
    lat: 34.89998665937005,
    lng: 73.69025985998988,
    location: "Sharan Route Point 12",
    description: "28:27 - 34.89998665937005, 73.69025985998988",
  },
  {
    time: 1953,
    lat: 34.88462418762077,
    lng: 73.69453207059298,
    location: "Sharan Route Point 13",
    description: "32:33 - 34.88462418762077, 73.69453207059298",
  },
  {
    time: 2062,
    lat: 34.87724143330988,
    lng: 73.69004140074593,
    location: "Sharan Route Point 14",
    description: "34:22 - 34.87724143330988, 73.69004140074593",
  },
  {
    time: 2185,
    lat: 34.877880092166095,
    lng: 73.6901998072388,
    location: "Sharan Route Point 15",
    description: "36:25 - 34.877880092166095, 73.6901998072388",
  },
  {
    time: 2203,
    lat: 34.880401350581664,
    lng: 73.69234330912755,
    location: "Sharan Route Point 16",
    description: "36:43 - 34.880401350581664, 73.69234330912755",
  },
  {
    time: 2230,
    lat: 34.8956511524289,
    lng: 73.69328196485915,
    location: "Sharan Route Point 17",
    description: "37:10 - 34.8956511524289, 73.69328196485915",
  },
  {
    time: 2265,
    lat: 34.901700033798285,
    lng: 73.68798949648908,
    location: "Sharan Route Point 18",
    description: "37:45 - 34.901700033798285, 73.68798949648908",
  },
  {
    time: 2279,
    lat: 34.91655436420631,
    lng: 73.66031306930569,
    location: "Sharan Route Point 19",
    description: "37:59 - 34.91655436420631, 73.66031306930569",
  },
  {
    time: 2304,
    lat: 34.91859049746691,
    lng: 73.6603583886536,
    location: "Sharan Route Point 20",
    description: "38:24 - 34.91859049746691, 73.6603583886536",
  },
  {
    time: 2355,
    lat: 34.93287492239166,
    lng: 73.75126945736415,
    location: "Sharan Route Point 21",
    description: "39:15 - 34.93287492239166, 73.75126945736415",
  },
]

export const creatorProfile = {
  name: "AdventureSeeker",
  channelUrl: "https://youtube.com/@adventureseeker",
  description: "Exploring the world one adventure at a time with route-aware travel storytelling.",
}

export const travelVideos: TravelVideo[] = [
  {
    id: "featured-wykkpsdveso",
    title: "Sharan Travel Trip",
    creator: creatorProfile.name,
    creatorChannelUrl: creatorProfile.channelUrl,
    youtubeId: "WYkkpsDVeso",
    thumbnail: getYouTubeThumbnailUrl("WYkkpsDVeso"),
    durationSeconds: 2355,
    views: 0,
    mapViews: 0,
    likes: 0,
    status: "published",
    createdAt: "2026-03-27",
    description: "Sharan travel trip route built from the provided timestamps and coordinates for the uploaded video.",
    locations: featuredSharanRouteKeyframes.map((keyframe) => keyframe.location),
    tags: ["demo", "route"],
    keyframes: featuredSharanRouteKeyframes,
  },
]

export function getTravelVideoById(id: string) {
  return travelVideos.find((video) => video.id === id)
}

export function getCreatorVideos() {
  return travelVideos.filter((video) => video.creator === creatorProfile.name)
}

export function getPublishedTravelVideos() {
  return travelVideos.filter((video) => video.status === "published")
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
  const creatorVideos = getCreatorVideos()
  const totalViews = creatorVideos.reduce((sum, video) => sum + video.views, 0)
  const totalMapViews = creatorVideos.reduce((sum, video) => sum + video.mapViews, 0)
  const totalLikes = creatorVideos.reduce((sum, video) => sum + video.likes, 0)

  return {
    totalVideos: creatorVideos.length,
    totalViews,
    totalMapViews,
    totalLikes,
    avgEngagement: totalViews === 0 ? 0 : Math.round((totalLikes / totalViews) * 1000) / 10,
  }
}
