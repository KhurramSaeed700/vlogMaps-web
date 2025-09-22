"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MapPin, Plus, Edit, Trash2, Eye, BarChart3, Settings, Youtube, Heart, TrendingUp } from "lucide-react"
import Link from "next/link"
import { useUser, SignedIn, SignedOut, RedirectToSignIn, UserButton } from "@clerk/nextjs"

// Mock data for creator's videos
const creatorVideos = [
  {
    id: 1,
    title: "Epic Road Trip: New York to Los Angeles",
    youtubeId: "dQw4w9WgXcQ",
    status: "published",
    keyframes: 6,
    views: "125K",
    mapViews: "89K",
    likes: "3.2K",
    createdAt: "2024-01-15",
    thumbnail: "/placeholder.svg?height=120&width=200",
  },
  {
    id: 2,
    title: "Backpacking Through Europe: 30 Days",
    youtubeId: "dQw4w9WgXcQ",
    status: "draft",
    keyframes: 12,
    views: "0",
    mapViews: "0",
    likes: "0",
    createdAt: "2024-01-20",
    thumbnail: "/placeholder.svg?height=120&width=200",
  },
]

const stats = {
  totalVideos: 15,
  totalViews: "2.3M",
  totalMapViews: "1.8M",
  avgEngagement: "12.5%",
  monthlyGrowth: "+23%",
}

function CreatorDashboardContent() {
  const { user } = useUser()
  const [searchQuery, setSearchQuery] = useState("")

  const filteredVideos = creatorVideos.filter((video) => video.title.toLowerCase().includes(searchQuery.toLowerCase()))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2">
                <MapPin className="h-8 w-8 text-blue-600" />
                <span className="text-2xl font-bold text-gray-900">TravelMap</span>
              </Link>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                Creator Dashboard
              </Badge>
            </div>

            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Button variant="ghost">
                  <Eye className="h-4 w-4 mr-2" />
                  Viewer Mode
                </Button>
              </Link>
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome back, {user?.firstName || "Creator"}! 👋</h1>
          <p className="text-gray-600">Manage your travel videos and interactive maps from your creator dashboard.</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
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
                  <p className="text-2xl font-bold">{stats.totalViews}</p>
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
                  <p className="text-2xl font-bold">{stats.totalMapViews}</p>
                </div>
                <MapPin className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Engagement</p>
                  <p className="text-2xl font-bold">{stats.avgEngagement}</p>
                </div>
                <Heart className="h-8 w-8 text-pink-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Growth</p>
                  <p className="text-2xl font-bold text-green-600">{stats.monthlyGrowth}</p>
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
            {/* Videos Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">My Videos</h2>
                <p className="text-gray-600">Manage your travel videos and interactive maps</p>
              </div>
              <Link href="/creator/video/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Video
                </Button>
              </Link>
            </div>

            {/* Search */}
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Input
                  placeholder="Search your videos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Videos List */}
            <div className="space-y-4">
              {filteredVideos.map((video) => (
                <Card key={video.id} className="overflow-hidden">
                  <div className="flex">
                    <div className="w-48 flex-shrink-0">
                      <img
                        src={video.thumbnail || "/placeholder.svg"}
                        alt={video.title}
                        className="w-full h-32 object-cover"
                      />
                    </div>

                    <CardContent className="flex-1 p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold">{video.title}</h3>
                            <Badge
                              variant={video.status === "published" ? "default" : "secondary"}
                              className={video.status === "published" ? "bg-green-100 text-green-800" : ""}
                            >
                              {video.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">YouTube ID: {video.youtubeId}</p>
                          <p className="text-sm text-gray-500">
                            Created: {new Date(video.createdAt).toLocaleDateString()}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Link href={`/creator/video/${video.id}/edit`}>
                            <Button variant="outline" size="sm">
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                          </Link>
                          <Link href={`/watch/${video.id}`}>
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4 mr-1" />
                              Preview
                            </Button>
                          </Link>
                          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Keyframes</p>
                          <p className="font-medium">{video.keyframes}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Views</p>
                          <p className="font-medium">{video.views}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Map Views</p>
                          <p className="font-medium">{video.mapViews}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Likes</p>
                          <p className="font-medium">{video.likes}</p>
                        </div>
                      </div>
                    </CardContent>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Analytics</h2>
              <p className="text-gray-600">Track your video performance and engagement</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Views Over Time</CardTitle>
                  <CardDescription>Video views vs Map interactions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64 bg-gray-100 rounded-lg flex items-center justify-center">
                    <BarChart3 className="h-12 w-12 text-gray-400" />
                    <span className="ml-2 text-gray-500">Chart placeholder</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Performing Videos</CardTitle>
                  <CardDescription>Based on map engagement</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {creatorVideos.slice(0, 3).map((video, index) => (
                      <div key={video.id} className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{video.title}</p>
                          <p className="text-xs text-gray-500">{video.mapViews} map views</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Creator Settings</h2>
              <p className="text-gray-600">Manage your creator profile and preferences</p>
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
                      <Input id="channelName" value="AdventureSeeker" readOnly />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="channelUrl">Channel URL</Label>
                      <Input id="channelUrl" value="https://youtube.com/@adventureseeker" readOnly />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bio">Channel Description</Label>
                    <Input id="bio" placeholder="Tell viewers about your travel content..." />
                  </div>
                  <Button>Update Profile</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Notification Preferences</CardTitle>
                  <CardDescription>Choose how you want to be notified</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">New video views</p>
                      <p className="text-sm text-gray-500">Get notified when your videos get new views</p>
                    </div>
                    <Button variant="outline" size="sm">
                      Enable
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Map interactions</p>
                      <p className="text-sm text-gray-500">Get notified about map engagement</p>
                    </div>
                    <Button variant="outline" size="sm">
                      Enable
                    </Button>
                  </div>
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
  return (
    <>
      <SignedIn>
        <CreatorDashboardContent />
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  )
}
