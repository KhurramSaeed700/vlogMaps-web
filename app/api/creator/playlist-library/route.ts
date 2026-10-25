import { NextResponse } from "next/server"
import { getPrisma } from "@/lib/prisma"
import { CreatorAuthorizationError, requireApprovedCreator } from "@/lib/server-creator-auth"
import { playlistIdPattern, playlistIds, updatePlaylistTags } from "@/lib/playlist-membership"

export async function POST(request: Request) {
  try {
    const creator = await requireApprovedCreator()
    const db = getPrisma()
    if (!db) return NextResponse.json({ error: "Creator database is unavailable." }, { status: 503 })
    let body
    try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid playlist request." }, { status: 400 }) }
    const { id, title, videoIds } = body ?? {}
    if (typeof id !== "string" || !playlistIdPattern.test(id) || typeof title !== "string" || !title.trim() || title.trim().length > 150 || !Array.isArray(videoIds) || videoIds.length > 2000 || videoIds.some(value => typeof value !== "string" || value.length > 150) || new Set(videoIds).size !== videoIds.length) {
      return NextResponse.json({ error: "Enter a playlist name and choose valid videos." }, { status: 400 })
    }
    await db.$transaction(async tx => {
      const videos = await tx.video.findMany({ where: { ownerUserId: { in: creator.ownerUserIds }, appId: { not: null } }, select: { id: true, appId: true, tags: true } })
      const owned = new Set(videos.map(video => video.appId!))
      if (videoIds.some((videoId: string) => !owned.has(videoId))) throw new CreatorAuthorizationError(404, "Some selected videos are no longer in your library. Reload and try again.")
      const positions = new Map<string, number>(videoIds.map((videoId: string, index: number) => [videoId, index]))
      if (!videoIds.length && !videos.some(video => playlistIds(Array.isArray(video.tags) ? video.tags.filter((tag): tag is string => typeof tag === "string") : []).includes(id))) throw new CreatorAuthorizationError(400, "Choose at least one video to create a playlist.")
      for (const video of videos) {
        const tags = Array.isArray(video.tags) ? video.tags.filter((tag): tag is string => typeof tag === "string") : []
        if (!positions.has(video.appId!) && !playlistIds(tags).includes(id)) continue
        await tx.video.update({ where: { id: video.id }, data: { tags: updatePlaylistTags(tags, id, title.trim(), positions.get(video.appId!) ?? null) } })
      }
    }, { isolationLevel: "Serializable", timeout: 30000 })
    return NextResponse.json({ saved: true }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    if (error instanceof CreatorAuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: "Unable to save the playlist. Please try again." }, { status: 503 })
  }
}
