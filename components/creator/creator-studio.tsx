"use client"

import { type FormEvent, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { RedirectToSignIn, UserButton, useUser } from "@clerk/nextjs"
import { CheckCircle2, Eye, Globe, LayoutDashboard, ListVideo, MapPin, Plus, BookOpen, TrendingUp, Video, Youtube } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { CreatorAccessGuard } from "@/components/creator/creator-access-guard"
import { CreatorLoadingState } from "@/components/creator/creator-loading-state"
import { CreatorContentTable } from "@/components/creator/creator-content-table"
import { CreatorPlaylistCards, CreatorPlaylistDetail } from "@/components/creator/creator-playlists"
import { groupCreatorPlaylists } from "@/lib/creator-playlists"
import { playlistEditorHref } from "@/lib/playlist-mapping"
import { extractYouTubePlaylistId } from "@/lib/youtube-playlist"
import { TravelMapLogo } from "@/components/app-shell/travelmap-logo"
import { ThemeToggle } from "@/components/app-shell/theme-toggle"
import { formatCompactNumber, type TravelVideo } from "@/lib/demo-data"
import {
  buildCreatorVideoStateSnapshot,
  createLocalCreatorVideo,
  mergeTravelVideos,
  withSyncedVideoState,
} from "@/lib/creator-videos"
import {
  deleteCreatorVideoFromCloud,
  fetchCreatorCloudVideos,
  unpublishCreatorVideoFromCloud,
  uploadCreatorVideoToCloud,
  setCreatorVideoVisibilityInCloud,
} from "@/lib/creator-videos-cloud-client"
import { migrateLegacyCreatorStorageToDatabase } from "@/lib/legacy-creator-storage-migration"
import { normalizeVideoVisibility, videoVisibilityDescriptions, videoVisibilityLabels, type VideoVisibility } from "@/lib/video-visibility"


interface CreatorStudioProps { section?: "content" | "playlists"; playlistId?: string; initialView?: "overview" | "content" }

function CreatorDashboardContent({ section = "content", playlistId, initialView = "content" }: CreatorStudioProps) {
  const router = useRouter()
  const { user } = useUser()
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [allCreatorVideos, setAllCreatorVideos] = useState<TravelVideo[]>([])
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null)
  const [syncingVideoId, setSyncingVideoId] = useState<string | null>(null)
  const [visibilityUpdatingId, setVisibilityUpdatingId] = useState<string | null>(null)
  const [isCreatingVideo, setIsCreatingVideo] = useState(false)
  const [cloudVideoIds, setCloudVideoIds] = useState<Set<string>>(() => new Set())
  const [cloudConfigured, setCloudConfigured] = useState<boolean | null>(null)
  const [syncMessage, setSyncMessage] = useState("")
  const [isLoadingCreatorVideos, setIsLoadingCreatorVideos] = useState(true)
  const [dashboardView, setDashboardView] = useState<"overview" | "content">(initialView)

  useEffect(() => {
    if (!syncMessage) {
      return
    }

    toast(syncMessage)
    setSyncMessage("")
  }, [syncMessage])

  useEffect(() => {
    let isMounted = true

    const loadCreatorVideos = async () => {
      try {
        const response = await fetchCreatorCloudVideos()
        if (!isMounted) {
          return
        }

        setCloudConfigured(response.configured)
        setCloudVideoIds(new Set(response.videos.map((video) => video.id)))
        setAllCreatorVideos(response.videos)
        setIsLoadingCreatorVideos(false)
        setSyncMessage(
          response.error ??
            (response.configured ? "" : "Cloud database is not configured yet. Add DATABASE_URL in Vercel to sync creator videos."),
        )

        if (!response.configured || response.error) {
          return
        }

        const migration = await migrateLegacyCreatorStorageToDatabase()
        if (!isMounted || migration.attempted === 0) {
          return
        }

        if (migration.failed === 0 && migration.migrated > 0) {
          const refreshedResponse = await fetchCreatorCloudVideos()
          if (isMounted) {
            setCloudConfigured(refreshedResponse.configured)
            setCloudVideoIds(new Set(refreshedResponse.videos.map((video) => video.id)))
            setAllCreatorVideos(refreshedResponse.videos)
          }
        }
      } catch {
        if (isMounted) {
          setCloudConfigured(false)
          setIsLoadingCreatorVideos(false)
          setSyncMessage("Unable to load creator videos from the database.")
        }
      }
    }

    loadCreatorVideos()

    return () => {
      isMounted = false
    }
  }, [])

  const handleCreateVideo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isCreatingVideo) {
      return
    }

    if (extractYouTubePlaylistId(youtubeUrl)) {
      router.push(`/creator/video/new?${new URLSearchParams({ url: youtubeUrl })}`)
      return
    }
    if (section === "playlists") {
      setSyncMessage("Paste a YouTube playlist URL to import a playlist.")
      return
    }

    try {
      setIsCreatingVideo(true)
      setSyncMessage("Opening and syncing video...")

      const video = await createLocalCreatorVideo({ youtubeUrl })
      const state = buildCreatorVideoStateSnapshot(video)
      const uploadVideo = withSyncedVideoState(video, state, video.status)
      const uploadResponse = await uploadCreatorVideoToCloud(uploadVideo, state)

      if (!uploadResponse.configured) {
        setCloudConfigured(false)
        setSyncMessage("Database is not configured. Add DATABASE_URL, restart the app, and try again.")
        return
      }

      if (uploadResponse.error) {
        setSyncMessage(uploadResponse.error)
        return
      }

      if (!uploadResponse.saved || !uploadResponse.video) {
        setSyncMessage("Unable to save this video to the database.")
        return
      }

      const savedVideo = uploadResponse.video
      setCloudConfigured(true)
      setCloudVideoIds((currentIds) => new Set(currentIds).add(savedVideo.id))
      setAllCreatorVideos((currentVideos) => mergeTravelVideos(currentVideos, [savedVideo]))
      setYoutubeUrl("")
      router.push(`/creator/video/${savedVideo.id}/edit`)
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Unable to create a creator video from that URL.")
    } finally {
      setIsCreatingVideo(false)
    }
  }

  const handleUploadVideo = async (video: TravelVideo) => {
    if (syncingVideoId) {
      return
    }

    setSyncingVideoId(video.id)
    setSyncMessage("")

    try {
      const state = buildCreatorVideoStateSnapshot(video)
      const uploadVideo = withSyncedVideoState(video, state, "published")
      const response = await uploadCreatorVideoToCloud(uploadVideo, state, { publish: true })

      if (!response.configured) {
        setCloudConfigured(false)
        setSyncMessage("Cloud database is not configured yet. Add DATABASE_URL in Vercel, then upload again.")
        return
      }

      if (response.error) {
        setSyncMessage(response.error)
        return
      }

      if (!response.saved || !response.video) {
        setSyncMessage("Could not upload this edited video. Please try again.")
        return
      }

      const savedVideo = response.video
      setCloudConfigured(true)
      setCloudVideoIds((currentIds) => new Set(currentIds).add(savedVideo.id))
      setAllCreatorVideos((currentVideos) => mergeTravelVideos(currentVideos, [savedVideo]))
      setSyncMessage(`Uploaded "${savedVideo.title}" to the cloud.`)
    } finally {
      setSyncingVideoId(null)
    }
  }

  const handleDeleteVideo = async (videoId: string, videoTitle: string) => {
    const shouldDelete = window.confirm(`Delete "${videoTitle}" and all of its saved timestamp points?`)
    if (!shouldDelete) {
      return
    }

    setDeletingVideoId(videoId)
    setSyncMessage("")

    const shouldDeleteCloudVideo = cloudVideoIds.has(videoId)
    const cloudDeleteResponse = shouldDeleteCloudVideo ? await deleteCreatorVideoFromCloud(videoId) : null
    const deletedCloudVideo = Boolean(cloudDeleteResponse?.deleted)

    if (deletedCloudVideo) {
      setAllCreatorVideos((currentVideos) => currentVideos.filter((video) => video.id !== videoId))
      setCloudVideoIds((currentIds) => {
        const nextIds = new Set(currentIds)
        nextIds.delete(videoId)
        return nextIds
      })
    }

    if (shouldDeleteCloudVideo && cloudDeleteResponse && !cloudDeleteResponse.configured) {
      setCloudConfigured(false)
      setSyncMessage("Cloud database is not configured, so only the local copy was removed.")
    }

    if (cloudDeleteResponse?.error) {
      setSyncMessage(cloudDeleteResponse.error)
    }

    setDeletingVideoId(null)
  }

  const handleUnpublishVideo = async (videoId: string, videoTitle: string) => {
    if (syncingVideoId) {
      return
    }

    const shouldUnpublish = window.confirm(
      `Unpublish "${videoTitle}"? It will be removed from public pages but remain editable in your dashboard.`,
    )
    if (!shouldUnpublish) {
      return
    }

    setSyncingVideoId(videoId)
    setSyncMessage("")

    try {
      const response = await unpublishCreatorVideoFromCloud(videoId)

      if (!response.configured) {
        setCloudConfigured(false)
        setSyncMessage("Cloud database is not configured, so this video could not be unpublished.")
        return
      }

      if (response.error || !response.unpublished || !response.video) {
        setSyncMessage(response.error || "Could not unpublish this video. Please try again.")
        return
      }

      const unpublishedVideo = response.video
      setCloudConfigured(true)
      setAllCreatorVideos((currentVideos) => mergeTravelVideos(currentVideos, [unpublishedVideo]))
      setSyncMessage(`Unpublished "${unpublishedVideo.title}". It is now a private draft.`)
    } catch {
      setSyncMessage("Could not unpublish this video. Check your connection and try again.")
    } finally {
      setSyncingVideoId(null)
    }
  }

  const handleVisibilityChange = async (video: TravelVideo, visibility: VideoVisibility) => {
    if (visibilityUpdatingId || syncingVideoId || deletingVideoId || visibility === normalizeVideoVisibility(video.visibility)) return
    setVisibilityUpdatingId(video.id)
    try {
      const response = await setCreatorVideoVisibilityInCloud(video.id, visibility)
      if (!response.updated || !response.video) {
        setSyncMessage(response.error || "Could not update visibility. Please try again.")
        return
      }
      const savedVideo = response.video
      setAllCreatorVideos((currentVideos) => mergeTravelVideos(currentVideos, [savedVideo]))
      setSyncMessage(`"${video.title}" is now ${videoVisibilityLabels[visibility].toLowerCase()}. ${videoVisibilityDescriptions[visibility]}`)
    } catch {
      setSyncMessage("Could not update visibility. Check your connection and try again.")
    } finally {
      setVisibilityUpdatingId(null)
    }
  }

  const handleBulkEdit = async (videos: TravelVideo[], action: VideoVisibility | "draft") => {
    const savedIds: string[] = []
    let failed = 0
    for (const video of videos.filter(video => video.status === "published" && video.viewerCanEdit !== false)) {
      try {
        const response = action === "draft"
          ? await unpublishCreatorVideoFromCloud(video.id)
          : await setCreatorVideoVisibilityInCloud(video.id, action)
        if (!response.video || response.error || ("updated" in response ? !response.updated : !response.unpublished)) { failed++; continue }
        const savedVideo = response.video
        setAllCreatorVideos(current => mergeTravelVideos(current, [savedVideo]))
        savedIds.push(video.id)
      } catch { failed++ }
    }
    setSyncMessage(`${savedIds.length} video${savedIds.length === 1 ? "" : "s"} updated.${failed ? ` ${failed} failed; choose the action again to retry.` : ""}${videos.some(video => video.status !== "published") ? " Drafts were skipped." : ""}`)
    return savedIds
  }

  const stats = useMemo(() => {
    const totalViews = allCreatorVideos.reduce((sum, video) => sum + video.views, 0)
    const totalMapViews = allCreatorVideos.reduce((sum, video) => sum + video.mapViews, 0)
    const publishedVideos = allCreatorVideos.filter((video) => video.status === "published").length

    return {
      totalVideos: allCreatorVideos.length,
      publishedVideos,
      totalViews,
      totalMapViews,
      avgEngagement: totalViews === 0 ? 0 : Math.round((totalMapViews / totalViews) * 1000) / 10,
    }
  }, [allCreatorVideos])

  const { standalone, playlists } = useMemo(() => groupCreatorPlaylists(allCreatorVideos), [allCreatorVideos])
  const selectedPlaylist = playlists.find(playlist => playlist.id === playlistId)
  const tableProps = {
    loading: isLoadingCreatorVideos,
    pendingId: visibilityUpdatingId || syncingVideoId || deletingVideoId,
    onBulkEdit: handleBulkEdit,
    onEdit: (video: TravelVideo) => router.push(playlistId ? playlistEditorHref(video.id, playlistId) : `/creator/video/${video.id}/edit`),
    onVisibility: (video: TravelVideo, visibility: VideoVisibility) => { void handleVisibilityChange(video, visibility) },
    onUpload: (video: TravelVideo) => { void handleUploadVideo(video) },
    onUnpublish: (id: string, title: string) => { void handleUnpublishVideo(id, title) },
    onDelete: (id: string, title: string) => { void handleDeleteVideo(id, title) },
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 sm:px-6 sm:py-3">
          <TravelMapLogo className="gap-2" textClassName="hidden sm:inline" />

          <div className="flex items-center gap-3">
            <span className="h-9 shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-4 text-[11px] font-semibold uppercase leading-9 tracking-wide text-muted-foreground">
              Creator Dashboard
            </span>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-9 w-9",
                },
              }}
            />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-[61px] hidden w-56 flex-col border-r border-border bg-background px-3 py-6 lg:flex" aria-label="Creator navigation">
        <nav className="space-y-1">
          <Button variant="ghost" onClick={() => section === 'playlists' ? router.push('/creator/dashboard?view=overview') : setDashboardView('overview')} aria-pressed={section === 'content' && dashboardView === 'overview'} className={`h-11 w-full justify-start gap-3 ${section === 'content' && dashboardView === 'overview' ? 'bg-muted font-semibold' : 'text-muted-foreground'}`}><LayoutDashboard className="h-5 w-5" />Overview</Button>
          <Button variant="ghost" onClick={() => section === 'playlists' ? router.push('/creator/dashboard') : setDashboardView('content')} aria-pressed={section === 'content' && dashboardView === 'content'} className={`h-11 w-full justify-start gap-3 ${section === 'content' && dashboardView === 'content' ? 'bg-muted font-semibold' : 'text-muted-foreground'}`}><Video className="h-5 w-5" />Content</Button>
          <Button asChild variant="ghost" className={`h-11 w-full justify-start gap-3 ${section === 'playlists' ? 'bg-muted font-semibold' : 'text-muted-foreground'}`}><Link href="/creator/playlists" aria-current={section === 'playlists' ? 'page' : undefined}><ListVideo className="h-5 w-5" />Playlists</Link></Button>
          <Button asChild variant="ghost" className="h-11 w-full justify-start gap-3 text-muted-foreground"><Link href="/"><Globe className="h-5 w-5" />Explore TravelMap</Link></Button>
        </nav>
        <div className="mt-auto border-t border-border pt-4"><Button asChild variant="ghost" className="w-full justify-start gap-3 text-muted-foreground"><Link href="/creator/guidelines"><BookOpen className="h-4 w-4" />Creator guidelines</Link></Button></div>
      </aside>
      <main className="min-w-0 px-3 py-4 sm:px-6 sm:py-6 lg:ml-56 lg:px-8">
        <nav aria-label="Creator sections" className="mb-5 flex flex-wrap gap-2 lg:hidden">
          <Button size="sm" variant={section === 'content' && dashboardView === 'overview' ? 'secondary' : 'ghost'} onClick={() => section === 'playlists' ? router.push('/creator/dashboard?view=overview') : setDashboardView('overview')}>Overview</Button>
          <Button size="sm" variant={section === 'content' && dashboardView === 'content' ? 'secondary' : 'ghost'} onClick={() => section === 'playlists' ? router.push('/creator/dashboard') : setDashboardView('content')}>Content</Button>
          <Button asChild size="sm" variant={section === 'playlists' ? 'secondary' : 'ghost'}><Link href="/creator/playlists" aria-current={section === 'playlists' ? 'page' : undefined}>Playlists</Link></Button>
        </nav>
        <div className="mb-4 flex flex-col gap-3 sm:mb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {section === 'playlists' ? playlistId ? 'Playlist workspace' : 'Playlists' : dashboardView === 'overview' ? 'Creator overview' : 'Channel content'}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                {section === 'playlists' ? 'Keep each series together. Open a playlist to map its videos in order.' : `${standalone.length} standalone videos · ${playlists.length} ${playlists.length === 1 ? "playlist" : "playlists"}. Manage your travel stories and mapped journeys.`}
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateVideo} className="grid w-full gap-2 sm:grid-cols-[minmax(18rem,28rem)_auto] lg:w-auto">
            <div className="relative min-w-0">
              <Youtube className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="url"
                aria-label={section === "playlists" ? "YouTube playlist URL" : "YouTube video or playlist URL"}
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
                placeholder={section === "playlists" ? "Paste YouTube playlist URL" : "Paste YouTube URL"}
                disabled={isCreatingVideo}
                className="h-10 rounded-lg pl-9 shadow-none"
              />
            </div>
            <Button
              type="submit"
              disabled={isCreatingVideo || youtubeUrl.trim().length === 0}
              className="h-10 rounded-lg px-4"
            >
              <Plus className="mr-2 h-4 w-4" />
              {isCreatingVideo ? "Adding..." : section === "playlists" || extractYouTubePlaylistId(youtubeUrl) ? "Import playlist" : "Add Video"}
            </Button>
          </form>
        </div>

        {section === 'content' && dashboardView === 'overview' && (<div className="mb-4 grid grid-cols-2 gap-2 sm:mb-6 sm:gap-3 lg:grid-cols-5">
          <Card className="overflow-hidden border-border bg-card shadow-sm">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between gap-3 sm:items-start sm:gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground sm:text-xs">Videos</p>
                  {isLoadingCreatorVideos ? (
                    <Skeleton className="mt-2 h-9 w-12" />
                  ) : (
                    <p className="mt-1 text-2xl font-semibold tracking-tight sm:mt-2 sm:text-3xl">{stats.totalVideos}</p>
                  )}
                </div>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300 sm:h-10 sm:w-10">
                  <Youtube className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border bg-card shadow-sm">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between gap-3 sm:items-start sm:gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground sm:text-xs">Published</p>
                  {isLoadingCreatorVideos ? (
                    <Skeleton className="mt-2 h-9 w-12" />
                  ) : (
                    <p className="mt-1 text-2xl font-semibold tracking-tight sm:mt-2 sm:text-3xl">{stats.publishedVideos}</p>
                  )}
                </div>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300 sm:h-10 sm:w-10">
                  <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border bg-card shadow-sm">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between gap-3 sm:items-start sm:gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground sm:text-xs">Views</p>
                  {isLoadingCreatorVideos ? (
                    <Skeleton className="mt-2 h-9 w-20" />
                  ) : (
                    <p className="mt-1 text-2xl font-semibold tracking-tight sm:mt-2 sm:text-3xl">{formatCompactNumber(stats.totalViews)}</p>
                  )}
                </div>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300 sm:h-10 sm:w-10">
                  <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border bg-card shadow-sm">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between gap-3 sm:items-start sm:gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground sm:text-xs">Map Views</p>
                  {isLoadingCreatorVideos ? (
                    <Skeleton className="mt-2 h-9 w-20" />
                  ) : (
                    <p className="mt-1 text-2xl font-semibold tracking-tight sm:mt-2 sm:text-3xl">{formatCompactNumber(stats.totalMapViews)}</p>
                  )}
                </div>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300 sm:h-10 sm:w-10">
                  <MapPin className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-2 overflow-hidden border-border bg-card shadow-sm lg:col-span-1">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between gap-3 sm:items-start sm:gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase text-muted-foreground sm:text-xs">Engagement</p>
                  {isLoadingCreatorVideos ? (
                    <Skeleton className="mt-2 h-9 w-16" />
                  ) : (
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-300 sm:mt-2 sm:text-3xl">{stats.avgEngagement}%</p>
                  )}
                </div>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300 sm:h-10 sm:w-10">
                  <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
            </CardContent>
          </Card>
        </div>)}

        {section === 'playlists' ? playlistId ? (
          isLoadingCreatorVideos ? <div aria-label="Loading playlist workspace" className="space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-80 w-full" /></div>
            : selectedPlaylist ? <CreatorPlaylistDetail key={playlistId} playlist={selectedPlaylist} tableProps={tableProps} />
              : <div className="rounded-xl border border-border p-8 text-center"><h2 className="font-semibold">Playlist not found</h2><p className="mt-2 text-sm text-muted-foreground">This playlist has no imported videos in your library.</p><Button asChild className="mt-4"><Link href="/creator/playlists">Back to playlists</Link></Button></div>
        ) : <CreatorPlaylistCards playlists={playlists} loading={isLoadingCreatorVideos} /> : (
          <CreatorContentTable {...tableProps} videos={standalone} playlists={playlists} />
        )}
      </main>
    </div>
  )
}

export function CreatorStudio(props: CreatorStudioProps) {
  const { isLoaded, isSignedIn } = useUser()

  if (!isLoaded) {
    return <CreatorLoadingState title="Loading creator dashboard" />
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />
  }

  return (
    <CreatorAccessGuard>
      <CreatorDashboardContent {...props} />
    </CreatorAccessGuard>
  )
}
