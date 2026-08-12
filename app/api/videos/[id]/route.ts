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
  const configured = isCreatorVideosDbConfigured()
  if (!configured) {
    return NextResponse.json(
      {
        configured: false,
        video: null,
        viewerCanEdit: false,
        editHref: null,
        error: "The video service is temporarily unavailable.",
      },
      { status: 503 },
    )
  }

  let cloudVideo: Awaited<ReturnType<typeof getCreatorVideoFromDb>>
  try {
    cloudVideo = await getCreatorVideoFromDb(id, userId)
  } catch {
    return NextResponse.json(
      {
        configured: true,
        video: null,
        viewerCanEdit: false,
        editHref: null,
        error: "The video service is temporarily unavailable.",
      },
      { status: 503 },
    )
  }

  if (!cloudVideo) {
    return NextResponse.json(
      {
        configured,
        video: null,
        viewerCanEdit: false,
        editHref: null,
      },
      { status: 404 },
    )
  }

  const viewerCanEdit = await isCreatorVideoOwnedByUser(id, userId)

  return NextResponse.json({
    configured,
    video: cloudVideo,
    viewerCanEdit,
    editHref: viewerCanEdit ? `/creator/video/${encodeURIComponent(cloudVideo.id)}/edit` : null,
  })
}
