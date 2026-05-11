import type { CreatorVideoState } from "@/lib/creator-video-state"
import type { TravelVideo } from "@/lib/demo-data"

interface CloudVideosResponse {
  configured: boolean
  videos: TravelVideo[]
}

interface CloudVideoResponse {
  configured: boolean
  video: TravelVideo | null
}

interface UploadCreatorVideoOptions {
  publish?: boolean
}

export async function fetchPublishedCloudVideos(signal?: AbortSignal) {
  const response = await fetch("/api/videos", {
    cache: "no-store",
    signal,
  })

  if (!response.ok) {
    return { configured: false, videos: [] } satisfies CloudVideosResponse
  }

  return (await response.json()) as CloudVideosResponse
}

export async function fetchCreatorCloudVideos(signal?: AbortSignal) {
  const response = await fetch("/api/creator/videos", {
    cache: "no-store",
    signal,
  })

  if (!response.ok) {
    return { configured: false, videos: [] } satisfies CloudVideosResponse
  }

  return (await response.json()) as CloudVideosResponse
}

export async function fetchCloudVideoById(videoId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/videos/${encodeURIComponent(videoId)}`, {
    cache: "no-store",
    signal,
  })

  if (!response.ok) {
    return { configured: false, video: null } satisfies CloudVideoResponse
  }

  return (await response.json()) as CloudVideoResponse
}

export async function uploadCreatorVideoToCloud(
  video: TravelVideo,
  state: CreatorVideoState,
  options: UploadCreatorVideoOptions = {},
) {
  const response = await fetch("/api/creator/videos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video,
      state,
      publish: options.publish === true,
    }),
    cache: "no-store",
  })

  if (!response.ok) {
    return { configured: false, saved: false, video: null } as const
  }

  return (await response.json()) as {
    configured: boolean
    saved: boolean
    video: TravelVideo | null
  }
}

export async function deleteCreatorVideoFromCloud(videoId: string) {
  const response = await fetch(`/api/creator/videos/${encodeURIComponent(videoId)}`, {
    method: "DELETE",
    cache: "no-store",
  })

  if (!response.ok) {
    return { configured: false, deleted: false } as const
  }

  return (await response.json()) as {
    configured: boolean
    deleted: boolean
  }
}
