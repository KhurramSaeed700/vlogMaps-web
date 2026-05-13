import "server-only"

import type { Prisma, Video, VideoEditorState, VideoKeyframe } from "@prisma/client"
import type { CreatorVideoState } from "@/lib/creator-video-state"
import { getPrisma } from "@/lib/prisma"
import { isDatabaseConfigured } from "@/lib/database"
import type { TravelVideo, VideoKeyframe as TravelVideoKeyframe } from "@/lib/demo-data"

type VideoWithRoute = Video & {
  editorState: VideoEditorState | null
  keyframes: VideoKeyframe[]
}

const catalogOwnerUserId = "catalog"
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string) {
  return uuidPattern.test(value)
}

function asStringArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function asCreatorPoints(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? (value as unknown as CreatorVideoState["points"]) : []
}

function toJsonInput(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function asTripRoute(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as unknown as CreatorVideoState["tripRoute"])
    : { start: null, end: null }
}

function asRouteShapes(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as unknown as CreatorVideoState["routeShapes"])
    : { trip: [], timestampLegs: {} }
}

function keyframeToDbCreate(videoId: string, keyframe: TravelVideoKeyframe): Prisma.VideoKeyframeCreateManyInput {
  return {
    videoId,
    timestampSeconds: Math.max(0, Math.round(keyframe.time)),
    stopEndTime:
      keyframe.pointType === "stop" && typeof keyframe.stopEndTime === "number" && keyframe.stopEndTime > keyframe.time
        ? Math.round(keyframe.stopEndTime)
        : null,
    latitude: keyframe.lat,
    longitude: keyframe.lng,
    locationName: keyframe.location,
    description: keyframe.description,
    pointType: keyframe.pointType === "stop" ? "stop" : "point",
  }
}

function rowKeyframeToTravelKeyframe(keyframe: VideoKeyframe): TravelVideoKeyframe {
  const pointType = keyframe.pointType === "stop" ? "stop" : "point"

  return {
    time: keyframe.timestampSeconds,
    stopEndTime:
      pointType === "stop" && typeof keyframe.stopEndTime === "number" && keyframe.stopEndTime > keyframe.timestampSeconds
        ? keyframe.stopEndTime
        : undefined,
    lat: Number(keyframe.latitude),
    lng: Number(keyframe.longitude),
    location: keyframe.locationName || "Saved location",
    description: keyframe.description || "",
    pointType,
  }
}

function rowToTravelVideo(video: VideoWithRoute): TravelVideo {
  const keyframes =
    video.editorState && asCreatorPoints(video.editorState.points).length > 0
      ? asCreatorPoints(video.editorState.points).map(({ id: _id, ...point }) => point)
      : video.keyframes.map(rowKeyframeToTravelKeyframe)

  return {
    id: video.appId || video.id,
    title: video.title,
    creator: video.creatorName || "Creator",
    creatorChannelUrl: video.creatorChannelUrl || `https://www.youtube.com/watch?v=${video.youtubeId}`,
    youtubeId: video.youtubeId,
    thumbnail: video.thumbnailUrl || "",
    durationSeconds: video.duration || 0,
    views: video.viewCount || 0,
    mapViews: video.mapViewCount || 0,
    likes: video.likeCount || 0,
    status: video.status === "published" ? "published" : "draft",
    createdAt: (video.createdAt ?? new Date()).toISOString(),
    description: video.description || "",
    locations: asStringArray(video.locations).length > 0 ? asStringArray(video.locations) : keyframes.map((point) => point.location),
    keyframes,
    routeShapes: video.editorState ? asRouteShapes(video.editorState.routeShapes) : undefined,
    tags: asStringArray(video.tags),
  }
}

function getVideoLookup(videoId: string) {
  return {
    OR: [{ appId: videoId }, ...(isUuid(videoId) ? [{ id: videoId }] : [])],
  }
}

async function replaceVideoKeyframes(tx: Prisma.TransactionClient, videoId: string, keyframes: TravelVideoKeyframe[]) {
  await tx.videoKeyframe.deleteMany({
    where: { videoId },
  })

  if (keyframes.length === 0) {
    return
  }

  await tx.videoKeyframe.createMany({
    data: keyframes.map((keyframe) => keyframeToDbCreate(videoId, keyframe)),
  })
}

export function isCreatorVideosDbConfigured() {
  return isDatabaseConfigured()
}

