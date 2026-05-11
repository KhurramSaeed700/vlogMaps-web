import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getCreatorVideoFromDb, isCreatorVideosDbConfigured } from "@/lib/creator-videos-db"
import { getTravelVideoById } from "@/lib/demo-data"

export const dynamic = "force-dynamic"

interface RouteContext {
  params: Promise<{
    id: string
  }>
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params
  const catalogVideo = getTravelVideoById(id)
  if (catalogVideo) {
    return NextResponse.json({
      configured: isCreatorVideosDbConfigured(),
      video: catalogVideo,
    })
  }

  const { userId } = await auth()
  const cloudVideo = await getCreatorVideoFromDb(id, userId)
  if (!cloudVideo) {
    return NextResponse.json(
      {
        configured: isCreatorVideosDbConfigured(),
        video: null,
      },
      { status: 404 },
    )
  }

  return NextResponse.json({
    configured: isCreatorVideosDbConfigured(),
    video: cloudVideo,
  })
}
