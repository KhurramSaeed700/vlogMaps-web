"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { Loader2 } from "lucide-react"
import { HomeHeader } from "@/components/home/home-header"
import {
  getSavedPreference,
  saveSelectedPreference,
  type PreferenceId,
} from "@/components/home/home-preferences"
import { PreferenceFilter } from "@/components/home/preference-filter"
import { HomeVideoGrid } from "@/components/home/video-grid"
import { isCreatorEmail } from "@/lib/creator-access"
import { createInstantWatchVideo, getPublishedTravelVideosClient } from "@/lib/creator-videos"
import { hydrateTravelVideos, toHydratedTravelVideo, type HydratedTravelVideo } from "@/lib/youtube-client"

export default function HomePage() {
  const router = useRouter()
  const { isLoaded, isSignedIn, user } = useUser()
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [selectedPreference, setSelectedPreference] = useState<PreferenceId>("all")
  const [catalogVideos, setCatalogVideos] = useState<HydratedTravelVideo[]>([])
  const [isCatalogLoading, setIsCatalogLoading] = useState(true)
  const [isHydratingCatalog, setIsHydratingCatalog] = useState(true)
  const [launcherError, setLauncherError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const savedPreference = getSavedPreference()
    if (savedPreference) {
      setSelectedPreference(savedPreference)
    }

    let baseVideos: ReturnType<typeof getPublishedTravelVideosClient>
    try {
      baseVideos = getPublishedTravelVideosClient()
    } catch {
      baseVideos = []
    }

    const fallbackVideos = baseVideos.map(toHydratedTravelVideo)
    const resolvedFallbackVideos = fallbackVideos.map((video) => ({ ...video, isMetadataLoading: false }))
    setCatalogVideos(fallbackVideos)
    setIsCatalogLoading(false)
    setIsHydratingCatalog(baseVideos.length > 0)

    let isMounted = true
    hydrateTravelVideos(baseVideos)
      .then((nextVideos) => {
        if (isMounted) {
          setCatalogVideos(nextVideos)
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

  const creatorCta = useMemo(() => {
    const email = user?.primaryEmailAddress?.emailAddress ?? null
    const isApprovedCreator = isCreatorEmail(email)

    return {
      href: isApprovedCreator ? "/creator/dashboard" : "/creator/apply",
      label: isApprovedCreator ? "Creator Dashboard" : "Become a creator",
    }
  }, [user])

  const homeLoadingMessage = useMemo(() => {
    if (isCatalogLoading) {
      return "Loading videos..."
    }

    if (isHydratingCatalog) {
      return "Refreshing video titles and details..."
    }

    return null
  }, [isCatalogLoading, isHydratingCatalog])

  const handleLaunch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLauncherError(null)

    try {
      const video = createInstantWatchVideo({
        youtubeUrl,
        preferredTag: selectedPreference === "all" ? undefined : selectedPreference,
      })

      const baseVideos = getPublishedTravelVideosClient()
      setCatalogVideos(baseVideos.map(toHydratedTravelVideo))
      setIsHydratingCatalog(true)
      hydrateTravelVideos(baseVideos)
        .then((nextVideos) => setCatalogVideos(nextVideos))
        .catch(() =>
          setCatalogVideos(
            baseVideos.map((baseVideo) => ({ ...toHydratedTravelVideo(baseVideo), isMetadataLoading: false })),
          ),
        )
        .finally(() => setIsHydratingCatalog(false))

      startTransition(() => {
        router.push(`/watch/${video.id}`)
      })
    } catch (error) {
      setLauncherError(error instanceof Error ? error.message : "Paste a valid YouTube link.")
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <HomeHeader
        creatorCta={creatorCta}
        isLoaded={isLoaded}
        isPending={isPending}
        isSignedIn={isSignedIn}
        launcherError={launcherError}
        youtubeUrl={youtubeUrl}
        onSubmit={handleLaunch}
        onYoutubeUrlChange={setYoutubeUrl}
      />

      <main className="mx-auto max-w-screen-2xl px-4 py-6">
        {homeLoadingMessage && (
          <div
            className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
            aria-live="polite"
          >
            <Loader2 className="h-4 w-4 animate-spin text-red-600" />
            <span>{homeLoadingMessage}</span>
          </div>
        )}

        <PreferenceFilter
          selectedPreference={selectedPreference}
          onPreferenceChange={(preference) => {
            setSelectedPreference(preference)
            saveSelectedPreference(preference)
          }}
        />

        <HomeVideoGrid isCatalogLoading={isCatalogLoading} videos={videos} />
      </main>
    </div>
  )
}
