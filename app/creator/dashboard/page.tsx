"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { RedirectToSignIn, UserButton, useUser } from "@clerk/nextjs"
import { BarChart3, CheckCircle2, Edit, Eye, MapPin, Plus, Search, Settings, Trash2, TrendingUp, UploadCloud, Youtube } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CreatorAccessGuard } from "@/components/creator/creator-access-guard"
import { TravelMapLogo } from "@/components/app-shell/travelmap-logo"
import { creatorProfile, formatCompactNumber, formatDuration, type TravelVideo } from "@/lib/demo-data"
import { clearCreatorPoints, loadCreatorPoints } from "@/lib/creator-points"
import {
  buildCreatorVideoStateSnapshot,
  deleteLocalCreatorVideo,
  getAllCreatorVideosClient,
  isLocalCreatorVideoId,
  mergeTravelVideos,
  withSyncedVideoState,
} from "@/lib/creator-videos"
import {
  deleteCreatorVideoFromCloud,
  fetchCreatorCloudVideos,
  uploadCreatorVideoToCloud,
} from "@/lib/creator-videos-cloud-client"

function CreatorDashboardContent() {
  const { user } = useUser()
  const [searchQuery, setSearchQuery] = useState("")
  const [allCreatorVideos, setAllCreatorVideos] = useState<TravelVideo[]>([])
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null)
  const [syncingVideoId, setSyncingVideoId] = useState<string | null>(null)
  const [cloudVideoIds, setCloudVideoIds] = useState<Set<string>>(() => new Set())
  const [cloudConfigured, setCloudConfigured] = useState<boolean | null>(null)
  const [syncMessage, setSyncMessage] = useState("")
  const [activeTab, setActiveTab] = useState("videos")

  useEffect(() => {
    const localVideos = getAllCreatorVideosClient()
    setAllCreatorVideos(localVideos)

    let isMounted = true
    fetchCreatorCloudVideos()
      .then((response) => {
        if (!isMounted) {
          return
        }

        setCloudConfigured(response.configured)
        setCloudVideoIds(new Set(response.videos.map((video) => video.id)))
        setAllCreatorVideos(mergeTravelVideos(localVideos, response.videos))
      })
      .catch(() => {
        if (isMounted) {
          setCloudConfigured(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

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

    const deletedLocalVideo = deleteLocalCreatorVideo(videoId)
    const shouldDeleteCloudVideo = cloudVideoIds.has(videoId)
    const cloudDeleteResponse = shouldDeleteCloudVideo ? await deleteCreatorVideoFromCloud(videoId) : null
    const deletedCloudVideo = Boolean(cloudDeleteResponse?.deleted)

    if (deletedLocalVideo || deletedCloudVideo) {
      clearCreatorPoints(videoId)
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

    setDeletingVideoId(null)
  }

  const creatorVideos = useMemo(
    () => allCreatorVideos.filter((video) => video.title.toLowerCase().includes(searchQuery.toLowerCase())),
    [allCreatorVideos, searchQuery],
  )

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
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <TravelMapLogo />

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open creator settings"
              className="h-9 w-9 rounded-lg"
              onClick={() => setActiveTab("settings")}
            >
              <Settings className="h-4 w-4" />
            </Button>
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Creator workspace
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Welcome back, {user?.firstName || "Creator"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Manage travel videos, map keyframes, publishing, and route performance.
              </p>
            </div>
          </div>

          <Link href="/creator/video/new">
            <Button className="h-10 rounded-lg bg-slate-950 px-4 text-white hover:bg-slate-800">
              <Plus className="mr-2 h-4 w-4" />
              Paste YouTube URL
            </Button>
          </Link>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Videos</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{stats.totalVideos}</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
                  <Youtube className="h-5 w-5" />
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Published</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{stats.publishedVideos}</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Views</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{formatCompactNumber(stats.totalViews)}</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                  <Eye className="h-5 w-5" />
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Map Views</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">{formatCompactNumber(stats.totalMapViews)}</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                  <MapPin className="h-5 w-5" />
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Engagement</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-emerald-700">{stats.avgEngagement}%</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <TrendingUp className="h-5 w-5" />
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
          <TabsList className="grid h-auto w-full grid-cols-3 rounded-lg border border-slate-200 bg-white p-1 shadow-sm sm:inline-grid sm:w-auto">
            <TabsTrigger value="videos" className="h-9 rounded-md px-2 text-sm data-[state=active]:bg-slate-950 data-[state=active]:text-white sm:px-4">
              My Videos
            </TabsTrigger>
            <TabsTrigger value="analytics" className="h-9 rounded-md px-2 text-sm data-[state=active]:bg-slate-950 data-[state=active]:text-white sm:px-4">
              Analytics
            </TabsTrigger>
            <TabsTrigger value="settings" className="h-9 rounded-md px-2 text-sm data-[state=active]:bg-slate-950 data-[state=active]:text-white sm:px-4">
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="videos" className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-950">Video Library</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Showing {creatorVideos.length} of {allCreatorVideos.length} videos.
                  </p>
                </div>
                <div className="relative w-full lg:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search videos"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-10 rounded-lg border-slate-200 bg-slate-50 pl-9 shadow-none focus-visible:bg-white"
                  />
                </div>
              </div>
            </div>

            {(syncMessage || cloudConfigured === false) && (
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                {syncMessage || "Cloud database is not configured yet. Add DATABASE_URL in Vercel to sync creator videos."}
              </div>
            )}

            <div>
              {creatorVideos.length === 0 ? (
                <Card className="border-slate-200 bg-white shadow-sm">
                  <CardContent className="p-10 text-center">
                    <p className="text-base font-medium text-slate-950">No creator videos yet</p>
                    <p className="mt-2 text-sm text-slate-500">
                      Paste a YouTube URL to create your first mapped video.
                    </p>
                    <Link href="/creator/video/new" className="mt-5 inline-flex">
                      <Button className="rounded-lg bg-slate-950 text-white hover:bg-slate-800">
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
                    const canDeleteVideo = isLocalCreatorVideoId(video.id) || isCloudVideo
                    const isSyncingThisVideo = syncingVideoId === video.id
                    const keyframeCount = loadCreatorPoints(video.id, video.keyframes).length

                    return (
                      <Card
                        key={video.id}
                        className="group flex h-full flex-col overflow-hidden border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md"
                      >
                        <div className="relative aspect-video w-full overflow-hidden bg-slate-200">
                          <Image
                            src={video.thumbnail || "/placeholder.svg"}
                            alt={video.title}
                            fill
                            sizes="(min-width: 1024px) 31vw, (min-width: 768px) 48vw, 100vw"
                            className="scale-110 object-cover object-center transition duration-300 group-hover:scale-[1.14]"
                          />
                          {isLiveVideo && (
                            <span className="absolute left-3 top-3 inline-flex h-7 items-center gap-1 rounded-md border border-emerald-200 bg-white/95 px-2 text-xs font-medium text-emerald-700 shadow-sm">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Published
                            </span>
                          )}
                          <div className="absolute right-3 top-3 rounded-md bg-black/75 px-2 py-1 text-xs font-medium text-white">
                            {formatDuration(video.durationSeconds)}
                          </div>
                        </div>

                        <CardContent className="flex flex-1 flex-col p-4">
                          <div className="min-w-0">
                            <h3 className="line-clamp-2 min-h-11 text-base font-semibold leading-snug text-slate-950">
                              {video.title}
                            </h3>
                            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                              <span className="truncate rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-600">
                                {video.youtubeId}
                              </span>
                              <span className="flex-shrink-0">{new Date(video.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm">
                            <div>
                              <p className="text-[11px] font-medium text-slate-500">Keyframes</p>
                              <p className="mt-0.5 font-semibold text-slate-950">{keyframeCount}</p>
                            </div>
                            <div>
                              <p className="text-[11px] font-medium text-slate-500">Views</p>
                              <p className="mt-0.5 font-semibold text-slate-950">{formatCompactNumber(video.views)}</p>
                            </div>
                            <div>
                              <p className="text-[11px] font-medium text-slate-500">Map Views</p>
                              <p className="mt-0.5 font-semibold text-slate-950">{formatCompactNumber(video.mapViews)}</p>
                            </div>
                          </div>

                          <div className="mt-auto flex items-center gap-2 pt-4">
                            {!isLiveVideo && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUploadVideo(video)}
                                disabled={Boolean(syncingVideoId) && !isSyncingThisVideo}
                                className="min-w-0 flex-1 rounded-lg border-slate-200 bg-white px-3"
                              >
                                <UploadCloud className="mr-1 h-4 w-4 flex-shrink-0" />
                                <span className="truncate">{isSyncingThisVideo ? "Uploading..." : "Upload"}</span>
                              </Button>
                            )}
                            <Link href={`/creator/video/${video.id}/edit`} className="inline-flex">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 rounded-lg border-slate-200 bg-white"
                                aria-label={`Edit ${video.title}`}
                                title="Edit"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Link href={`/watch/${video.id}`} className="inline-flex">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 rounded-lg border-slate-200 bg-white"
                                aria-label={`Preview ${video.title}`}
                                title="Preview"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 rounded-lg border-slate-200 bg-white text-red-600 hover:text-red-700"
                              onClick={() => handleDeleteVideo(video.id, video.title)}
                              disabled={!canDeleteVideo || deletingVideoId === video.id}
                              aria-label={`Delete ${video.title}`}
                              title={canDeleteVideo ? "Delete video" : "Upload this video before deleting its cloud copy"}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">Analytics</h2>
              <p className="mt-1 text-sm text-slate-600">
                Track video performance and map engagement with route-aware signals.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-slate-950">Views Over Time</CardTitle>
                  <CardDescription className="text-slate-500">
                    Video views compared with map interactions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm">
                      <BarChart3 className="h-6 w-6" />
                    </span>
                    <p className="mt-3 text-sm font-medium text-slate-700">Analytics events are ready for wiring.</p>
                    <p className="mt-1 max-w-xs text-xs text-slate-500">
                      Once view events are recorded, this panel can chart traffic across videos and maps.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-slate-950">Top Performing Videos</CardTitle>
                  <CardDescription className="text-slate-500">Ranked by map engagement</CardDescription>
                </CardHeader>
                <CardContent>
                  {allCreatorVideos.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                      Create a video first to see engagement rankings here.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {[...allCreatorVideos]
                        .sort((a, b) => b.mapViews - a.mapViews)
                        .map((video, index) => (
                          <div
                            key={video.id}
                            className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
                          >
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white text-sm font-semibold text-slate-700 shadow-sm">
                              {index + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-950">{video.title}</p>
                              <p className="text-xs text-slate-500">{formatCompactNumber(video.mapViews)} map views</p>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">Creator Settings</h2>
              <p className="mt-1 text-sm text-slate-600">
                Manage the creator profile details shown with your videos.
              </p>
            </div>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-950">Channel Information</CardTitle>
                <CardDescription className="text-slate-500">Verified channel details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="channelName" className="text-sm font-medium text-slate-700">
                      Channel Name
                    </Label>
                    <Input
                      id="channelName"
                      value={creatorProfile.name}
                      readOnly
                      className="h-10 rounded-lg border-slate-200 bg-slate-50 shadow-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="channelUrl" className="text-sm font-medium text-slate-700">
                      Channel URL
                    </Label>
                    <Input
                      id="channelUrl"
                      value={creatorProfile.channelUrl}
                      readOnly
                      className="h-10 rounded-lg border-slate-200 bg-slate-50 shadow-none"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio" className="text-sm font-medium text-slate-700">
                    Channel Description
                  </Label>
                  <Input
                    id="bio"
                    value={creatorProfile.description}
                    readOnly
                    className="h-10 rounded-lg border-slate-200 bg-slate-50 shadow-none"
                  />
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Creator profile edits are currently managed from the approved creator profile.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

export default function CreatorDashboardPage() {
  const { isLoaded, isSignedIn } = useUser()

  if (!isLoaded) {
    return <div className="p-8 text-sm text-gray-500">Loading creator workspace...</div>
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
