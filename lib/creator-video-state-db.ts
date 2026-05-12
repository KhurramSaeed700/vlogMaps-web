import "server-only"

import type { CreatorVideoState } from "@/lib/creator-video-state"
import { isDatabaseConfigured } from "@/lib/database"
import { getCreatorVideoStateFromDb, saveCreatorVideoStateForVideoId } from "@/lib/creator-videos-db"

export function isCreatorVideoStateDbConfigured() {
  return isDatabaseConfigured()
}

export async function loadCreatorVideoStateFromDb(videoId: string, ownerUserId: string) {
  return getCreatorVideoStateFromDb(videoId, ownerUserId)
}

export async function saveCreatorVideoStateToDb(videoId: string, ownerUserId: string, state: CreatorVideoState) {
  return saveCreatorVideoStateForVideoId(videoId, ownerUserId, state)
}
