import { NextRequest, NextResponse } from "next/server"
import { CreatorAuthorizationError, requireApprovedCreator } from "@/lib/server-creator-auth"
import { extractYouTubePlaylistId } from "@/lib/youtube-playlist"
import { loadYouTubePlaylist, PlaylistLoadError } from "@/lib/youtube-playlist-server"
import { checkRateLimit } from "@/lib/rate-limit"
import { reportServerFailure } from "@/lib/monitoring/server"

export const dynamic = "force-dynamic"
export async function GET(request: NextRequest) {
  try {
    await requireApprovedCreator()
    const limited = checkRateLimit(request, { keyPrefix: "creator-playlist", limit: 12, windowMs: 60000 })
    if (limited) return limited
    const id = extractYouTubePlaylistId(request.nextUrl.searchParams.get("url") || "")
    if (!id) return NextResponse.json({ error: "Paste a valid YouTube playlist URL." }, { status: 400 })
    return NextResponse.json(await loadYouTubePlaylist(id), { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    if (error instanceof CreatorAuthorizationError || error instanceof PlaylistLoadError) return NextResponse.json({ error: error.message }, { status: error.status })
    const { requestId } = reportServerFailure(error, "api.creator_playlist")
    return NextResponse.json({ error: "Unable to load playlist. Please try again.", requestId }, { status: 500 })
  }
}
