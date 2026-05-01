import type { TravelVideo, VideoKeyframe } from "@/lib/demo-data"
import { creatorProfile, getCreatorVideos, getPublishedTravelVideos, getTravelVideoById } from "@/lib/demo-data"
import { extractYouTubeId, getYouTubeThumbnailUrl, type ResolvedYouTubeMetadata } from "@/lib/youtube"

const creatorVideosStorageKey = "travelmap:creator-videos"
const instantVideosStorageKey = "travelmap:instant-videos"

const instantRouteTemplates = [
  {
    id: "road-trips",
    tags: ["road-trips", "cities", "usa"],
    locations: [
      { lat: 37.7749, lng: -122.4194, location: "San Francisco", description: "Opening with a coastal city launch." },
      { lat: 36.1699, lng: -115.1398, location: "Las Vegas", description: "A bright desert stop in the middle stretch." },
      { lat: 34.0489, lng: -111.0937, location: "Arizona Desert", description: "Long-road scenery and open sky." },
      { lat: 35.1983, lng: -111.6513, location: "Flagstaff", description: "Higher altitude and cooler air." },
      { lat: 34.0522, lng: -118.2437, location: "Los Angeles", description: "Finishing near the California coast." },
    ],
  },
  {
    id: "beaches",
    tags: ["beaches", "islands", "tropical"],
    locations: [
      { lat: 13.7563, lng: 100.5018, location: "Bangkok", description: "Starting in a busy tropical capital." },
      { lat: 7.9519, lng: 98.3381, location: "Phang Nga Bay", description: "Limestone cliffs and longboat views." },
      { lat: 8.0863, lng: 98.9063, location: "Krabi", description: "The route shifts toward turquoise water." },
      { lat: 7.8804, lng: 98.3923, location: "Phuket", description: "Beach clubs, boats, and sunset color." },
      { lat: 8.005, lng: 98.8383, location: "Railay Beach", description: "A final drift into island calm." },
    ],
  },
  {
    id: "mountains",
    tags: ["mountains", "scenic", "rail"],
    locations: [
      { lat: 46.948, lng: 7.4474, location: "Bern", description: "The route starts with calm old-town energy." },
      { lat: 46.6242, lng: 8.0414, location: "Lake Brienz", description: "Glacial water and green slopes take over." },
      { lat: 46.6863, lng: 7.8632, location: "Interlaken", description: "A mountain gateway between two lakes." },
      { lat: 46.0207, lng: 7.7491, location: "Zermatt", description: "Steeper climbs and alpine air." },
      { lat: 45.9237, lng: 6.8694, location: "Chamonix", description: "A dramatic summit-side finale." },
    ],
  },
  {
    id: "food",
    tags: ["food", "cities", "culture"],
    locations: [
      { lat: 35.6762, lng: 139.6503, location: "Tokyo", description: "Opening with late-night city energy." },
      { lat: 35.0116, lng: 135.7681, location: "Kyoto", description: "The pace slows for temple streets and hidden kitchens." },
      { lat: 34.6937, lng: 135.5023, location: "Osaka", description: "Street food becomes the center of the route." },
      { lat: 35.1815, lng: 136.9066, location: "Nagoya", description: "A fast detour for regional flavor." },
      { lat: 43.0618, lng: 141.3545, location: "Sapporo", description: "Ending with a cooler, northern food scene." },
    ],
  },
  {
    id: "desert",
    tags: ["desert", "culture", "adventure"],
    locations: [
      { lat: 31.6295, lng: -7.9811, location: "Marrakesh", description: "The first stop opens in a dense, colorful medina." },
      { lat: 31.047, lng: -7.132, location: "Ait Benhaddou", description: "The route heads toward cinematic kasbah terrain." },
      { lat: 31.5937, lng: -5.9306, location: "Dades Valley", description: "Curving roads cut through canyon country." },
      { lat: 31.0994, lng: -4.0127, location: "Merzouga", description: "Sand dunes and sunset movement take over." },
      { lat: 32.3373, lng: -6.3498, location: "Ouarzazate", description: "A final desert-city landing closes the journey." },
    ],
  },
]

