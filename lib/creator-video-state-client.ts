import type { CreatorVideoState, CreatorVideoStateResponse } from "@/lib/creator-video-state"
import { diagnosticEvent } from "@/lib/monitoring/diagnostics"

function getCreatorVideoStateUrl(videoId: string) {
  return `/api/creator/video-state/${encodeURIComponent(videoId)}`
}

export async function loadCreatorVideoState(videoId: string, signal?: AbortSignal) {
  const response = await fetch(getCreatorVideoStateUrl(videoId), {
    cache: "no-store",
    signal,
  })

  if (!response.ok) {
    diagnosticEvent("editor.load_failed", { videoId, status: response.status, requestId: response.headers.get("X-Request-Id") })
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
    diagnosticEvent("editor.save_failed", { videoId, status: response.status, requestId: response.headers.get("X-Request-Id") })
    return null
  }

  return (await response.json()) as { configured: boolean; saved: boolean; updatedAt: string | null }
}
