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

type OwnerUserIdInput = string | string[] | null | undefined

interface RowToTravelVideoOptions {
  editableOwnerUserIds?: string[]
}

interface CreatorVideoListOptions {
  includeCatalog?: boolean
}

export class CreatorVideoPersistenceError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "CreatorVideoPersistenceError"
    this.status = status
  }
}

function isUuid(value: string) {
  return uuidPattern.test(value)
}

function normalizeOwnerUserIds(ownerUserIds: OwnerUserIdInput) {
  return [
    ...new Set(
      (Array.isArray(ownerUserIds) ? ownerUserIds : [ownerUserIds]).filter(
        (ownerUserId): ownerUserId is string => Boolean(ownerUserId),
      ),
    ),
  ]
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
    pointType: keyframe.pointType === "stop" || keyframe.pointType === "flight" ? keyframe.pointType : "point",
  }
}

function rowKeyframeToTravelKeyframe(keyframe: VideoKeyframe): TravelVideoKeyframe {
  const pointType = keyframe.pointType === "stop" || keyframe.pointType === "flight" ? keyframe.pointType : "point"

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

function rowToTravelVideo(video: VideoWithRoute, options: RowToTravelVideoOptions = {}): TravelVideo {
  const keyframes =
    video.editorState && asCreatorPoints(video.editorState.points).length > 0
      ? asCreatorPoints(video.editorState.points).map(({ id: _id, ...point }) => point)
      : video.keyframes.map(rowKeyframeToTravelKeyframe)
  const editableOwnerUserIds = options.editableOwnerUserIds
  const ownerUserId = video.ownerUserId ?? ""
  const viewerCanEdit = editableOwnerUserIds ? editableOwnerUserIds.includes(ownerUserId) : undefined
  const isCatalog = ownerUserId === catalogOwnerUserId

  return {
    id: video.id,
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
    viewerCanEdit,
    isCatalog,
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
  ownerUserIds,
  state,
  publish = false,
}: {
  video: TravelVideo
  ownerUserId: string
  ownerUserIds?: string[]
  state?: CreatorVideoState | null
  publish?: boolean
}) {
  const prisma = getPrisma()
  if (!prisma) {
    return null
  }

  const keyframes = state?.points?.length ? state.points.map(({ id: _id, ...point }) => point) : video.keyframes
  const status = publish ? "published" : video.status
  const editableOwnerUserIds = normalizeOwnerUserIds(ownerUserIds?.length ? ownerUserIds : ownerUserId)

  const savedVideo = await prisma.$transaction(async (tx) => {
    const existingVideo = await tx.video.findFirst({
      where: getVideoLookup(video.id),
    })

    if (existingVideo && !editableOwnerUserIds.includes(existingVideo.ownerUserId ?? "")) {
      throw new CreatorVideoPersistenceError(409, "A video with this id already belongs to another creator.")
    }

    const saved = existingVideo
      ? await tx.video.update({
          where: { id: existingVideo.id },
          data: {
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

  return savedVideo ? rowToTravelVideo(savedVideo, { editableOwnerUserIds }) : null
}

export async function listCreatorVideosFromDb(ownerUserIds: OwnerUserIdInput, options: CreatorVideoListOptions = {}) {
  const prisma = getPrisma()
  if (!prisma) {
    return []
  }
  const editableOwnerUserIds = normalizeOwnerUserIds(ownerUserIds)
  const allowedOwnerUserIds = options.includeCatalog
    ? [...new Set([...editableOwnerUserIds, catalogOwnerUserId])]
    : editableOwnerUserIds

  if (allowedOwnerUserIds.length === 0) {
    return []
  }

  const videos = await prisma.video.findMany({
    where: {
      ownerUserId: { in: allowedOwnerUserIds },
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

  return videos.map((video) => rowToTravelVideo(video, { editableOwnerUserIds }))
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

    return videos.map((video) => rowToTravelVideo(video))
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

export async function getOwnedCreatorVideoFromDb(videoId: string, ownerUserIds: OwnerUserIdInput) {
  const prisma = getPrisma()
  if (!prisma) {
    return null
  }
  const editableOwnerUserIds = normalizeOwnerUserIds(ownerUserIds)
  if (editableOwnerUserIds.length === 0) {
    return null
  }

  const video = await prisma.video.findFirst({
    where: {
      AND: [getVideoLookup(videoId), { ownerUserId: { in: editableOwnerUserIds } }],
    },
    include: {
      editorState: true,
      keyframes: {
        orderBy: { timestampSeconds: "asc" },
      },
    },
  })

  return video ? rowToTravelVideo(video, { editableOwnerUserIds }) : null
}

export async function isCreatorVideoOwnedByUser(videoId: string, ownerUserIds: OwnerUserIdInput) {
  const prisma = getPrisma()
  const editableOwnerUserIds = normalizeOwnerUserIds(ownerUserIds)
  if (!prisma || editableOwnerUserIds.length === 0) {
    return false
  }

  const video = await prisma.video.findFirst({
    where: {
      AND: [getVideoLookup(videoId), { ownerUserId: { in: editableOwnerUserIds } }],
    },
    select: {
      id: true,
    },
  })

  return Boolean(video)
}

export async function deleteCreatorVideoFromDb(videoId: string, ownerUserIds: OwnerUserIdInput) {
  const prisma = getPrisma()
  if (!prisma) {
    return false
  }
  const editableOwnerUserIds = normalizeOwnerUserIds(ownerUserIds)
  if (editableOwnerUserIds.length === 0) {
    return false
  }

  const video = await prisma.video.findFirst({
    where: {
      AND: [getVideoLookup(videoId), { ownerUserId: { in: editableOwnerUserIds } }],
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

export async function getCreatorVideoStateFromDb(videoId: string, ownerUserIds: OwnerUserIdInput) {
  const prisma = getPrisma()
  if (!prisma) {
    return null
  }
  const editableOwnerUserIds = normalizeOwnerUserIds(ownerUserIds)
  if (editableOwnerUserIds.length === 0) {
    return null
  }

  const video = await prisma.video.findFirst({
    where: {
      AND: [getVideoLookup(videoId), { ownerUserId: { in: editableOwnerUserIds } }],
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

export async function saveCreatorVideoStateForVideoId(
  videoId: string,
  ownerUserId: string,
  ownerUserIds: OwnerUserIdInput,
  state: CreatorVideoState,
) {
  const prisma = getPrisma()
  if (!prisma) {
    return null
  }
  const editableOwnerUserIds = normalizeOwnerUserIds(ownerUserIds)
  if (editableOwnerUserIds.length === 0) {
    return null
  }

  const video = await prisma.video.findFirst({
    where: {
      AND: [getVideoLookup(videoId), { ownerUserId: { in: editableOwnerUserIds } }],
    },
  })

  if (!video) {
    const existingVideo = await prisma.video.findFirst({
      where: getVideoLookup(videoId),
      select: {
        ownerUserId: true,
      },
    })

    if (existingVideo?.ownerUserId === catalogOwnerUserId) {
      throw new CreatorVideoPersistenceError(403, "Catalog videos are read-only.")
    }

    if (existingVideo) {
      throw new CreatorVideoPersistenceError(403, "You do not own this video.")
    }

    return null
  }

  const keyframes = state.points.map(({ id: _id, ...point }) => point)
  const savedState = await prisma.$transaction(async (tx) => {
    await replaceVideoKeyframes(tx, video.id, keyframes)
    await tx.video.update({
      where: { id: video.id },
      data: {
        locations: keyframes.map((point) => point.location),
        updatedAt: new Date(),
      },
    })

    return tx.videoEditorState.upsert({
      where: { videoId: video.id },
      create: {
        videoId: video.id,
        ownerUserId,
        points: toJsonInput(state.points),
        tripRoute: toJsonInput(state.tripRoute),
        routeShapes: toJsonInput(state.routeShapes),
      },
      update: {
        points: toJsonInput(state.points),
        tripRoute: toJsonInput(state.tripRoute),
        routeShapes: toJsonInput(state.routeShapes),
        updatedAt: new Date(),
      },
    })
  })

  return savedState.updatedAt.toISOString()
}
