import { NextResponse } from "next/server"
import {
  deleteCreatorVideoFromDb,
  getOwnedCreatorVideoFromDb,
  isCreatorVideosDbConfigured,
  unpublishCreatorVideoFromDb,
  setCreatorVideoVisibilityFromDb,
} from "@/lib/creator-videos-db"
import { CreatorAuthorizationError, requireApprovedCreator } from "@/lib/server-creator-auth"
import { isVideoVisibility } from "@/lib/video-visibility"

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

export async function PATCH(request: Request, context: RouteContext) {
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
  // Legacy unpublish requests have no body. Visibility updates must be explicit.
  let payload: unknown = undefined
  try {
    const body = await request.text()
    if (body) payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: "Malformed JSON payload." }, { status: 400 })
  }
  if (payload !== undefined) {
    if (!payload || typeof payload !== "object" || !("visibility" in payload) || !isVideoVisibility(payload.visibility)) {
      return NextResponse.json({ error: "Choose Private, Unlisted or Public visibility." }, { status: 400 })
    }
    try {
      const video = await setCreatorVideoVisibilityFromDb(videoId, creator.ownerUserIds, payload.visibility)
      return NextResponse.json(
        video ? { configured: true, updated: true, video } : { configured: true, updated: false, video: null, error: "Uploaded video not found." },
        { status: video ? 200 : 404, headers: { "Cache-Control": "private, no-store" } },
      )
    } catch (error) {
      const unknownField = error instanceof Error ? error.message.match(/Unknown (?:argument|field) [`']?(\w+)/)?.[1] : undefined
      console.error("[creator-video-visibility] update failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        unknownField,
        code: error && typeof error === "object" && "code" in error ? String(error.code) : undefined,
      })
      return NextResponse.json({ error: unknownField === "visibility"
        ? "The server is using an outdated database client. Regenerate Prisma and restart the server."
        : "Unable to update video visibility. Please try again." }, { status: 503 })
    }
  }
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
