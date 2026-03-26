"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Space_Grotesk } from "next/font/google"
import { UserButton, useUser } from "@clerk/nextjs"
import {
  ArrowRight,
  Building2,
  Compass,
  MapPin,
  Mountain,
  Play,
  Search,
  Sparkles,
  UserRoundPen,
  UtensilsCrossed,
  Waves,
} from "lucide-react"
import { MapPreview } from "@/components/map-preview"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { createInstantWatchVideo } from "@/lib/creator-videos"
import { formatCompactNumber, formatDuration, getPublishedTravelVideos, type TravelVideo } from "@/lib/demo-data"

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
})

const preferenceStorageKey = "travelmap:home-preference"

const preferenceOptions = [
  { id: "all", label: "For You", icon: Compass },
  { id: "road-trips", label: "Road Trips", icon: MapPin },
  { id: "cities", label: "Cities", icon: Building2 },
  { id: "beaches", label: "Beaches", icon: Waves },
  { id: "mountains", label: "Mountains", icon: Mountain },
  { id: "food", label: "Food Trails", icon: UtensilsCrossed },
] as const

type PreferenceId = (typeof preferenceOptions)[number]["id"]

function DiscoveryCard({ video, featured = false }: { video: TravelVideo; featured?: boolean }) {
  return (
    <Link href={`/watch/${video.id}`} className="group block">
      <Card className="overflow-hidden border-white/10 bg-slate-950/80 text-white shadow-[0_30px_90px_-40px_rgba(15,23,42,1)] transition duration-300 hover:-translate-y-1 hover:border-cyan-300/40">
        <div className={`grid gap-0 ${featured ? "lg:grid-cols-[1.15fr_0.85fr]" : ""}`}>
          <div className="relative">
            <img
              src={video.thumbnail || "/placeholder.svg"}
              alt={video.title}
              className={`w-full object-cover ${featured ? "h-full min-h-[260px]" : "aspect-video"}`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/15 to-transparent" />
            <div className="absolute left-4 top-4 flex flex-wrap gap-2">
              <Badge className="border-0 bg-cyan-400 text-slate-950">Watch Now</Badge>
              <Badge variant="secondary" className="border-0 bg-white/15 text-white">
                {formatDuration(video.durationSeconds)}
              </Badge>
            </div>
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">{video.creator}</p>
                <p className="text-sm text-white/70">{video.locations.slice(0, 2).join(" to ")}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur">
                <Play className="h-4 w-4 fill-white text-white" />
              </div>
            </div>
          </div>

          <CardContent className={`${featured ? "p-6" : "p-5"} flex flex-col justify-between gap-5`}>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-white/45">
                <span>{video.tags?.[0] ?? "Travel"}</span>
                <span className="h-1 w-1 rounded-full bg-white/25" />
                <span>{formatCompactNumber(video.views)} views</span>
              </div>
              <h3 className={`${featured ? "text-2xl" : "text-lg"} font-semibold leading-tight`}>{video.title}</h3>
              <p className="text-sm leading-6 text-white/65">{video.description}</p>
            </div>

            <div className="space-y-4">
              <div className={`${featured ? "h-40" : "h-32"} overflow-hidden rounded-2xl border border-white/10`}>
                <MapPreview keyframes={video.keyframes} className="h-full w-full" />
              </div>
              <div className="flex items-center justify-between text-sm text-white/70">
                <span>{video.locations.length} stops</span>
                <span className="inline-flex items-center gap-2 text-cyan-200">
                  Open experience
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </span>
              </div>
            </div>
          </CardContent>
        </div>
      </Card>
    </Link>
  )
}

export default function HomePage() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [selectedPreference, setSelectedPreference] = useState<PreferenceId>("all")
  const [launcherError, setLauncherError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const savedPreference = window.localStorage.getItem(preferenceStorageKey) as PreferenceId | null
    if (!savedPreference) {
      return
    }

    if (preferenceOptions.some((option) => option.id === savedPreference)) {
      setSelectedPreference(savedPreference)
    }
  }, [])

  const publishedVideos = useMemo(() => getPublishedTravelVideos(), [])

  const discoveryVideos = useMemo(() => {
    const filtered =
      selectedPreference === "all"
        ? publishedVideos
        : publishedVideos.filter((video) => video.tags?.includes(selectedPreference))

    const nextVideos = filtered.length > 0 ? filtered : publishedVideos
    return [...nextVideos].sort((a, b) => b.views - a.views)
  }, [publishedVideos, selectedPreference])

  const leadVideo = discoveryVideos[0]
  const supportingVideos = discoveryVideos.slice(1, 3)
  const gridVideos = discoveryVideos.slice(0, 6)

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
      setLauncherError(error instanceof Error ? error.message : "Paste a valid YouTube link to continue.")
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(251,191,36,0.16),_transparent_24%),linear-gradient(180deg,_#020617_0%,_#0f172a_38%,_#eef6ff_38%,_#f8fafc_100%)] text-slate-900">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-300">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <p className={`${headingFont.className} text-lg font-semibold text-white`}>TravelMap</p>
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">Watch the route move</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/creator/apply">
              <Button variant="ghost" className="hidden text-white hover:bg-white/10 hover:text-white sm:inline-flex">
                <UserRoundPen className="mr-2 h-4 w-4" />
                Become a creator
              </Button>
            </Link>
            {!isLoaded || !isSignedIn ? (
              <>
                <Link href="/auth/login">
                  <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
                    Sign In
                  </Button>
                </Link>
                <Link href="/auth/register">
                  <Button className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">Get Started</Button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/dashboard">
                  <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
                    Dashboard
                  </Button>
                </Link>
                <UserButton
                  afterSignOutUrl="/"
                  appearance={{
                    elements: {
                      avatarBox: "h-9 w-9",
                    },
                  }}
                />
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden px-4 pb-20 pt-12 sm:px-6 lg:px-8 lg:pb-28 lg:pt-16">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-8">
              <div className="space-y-5">
                <Badge className="border-0 bg-cyan-400/15 px-4 py-2 text-cyan-200">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Paste a YouTube link and jump straight into the map
                </Badge>

                <div className="space-y-5">
                  <h1 className={`${headingFont.className} max-w-3xl text-5xl font-bold leading-[0.95] text-white sm:text-6xl lg:text-7xl`}>
                    Make your first impression feel like pressing play.
                  </h1>
                  <p className="max-w-2xl text-lg leading-8 text-slate-200/80">
                    Drop in any YouTube URL and TravelMap opens it instantly in split-screen mode with a live route on the
                    right. Then keep scrolling to discover journeys tuned to your travel vibe.
                  </p>
                </div>
              </div>

              <Card className="border-white/10 bg-white/95 shadow-[0_35px_120px_-50px_rgba(8,15,33,1)]">
                <CardContent className="space-y-5 p-5 sm:p-6">
                  <div className="space-y-2">
                    <p className={`${headingFont.className} text-2xl font-semibold text-slate-950`}>Launch your own video</p>
                    <p className="text-sm leading-6 text-slate-600">
                      Paste a YouTube link, hit Enter, and we will open a ready-to-watch map experience right away.
                    </p>
                  </div>

                  <form onSubmit={handleLaunch} className="space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Input
                        value={youtubeUrl}
                        onChange={(event) => setYoutubeUrl(event.target.value)}
                        placeholder="Paste https://www.youtube.com/watch?v=... or youtu.be/..."
                        className="h-14 rounded-2xl border-slate-200 bg-white px-5 text-base shadow-sm"
                      />
                      <Button
                        type="submit"
                        disabled={isPending}
                        className="h-14 rounded-2xl bg-slate-950 px-6 text-white hover:bg-slate-800"
                      >
                        <Search className="mr-2 h-4 w-4" />
                        {isPending ? "Opening..." : "Watch with map"}
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="text-slate-500">Route style:</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                        {preferenceOptions.find((option) => option.id === selectedPreference)?.label ?? "For You"}
                      </span>
                      <span className="text-slate-400">The map opens on the right side in real time.</span>
                    </div>
                  </form>

                  {launcherError && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      {launcherError}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="border-white/10 bg-white/10 text-white backdrop-blur">
                  <CardContent className="p-5">
                    <p className="text-sm text-white/60">Instant launch</p>
                    <p className={`${headingFont.className} mt-2 text-3xl font-semibold`}>1 paste</p>
                    <p className="mt-2 text-sm text-white/70">Jump from copied YouTube URL to split-screen playback.</p>
                  </CardContent>
                </Card>
                <Card className="border-white/10 bg-white/10 text-white backdrop-blur">
                  <CardContent className="p-5">
                    <p className="text-sm text-white/60">Discovery</p>
                    <p className={`${headingFont.className} mt-2 text-3xl font-semibold`}>{gridVideos.length} picks</p>
                    <p className="mt-2 text-sm text-white/70">Creator videos filtered by your current travel preference.</p>
                  </CardContent>
                </Card>
                <Card className="border-white/10 bg-white/10 text-white backdrop-blur">
                  <CardContent className="p-5">
                    <p className="text-sm text-white/60">Map sync</p>
                    <p className={`${headingFont.className} mt-2 text-3xl font-semibold`}>Live</p>
                    <p className="mt-2 text-sm text-white/70">Smooth route movement follows the video instead of static pins.</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-rows-[auto_auto]">
              {leadVideo ? <DiscoveryCard video={leadVideo} featured /> : null}
              <div className="grid gap-6 md:grid-cols-2">
                {supportingVideos.map((video) => (
                  <DiscoveryCard key={video.id} video={video} />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <p className="text-sm uppercase tracking-[0.32em] text-slate-500">Discovery feed</p>
                <h2 className={`${headingFont.className} text-4xl font-bold text-slate-950 sm:text-5xl`}>
                  Videos matched to what you want to feel next.
                </h2>
                <p className="max-w-3xl text-base leading-7 text-slate-600">
                  Switch the preference and the homepage instantly reshapes around that style of trip, while keeping the
                  focus on creators and watchable videos.
                </p>
              </div>
            </div>

            <div className="mb-8 flex flex-wrap gap-3">
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

            <div className="grid gap-6 lg:grid-cols-3">
              {gridVideos.map((video) => (
                <Link key={video.id} href={`/watch/${video.id}`} className="group block">
                  <Card className="h-full overflow-hidden border-slate-200 bg-white shadow-[0_24px_70px_-50px_rgba(15,23,42,0.8)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_34px_80px_-45px_rgba(8,15,33,0.55)]">
                    <div className="relative">
                      <img src={video.thumbnail || "/placeholder.svg"} alt={video.title} className="aspect-video w-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
                      <div className="absolute bottom-4 left-4 flex items-center gap-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur">
                          <Play className="h-4 w-4 fill-white text-white" />
                        </div>
                        <div className="text-white">
                          <p className="text-sm font-medium">{video.creator}</p>
                          <p className="text-xs text-white/75">{formatCompactNumber(video.views)} views</p>
                        </div>
                      </div>
                    </div>

                    <CardContent className="space-y-4 p-5">
                      <div>
                        <div className="mb-3 flex flex-wrap gap-2">
                          {(video.tags ?? []).slice(0, 2).map((tag) => (
                            <Badge key={`${video.id}-${tag}`} variant="secondary" className="border-0 bg-slate-100 text-slate-700">
                              {tag.replace("-", " ")}
                            </Badge>
                          ))}
                        </div>
                        <h3 className="text-xl font-semibold leading-tight text-slate-950">{video.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{video.description}</p>
                      </div>

                      <div className="h-36 overflow-hidden rounded-2xl border border-slate-200">
                        <MapPreview keyframes={video.keyframes} className="h-full w-full" />
                      </div>

                      <div className="flex items-center justify-between text-sm text-slate-500">
                        <span>{formatDuration(video.durationSeconds)}</span>
                        <span className="inline-flex items-center gap-2 text-slate-900">
                          Watch journey
                          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <footer className="border-t border-slate-200 bg-white/80 px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className={`${headingFont.className} text-2xl font-semibold text-slate-950`}>TravelMap</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Discover travel videos, launch your own pasted YouTube link, and follow the route in real time.
              </p>
            </div>
            <div className="flex flex-wrap gap-5 text-sm text-slate-500">
              <Link href="/privacy" className="transition hover:text-slate-950">
                Privacy
              </Link>
              <Link href="/terms" className="transition hover:text-slate-950">
                Terms
              </Link>
              <Link href="/contact" className="transition hover:text-slate-950">
                Contact
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}
