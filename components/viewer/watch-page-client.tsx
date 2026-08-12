"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { WatchExperience } from "@/components/viewer/watch-experience"
import { Button } from "@/components/ui/button"
import {
  fetchCloudVideoById,
  fetchPublishedCloudVideos,
} from "@/lib/creator-videos-cloud-client"
import { getTravelVideoByIdClient } from "@/lib/creator-videos"
import { hydrateTravelVideo, toHydratedTravelVideo, type HydratedTravelVideo } from "@/lib/youtube-client"
import type { TravelVideo } from "@/lib/demo-data"

interface WatchVideoState {
  video: HydratedTravelVideo
  viewerCanEdit: boolean
  editHref: string | null
}

type CloudWatchVideoResponse = Awaited<ReturnType<typeof fetchCloudVideoById>>

const watchVideoRetryDelaysMs = [0, 450, 1100] as const
const maxRecommendedVideos = 6

function normalizeRecommendationValue(value: string) {
  return value.trim().toLowerCase()
}

function getRecommendationScore(video: TravelVideo, currentVideo: TravelVideo) {
  const currentTags = new Set((currentVideo.tags ?? []).map(normalizeRecommendationValue))
  const currentLocations = new Set(currentVideo.locations.map(normalizeRecommendationValue))
  const sharedTags = (video.tags ?? []).reduce(
    (count, tag) => count + (currentTags.has(normalizeRecommendationValue(tag)) ? 1 : 0),
    0,
  )
  const sharedLocations = video.locations.reduce(
    (count, location) =>
      count + (currentLocations.has(normalizeRecommendationValue(location)) ? 1 : 0),
    0,
  )
  const sameCreator =
    normalizeRecommendationValue(video.creator) === normalizeRecommendationValue(currentVideo.creator)

  return sharedTags * 4 + sharedLocations * 2 + (sameCreator ? 1 : 0)
}

function selectRecommendedVideos(videos: TravelVideo[], currentVideo: TravelVideo) {
  return videos
    .filter(
      (video) =>
        video.status === "published" &&
        video.id !== currentVideo.id &&
        video.youtubeId !== currentVideo.youtubeId,
    )
    .map((video, index) => ({
      video,
      index,
      score: getRecommendationScore(video, currentVideo),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maxRecommendedVideos)
    .map(({ video }) => video)
}

function isRetryableWatchStatus(status?: number) {
  return status === undefined || status === 408 || status === 429 || status >= 500
}

function waitForWatchRetry(delayMs: number, signal: AbortSignal) {
  if (delayMs <= 0) {
    return Promise.resolve(!signal.aborted)
  }

  return new Promise<boolean>((resolve) => {
    if (signal.aborted) {
      resolve(false)
      return
    }

    const handleAbort = () => {
      window.clearTimeout(timer)
      resolve(false)
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort)
      resolve(true)
    }, delayMs)
    signal.addEventListener("abort", handleAbort, { once: true })
  })
}

async function fetchWatchVideoWithRetry(id: string, signal: AbortSignal) {
  let lastResponse: CloudWatchVideoResponse | null = null

  for (const delayMs of watchVideoRetryDelaysMs) {
    if (!(await waitForWatchRetry(delayMs, signal))) {
      return null
    }

    try {
      const response = await fetchCloudVideoById(id, signal)
      lastResponse = response
      if (response.video || !isRetryableWatchStatus(response.status)) {
        return response
      }
    } catch {
      if (signal.aborted) {
        return null
      }
    }
  }

  return lastResponse
}

function WatchLoadingState() {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050707] px-5 py-10 text-white"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(20,184,166,0.14),transparent_28%),radial-gradient(circle_at_50%_72%,rgba(249,115,22,0.08),transparent_24%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:44px_44px]"
      />

      <div className="relative flex w-full max-w-lg flex-col items-center text-center">
        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute inset-6 rounded-full bg-cyan-400/10 blur-3xl"
          />
          <img
            src="/vmap-loading.svg"
            width={237}
            height={237}
            alt=""
            aria-hidden="true"
            className="relative h-auto w-40 select-none drop-shadow-[0_18px_42px_rgba(34,211,238,0.12)] sm:w-48"
            draggable={false}
          />
        </div>

        <div className="relative -mt-1 h-20 w-[min(92vw,30rem)] overflow-hidden sm:h-24">
          <img
            src="/loading-text.svg"
            width={1920}
            height={1080}
            alt=""
            aria-hidden="true"
            className="absolute left-0 top-1/2 h-auto w-full -translate-y-1/2 select-none"
            draggable={false}
          />
        </div>

      </div>

      <span className="sr-only">Loading watch experience.</span>
    </main>
  )
}

