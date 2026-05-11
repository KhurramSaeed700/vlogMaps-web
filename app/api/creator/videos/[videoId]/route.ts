import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { deleteCreatorVideoFromDb, isCreatorVideosDbConfigured } from "@/lib/creator-videos-db"

export const dynamic = "force-dynamic"

interface RouteContext {
  params: Promise<{
    videoId: string
  }>
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!isCreatorVideosDbConfigured()) {
    return NextResponse.json({ configured: false, deleted: false })
  }

  const { videoId } = await context.params
  const deleted = await deleteCreatorVideoFromDb(videoId, userId)

  return NextResponse.json({
    configured: true,
    deleted,
  })
}
