import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { extractYouTubeId, fetchResolvedYouTubeMetadata } from "@/lib/youtube"
import { isValidYouTubeVideoId } from "@/lib/creator-video-payload"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rateLimitResponse = checkRateLimit(request, {
    keyPrefix: "youtube-metadata",
    limit: 30,
    windowMs: 60_000,
  })
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  const { id } = await params
  const videoId = extractYouTubeId(id) ?? id

  if (!isValidYouTubeVideoId(videoId)) {
    return NextResponse.json({ error: "Invalid YouTube video id." }, { status: 400 })
  }

  const metadata = await fetchResolvedYouTubeMetadata(videoId)

  if (!metadata) {
    return NextResponse.json({ error: "Unable to resolve YouTube metadata." }, { status: 404 })
  }

  return NextResponse.json(metadata, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  })
}
