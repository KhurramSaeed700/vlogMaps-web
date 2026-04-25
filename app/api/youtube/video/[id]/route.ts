import { NextResponse } from "next/server"
import { extractYouTubeId, fetchResolvedYouTubeMetadata } from "@/lib/youtube"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const videoId = extractYouTubeId(id) ?? id
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
