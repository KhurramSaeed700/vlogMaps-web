"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MapPin, Play, Search, Filter, Grid, List, Clock, Eye, Heart, Share2, Settings } from "lucide-react"
import Link from "next/link"
import { MapPreview } from "@/components/map-preview"
import { UserButton, useUser, SignedIn } from "@clerk/nextjs"

// Mock data for travel videos
const travelVideos = [
  {
    id: 1,
    title: "Epic Road Trip: New York to Los Angeles",
    creator: "AdventureSeeker",
    thumbnail: "/placeholder.svg?height=200&width=300",
    duration: "45:32",
    views: "125K",
    likes: "3.2K",
    hasMap: true,
    locations: ["New York", "Chicago", "Denver", "Las Vegas", "Los Angeles"],
    description: "Join me on an incredible cross-country road trip adventure!",
    keyframes: [
      { lat: 40.7128, lng: -74.006, location: "New York City" },
      { lat: 41.8781, lng: -87.6298, location: "Chicago" },
      { lat: 39.7392, lng: -104.9903, location: "Denver" },
      { lat: 36.1699, lng: -115.1398, location: "Las Vegas" },
      { lat: 34.0522, lng: -118.2437, location: "Los Angeles" },
    ],
  },
  {
    id: 2,
    title: "Backpacking Through Europe: 30 Days, 15 Countries",
    creator: "EuroExplorer",
    thumbnail: "/placeholder.svg?height=200&width=300",
    duration: "1:12:45",
    views: "89K",
    likes: "2.8K",
    hasMap: true,
    locations: ["London", "Paris", "Berlin", "Prague", "Vienna"],
    description: "The ultimate European backpacking adventure with interactive maps!",
    keyframes: [
      { lat: 51.5074, lng: -0.1278, location: "London" },
      { lat: 48.8566, lng: 2.3522, location: "Paris" },
      { lat: 52.52, lng: 13.405, location: "Berlin" },
      { lat: 50.0755, lng: 14.4378, location: "Prague" },
      { lat: 48.2082, lng: 16.3738, location: "Vienna" },
    ],
  },
  {
    id: 3,
    title: "Island Hopping in Southeast Asia",
    creator: "TropicalNomad",
    thumbnail: "/placeholder.svg?height=200&width=300",
    duration: "38:21",
    views: "67K",
    likes: "1.9K",
    hasMap: true,
    locations: ["Bangkok", "Phuket", "Bali", "Manila", "Boracay"],
    description: "Discover paradise as we hop between tropical islands!",
    keyframes: [
      { lat: 13.7563, lng: 100.5018, location: "Bangkok" },
      { lat: 7.8804, lng: 98.3923, location: "Phuket" },
      { lat: -8.3405, lng: 115.092, location: "Bali" },
      { lat: 14.5995, lng: 120.9842, location: "Manila" },
      { lat: 11.9804, lng: 121.9189, location: "Boracay" },
    ],
  },
]

function DashboardContent() {
  const { user } = useUser()
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  const filteredVideos = travelVideos.filter(
    (video) =>
      video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      video.creator.toLowerCase().includes(searchQuery.toLowerCase()) ||
      video.locations.some((location) => location.toLowerCase().includes(searchQuery.toLowerCase())),
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <MapPin className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">TravelMap</span>
            </Link>

            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search videos, creators, or locations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-80"
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome back, {user?.firstName || "Explorer"}! 👋</h1>
            <p className="text-gray-600">Watch travel content with interactive maps that follow the journey</p>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>

            <div className="flex items-center border rounded-lg">
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

        <Tabs defaultValue="all" className="mb-8">
          <TabsList>
            <TabsTrigger value="all">All Videos</TabsTrigger>
            <TabsTrigger value="trending">Trending</TabsTrigger>
            <TabsTrigger value="recent">Recent</TabsTrigger>
            <TabsTrigger value="favorites">Favorites</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-6">
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredVideos.map((video) => (
                  <Card key={video.id} className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
                    <div className="relative">
                      <div className="h-32 mb-2">
                        <MapPreview keyframes={video.keyframes} className="w-full h-full" />
                      </div>
                      <img
                        src={video.thumbnail || "/placeholder.svg"}
                        alt={video.title}
                        className="w-full h-16 object-cover rounded"
                      />
                      <div className="absolute bottom-2 right-2 bg-black/80 text-white px-2 py-1 rounded text-sm">
                        {video.duration}
                      </div>
                      {video.hasMap && (
                        <Badge className="absolute top-2 left-2 bg-blue-600">
                          <MapPin className="h-3 w-3 mr-1" />
                          Interactive Map
                        </Badge>
                      )}
                    </div>

                    <CardContent className="p-4">
                      <h3 className="font-semibold text-lg mb-2 line-clamp-2">{video.title}</h3>
                      <p className="text-sm text-gray-600 mb-2">by {video.creator}</p>
                      <p className="text-sm text-gray-500 mb-3 line-clamp-2">{video.description}</p>

                      <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Eye className="h-4 w-4" />
                            {video.views}
                          </span>
                          <span className="flex items-center gap-1">
                            <Heart className="h-4 w-4" />
                            {video.likes}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1 mb-4">
                        {video.locations.slice(0, 3).map((location, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
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
                            <Play className="h-4 w-4 mr-2" />
                            Watch
                          </Button>
                        </Link>
                        <Button variant="outline" size="icon">
                          <Share2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredVideos.map((video) => (
                  <Card key={video.id} className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer">
                    <div className="flex">
                      <div className="relative w-80 flex-shrink-0">
                        <img
                          src={video.thumbnail || "/placeholder.svg"}
                          alt={video.title}
                          className="w-full h-32 object-cover"
                        />
                        <div className="absolute bottom-2 right-2 bg-black/80 text-white px-2 py-1 rounded text-sm">
                          {video.duration}
                        </div>
                        {video.hasMap && (
                          <Badge className="absolute top-2 left-2 bg-blue-600">
                            <MapPin className="h-3 w-3 mr-1" />
                            Interactive Map
                          </Badge>
                        )}
                      </div>

                      <CardContent className="flex-1 p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-lg line-clamp-2 flex-1">{video.title}</h3>
                          <div className="flex gap-2 ml-4">
                            <Link href={`/watch/${video.id}`}>
                              <Button>
                                <Play className="h-4 w-4 mr-2" />
                                Watch
                              </Button>
                            </Link>
                            <Button variant="outline" size="icon">
                              <Share2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <p className="text-sm text-gray-600 mb-2">by {video.creator}</p>

                        <p className="text-sm text-gray-500 mb-3 line-clamp-2">{video.description}</p>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <Eye className="h-4 w-4" />
                              {video.views}
                            </span>
                            <span className="flex items-center gap-1">
                              <Heart className="h-4 w-4" />
                              {video.likes}
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {video.locations.slice(0, 3).map((location, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {location}
                              </Badge>
                            ))}
                            {video.locations.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{video.locations.length - 3} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Quick Actions */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Get started with TravelMap</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link href="/creator/apply">
                <Button variant="outline" className="w-full h-20 flex-col gap-2">
                  <MapPin className="h-6 w-6" />
                  <span>Become a Creator</span>
                </Button>
              </Link>
              <Button variant="outline" className="w-full h-20 flex-col gap-2">
                <Heart className="h-6 w-6" />
                <span>View Favorites</span>
              </Button>
              <Button variant="outline" className="w-full h-20 flex-col gap-2">
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
  return (
    <SignedIn>
      <DashboardContent />
    </SignedIn>
  )
}
