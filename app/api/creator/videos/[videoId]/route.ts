import { NextResponse } from "next/server"
import {
  deleteCreatorVideoFromDb,
  getOwnedCreatorVideoFromDb,
  isCreatorVideosDbConfigured,
  unpublishCreatorVideoFromDb,
} from "@/lib/creator-videos-db"
import { CreatorAuthorizationError, requireApprovedCreator } from "@/lib/server-creator-auth"

export const dynamic = "force-dynamic"

interface RouteContext {
  params: Promise<{
    videoId: string
  }>
}

function creatorVideoRouteErrorResponse(error: unknown) {
  if (error instanceof CreatorAuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  return NextResponse.json({ error: "Unable to authorize creator." }, { status: 500 })
}

export async function GET(_request: Request, context: RouteContext) {
  let creator
  try {
    creator = await requireApprovedCreator()
  } catch (error) {
    return creatorVideoRouteErrorResponse(error)
  }

  if (!isCreatorVideosDbConfigured()) {
    return NextResponse.json({ configured: false, video: null })
  }

  const { videoId } = await context.params
  const video = await getOwnedCreatorVideoFromDb(videoId, creator.ownerUserIds)

  return NextResponse.json({
    configured: true,
    video,
  }, { status: video ? 200 : 404 })
}

export async function DELETE(_request: Request, context: RouteContext) {
  let creator
  try {
    creator = await requireApprovedCreator()
  } catch (error) {
    return creatorVideoRouteErrorResponse(error)
  }

  if (!isCreatorVideosDbConfigured()) {
    return NextResponse.json({ configured: false, deleted: false })
  }

  const { videoId } = await context.params
  const deleted = await deleteCreatorVideoFromDb(videoId, creator.ownerUserIds)

  return NextResponse.json({
    configured: true,
    deleted,
  })
}

export async function PATCH(_request: Request, context: RouteContext) {
  let creator
  try {
    creator = await requireApprovedCreator()
  } catch (error) {
    return creatorVideoRouteErrorResponse(error)
  }

  if (!isCreatorVideosDbConfigured()) {
    return NextResponse.json({ configured: false, unpublished: false, video: null }, { status: 503 })
  }

  const { videoId } = await context.params
  const video = await unpublishCreatorVideoFromDb(videoId, creator.ownerUserIds)

  if (!video) {
    return NextResponse.json(
      { configured: true, unpublished: false, video: null, error: "Video not found." },
      { status: 404 },
    )
  }

  return NextResponse.json({
    configured: true,
    unpublished: true,
    video,
  })
}
