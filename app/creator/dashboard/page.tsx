"use client"

import { type FormEvent, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { RedirectToSignIn, UserButton, useUser } from "@clerk/nextjs"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { CheckCircle2, CloudOff, Edit, Eye, MapPin, MoreHorizontal, Plus, Trash2, TrendingUp, UploadCloud, Youtube } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { CreatorAccessGuard } from "@/components/creator/creator-access-guard"
import { TravelMapLogo } from "@/components/app-shell/travelmap-logo"
import { ThemeToggle } from "@/components/app-shell/theme-toggle"
import { formatCompactNumber, formatDuration, type TravelVideo } from "@/lib/demo-data"
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
} from "@/lib/creator-videos-cloud-client"
import { migrateLegacyCreatorStorageToDatabase } from "@/lib/legacy-creator-storage-migration"

const creatorDashboardSkeletonCardCount = 3

function CreatorVideoGridSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
      aria-hidden="true"
    >
      {Array.from({ length: creatorDashboardSkeletonCardCount }, (_, index) => (
        <Card
          key={`creator-video-skeleton-${index}`}
          className="flex h-full flex-col overflow-hidden border-border bg-card shadow-sm"
        >
          <Skeleton className="aspect-video w-full rounded-none bg-muted" />
          <CardContent className="flex flex-1 flex-col p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2 py-1">
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-3/5" />
              </div>
              <Skeleton className="h-7 w-20 shrink-0" />
            </div>

            <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-muted px-3 py-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-1 w-1 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>

            <div className="mt-auto flex items-center gap-2 pt-3">
              <Skeleton className="h-10 flex-1 rounded-lg" />
              <Skeleton className="h-10 flex-1 rounded-lg" />
              <Skeleton className="h-10 w-10 rounded-lg" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function CreatorDashboardContent() {
  const router = useRouter()
  const { user } = useUser()
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [allCreatorVideos, setAllCreatorVideos] = useState<TravelVideo[]>([])
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null)
  const [syncingVideoId, setSyncingVideoId] = useState<string | null>(null)
  const [isCreatingVideo, setIsCreatingVideo] = useState(false)
  const [cloudVideoIds, setCloudVideoIds] = useState<Set<string>>(() => new Set())
  const [cloudConfigured, setCloudConfigured] = useState<boolean | null>(null)
  const [syncMessage, setSyncMessage] = useState("")
  const [isLoadingCreatorVideos, setIsLoadingCreatorVideos] = useState(true)

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

  const creatorVideos = allCreatorVideos

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-2 px-3 py-2.5 sm:px-6 sm:py-3 lg:px-8">
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

      <main className="mx-auto max-w-screen-2xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="mb-4 flex flex-col gap-3 sm:mb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Welcome back, {user?.firstName || "Creator"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Manage travel videos, map keyframes, publishing, and route performance.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateVideo} className="grid w-full gap-2 sm:grid-cols-[minmax(18rem,28rem)_auto] lg:w-auto">
            <div className="relative min-w-0">
              <Youtube className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="url"
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
                placeholder="Paste YouTube URL"
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
              {isCreatingVideo ? "Adding..." : "Add Video"}
            </Button>
          </form>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:mb-6 sm:gap-3 lg:grid-cols-5">
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
        </div>

        <section aria-busy={isLoadingCreatorVideos} aria-label="Creator videos">
          <div>
            {isLoadingCreatorVideos ? (
              <>
                <p className="sr-only" role="status">Loading creator videos</p>
                <CreatorVideoGridSkeleton />
              </>
            ) : creatorVideos.length === 0 ? (
              <Card className="border-border bg-card shadow-sm">
                <CardContent className="p-10 text-center">
                  <p className="text-base font-medium text-foreground">No creator videos yet</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Paste a YouTube URL to create your first mapped video.
                  </p>
                  <Link href="/creator/video/new" className="mt-5 inline-flex">
                    <Button className="rounded-lg">
                      <Plus className="mr-2 h-4 w-4" />
                      Paste YouTube URL
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {creatorVideos.map((video) => {
                  const isCloudVideo = cloudVideoIds.has(video.id)
                  const isLiveVideo = video.status === "published"
                  const canEditVideo = video.viewerCanEdit !== false
                  const canDeleteVideo = isCloudVideo && canEditVideo
                  const isSyncingThisVideo = syncingVideoId === video.id
                  const keyframeCount = video.keyframes.length

                  return (
                    <Card
                      key={video.id}
                      className="group flex h-full flex-col overflow-hidden border-border bg-card shadow-sm transition hover:border-muted-foreground/40 hover:shadow-md"
                    >
                      <div className="relative aspect-video w-full overflow-hidden bg-muted">
                        <Image
                          src={video.thumbnail || "/placeholder.svg"}
                          alt={video.title}
                          fill
                          sizes="(min-width: 1024px) 31vw, (min-width: 768px) 48vw, 100vw"
                          className="scale-110 object-cover object-center transition duration-300 group-hover:scale-[1.14]"
                        />
                        {isLiveVideo && (
                            <span className="absolute left-3 top-3 inline-flex h-7 items-center gap-1 rounded-md border border-emerald-200 bg-white/95 px-2 text-xs font-medium text-emerald-700 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/90 dark:text-emerald-200">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Published
                          </span>
                        )}
                        <div className="absolute right-3 top-3 rounded-md bg-black/75 px-2 py-1 text-xs font-medium text-white">
                          {formatDuration(video.durationSeconds)}
                        </div>
                      </div>

                      <CardContent className="flex flex-1 flex-col p-3">
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="line-clamp-2 text-base font-semibold leading-snug text-foreground">
                              {video.title}
                            </h3>
                            <span className="flex-shrink-0 rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                              {new Date(video.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                          <span className="text-muted-foreground">
                            Keyframes <span className="font-semibold text-foreground">{keyframeCount}</span>
                          </span>
                          <span className="h-1 w-1 rounded-full bg-muted-foreground/40" aria-hidden="true" />
                          <span className="text-muted-foreground">
                            Views <span className="font-semibold text-foreground">{formatCompactNumber(video.views)}</span>
                          </span>
                        </div>

                        <div className="mt-auto flex items-center gap-2 pt-3">
                          {!isLiveVideo && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUploadVideo(video)}
                              disabled={Boolean(syncingVideoId) && !isSyncingThisVideo}
                              className="h-10 flex-none rounded-lg px-3"
                              title="Upload edited video"
                            >
                              <UploadCloud className="h-4 w-4 flex-shrink-0 sm:mr-1" />
                              <span className="hidden sm:inline">{isSyncingThisVideo ? "Uploading" : "Upload"}</span>
                            </Button>
                          )}
                          {canEditVideo && (
                            <Link href={`/creator/video/${video.id}/edit`} className="min-w-0 flex-1">
                              <Button variant="outline" size="sm" className="h-10 w-full rounded-lg">
                                <Edit className="mr-1 h-4 w-4" />
                                Edit
                              </Button>
                            </Link>
                          )}
                          <Link href={`/watch/${video.id}`} className="min-w-0 flex-1">
                            <Button variant="outline" size="sm" className="h-10 w-full rounded-lg">
                              <Eye className="mr-1 h-4 w-4" />
                              Preview
                            </Button>
                          </Link>
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-10 w-10 flex-none rounded-lg"
                                aria-label={`Open options for ${video.title}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content
                                align="end"
                                sideOffset={8}
                                className="z-50 w-44 rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
                              >
                                {canEditVideo && (
                                  <DropdownMenu.Item asChild>
                                    <Link
                                      href={`/creator/video/${video.id}/edit`}
                                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-popover-foreground outline-none hover:bg-accent focus:bg-accent"
                                    >
                                      <Edit className="h-4 w-4" />
                                      Quick edit
                                    </Link>
                                  </DropdownMenu.Item>
                                )}
                                {isLiveVideo && canEditVideo && (
                                  <DropdownMenu.Item
                                    disabled={Boolean(syncingVideoId)}
                                    onSelect={() => {
                                      void handleUnpublishVideo(video.id, video.title)
                                    }}
                                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-popover-foreground outline-none hover:bg-accent focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                                  >
                                    <CloudOff className="h-4 w-4" />
                                    {isSyncingThisVideo ? "Unpublishing..." : "Unpublish"}
                                  </DropdownMenu.Item>
                                )}
                                <DropdownMenu.Item
                                  disabled={!canDeleteVideo || deletingVideoId === video.id}
                                  onSelect={() => {
                                    handleDeleteVideo(video.id, video.title)
                                  }}
                                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-red-600 outline-none hover:bg-red-50 focus:bg-red-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 dark:text-red-300 dark:hover:bg-red-950/40 dark:focus:bg-red-950/40"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default function CreatorDashboardPage() {
  const { isLoaded, isSignedIn } = useUser()

  if (!isLoaded) {
    return <div className="p-8 text-sm text-muted-foreground">Loading creator workspace...</div>
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />
  }

  return (
    <CreatorAccessGuard>
      <CreatorDashboardContent />
    </CreatorAccessGuard>
  )
}
