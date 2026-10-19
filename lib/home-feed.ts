import "server-only"

import { auth } from "@clerk/nextjs/server"
import { getPrisma } from "@/lib/prisma"
import { listPublishedCreatorVideosFromDb } from "@/lib/creator-videos-db"

// Resolve ownership from the session, never from a client-supplied user ID.
export async function listHomeFeedVideos() {
  const { userId } = await auth()
  const ownerUserIds = userId ? [userId] : []
  if (userId) {
    const linkedUser = await getPrisma()?.user.findUnique({
      where: { clerkUserId: userId },
      select: { id: true },
    })
    if (linkedUser) ownerUserIds.push(linkedUser.id)
  }
  return listPublishedCreatorVideosFromDb(ownerUserIds)
}