export async function saveCreatorVideoToDb({
  video,
  ownerUserId,
  state,
  publish = false,
}: {
  video: TravelVideo
  ownerUserId: string
  state?: CreatorVideoState | null
  publish?: boolean
}) {
  const prisma = getPrisma()
  if (!prisma) {
    return null
  }

  const keyframes = state?.points?.length ? state.points.map(({ id: _id, ...point }) => point) : video.keyframes
  const status = publish ? "published" : video.status

  const savedVideo = await prisma.$transaction(async (tx) => {
    const existingVideo = await tx.video.findFirst({
      where: getVideoLookup(video.id),
    })

    const saved = existingVideo
      ? await tx.video.update({
          where: { id: existingVideo.id },
          data: {
            ownerUserId,
            appId: video.id,
            title: video.title,
            youtubeId: video.youtubeId,
            thumbnailUrl: video.thumbnail,
            duration: Math.max(0, Math.round(video.durationSeconds)),
            viewCount: Math.max(0, Math.round(video.views)),
            mapViewCount: Math.max(0, Math.round(video.mapViews)),
            likeCount: Math.max(0, Math.round(video.likes)),
            status,
            description: video.description,
            creatorName: video.creator,
            creatorChannelUrl: video.creatorChannelUrl,
            locations: keyframes.map((point) => point.location),
            tags: video.tags ?? [],
          },
        })
      : await tx.video.create({
          data: {
            ownerUserId,
            appId: video.id,
            title: video.title,
            youtubeId: video.youtubeId,
            thumbnailUrl: video.thumbnail,
            duration: Math.max(0, Math.round(video.durationSeconds)),
            viewCount: Math.max(0, Math.round(video.views)),
            mapViewCount: Math.max(0, Math.round(video.mapViews)),
            likeCount: Math.max(0, Math.round(video.likes)),
            status,
            description: video.description,
            creatorName: video.creator,
            creatorChannelUrl: video.creatorChannelUrl,
            locations: keyframes.map((point) => point.location),
            tags: video.tags ?? [],
          },
        })

    await replaceVideoKeyframes(tx, saved.id, keyframes)

    if (state) {
      await tx.videoEditorState.upsert({
        where: { videoId: saved.id },
        create: {
          videoId: saved.id,
          ownerUserId,
          points: toJsonInput(state.points),
          tripRoute: toJsonInput(state.tripRoute),
          routeShapes: toJsonInput(state.routeShapes),
        },
        update: {
          ownerUserId,
          points: toJsonInput(state.points),
          tripRoute: toJsonInput(state.tripRoute),
          routeShapes: toJsonInput(state.routeShapes),
          updatedAt: new Date(),
        },
      })
    }

    return tx.video.findUnique({
      where: { id: saved.id },
      include: {
        editorState: true,
        keyframes: {
          orderBy: { timestampSeconds: "asc" },
        },
      },
    })
  })

  return savedVideo ? rowToTravelVideo(savedVideo) : null
}

export async function listCreatorVideosFromDb(ownerUserId: string) {
  const prisma = getPrisma()
  if (!prisma) {
    return []
  }

  const videos = await prisma.video.findMany({
    where: {
      ownerUserId,
      appId: { not: null },
    },
    include: {
      editorState: true,
      keyframes: {
        orderBy: { timestampSeconds: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return videos.map(rowToTravelVideo)
}

export async function listPublishedCreatorVideosFromDb() {
  const prisma = getPrisma()
  if (!prisma) {
    return []
  }

  try {
    const videos = await prisma.video.findMany({
      where: {
        status: "published",
        appId: { not: null },
      },
      include: {
        editorState: true,
        keyframes: {
          orderBy: { timestampSeconds: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return videos.map(rowToTravelVideo)
  } catch {
    return []
  }
}

export async function getCreatorVideoFromDb(videoId: string, requesterUserId?: string | null) {
  const prisma = getPrisma()
  if (!prisma) {
    return null
  }

  try {
    const video = await prisma.video.findFirst({
      where: {
        AND: [
          getVideoLookup(videoId),
          {
            OR: [{ status: "published" }, { ownerUserId: requesterUserId ?? "" }, { ownerUserId: catalogOwnerUserId }],
          },
        ],
      },
      include: {
        editorState: true,
        keyframes: {
          orderBy: { timestampSeconds: "asc" },
        },
      },
    })

    return video ? rowToTravelVideo(video) : null
  } catch {
    return null
  }
}

export async function deleteCreatorVideoFromDb(videoId: string, ownerUserId: string) {
  const prisma = getPrisma()
  if (!prisma) {
    return false
  }

  const video = await prisma.video.findFirst({
    where: {
      AND: [getVideoLookup(videoId), { ownerUserId }],
    },
  })

  if (!video) {
    return false
  }

  await prisma.video.delete({
    where: { id: video.id },
  })

  return true
}

export async function getCreatorVideoStateFromDb(videoId: string, ownerUserId: string) {
  const prisma = getPrisma()
  if (!prisma) {
    return null
  }

  const video = await prisma.video.findFirst({
    where: {
      AND: [getVideoLookup(videoId), { OR: [{ ownerUserId }, { ownerUserId: catalogOwnerUserId }] }],
    },
    include: {
      editorState: true,
    },
  })

  if (!video?.editorState) {
    return null
  }

  return {
    state: {
      points: asCreatorPoints(video.editorState.points),
      tripRoute: asTripRoute(video.editorState.tripRoute),
      routeShapes: asRouteShapes(video.editorState.routeShapes),
    },
    updatedAt: video.editorState.updatedAt.toISOString(),
  }
}

export async function saveCreatorVideoStateForVideoId(videoId: string, ownerUserId: string, state: CreatorVideoState) {
  const prisma = getPrisma()
  if (!prisma) {
    return null
  }

  const video = await prisma.video.findFirst({
    where: {
      AND: [getVideoLookup(videoId), { OR: [{ ownerUserId }, { ownerUserId: catalogOwnerUserId }] }],
    },
  })

  if (!video) {
    return null
  }

  const savedState = await prisma.videoEditorState.upsert({
    where: { videoId: video.id },
    create: {
      videoId: video.id,
      ownerUserId,
      points: toJsonInput(state.points),
      tripRoute: toJsonInput(state.tripRoute),
      routeShapes: toJsonInput(state.routeShapes),
    },
    update: {
      ownerUserId,
      points: toJsonInput(state.points),
      tripRoute: toJsonInput(state.tripRoute),
      routeShapes: toJsonInput(state.routeShapes),
      updatedAt: new Date(),
    },
  })

  return savedState.updatedAt.toISOString()
}
