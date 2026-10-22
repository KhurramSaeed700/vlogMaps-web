import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { getPrisma } from "@/lib/prisma"
import { checkRateLimit } from "@/lib/rate-limit"
import { extractYouTubeId, fetchResolvedYouTubeMetadata } from "@/lib/youtube"
import { extractYouTubePlaylistId } from "@/lib/youtube-playlist"
import { loadYouTubePlaylistSummary, PlaylistLoadError } from "@/lib/youtube-playlist-server"
import type { YouTubeLinkPreviewData } from "@/lib/youtube-link-preview"
import { reportServerFailure } from "@/lib/monitoring/server"

export const dynamic = "force-dynamic"
export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, { keyPrefix: "youtube-link-preview", limit: 30, windowMs: 60000 })
  if (limited) return limited
  const input = request.nextUrl.searchParams.get("url") || ""
  const playlistId = extractYouTubePlaylistId(input)
  const videoId = extractYouTubeId(input)
  if (!playlistId && !videoId) return NextResponse.json({ error: "Paste a YouTube video or playlist URL." }, { status: 400 })
  try {
    const { userId } = await auth()
    const prisma = getPrisma()
    const owners = userId ? [userId] : []
    if (userId && prisma) {
      const linked = await prisma.user.findUnique({ where: { clerkUserId: userId }, select: { id: true } })
      if (linked) owners.push(linked.id)
    }
    const visible = { OR: [{ status: "published", visibility: "public" }, ...(owners.length ? [{ ownerUserId: { in: owners } }] : [])] }
    let body: YouTubeLinkPreviewData
    if (playlistId) {
      const [summary, count] = await Promise.all([
        loadYouTubePlaylistSummary(playlistId),
        prisma?.video.count({ where: { ...visible, appId: { not: null }, tags: { array_contains: [`playlist:${playlistId}`] } } }),
      ])
      body = { kind: "playlist", ...summary, added: count === undefined ? null : count > 0, editVideoId: null }
    } else {
      const [metadata, videos] = await Promise.all([
        fetchResolvedYouTubeMetadata(videoId!),
        prisma?.video.findMany({ where: { ...visible, appId: { not: null }, youtubeId: videoId! }, select: { id: true, ownerUserId: true } }),
      ])
      if (!metadata) return NextResponse.json({ error: "Unable to load this video's preview." }, { status: 404 })
      body = { kind: "video", title: metadata.title, creator: metadata.creator, thumbnail: metadata.thumbnail, durationSeconds: metadata.durationSeconds, views: metadata.views, added: videos === undefined ? null : videos.length > 0, editVideoId: videos?.find(video => owners.includes(video.ownerUserId ?? ""))?.id ?? null }
    }
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } })
  } catch (error) {
    if (error instanceof PlaylistLoadError) return NextResponse.json({ error: error.message }, { status: error.status })
    const { requestId } = reportServerFailure(error, "api.youtube_link_preview")
    return NextResponse.json({ error: "Unable to check this link. Please try again.", requestId }, { status: 500 })
  }
}
