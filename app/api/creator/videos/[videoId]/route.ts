import { NextResponse } from "next/server"
import { deleteCreatorVideoFromDb, getOwnedCreatorVideoFromDb, isCreatorVideosDbConfigured } from "@/lib/creator-videos-db"
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
