import { NextRequest, NextResponse } from "next/server"
import {
  CreatorVideoPersistenceError,
  isCreatorVideosDbConfigured,
  listCreatorVideosFromDb,
  saveCreatorVideoToDb,
} from "@/lib/creator-videos-db"
import { parseCreatorVideoStatePayload, parseTravelVideoPayload } from "@/lib/creator-video-payload"
import { CreatorAuthorizationError, requireApprovedCreator } from "@/lib/server-creator-auth"

export const dynamic = "force-dynamic"

const maxCreatorUploadBodyBytes = 750_000

function creatorApiErrorResponse(error: unknown) {
  if (error instanceof CreatorAuthorizationError || error instanceof CreatorVideoPersistenceError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  return NextResponse.json({ error: "Unable to process creator video." }, { status: 500 })
}

export async function GET() {
  let creator
  try {
    creator = await requireApprovedCreator()
  } catch (error) {
    return creatorApiErrorResponse(error)
  }

  if (!isCreatorVideosDbConfigured()) {
    return NextResponse.json({ configured: false, videos: [] })
  }

  const videos = await listCreatorVideosFromDb(creator.ownerUserIds, {
    includeCatalog: creator.isDemoCreator,
  })
  return NextResponse.json({ configured: true, videos })
}

export async function POST(request: NextRequest) {
  let creator
  try {
    creator = await requireApprovedCreator()
  } catch (error) {
    return creatorApiErrorResponse(error)
  }

  if (!isCreatorVideosDbConfigured()) {
    return NextResponse.json({ configured: false, saved: false, video: null })
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(contentLength) && contentLength > maxCreatorUploadBodyBytes) {
    return NextResponse.json({ error: "Creator video payload is too large." }, { status: 413 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed JSON payload." }, { status: 400 })
  }

  const parsedVideo = parseTravelVideoPayload(
    payload && typeof payload === "object" && "video" in payload ? (payload as { video?: unknown }).video : null,
  )

  if (!parsedVideo.success) {
    return NextResponse.json({ error: parsedVideo.error }, { status: 400 })
  }

  const parsedState = parseCreatorVideoStatePayload(
    payload && typeof payload === "object" && "state" in payload ? (payload as { state?: unknown }).state : null,
  )
  if (!parsedState.success) {
    return NextResponse.json({ error: parsedState.error }, { status: 400 })
  }

  const publish = Boolean(payload && typeof payload === "object" && "publish" in payload && (payload as { publish?: unknown }).publish)
  let savedVideo
  try {
    savedVideo = await saveCreatorVideoToDb({
      video: parsedVideo.data,
      ownerUserId: creator.userId,
      ownerUserIds: creator.ownerUserIds,
      state: parsedState.data,
      publish,
    })
  } catch (error) {
    return creatorApiErrorResponse(error)
  }

  return NextResponse.json({
    configured: true,
    saved: Boolean(savedVideo),
    video: savedVideo,
  })
}
