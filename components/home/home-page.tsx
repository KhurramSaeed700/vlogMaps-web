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
import { createInstantWatchVideo, getPublishedTravelVideosClient, mergeTravelVideos } from "@/lib/creator-videos"
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

export default function HomePage({ initialVideos = [] }: HomePageProps) {
  const router = useRouter()
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [selectedPreference, setSelectedPreference] = useState<PreferenceId>("all")
  const [catalogVideos, setCatalogVideos] = useState<HydratedTravelVideo[]>(() =>
    toResolvedFallbackVideos(initialVideos),
  )
  const [isCatalogLoading, setIsCatalogLoading] = useState(false)
  const [isHydratingCatalog, setIsHydratingCatalog] = useState(() => initialVideos.length > 0)
  const [launcherError, setLauncherError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const savedPreference = getSavedPreference()
    if (savedPreference) {
      setSelectedPreference(savedPreference)
    }

    let localVideos: ReturnType<typeof getPublishedTravelVideosClient>
    try {
      localVideos = getPublishedTravelVideosClient()
    } catch {
      localVideos = []
    }

    const resolvedFallbackVideos = toResolvedFallbackVideos(mergeTravelVideos(initialVideos, localVideos))
    setCatalogVideos(resolvedFallbackVideos)
    setIsCatalogLoading(false)
    setIsHydratingCatalog(resolvedFallbackVideos.length > 0)

    let isMounted = true
    fetchPublishedCloudVideos()
      .then((response) => {
        if (!isMounted) {
          return []
        }

        const baseVideos = mergeTravelVideos(initialVideos, localVideos, response.videos)
        const nextFallbackVideos = toResolvedFallbackVideos(baseVideos)
        setCatalogVideos(nextFallbackVideos)
        setIsHydratingCatalog(baseVideos.length > 0)
        return hydrateTravelVideosWithTimeout(baseVideos)
      })
      .then((nextVideos) => {
        if (isMounted) {
          setCatalogVideos(nextVideos.length > 0 ? nextVideos : resolvedFallbackVideos)
        }
      })
      .catch(() => {
        if (isMounted) {
          setCatalogVideos(resolvedFallbackVideos)
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
    return [...nextVideos].sort((a, b) => b.views - a.views)
  }, [catalogVideos, selectedPreference])

  const homeLoadingMessage = useMemo(() => {
    if (isCatalogLoading) {
      return "Loading videos..."
    }

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

      const baseVideos = mergeTravelVideos(catalogVideos, getPublishedTravelVideosClient())
      setCatalogVideos(toResolvedFallbackVideos(baseVideos))
      setIsHydratingCatalog(true)
      hydrateTravelVideosWithTimeout(baseVideos)
        .then((nextVideos) => setCatalogVideos(nextVideos))
        .catch(() => setCatalogVideos(toResolvedFallbackVideos(baseVideos)))
        .finally(() => setIsHydratingCatalog(false))

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
