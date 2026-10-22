import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { requireApprovedCreator, CreatorAuthorizationError } from "@/lib/server-creator-auth"
import { getPrisma } from "@/lib/prisma"
import { loadYouTubeVideoDetails } from "@/lib/youtube-playlist-server"
import { checkRateLimit } from "@/lib/rate-limit"
import type { YouTubeVideoDetails } from "@/lib/youtube-video-details"

const payload = z.object({
  ids: z.array(z.string().regex(/^[A-Za-z0-9_-]{11}$/)).min(1).max(50),
  observedDurations: z.record(z.string(), z.number().positive().max(604800)).optional(),
})
export async function POST(request: NextRequest) {
  try {
    const creator = await requireApprovedCreator()
    const limited = checkRateLimit(request, { keyPrefix: "creator-video-details", limit: 30, windowMs: 60000 })
    if (limited) return limited
    const parsed = payload.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: "Provide up to 50 valid video IDs." }, { status: 400 })
    const ids = [...new Set(parsed.data.ids)]
    const prisma = getPrisma()
    if (!prisma) return NextResponse.json({ error: "Database unavailable." }, { status: 503 })
    const owned = await prisma.video.findMany({ where: { youtubeId: { in: ids }, ownerUserId: { in: creator.ownerUserIds } }, select: { youtubeId: true, duration: true, viewCount: true } })
    const known = new Map<string, YouTubeVideoDetails>(owned.map(video => [video.youtubeId, { youtubeId: video.youtubeId, durationSeconds: (video.duration ?? 0) > 0 ? video.duration : null, views: (video.viewCount ?? 0) > 0 ? video.viewCount : null }]))
    const observed = parsed.data.observedDurations ?? {}
    const remoteIds = ids.filter(id => !observed[id])
    let fresh: YouTubeVideoDetails[] = []
    let retryable = false
    try { if (remoteIds.length) fresh = await loadYouTubeVideoDetails(remoteIds) }
    catch { retryable = true }
    const updates = new Map(fresh.map(item => [item.youtubeId, item]))
    for (const id of ids) {
      if (observed[id] && owned.some(video => video.youtubeId === id)) updates.set(id, { youtubeId: id, durationSeconds: Math.round(observed[id]), views: null })
    }
    // Update metadata only, scoped to this creator. Never replace known data with zero.
    if (updates.size) await prisma.$transaction([...updates.values()].filter(item => item.durationSeconds || item.views !== null).map(item => prisma.video.updateMany({
      where: { youtubeId: item.youtubeId, ownerUserId: { in: creator.ownerUserIds } },
      data: { ...(item.durationSeconds ? { duration: item.durationSeconds } : {}), ...(item.views !== null ? { viewCount: item.views } : {}) },
    })))
    const items = ids.map(id => {
      const previous = known.get(id), next = updates.get(id)
      return { youtubeId: id, durationSeconds: next?.durationSeconds || previous?.durationSeconds || null, views: next?.views ?? previous?.views ?? null }
    })
    return NextResponse.json({ items, retryable }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    if (error instanceof CreatorAuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: "Unable to refresh video details. Please retry." }, { status: 503 })
  }
}
