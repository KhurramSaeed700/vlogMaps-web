"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { UserButton, useUser } from "@clerk/nextjs"
import { Building2, Compass, Loader2, MapPin, Mountain, Search, UtensilsCrossed, Waves } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { isCreatorEmail } from "@/lib/creator-access"
import { createInstantWatchVideo, getPublishedTravelVideosClient } from "@/lib/creator-videos"
import { formatCompactNumber, formatDuration } from "@/lib/demo-data"
import { hydrateTravelVideos, toHydratedTravelVideo, type HydratedTravelVideo } from "@/lib/youtube-client"

const preferenceStorageKey = "travelmap:home-preference"

const preferenceOptions = [
  { id: "all", label: "All", icon: Compass },
  { id: "road-trips", label: "Road Trips", icon: MapPin },
  { id: "cities", label: "Cities", icon: Building2 },
  { id: "beaches", label: "Beaches", icon: Waves },
  { id: "mountains", label: "Mountains", icon: Mountain },
  { id: "food", label: "Food", icon: UtensilsCrossed },
] as const

type PreferenceId = (typeof preferenceOptions)[number]["id"]
const homeSkeletonCardCount = 10

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
    const savedPreference = window.localStorage.getItem(preferenceStorageKey) as PreferenceId | null
    if (savedPreference && preferenceOptions.some((option) => option.id === savedPreference)) {
      setSelectedPreference(savedPreference)
    }

    const baseVideos = getPublishedTravelVideosClient()
    setCatalogVideos(baseVideos.map(toHydratedTravelVideo))
    setIsCatalogLoading(false)
    setIsHydratingCatalog(true)

    let isMounted = true
    hydrateTravelVideos(baseVideos)
      .then((nextVideos) => {
        if (isMounted) {
          setCatalogVideos(nextVideos)
        }
      })
      .catch(() => {
        if (isMounted) {
          setCatalogVideos(baseVideos.map(toHydratedTravelVideo))
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
    if (!isLoaded) {
      return "Loading your home screen..."
    }

    if (isCatalogLoading) {
      return "Loading videos..."
    }

    if (isHydratingCatalog) {
      return "Refreshing video titles and details..."
    }

    return null
  }, [isCatalogLoading, isHydratingCatalog, isLoaded])

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
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-screen-2xl items-center gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 whitespace-nowrap">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white">
              <MapPin className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold">TravelMap</span>
          </Link>

          <form onSubmit={handleLaunch} className="mx-auto flex w-full max-w-2xl items-center">
            <Input
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              placeholder="Paste YouTube video link"
              className="h-11 rounded-l-full rounded-r-none border-slate-300 bg-white px-4 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <Button
              type="submit"
              size="icon"
              disabled={isPending}
              className="h-11 w-14 rounded-l-none rounded-r-full border border-l-0 border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              <Search className="h-4 w-4" />
            </Button>
          </form>

          <div className="flex items-center gap-2">
            <Link href={creatorCta.href} className="hidden md:block">
              <Button variant="outline" className="rounded-full">
                {creatorCta.label}
              </Button>
            </Link>

            {!isLoaded || !isSignedIn ? (
              <>
                <Link href="/auth/login" className="hidden sm:block">
                  <Button variant="ghost" className="rounded-full">
                    Sign In
                  </Button>
                </Link>
              </>
            ) : (
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: "h-9 w-9",
                  },
                }}
              />
            )}
          </div>
        </div>

        {launcherError && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
            {launcherError}
          </div>
        )}
      </header>

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

        <div className="mb-6 flex flex-wrap gap-2">
          {preferenceOptions.map((option) => {
            const Icon = option.icon

            return (
              <Button
                key={option.id}
                type="button"
                variant={selectedPreference === option.id ? "default" : "outline"}
                className={
                  selectedPreference === option.id
                    ? "rounded-full bg-slate-950 text-white hover:bg-slate-800"
                    : "rounded-full border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }
                onClick={() => {
                  setSelectedPreference(option.id)
                  window.localStorage.setItem(preferenceStorageKey, option.id)
                }}
              >
                <Icon className="mr-2 h-4 w-4" />
                {option.label}
              </Button>
            )
          })}
        </div>

        <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {isCatalogLoading &&
            Array.from({ length: homeSkeletonCardCount }, (_, index) => (
              <div key={`home-skeleton-${index}`} className="space-y-3">
                <div className="relative overflow-hidden rounded-2xl bg-slate-100">
                  <Skeleton className="aspect-video w-full rounded-2xl" />
                  <div className="absolute left-3 top-3">
                    <Skeleton className="h-6 w-16 rounded-full bg-slate-300/80" />
                  </div>
                  <div className="absolute bottom-3 right-3">
                    <Skeleton className="h-6 w-14 rounded-md bg-slate-300/80" />
                  </div>
                </div>

                <div className="space-y-2 px-1">
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              </div>
            ))}

          {videos.map((video) => (
            <Link key={video.id} href={`/watch/${video.id}`} className="group block">
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-2xl bg-slate-100">
                  <img
                    src={video.thumbnail || "/placeholder.svg"}
                    alt={video.title}
                    className="aspect-video w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  />
                  <div className="absolute left-3 top-3">
                    <Badge className="border-0 bg-black/75 text-white">Live map</Badge>
                  </div>
                  <div className="absolute bottom-3 right-3 rounded bg-black/80 px-2 py-1 text-xs text-white">
                    {formatDuration(video.durationSeconds)}
                  </div>
                </div>

                <div className="space-y-1 px-1">
                  {video.isMetadataLoading ? (
                    <>
                      <Skeleton className="h-4 w-11/12" />
                      <Skeleton className="h-4 w-2/5" />
                      <Skeleton className="h-4 w-3/5" />
                    </>
                  ) : (
                    <>
                      <h2 className="line-clamp-2 text-[15px] font-semibold leading-5 text-slate-950">{video.title}</h2>
                      <p className="text-sm text-slate-600">{video.creator}</p>
                      <p className="text-sm text-slate-500">
                        {video.hasLiveViewCount ? `${formatCompactNumber(video.views)} views - ` : ""}
                        {video.locations[0] ?? "Route pending"}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
