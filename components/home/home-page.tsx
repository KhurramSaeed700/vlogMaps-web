"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { HomeHeader } from "@/components/home/home-header"
import {
  getSavedPreference,
  saveSelectedPreference,
  type PreferenceId,
} from "@/components/home/home-preferences"
import { HomeVideoGrid } from "@/components/home/video-grid"
import { fetchPublishedCloudVideos } from "@/lib/creator-videos-cloud-client"
import { createInstantWatchVideo } from "@/lib/creator-videos"
import type { TravelVideo } from "@/lib/demo-data"
import { hydrateTravelVideos, toHydratedTravelVideo, type HydratedTravelVideo } from "@/lib/youtube-client"

const catalogHydrationTimeoutMs = 9000

interface HomePageProps {
  initialVideos?: TravelVideo[]
}

function toResolvedFallbackVideos(videos: TravelVideo[]) {
  return videos.map((video) => ({ ...toHydratedTravelVideo(video), isMetadataLoading: false }))
}

async function hydrateTravelVideosWithTimeout(videos: TravelVideo[]) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      hydrateTravelVideos(videos),
      new Promise<HydratedTravelVideo[]>((resolve) => {
        timeoutId = setTimeout(() => resolve(toResolvedFallbackVideos(videos)), catalogHydrationTimeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

function getVideoDedupeKey(video: TravelVideo) {
  return video.youtubeId.trim().toLowerCase() || video.id
}

function dedupeVideosByYouTubeId<T extends TravelVideo>(videos: T[]) {
  const seenVideoKeys = new Set<string>()

  return videos.filter((video) => {
    const videoKey = getVideoDedupeKey(video)

    if (seenVideoKeys.has(videoKey)) {
      return false
    }

    seenVideoKeys.add(videoKey)
    return true
  })
}

export default function HomePage({ initialVideos = [] }: HomePageProps) {
  const router = useRouter()
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [selectedPreference, setSelectedPreference] = useState<PreferenceId>("all")
  const [catalogVideos, setCatalogVideos] = useState<HydratedTravelVideo[]>([])
  const [isCatalogLoading, setIsCatalogLoading] = useState(true)
  const [isHydratingCatalog, setIsHydratingCatalog] = useState(false)
  const [launcherError, setLauncherError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const savedPreference = getSavedPreference()
    if (savedPreference) {
      setSelectedPreference(savedPreference)
    }

    let isMounted = true
    setCatalogVideos([])
    setIsCatalogLoading(true)
    setIsHydratingCatalog(false)

    fetchPublishedCloudVideos()
      .then((response) => {
        if (!isMounted) {
          return []
        }

        const baseVideos = response.videos
        const nextFallbackVideos = toResolvedFallbackVideos(baseVideos)
        setCatalogVideos(nextFallbackVideos)
        setIsCatalogLoading(false)
        setIsHydratingCatalog(baseVideos.length > 0)
        return hydrateTravelVideosWithTimeout(baseVideos)
      })
      .then((nextVideos) => {
        if (isMounted) {
          setCatalogVideos(nextVideos)
        }
      })
      .catch(() => {
        if (isMounted) {
          setCatalogVideos([])
          setIsCatalogLoading(false)
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsHydratingCatalog(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  const videos = useMemo(() => {
    const filtered =
      selectedPreference === "all"
        ? catalogVideos
        : catalogVideos.filter((video) => video.tags?.includes(selectedPreference))

    const nextVideos = filtered.length > 0 ? filtered : catalogVideos
    return dedupeVideosByYouTubeId(nextVideos).sort((a, b) => b.views - a.views)
  }, [catalogVideos, selectedPreference])

  const homeLoadingMessage = useMemo(() => {
    if (isHydratingCatalog && videos.length === 0) {
      return "Refreshing video titles and details..."
    }

    return null
  }, [isCatalogLoading, isHydratingCatalog, videos.length])

  const handleLaunch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLauncherError(null)

    try {
      const video = createInstantWatchVideo({
        youtubeUrl,
        preferredTag: selectedPreference === "all" ? undefined : selectedPreference,
      })

      startTransition(() => {
        router.push(`/watch/${video.id}`)
      })
    } catch (error) {
      setLauncherError(error instanceof Error ? error.message : "Paste a valid YouTube link.")
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <HomeHeader
        isPending={isPending}
        launcherError={launcherError}
        selectedPreference={selectedPreference}
        youtubeUrl={youtubeUrl}
        onPreferenceChange={(preference) => {
          setSelectedPreference(preference)
          saveSelectedPreference(preference)
        }}
        onSubmit={handleLaunch}
        onYoutubeUrlChange={setYoutubeUrl}
      />

      <main className="mx-auto max-w-screen-2xl px-4 py-6">
        {homeLoadingMessage && (
          <div
            className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <Loader2 className="h-4 w-4 animate-spin text-red-600" />
            <span>{homeLoadingMessage}</span>
          </div>
        )}

        <HomeVideoGrid isCatalogLoading={isCatalogLoading} videos={videos} />
      </main>
    </div>
  )
}
