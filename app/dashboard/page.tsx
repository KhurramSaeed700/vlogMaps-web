"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { RedirectToSignIn, UserButton, useUser } from "@clerk/nextjs"
import { Clock, Eye, Filter, Grid, Heart, List, MapPin, Play, Search, Settings, Share2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MapPreview } from "@/components/map-preview"
import { formatCompactNumber, formatDuration, travelVideos } from "@/lib/demo-data"

type TabKey = "all" | "trending" | "recent" | "favorites"

function DashboardContent() {
  const { user } = useUser()
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  const filteredByQuery = useMemo(() => {
    return travelVideos.filter(
      (video) =>
        video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        video.creator.toLowerCase().includes(searchQuery.toLowerCase()) ||
        video.locations.some((location) => location.toLowerCase().includes(searchQuery.toLowerCase())),
    )
  }, [searchQuery])

  const videosByTab = useMemo<Record<TabKey, typeof travelVideos>>(
    () => ({
      all: filteredByQuery,
      trending: [...filteredByQuery].sort((a, b) => b.views - a.views).slice(0, 2),
      recent: [...filteredByQuery].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
      favorites: filteredByQuery.filter((video) => video.id !== "3"),
    }),
    [filteredByQuery],
  )

  const renderVideoCard = (video: (typeof travelVideos)[number]) => (
    <Card key={video.id} className="overflow-hidden transition-shadow hover:shadow-lg">
      <div className="relative">
        <div className="mb-2 h-32">
          <MapPreview keyframes={video.keyframes} className="h-full w-full" />
        </div>
        <img src={video.thumbnail || "/placeholder.svg"} alt={video.title} className="h-16 w-full rounded object-cover" />
        <div className="absolute bottom-2 right-2 rounded bg-black/80 px-2 py-1 text-sm text-white">
          {formatDuration(video.durationSeconds)}
        </div>
        <Badge className="absolute left-2 top-2 bg-blue-600">
          <MapPin className="mr-1 h-3 w-3" />
          Interactive Map
        </Badge>
      </div>

      <CardContent className="p-4">
        <h3 className="mb-2 line-clamp-2 text-lg font-semibold">{video.title}</h3>
        <p className="mb-2 text-sm text-gray-600">by {video.creator}</p>
        <p className="mb-3 line-clamp-2 text-sm text-gray-500">{video.description}</p>

        <div className="mb-3 flex items-center justify-between text-sm text-gray-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <Eye className="h-4 w-4" />
              {formatCompactNumber(video.views)}
            </span>
            <span className="flex items-center gap-1">
              <Heart className="h-4 w-4" />
              {formatCompactNumber(video.likes)}
            </span>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-1">
          {video.locations.slice(0, 3).map((location) => (
            <Badge key={`${video.id}-${location}`} variant="secondary" className="text-xs">
              {location}
            </Badge>
          ))}
          {video.locations.length > 3 && (
            <Badge variant="secondary" className="text-xs">
              +{video.locations.length - 3} more
            </Badge>
          )}
        </div>

        <div className="flex gap-2">
          <Link href={`/watch/${video.id}`} className="flex-1">
            <Button className="w-full">
              <Play className="mr-2 h-4 w-4" />
              Watch
            </Button>
          </Link>
          <Button variant="outline" size="icon">
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  const renderVideoList = (video: (typeof travelVideos)[number]) => (
    <Card key={video.id} className="overflow-hidden transition-shadow hover:shadow-lg">
      <div className="flex">
        <div className="relative w-80 flex-shrink-0">
          <img src={video.thumbnail || "/placeholder.svg"} alt={video.title} className="h-32 w-full object-cover" />
          <div className="absolute bottom-2 right-2 rounded bg-black/80 px-2 py-1 text-sm text-white">
            {formatDuration(video.durationSeconds)}
          </div>
          <Badge className="absolute left-2 top-2 bg-blue-600">
            <MapPin className="mr-1 h-3 w-3" />
            Interactive Map
          </Badge>
        </div>

        <CardContent className="flex-1 p-4">
          <div className="mb-2 flex items-start justify-between">
            <h3 className="line-clamp-2 flex-1 text-lg font-semibold">{video.title}</h3>
            <div className="ml-4 flex gap-2">
              <Link href={`/watch/${video.id}`}>
                <Button>
                  <Play className="mr-2 h-4 w-4" />
                  Watch
                </Button>
              </Link>
              <Button variant="outline" size="icon">
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <p className="mb-2 text-sm text-gray-600">by {video.creator}</p>
          <p className="mb-3 line-clamp-2 text-sm text-gray-500">{video.description}</p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {formatCompactNumber(video.views)}
              </span>
              <span className="flex items-center gap-1">
                <Heart className="h-4 w-4" />
                {formatCompactNumber(video.likes)}
              </span>
            </div>

            <div className="flex flex-wrap gap-1">
              {video.locations.slice(0, 3).map((location) => (
                <Badge key={`${video.id}-${location}`} variant="secondary" className="text-xs">
                  {location}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </div>
    </Card>
  )

  const renderVideos = (tab: TabKey) => {
    const videos = videosByTab[tab]

    if (videos.length === 0) {
      return (
        <Card>
          <CardContent className="p-10 text-center text-sm text-gray-500">
            No videos matched your search yet. Try a creator name or location.
          </CardContent>
        </Card>
      )
    }

    if (viewMode === "grid") {
      return <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">{videos.map(renderVideoCard)}</div>
    }

    return <div className="space-y-4">{videos.map(renderVideoList)}</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-50 border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2">
              <MapPin className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">TravelMap</span>
            </Link>

            <div className="flex items-center gap-4">
              <div className="relative hidden md:block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search videos, creators, or locations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-80 pl-10"
                />
              </div>

              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>

              <UserButton afterSignOutUrl="/" />
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="mb-2 text-3xl font-bold text-gray-900">Welcome back, {user?.firstName || "Explorer"}!</h1>
            <p className="text-gray-600">Watch travel stories with interactive maps that follow the journey.</p>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm">
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>

            <div className="flex items-center rounded-lg border">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className="rounded-r-none"
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                className="rounded-l-none"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="mb-6 md:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search videos, creators, or locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Tabs defaultValue="all" className="mb-8">
          <TabsList>
            <TabsTrigger value="all">All Videos</TabsTrigger>
            <TabsTrigger value="trending">Trending</TabsTrigger>
            <TabsTrigger value="recent">Recent</TabsTrigger>
            <TabsTrigger value="favorites">Favorites</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-6">
            {renderVideos("all")}
          </TabsContent>
          <TabsContent value="trending" className="mt-6">
            {renderVideos("trending")}
          </TabsContent>
          <TabsContent value="recent" className="mt-6">
            {renderVideos("recent")}
          </TabsContent>
          <TabsContent value="favorites" className="mt-6">
            {renderVideos("favorites")}
          </TabsContent>
        </Tabs>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Get started with TravelMap</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Link href="/creator/apply">
                <Button variant="outline" className="h-20 w-full flex-col gap-2">
                  <MapPin className="h-6 w-6" />
                  <span>Become a Creator</span>
                </Button>
              </Link>
              <Button variant="outline" className="h-20 w-full flex-col gap-2">
                <Heart className="h-6 w-6" />
                <span>View Favorites</span>
              </Button>
              <Button variant="outline" className="h-20 w-full flex-col gap-2">
                <Clock className="h-6 w-6" />
                <span>Watch History</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { isLoaded, isSignedIn } = useUser()

  if (!isLoaded) {
    return <div className="p-8 text-sm text-gray-500">Loading dashboard...</div>
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />
  }

  return <DashboardContent />
}
