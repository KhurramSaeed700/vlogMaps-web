import { NextRequest, NextResponse } from "next/server"
import { reportServerFailure } from "@/lib/monitoring/server"
import { CreatorVideoPersistenceError } from "@/lib/creator-videos-db"
import {
  isCreatorVideoStateDbConfigured,
  loadCreatorVideoStateFromDb,
  saveCreatorVideoStateToDb,
} from "@/lib/creator-video-state-db"
import { parseCreatorVideoStatePayload } from "@/lib/creator-video-payload"
import { CreatorAuthorizationError, requireApprovedCreator } from "@/lib/server-creator-auth"

interface RouteContext {
  params: Promise<{
    videoId: string
  }>
}

const maxCreatorStateBodyBytes = 500_000

function creatorStateErrorResponse(error: unknown) {
  if (error instanceof CreatorAuthorizationError || error instanceof CreatorVideoPersistenceError) {
    if (error.status >= 500) {
      const { requestId } = reportServerFailure(error, "api.editor_state")
      return NextResponse.json({ error: "The save service is temporarily unavailable.", requestId }, { status: error.status, headers: { "X-Request-Id": requestId } })
    }
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  const { requestId } = reportServerFailure(error, "api.editor_state")
  return NextResponse.json({ error: "Unable to process creator video state.", requestId }, { status: 500, headers: { "X-Request-Id": requestId } })
}

export async function GET(_request: NextRequest, context: RouteContext) {
  let creator
  try {
    creator = await requireApprovedCreator()
  } catch (error) {
    return creatorStateErrorResponse(error)
  }

  const { videoId } = await context.params
  if (!isCreatorVideoStateDbConfigured()) {
    return NextResponse.json({ configured: false, state: null, updatedAt: null })
  }

  const savedState = await loadCreatorVideoStateFromDb(videoId, creator.ownerUserIds)
  return NextResponse.json({
    configured: true,
    state: savedState?.state ?? null,
    updatedAt: savedState?.updatedAt ?? null,
  })
}

export async function PUT(request: NextRequest, context: RouteContext) {
  let creator
  try {
    creator = await requireApprovedCreator()
  } catch (error) {
    return creatorStateErrorResponse(error)
  }

  const { videoId } = await context.params
  if (!isCreatorVideoStateDbConfigured()) {
    return NextResponse.json({ configured: false, saved: false, updatedAt: null })
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(contentLength) && contentLength > maxCreatorStateBodyBytes) {
    return NextResponse.json({ error: "Creator video state payload is too large." }, { status: 413 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Malformed JSON payload." }, { status: 400 })
  }

  const parsedState = parseCreatorVideoStatePayload(payload)
  if (!parsedState.success) {
    return NextResponse.json({ error: parsedState.error }, { status: 400 })
  }

  let updatedAt
  try {
    updatedAt = await saveCreatorVideoStateToDb(videoId, creator.userId, creator.ownerUserIds, parsedState.data)
  } catch (error) {
    return creatorStateErrorResponse(error)
  }

  return NextResponse.json({
    configured: true,
    saved: Boolean(updatedAt),
    updatedAt,
  })
}

