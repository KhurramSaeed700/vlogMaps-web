import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getCreatorVideoFromDb, isCreatorVideoOwnedByUser, isCreatorVideosDbConfigured } from "@/lib/creator-videos-db"

export const dynamic = "force-dynamic"

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params
  const { userId } = await auth()
  const cloudVideo = await getCreatorVideoFromDb(id, userId)
  if (!cloudVideo) {
    return NextResponse.json(
      {
        configured: isCreatorVideosDbConfigured(),
        video: null,
        viewerCanEdit: false,
        editHref: null,
      },
      { status: 404 },
    )
  }

  const viewerCanEdit = await isCreatorVideoOwnedByUser(id, userId)

  return NextResponse.json({
    configured: isCreatorVideosDbConfigured(),
    video: cloudVideo,
    viewerCanEdit,
    editHref: viewerCanEdit ? `/creator/video/${encodeURIComponent(cloudVideo.id)}/edit` : null,
  })
}
