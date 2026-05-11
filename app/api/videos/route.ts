import { NextResponse } from "next/server"
import { listPublishedCreatorVideosFromDb, isCreatorVideosDbConfigured } from "@/lib/creator-videos-db"
import { getPublishedTravelVideos, type TravelVideo } from "@/lib/demo-data"

export const dynamic = "force-dynamic"

function mergeVideos(...groups: TravelVideo[][]) {
  const order: string[] = []
  const byId = new Map<string, TravelVideo>()

  for (const group of groups) {
    for (const video of group) {
      if (!byId.has(video.id)) {
        order.push(video.id)
      }

      byId.set(video.id, video)
    }
  }

  return order.flatMap((id) => {
    const video = byId.get(id)
    return video ? [video] : []
  })
}

export async function GET() {
  const cloudVideos = await listPublishedCreatorVideosFromDb()

  return NextResponse.json({
    configured: isCreatorVideosDbConfigured(),
    videos: mergeVideos(getPublishedTravelVideos(), cloudVideos),
  })
}