function WatchUnavailableState({
  title,
  message,
  onRetry,
}: {
  title: string
  message: string
  onRetry?: () => void
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050707] px-5 py-10 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(20,184,166,0.1),transparent_30%)]"
      />
      <section className="relative w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center shadow-2xl backdrop-blur-sm sm:p-8">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-orange-400/20 bg-orange-400/10 text-lg text-orange-200">
          !
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-white/60">{message}</p>
        <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
          <a
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.045] px-4 text-sm font-medium text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            Back to home
          </a>
          {onRetry ? (
            <Button type="button" onClick={onRetry} className="h-10 bg-orange-600 text-white hover:bg-orange-500">
              Try again
            </Button>
          ) : null}
        </div>
      </section>
    </main>
  )
}

export function WatchPageClient({ id }: { id: string }) {
  const router = useRouter()
  const [videoState, setVideoState] = useState<WatchVideoState | null | undefined>(undefined)
  const [recommendedVideos, setRecommendedVideos] = useState<TravelVideo[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryCycle, setRetryCycle] = useState(0)

  useEffect(() => {
    const baseVideo = getTravelVideoByIdClient(id)
    let isMounted = true
    const abortController = new AbortController()
    setLoadError(null)
    setRecommendedVideos([])
    setVideoState(
      baseVideo
        ? {
            video: toHydratedTravelVideo(baseVideo),
            viewerCanEdit: false,
            editHref: null,
          }
        : undefined,
    )

    const resolveVideo = async () => {
      const publishedVideosPromise = fetchPublishedCloudVideos(abortController.signal).catch(
        () => null,
      )
      const cloudResponse = await fetchWatchVideoWithRetry(id, abortController.signal)
      if (!cloudResponse || abortController.signal.aborted) {
        return
      }

      const resolvedVideo = cloudResponse.video ?? baseVideo
      const viewerCanEdit = Boolean(cloudResponse.viewerCanEdit)
      const editHref = cloudResponse.editHref ?? null

      if (!resolvedVideo) {
        if (isMounted) {
          if (cloudResponse.status === 404) {
            setVideoState(null)
          } else {
            setLoadError(
              cloudResponse.error ||
                "We could not reach the video service. Check your connection and try again.",
            )
          }
        }
        return
      }

      if (cloudResponse.video && cloudResponse.video.id !== id) {
        router.replace(`/watch/${cloudResponse.video.id}`)
      }

      if (isMounted) {
        setVideoState({
          video: toHydratedTravelVideo(resolvedVideo),
          viewerCanEdit,
          editHref,
        })
      }

      void publishedVideosPromise.then((publishedResponse) => {
        if (isMounted && publishedResponse) {
          setRecommendedVideos(selectRecommendedVideos(publishedResponse.videos, resolvedVideo))
        }
      })

      const hydratedVideo = await hydrateTravelVideo(resolvedVideo)
      if (isMounted) {
        setVideoState({
          video: hydratedVideo,
          viewerCanEdit,
          editHref,
        })
      }
    }

    resolveVideo()

    return () => {
      isMounted = false
      abortController.abort()
    }
  }, [id, retryCycle, router])

  if (loadError) {
    return (
      <WatchUnavailableState
        title="The journey could not load"
        message={loadError}
        onRetry={() => {
          setVideoState(undefined)
          setRetryCycle((cycle) => cycle + 1)
        }}
      />
    )
  }

  if (videoState === undefined) {
    return <WatchLoadingState />
  }

  if (videoState === null) {
    return (
      <WatchUnavailableState
        title="Journey not found"
        message="This video is no longer available, or its watch link is incorrect."
      />
    )
  }

  return (
    <WatchExperience
      video={videoState.video}
      recommendedVideos={recommendedVideos}
      viewerCanEdit={videoState.viewerCanEdit}
      editHref={videoState.editHref}
    />
  )
}