function createVideoId(prefix: string, youtubeId: string) {
  return `${prefix}-${youtubeId}`
}

function hashValue(value: string) {
  return Array.from(value).reduce((total, char) => total + char.charCodeAt(0), 0)
}

function readStorageItem(key: string) {
  if (typeof window === "undefined") {
    return null
  }

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorageItem(key: string, value: string) {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Local storage can be unavailable in private or restricted browser contexts.
  }
}

function buildInstantKeyframes(youtubeId: string, preferredTag?: string) {
  const preferredTemplate = preferredTag
    ? instantRouteTemplates.find((template) => template.tags.includes(preferredTag))
    : null
  const template = preferredTemplate ?? instantRouteTemplates[hashValue(youtubeId) % instantRouteTemplates.length]
  const timestamps = [0, 35, 80, 130, 185]

  const keyframes: VideoKeyframe[] = template.locations.map((stop, index) => ({
    ...stop,
    time: timestamps[index] ?? index * 45,
  }))

  return {
    tags: template.tags,
    keyframes,
  }
}

export function isLocalCreatorVideoId(id: string) {
  return id.startsWith("custom-")
}

export function isInstantWatchVideoId(id: string) {
  return id.startsWith("instant-")
}

export function loadLocalCreatorVideos() {
  const raw = readStorageItem(creatorVideosStorageKey)
  if (!raw) {
    return [] as TravelVideo[]
  }

  try {
    const parsed = JSON.parse(raw) as TravelVideo[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveLocalCreatorVideos(videos: TravelVideo[]) {
  writeStorageItem(creatorVideosStorageKey, JSON.stringify(videos))
}

export function loadInstantWatchVideos() {
  const raw = readStorageItem(instantVideosStorageKey)
  if (!raw) {
    return [] as TravelVideo[]
  }

  try {
    const parsed = JSON.parse(raw) as TravelVideo[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveInstantWatchVideos(videos: TravelVideo[]) {
  writeStorageItem(instantVideosStorageKey, JSON.stringify(videos))
}

export function getAllCreatorVideosClient() {
  const localVideos = loadLocalCreatorVideos()
  const catalogCreatorVideos = getCreatorVideos().filter(
    (catalogVideo) =>
      !localVideos.some(
        (localVideo) => localVideo.id === catalogVideo.id || localVideo.youtubeId === catalogVideo.youtubeId,
      ),
  )

  return [...localVideos, ...catalogCreatorVideos]
}

export function getPublishedTravelVideosClient() {
  return [...getPublishedTravelVideos(), ...loadLocalCreatorVideos().filter((video) => video.status === "published"), ...loadInstantWatchVideos()]
}

export function getTravelVideoByIdClient(id: string) {
  const catalogVideo = getTravelVideoById(id)
  if (catalogVideo) {
    return catalogVideo
  }

  return [...loadLocalCreatorVideos(), ...loadInstantWatchVideos()].find((video) => video.id === id)
}

async function fetchMetadataForCreatorVideo(youtubeId: string) {
  let response: Response
  try {
    response = await fetch(`/api/youtube/video/${youtubeId}`, {
      cache: "no-store",
    })
  } catch {
    return null
  }

  if (!response.ok) {
    return null
  }

  return (await response.json()) as ResolvedYouTubeMetadata
}

export async function createLocalCreatorVideo({
  youtubeUrl,
}: {
  youtubeUrl: string
}) {
  const youtubeId = extractYouTubeId(youtubeUrl)

  if (!youtubeId) {
    throw new Error("Please paste a valid YouTube URL.")
  }

  const existingVideo = loadLocalCreatorVideos().find((video) => video.youtubeId === youtubeId)
  if (existingVideo) {
    return existingVideo
  }

  const existingCatalogVideo = getCreatorVideos().find((video) => video.youtubeId === youtubeId)
  if (existingCatalogVideo) {
    return existingCatalogVideo
  }

  const metadata = await fetchMetadataForCreatorVideo(youtubeId)
  const now = new Date().toISOString()
  const video: TravelVideo = {
    id: `custom-${youtubeId}-${Date.now()}`,
    title: metadata?.title || `New travel video (${youtubeId})`,
    creator: metadata?.creator || creatorProfile.name,
    creatorChannelUrl: metadata?.creatorChannelUrl || creatorProfile.channelUrl,
    youtubeId,
    thumbnail: metadata?.thumbnail || getYouTubeThumbnailUrl(youtubeId),
    durationSeconds: metadata?.durationSeconds ?? 0,
    views: metadata?.views ?? 0,
    mapViews: 0,
    likes: metadata?.likes ?? 0,
    status: "draft",
    createdAt: now,
    description:
      metadata?.description?.trim() || "Creator-added travel video. Add timestamped route points to bring the map to life.",
    locations: [],
    keyframes: [],
    tags: ["creator"],
  }

  const nextVideos = [video, ...loadLocalCreatorVideos()]
  saveLocalCreatorVideos(nextVideos)
  return video
}

export function createInstantWatchVideo({
  youtubeUrl,
  preferredTag,
}: {
  youtubeUrl: string
  preferredTag?: string
}) {
  const youtubeId = extractYouTubeId(youtubeUrl)

  if (!youtubeId) {
    throw new Error("Paste a valid YouTube URL to launch the instant watch view.")
  }

  const creatorVideo = loadLocalCreatorVideos().find((video) => video.youtubeId === youtubeId)
  if (creatorVideo) {
    return creatorVideo
  }

  const existingVideo = loadInstantWatchVideos().find((video) => video.youtubeId === youtubeId)
  if (existingVideo) {
    return existingVideo
  }

  const now = new Date().toISOString()
  const { tags, keyframes } = buildInstantKeyframes(youtubeId, preferredTag)
  const video: TravelVideo = {
    id: createVideoId("instant", youtubeId),
    title: "Your Pasted YouTube Video",
    creator: "You",
    creatorChannelUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
    youtubeId,
    thumbnail: getYouTubeThumbnailUrl(youtubeId),
    durationSeconds: 220,
    views: 0,
    mapViews: 0,
    likes: 0,
    status: "published",
    createdAt: now,
    description: "An instant map route was generated so you can jump straight into the split-screen watch experience.",
    locations: keyframes.map((point) => point.location),
    keyframes,
    tags,
  }

  const nextVideos = [video, ...loadInstantWatchVideos()]
  saveInstantWatchVideos(nextVideos)
  return video
}

export function updateLocalCreatorVideo(videoId: string, updates: Partial<TravelVideo>) {
  if (!isLocalCreatorVideoId(videoId)) {
    return null
  }

  const videos = loadLocalCreatorVideos()
  const nextVideos = videos.map((video) => {
    if (video.id !== videoId) {
      return video
    }

    return {
      ...video,
      ...updates,
    }
  })

  saveLocalCreatorVideos(nextVideos)
  return nextVideos.find((video) => video.id === videoId) ?? null
}

export function deleteLocalCreatorVideo(videoId: string) {
  if (!isLocalCreatorVideoId(videoId)) {
    return false
  }

  const videos = loadLocalCreatorVideos()
  const nextVideos = videos.filter((video) => video.id !== videoId)

  if (nextVideos.length === videos.length) {
    return false
  }

  saveLocalCreatorVideos(nextVideos)
  return true
}

export function syncVideoRouteMetadata(videoId: string, keyframes: VideoKeyframe[]) {
  if (!isLocalCreatorVideoId(videoId)) {
    return
  }

  updateLocalCreatorVideo(videoId, {
    keyframes,
    locations: keyframes.map((point) => point.location),
  })
}
