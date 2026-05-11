import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import type { CreatorVideoState } from "@/lib/creator-video-state"
import {
  isCreatorVideoStateDbConfigured,
  loadCreatorVideoStateFromDb,
  saveCreatorVideoStateToDb,
} from "@/lib/creator-video-state-db"

interface RouteContext {
  params: Promise<{
    videoId: string
  }>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isCreatorVideoState(value: unknown): value is CreatorVideoState {
  return (
    isPlainObject(value) &&
    Array.isArray(value.points) &&
    isPlainObject(value.tripRoute) &&
    isPlainObject(value.routeShapes)
  )
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { videoId } = await context.params
  if (!isCreatorVideoStateDbConfigured()) {
    return NextResponse.json({ configured: false, state: null, updatedAt: null })
  }

  const savedState = await loadCreatorVideoStateFromDb(videoId, userId)
  return NextResponse.json({
    configured: true,
    state: savedState?.state ?? null,
    updatedAt: savedState?.updatedAt ?? null,
  })
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { videoId } = await context.params
  if (!isCreatorVideoStateDbConfigured()) {
    return NextResponse.json({ configured: false, saved: false, updatedAt: null })
  }

  const payload = (await request.json()) as unknown
  if (!isCreatorVideoState(payload)) {
    return NextResponse.json({ error: "Invalid creator video state." }, { status: 400 })
  }

  const updatedAt = await saveCreatorVideoStateToDb(videoId, userId, payload)
  return NextResponse.json({
    configured: true,
    saved: true,
    updatedAt,
  })
}

