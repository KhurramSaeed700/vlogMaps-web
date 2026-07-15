import "server-only"

import type { Prisma } from "@prisma/client"
import { getPrisma } from "@/lib/prisma"

export type PublicRoutePoint = {
  id: string
  timestampSeconds: number
  latitude: number
  longitude: number
  label?: string
  description?: string
  pointType?: "point" | "stop" | "flight"
  stopEndTime?: number
}

export type PublicRouteShapePoint = {
  latitude: number
  longitude: number
}

export type PublicRouteShapes = {
  trip: PublicRouteShapePoint[]
  timestampLegs: Record<string, PublicRouteShapePoint[]>
}

export type PublicCreator = {
  id: string
  name: string
  handle: string
}

export type PublicVideoSummary = {
  id: string
  title: string
  description?: string
  youtubeVideoId: string
  thumbnailUrl: string
  creator: PublicCreator
  durationSeconds: number
  startLabel?: string
  endLabel?: string
  tags: string[]
  routePointCount: number
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const publicVideoSelect = {
  id: true,
  appId: true,
  creatorId: true,
  title: true,
  youtubeId: true,
  description: true,
  duration: true,
  thumbnailUrl: true,
  creatorName: true,
  creatorChannelUrl: true,
  locations: true,
  tags: true,
  createdAt: true,
  _count: {
    select: {
      keyframes: true,
    },
  },
} satisfies Prisma.VideoSelect

type PublicVideoRow = Prisma.VideoGetPayload<{ select: typeof publicVideoSelect }>

export class MobileViewerUnavailableError extends Error {
  constructor() {
    super("The published video database is not configured.")
    this.name = "MobileViewerUnavailableError"
  }
}

function requirePrisma() {
  const prisma = getPrisma()
  if (!prisma) {
    throw new MobileViewerUnavailableError()
  }

  return prisma
}

function asStringArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function asRoutePointType(value: unknown): "point" | "stop" | "flight" {
  if (value === "stop" || value === "flight") {
    return value
  }

  return "point"
}

function asFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function asPublicShapePoint(value: unknown): PublicRouteShapePoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const point = value as Record<string, unknown>
  const latitude = asFiniteNumber(point.lat ?? point.latitude)
  const longitude = asFiniteNumber(point.lng ?? point.longitude)
  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null
  }

  return {
    latitude,
    longitude,
  }
}

function asPublicShapePoints(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((point) => {
        const publicPoint = asPublicShapePoint(point)
        return publicPoint ? [publicPoint] : []
      })
    : []
}

function asPublicRouteShapes(value: Prisma.JsonValue | null | undefined): PublicRouteShapes {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { trip: [], timestampLegs: {} }
  }

  const routeShapes = value as Record<string, unknown>
  const rawTimestampLegs =
    routeShapes.timestampLegs && typeof routeShapes.timestampLegs === "object" && !Array.isArray(routeShapes.timestampLegs)
      ? (routeShapes.timestampLegs as Record<string, unknown>)
      : {}

  return {
    trip: asPublicShapePoints(routeShapes.trip),
    timestampLegs: Object.fromEntries(
      Object.entries(rawTimestampLegs).flatMap(([key, points]) => {
        const publicPoints = asPublicShapePoints(points)
        return publicPoints.length > 0 ? [[key, publicPoints]] : []
      }),
    ),
  }
}

function asPublicEditorRoutePoint(value: unknown): PublicRoutePoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const point = value as Record<string, unknown>
  const timestampSeconds = asFiniteNumber(point.time ?? point.timestampSeconds)
  const latitude = asFiniteNumber(point.lat ?? point.latitude)
  const longitude = asFiniteNumber(point.lng ?? point.longitude)
  if (
    timestampSeconds === null ||
    latitude === null ||
    longitude === null ||
    timestampSeconds < 0 ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null
  }

  const pointType = asRoutePointType(point.pointType)
  const stopEndTime = asFiniteNumber(point.stopEndTime)
  const id =
    typeof point.id === "string" && point.id.trim()
      ? point.id
      : `route-${Math.round(timestampSeconds)}-${latitude.toFixed(5)}-${longitude.toFixed(5)}`

  return {
    id,
    timestampSeconds: Math.round(timestampSeconds),
    latitude,
    longitude,
    label: typeof point.location === "string" && point.location.trim() ? point.location : undefined,
    description: typeof point.description === "string" && point.description.trim() ? point.description : undefined,
    pointType,
    stopEndTime:
      pointType === "stop" && stopEndTime !== null && stopEndTime > timestampSeconds
        ? Math.round(stopEndTime)
        : undefined,
  }
}

