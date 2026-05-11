"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { RedirectToSignIn, UserButton, useUser } from "@clerk/nextjs"
import { BarChart3, Edit, Eye, Heart, MapPin, Plus, Settings, Trash2, TrendingUp, Youtube } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CreatorAccessGuard } from "@/components/creator/creator-access-guard"
import { TravelMapLogo } from "@/components/app-shell/travelmap-logo"
import { creatorProfile, formatCompactNumber, formatDuration, type TravelVideo } from "@/lib/demo-data"
import { clearCreatorPoints, loadCreatorPoints } from "@/lib/creator-points"
import { deleteLocalCreatorVideo, getAllCreatorVideosClient, isLocalCreatorVideoId } from "@/lib/creator-videos"

function CreatorDashboardContent() {
  const { user } = useUser()
  const [searchQuery, setSearchQuery] = useState("")
  const [allCreatorVideos, setAllCreatorVideos] = useState<TravelVideo[]>([])
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null)

  useEffect(() => {
    setAllCreatorVideos(getAllCreatorVideosClient())
  }, [])

  const handleDeleteVideo = (videoId: string, videoTitle: string) => {
    const shouldDelete = window.confirm(`Delete "${videoTitle}" and all of its saved timestamp points?`)
    if (!shouldDelete) {
      return
    }

    setDeletingVideoId(videoId)

    const deleted = deleteLocalCreatorVideo(videoId)
    if (deleted) {
      clearCreatorPoints(videoId)
      setAllCreatorVideos((currentVideos) => currentVideos.filter((video) => video.id !== videoId))
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
    const totalLikes = allCreatorVideos.reduce((sum, video) => sum + video.likes, 0)

    return {
      totalVideos: allCreatorVideos.length,
      totalViews,
      totalMapViews,
      totalLikes,
      avgEngagement: totalViews === 0 ? 0 : Math.round((totalLikes / totalViews) * 1000) / 10,
    }
  }, [allCreatorVideos])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <TravelMapLogo />
            </div>

            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" aria-label="Open creator settings">
                <Settings className="h-5 w-5" />
              </Button>
              <UserButton />
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">Welcome back, {user?.firstName || "Creator"}!</h1>
          <p className="text-gray-600">Manage your travel videos, map keyframes, and creator profile from one place.</p>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Videos</p>
                  <p className="text-2xl font-bold">{stats.totalVideos}</p>
                </div>
                <Youtube className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Views</p>
                  <p className="text-2xl font-bold">{formatCompactNumber(stats.totalViews)}</p>
                </div>
                <Eye className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Map Views</p>
                  <p className="text-2xl font-bold">{formatCompactNumber(stats.totalMapViews)}</p>
                </div>
                <MapPin className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Likes</p>
                  <p className="text-2xl font-bold">{formatCompactNumber(stats.totalLikes)}</p>
                </div>
                <Heart className="h-8 w-8 text-pink-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Engagement</p>
                  <p className="text-2xl font-bold text-green-600">{stats.avgEngagement}%</p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="videos" className="space-y-6">
          <TabsList>
            <TabsTrigger value="videos">My Videos</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="videos" className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">My Videos</h2>
                <p className="text-gray-600">Manage your travel videos and interactive maps</p>
              </div>
              <Link href="/creator/video/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Paste YouTube URL
                </Button>
              </Link>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Input
                  placeholder="Search your videos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-4">
              {creatorVideos.length === 0 ? (
                <Card>
                  <CardContent className="p-10 text-center">
                    <p className="text-base font-medium text-gray-900">No creator videos yet</p>
                    <p className="mt-2 text-sm text-gray-500">
                      Paste a YouTube URL to create your first mapped video.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                creatorVideos.map((video) => {
                  const canDeleteVideo = isLocalCreatorVideoId(video.id)

                  return (
                    <Card key={video.id} className="overflow-hidden">
                      <div className="flex flex-col sm:flex-row">
                        <div className="relative h-40 w-full flex-shrink-0 bg-gray-100 sm:h-32 sm:w-48">
                          <Image
                            src={video.thumbnail || "/placeholder.svg"}
                            alt={video.title}
                            fill
                            sizes="(min-width: 640px) 12rem, 100vw"
                            className="object-cover"
                          />
                        </div>

                        <CardContent className="flex-1 p-6">
                          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="flex-1">
                              <div className="mb-2 flex items-center gap-2">
                                <h3 className="text-lg font-semibold">{video.title}</h3>
                              </div>
                              <p className="mb-2 text-sm text-gray-600">YouTube ID: {video.youtubeId}</p>
                              <p className="text-sm text-gray-500">
                                Created: {new Date(video.createdAt).toLocaleDateString()} - {formatDuration(video.durationSeconds)}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <Link href={`/creator/video/${video.id}/edit`}>
                                <Button variant="outline" size="sm">
                                  <Edit className="mr-1 h-4 w-4" />
                                  Edit
                                </Button>
                              </Link>
                              <Link href={`/watch/${video.id}`}>
                                <Button variant="outline" size="sm">
                                  <Eye className="mr-1 h-4 w-4" />
                                  Preview
                                </Button>
                              </Link>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => handleDeleteVideo(video.id, video.title)}
                                disabled={!canDeleteVideo || deletingVideoId === video.id}
                                aria-label={`Delete ${video.title}`}
                                title={canDeleteVideo ? "Delete video" : "Featured creator videos cannot be deleted locally"}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                            <div>
                              <p className="text-gray-500">Keyframes</p>
                              <p className="font-medium">{loadCreatorPoints(video.id, video.keyframes).length}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Views</p>
                              <p className="font-medium">{formatCompactNumber(video.views)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Map Views</p>
                              <p className="font-medium">{formatCompactNumber(video.mapViews)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Likes</p>
                              <p className="font-medium">{formatCompactNumber(video.likes)}</p>
                            </div>
                          </div>
                        </CardContent>
                      </div>
                    </Card>
                  )
                })
              )}
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <div>
              <h2 className="mb-2 text-2xl font-bold text-gray-900">Analytics</h2>
              <p className="text-gray-600">Track video performance and map engagement with route-aware signals.</p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Views Over Time</CardTitle>
                  <CardDescription>Video views compared with map interactions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex h-64 items-center justify-center rounded-lg bg-gray-100">
                    <BarChart3 className="h-12 w-12 text-gray-400" />
                    <span className="ml-2 text-gray-500">Connect real analytics next</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Performing Videos</CardTitle>
                  <CardDescription>Based on map engagement</CardDescription>
                </CardHeader>
                <CardContent>
                  {allCreatorVideos.length === 0 ? (
                    <p className="text-sm text-gray-500">Create a video first to see engagement rankings here.</p>
                  ) : (
                    <div className="space-y-4">
                      {[...allCreatorVideos]
                        .sort((a, b) => b.mapViews - a.mapViews)
                        .map((video, index) => (
                          <div key={video.id} className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600">
                              {index + 1}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium">{video.title}</p>
                              <p className="text-xs text-gray-500">{formatCompactNumber(video.mapViews)} map views</p>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div>
              <h2 className="mb-2 text-2xl font-bold text-gray-900">Creator Settings</h2>
              <p className="text-gray-600">Manage your creator profile and the information shown with your videos.</p>
            </div>

            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Channel Information</CardTitle>
                  <CardDescription>Update your verified channel details</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="channelName">Channel Name</Label>
                      <Input id="channelName" value={creatorProfile.name} readOnly />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="channelUrl">Channel URL</Label>
                      <Input id="channelUrl" value={creatorProfile.channelUrl} readOnly />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bio">Channel Description</Label>
                    <Input id="bio" value={creatorProfile.description} readOnly />
                  </div>
                  <Button>Update Profile</Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
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
