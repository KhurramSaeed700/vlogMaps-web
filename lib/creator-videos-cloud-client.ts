import type { CreatorVideoState } from "@/lib/creator-video-state"
import type { TravelVideo } from "@/lib/demo-data"

interface CloudVideosResponse {
  configured: boolean
  videos: TravelVideo[]
  error?: string
  status?: number
}

interface CloudVideoResponse {
  configured: boolean
  video: TravelVideo | null
  viewerCanEdit?: boolean
  editHref?: string | null
  error?: string
  status?: number
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
    return { configured: false, videos: [], status: response.status } satisfies CloudVideosResponse
  }

  return (await response.json()) as CloudVideosResponse
}

export async function fetchCreatorCloudVideos(signal?: AbortSignal) {
  const response = await fetch("/api/creator/videos", {
    cache: "no-store",
    signal,
  })

  if (!response.ok) {
    const body = await readErrorResponse(response)
    return {
      configured: response.status !== 503,
      videos: [],
      error: body.error || getDefaultCreatorApiError(response.status),
      status: response.status,
    } satisfies CloudVideosResponse
  }

  return (await response.json()) as CloudVideosResponse
}

export async function fetchCreatorCloudVideoById(videoId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/creator/videos/${encodeURIComponent(videoId)}`, {
    cache: "no-store",
    signal,
  })

  if (!response.ok) {
    const body = await readErrorResponse(response)
    return {
      configured: response.status !== 503,
      video: null,
      error: body.error || getDefaultCreatorApiError(response.status),
      status: response.status,
    } satisfies CloudVideoResponse
  }

  return (await response.json()) as CloudVideoResponse
}

export async function fetchCloudVideoById(videoId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/videos/${encodeURIComponent(videoId)}`, {
    cache: "no-store",
    signal,
  })

  if (!response.ok) {
    const body = await readErrorResponse(response)
    return {
      configured: response.status !== 503,
      video: null,
      error: body.error,
      status: response.status,
    } satisfies CloudVideoResponse
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
    const body = await readErrorResponse(response)
    return {
      configured: response.status !== 503,
      saved: false,
      video: null,
      error: body.error || getDefaultCreatorApiError(response.status),
      status: response.status,
    } as const
  }

  return (await response.json()) as {
    configured: boolean
    saved: boolean
    video: TravelVideo | null
    error?: string
    status?: number
  }
}

export async function deleteCreatorVideoFromCloud(videoId: string) {
  const response = await fetch(`/api/creator/videos/${encodeURIComponent(videoId)}`, {
    method: "DELETE",
    cache: "no-store",
  })

  if (!response.ok) {
    const body = await readErrorResponse(response)
    return {
      configured: response.status !== 503,
      deleted: false,
      error: body.error || getDefaultCreatorApiError(response.status),
      status: response.status,
    } as const
  }

  return (await response.json()) as {
    configured: boolean
    deleted: boolean
    error?: string
    status?: number
  }
}

async function readErrorResponse(response: Response) {
  try {
    return (await response.json()) as { error?: string }
  } catch {
    return {} as { error?: string }
  }
}

function getDefaultCreatorApiError(status: number) {
  if (status === 401) {
    return "Sign in again to load creator videos."
  }

  if (status === 403) {
    return "Creator access is required to load creator videos."
  }

  if (status === 503) {
    return "Creator database is not configured."
  }

  return "Unable to load creator videos."
}