function asPublicEditorRoutePoints(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value)
    ? value
        .flatMap((point) => {
          const publicPoint = asPublicEditorRoutePoint(point)
          return publicPoint ? [publicPoint] : []
        })
        .sort((left, right) => left.timestampSeconds - right.timestampSeconds)
    : []
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "creator"
}

function creatorHandle(channelUrl: string | null, creatorName: string) {
  if (channelUrl) {
    try {
      const segment = new URL(channelUrl).pathname
        .split("/")
        .filter(Boolean)
        .find((part) => part.startsWith("@"))
      if (segment) {
        return decodeURIComponent(segment)
      }
    } catch {
      // Fall back to a stable public handle derived from the display name.
    }
  }

  return `@${slugify(creatorName)}`
}

function toPublicCreator(video: Pick<PublicVideoRow, "creatorId" | "creatorName" | "creatorChannelUrl">) {
  const name = video.creatorName?.trim() || "Creator"
  return {
    id: video.creatorId || `creator-${slugify(name)}`,
    name,
    handle: creatorHandle(video.creatorChannelUrl, name),
  }
}

function toPublicVideoSummary(video: PublicVideoRow): PublicVideoSummary {
  const locations = asStringArray(video.locations)

  return {
    id: video.id,
    title: video.title,
    description: video.description || undefined,
    youtubeVideoId: video.youtubeId,
    thumbnailUrl: video.thumbnailUrl || `https://i.ytimg.com/vi/${video.youtubeId}/hqdefault.jpg`,
    creator: toPublicCreator(video),
    durationSeconds: Math.max(0, video.duration || 0),
    startLabel: locations[0],
    endLabel: locations.at(-1),
    tags: asStringArray(video.tags),
    routePointCount: video._count.keyframes,
  }
}

function publicLookup(videoId: string) {
  return {
    OR: [{ appId: videoId }, ...(uuidPattern.test(videoId) ? [{ id: videoId }] : [])],
  }
}

export async function listPublishedMobileVideos(query?: string) {
  const prisma = requirePrisma()
  const normalizedQuery = query?.trim()
  const videos = await prisma.video.findMany({
    where: {
      status: "published",
      appId: { not: null },
    },
    select: publicVideoSelect,
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  const publicVideos = videos.map(toPublicVideoSummary)
  if (!normalizedQuery) {
    return publicVideos
  }

  const needle = normalizedQuery.toLowerCase()
  return publicVideos.filter((video) =>
    [
      video.title,
      video.description,
      video.youtubeVideoId,
      video.creator.name,
      video.creator.handle,
      video.startLabel,
      video.endLabel,
      ...video.tags,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle),
  )
}

export async function getPublishedMobileVideo(videoId: string) {
  const prisma = requirePrisma()
  const video = await prisma.video.findFirst({
    where: {
      AND: [publicLookup(videoId), { status: "published", appId: { not: null } }],
    },
    select: publicVideoSelect,
  })

  return video ? toPublicVideoSummary(video) : null
}

export async function getPublishedMobileRoute(
  videoId: string,
): Promise<{ route: PublicRoutePoint[]; routeShapes: PublicRouteShapes } | null> {
  const prisma = requirePrisma()
  const video = await prisma.video.findFirst({
    where: {
      AND: [publicLookup(videoId), { status: "published", appId: { not: null } }],
    },
    select: {
      keyframes: {
        select: {
          id: true,
          timestampSeconds: true,
          latitude: true,
          longitude: true,
          locationName: true,
          description: true,
          pointType: true,
          stopEndTime: true,
        },
        orderBy: { timestampSeconds: "asc" },
      },
      editorState: {
        select: {
          points: true,
          routeShapes: true,
        },
      },
    },
  })

  if (!video) {
    return null
  }

  const editorRoute = asPublicEditorRoutePoints(video.editorState?.points)
  const route =
    editorRoute.length > 0
      ? editorRoute
      : video.keyframes.map((point) => {
          const pointType = asRoutePointType(point.pointType)

          return {
            id: point.id,
            timestampSeconds: point.timestampSeconds,
            latitude: Number(point.latitude),
            longitude: Number(point.longitude),
            label: point.locationName || undefined,
            description: point.description || undefined,
            pointType,
            stopEndTime:
              pointType === "stop" && typeof point.stopEndTime === "number" && point.stopEndTime > point.timestampSeconds
                ? point.stopEndTime
                : undefined,
          }
        })

  return {
    route,
    routeShapes: asPublicRouteShapes(video.editorState?.routeShapes),
  }
}

export async function getPublishedMobileCreator(creatorId: string) {
  const videos = await listPublishedMobileVideos()
  const creatorVideos = videos.filter((video) => video.creator.id === creatorId)
  if (creatorVideos.length === 0) {
    return null
  }

  return {
    creator: creatorVideos[0].creator,
    videos: creatorVideos,
  }
}
