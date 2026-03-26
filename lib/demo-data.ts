import { getYouTubeThumbnailUrl } from "@/lib/youtube"

export interface VideoKeyframe {
  time: number
  lat: number
  lng: number
  location: string
  description: string
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
  tags?: string[]
}

export const travelVideos: TravelVideo[] = [
  {
    id: "1",
    title: "Epic Road Trip: New York to Los Angeles",
    creator: "AdventureSeeker",
    creatorChannelUrl: "https://youtube.com/@adventureseeker",
    youtubeId: "dQw4w9WgXcQ",
    thumbnail: getYouTubeThumbnailUrl("dQw4w9WgXcQ"),
    durationSeconds: 2732,
    views: 125000,
    mapViews: 89000,
    likes: 3200,
    status: "published",
    createdAt: "2024-01-15",
    description: "Join me on an incredible cross-country road trip adventure spanning 2,800 miles across America!",
    locations: ["New York", "Chicago", "Denver", "Las Vegas", "Los Angeles"],
    tags: ["road-trips", "cities", "usa"],
    keyframes: [
      { time: 0, lat: 40.7128, lng: -74.006, location: "New York City", description: "Starting our journey in the Big Apple!" },
      { time: 300, lat: 40.7589, lng: -73.9851, location: "Times Square", description: "Last stop in NYC before hitting the road." },
      { time: 600, lat: 41.8781, lng: -87.6298, location: "Chicago", description: "Windy City pit stop for deep dish pizza." },
      { time: 1200, lat: 39.7392, lng: -104.9903, location: "Denver", description: "Mile High City with stunning mountain views." },
      { time: 1800, lat: 36.1699, lng: -115.1398, location: "Las Vegas", description: "Bright lights and desert landscapes." },
      { time: 2400, lat: 34.0522, lng: -118.2437, location: "Los Angeles", description: "Finally made it to the City of Angels!" },
    ],
  },
  {
    id: "2",
    title: "Backpacking Through Europe: 30 Days, 15 Countries",
    creator: "EuroExplorer",
    creatorChannelUrl: "https://youtube.com/@euroexplorer",
    youtubeId: "JGwWNGJdvx8",
    thumbnail: getYouTubeThumbnailUrl("JGwWNGJdvx8"),
    durationSeconds: 4365,
    views: 89000,
    mapViews: 67000,
    likes: 2800,
    status: "published",
    createdAt: "2024-01-20",
    description: "The ultimate European backpacking adventure with interactive maps and route-aware storytelling.",
    locations: ["London", "Paris", "Berlin", "Prague", "Vienna"],
    tags: ["cities", "culture", "backpacking"],
    keyframes: [
      { time: 0, lat: 51.5074, lng: -0.1278, location: "London", description: "Starting the European adventure in London." },
      { time: 600, lat: 48.8566, lng: 2.3522, location: "Paris", description: "City of Light and amazing croissants." },
      { time: 1200, lat: 52.52, lng: 13.405, location: "Berlin", description: "Rich history and vibrant culture." },
      { time: 1800, lat: 50.0755, lng: 14.4378, location: "Prague", description: "Fairy tale architecture and great beer." },
      { time: 2400, lat: 48.2082, lng: 16.3738, location: "Vienna", description: "Imperial palaces and classical music." },
    ],
  },
  {
    id: "3",
    title: "Island Hopping in Southeast Asia",
    creator: "TropicalNomad",
    creatorChannelUrl: "https://youtube.com/@tropicalnomad",
    youtubeId: "kXYiU_JCYtU",
    thumbnail: getYouTubeThumbnailUrl("kXYiU_JCYtU"),
    durationSeconds: 2301,
    views: 67000,
    mapViews: 45000,
    likes: 1900,
    status: "published",
    createdAt: "2024-01-24",
    description: "Discover paradise as we hop between tropical islands, cities, and coastlines across Southeast Asia.",
    locations: ["Bangkok", "Phuket", "Bali", "Manila", "Boracay"],
    tags: ["beaches", "islands", "tropical"],
    keyframes: [
      { time: 0, lat: 13.7563, lng: 100.5018, location: "Bangkok", description: "Starting in the bustling capital of Thailand." },
      { time: 400, lat: 7.8804, lng: 98.3923, location: "Phuket", description: "Beautiful beaches and crystal clear waters." },
      { time: 800, lat: -8.3405, lng: 115.092, location: "Bali", description: "Island paradise with stunning temples." },
      { time: 1200, lat: 14.5995, lng: 120.9842, location: "Manila", description: "Gateway to the Philippines." },
      { time: 1600, lat: 11.9804, lng: 121.9189, location: "Boracay", description: "White sand beaches and turquoise waters." },
    ],
  },
  {
    id: "4",
    title: "Alpine Train Diaries Across Switzerland",
    creator: "PeakFrames",
    creatorChannelUrl: "https://youtube.com/@peakframes",
    youtubeId: "9bZkp7q19f0",
    thumbnail: getYouTubeThumbnailUrl("9bZkp7q19f0"),
    durationSeconds: 1984,
    views: 54000,
    mapViews: 38200,
    likes: 1430,
    status: "published",
    createdAt: "2024-02-02",
    description: "A slow scenic glide across lakes, mountain villages, and snowy passes on one of Europe's dream routes.",
    locations: ["Zurich", "Lucerne", "Interlaken", "Zermatt", "St. Moritz"],
    tags: ["mountains", "scenic", "rail"],
    keyframes: [
      { time: 0, lat: 47.3769, lng: 8.5417, location: "Zurich", description: "Starting the mountain rail escape." },
      { time: 280, lat: 47.0502, lng: 8.3093, location: "Lucerne", description: "Lake views and sharp morning light." },
      { time: 640, lat: 46.6863, lng: 7.8632, location: "Interlaken", description: "Switching tracks beneath alpine peaks." },
      { time: 980, lat: 46.0207, lng: 7.7491, location: "Zermatt", description: "Matterhorn country and fresh snow." },
      { time: 1380, lat: 46.497, lng: 9.838, location: "St. Moritz", description: "A cinematic finish in the Engadin valley." },
    ],
  },
  {
    id: "5",
    title: "Tokyo to Osaka Food Crawl",
    creator: "StreetBiteStories",
    creatorChannelUrl: "https://youtube.com/@streetbitestories",
    youtubeId: "fJ9rUzIMcZQ",
    thumbnail: getYouTubeThumbnailUrl("fJ9rUzIMcZQ"),
    durationSeconds: 2575,
    views: 72000,
    mapViews: 56100,
    likes: 2480,
    status: "published",
    createdAt: "2024-02-11",
    description: "Fast trains, neon lanes, and unforgettable street food from Tokyo alleys to Osaka's late-night grills.",
    locations: ["Tokyo", "Nagoya", "Kyoto", "Nara", "Osaka"],
    tags: ["cities", "food", "culture"],
    keyframes: [
      { time: 0, lat: 35.6762, lng: 139.6503, location: "Tokyo", description: "Neon-lit opening bites in Tokyo." },
      { time: 420, lat: 35.1815, lng: 136.9066, location: "Nagoya", description: "A quick stop for local specialties." },
      { time: 900, lat: 35.0116, lng: 135.7681, location: "Kyoto", description: "Temple walks between snack breaks." },
      { time: 1260, lat: 34.6851, lng: 135.8048, location: "Nara", description: "Slow afternoon detour before dinner." },
      { time: 1680, lat: 34.6937, lng: 135.5023, location: "Osaka", description: "Ending in the nation's street food capital." },
    ],
  },
  {
    id: "6",
    title: "Desert Nights in Morocco",
    creator: "NomadCanvas",
    creatorChannelUrl: "https://youtube.com/@nomadcanvas",
    youtubeId: "RgKAFK5djSk",
    thumbnail: getYouTubeThumbnailUrl("RgKAFK5djSk"),
    durationSeconds: 2148,
    views: 61000,
    mapViews: 47250,
    likes: 1880,
    status: "published",
    createdAt: "2024-02-19",
    description: "From busy medinas to Sahara camps, this route follows a warm, color-saturated journey through Morocco.",
    locations: ["Marrakesh", "Ait Benhaddou", "Dades Valley", "Merzouga", "Fez"],
    tags: ["desert", "culture", "adventure"],
    keyframes: [
      { time: 0, lat: 31.6295, lng: -7.9811, location: "Marrakesh", description: "Opening in the rhythm of the red city." },
      { time: 360, lat: 31.047, lng: -7.132, location: "Ait Benhaddou", description: "Ancient kasbahs and dusty light." },
      { time: 820, lat: 31.5937, lng: -5.9306, location: "Dades Valley", description: "Winding roads and canyon walls." },
      { time: 1280, lat: 31.0994, lng: -4.0127, location: "Merzouga", description: "Sunset camel trails into the Sahara." },
      { time: 1760, lat: 34.0181, lng: -5.0078, location: "Fez", description: "A textured finish in the labyrinth of Fez." },
    ],
  },
]

export const creatorProfile = {
  name: "AdventureSeeker",
  channelUrl: "https://youtube.com/@adventureseeker",
  description: "Exploring the world one adventure at a time with route-aware travel storytelling.",
}

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
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

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
