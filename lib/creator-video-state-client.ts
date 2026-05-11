import type { CreatorVideoState, CreatorVideoStateResponse } from "@/lib/creator-video-state"

function getCreatorVideoStateUrl(videoId: string) {
  return `/api/creator/video-state/${encodeURIComponent(videoId)}`
}

export async function loadCreatorVideoState(videoId: string, signal?: AbortSignal) {
  const response = await fetch(getCreatorVideoStateUrl(videoId), {
    cache: "no-store",
    signal,
  })

  if (!response.ok) {
    return null
  }

  return (await response.json()) as CreatorVideoStateResponse
}

export async function saveCreatorVideoState(videoId: string, state: CreatorVideoState, signal?: AbortSignal) {
  const body = JSON.stringify(state)
  const response = await fetch(getCreatorVideoStateUrl(videoId), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    cache: "no-store",
    keepalive: body.length < 60_000,
    signal,
  })

  if (!response.ok) {
    return null
  }

  return (await response.json()) as { configured: boolean; saved: boolean; updatedAt: string | null }
}
