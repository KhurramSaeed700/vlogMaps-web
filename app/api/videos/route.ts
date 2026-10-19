import { NextResponse } from "next/server"
import { isCreatorVideosDbConfigured } from "@/lib/creator-videos-db"
import { listHomeFeedVideos } from "@/lib/home-feed"
import type { TravelVideo } from "@/lib/demo-data"

export const dynamic = "force-dynamic"

function getVideoDedupeKey(video: TravelVideo) {
  return video.youtubeId.trim().toLowerCase() || video.id
}

function dedupeVideosByYouTubeId(videos: TravelVideo[]) {
  const seenVideoKeys = new Set<string>()

  return videos.filter((video) => {
    const videoKey = getVideoDedupeKey(video)

    if (seenVideoKeys.has(videoKey)) {
      return false
    }

    seenVideoKeys.add(videoKey)
    return true
  })
}

export async function GET() {
  const cloudVideos = await listHomeFeedVideos()

  return NextResponse.json({
    configured: isCreatorVideosDbConfigured(),
    videos: dedupeVideosByYouTubeId(cloudVideos),
  }, { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } })
}
