import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import {
  isCreatorVideosDbConfigured,
  listCreatorVideosFromDb,
  saveCreatorVideoToDb,
} from "@/lib/creator-videos-db"
import { parseCreatorVideoStatePayload, parseTravelVideoPayload } from "@/lib/creator-video-payload"

export const dynamic = "force-dynamic"

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isCreatorVideosDbConfigured()) {
    return NextResponse.json({ configured: false, videos: [] })
  }

  const videos = await listCreatorVideosFromDb(userId)
  return NextResponse.json({ configured: true, videos })
}

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isCreatorVideosDbConfigured()) {
    return NextResponse.json({ configured: false, saved: false, video: null })
  }

  const payload = (await request.json()) as unknown
  const video = parseTravelVideoPayload(
    payload && typeof payload === "object" && "video" in payload ? (payload as { video?: unknown }).video : null,
  )

  if (!video) {
    return NextResponse.json({ error: "Invalid creator video." }, { status: 400 })
  }

  const state = parseCreatorVideoStatePayload(
    payload && typeof payload === "object" && "state" in payload ? (payload as { state?: unknown }).state : null,
  )
  const publish = Boolean(payload && typeof payload === "object" && "publish" in payload && (payload as { publish?: unknown }).publish)
  const savedVideo = await saveCreatorVideoToDb({
    video,
    ownerUserId: userId,
    state,
    publish,
  })

  return NextResponse.json({
    configured: true,
    saved: Boolean(savedVideo),
    video: savedVideo,
  })
}
