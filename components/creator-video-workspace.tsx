"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Link2, PlayCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createLocalCreatorVideo, getAllCreatorVideosClient } from "@/lib/creator-videos"
import { formatDuration, type TravelVideo } from "@/lib/demo-data"

export function CreatorVideoWorkspace() {
  const router = useRouter()
  const [videos, setVideos] = useState<TravelVideo[]>([])
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [message, setMessage] = useState("Paste a YouTube URL to start a new creator-mapped video.")

  useEffect(() => {
    setVideos(getAllCreatorVideosClient())
  }, [])

  const orderedVideos = useMemo(
    () => [...videos].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [videos],
  )

  const handleCreateVideo = () => {
    try {
      const video = createLocalCreatorVideo({ youtubeUrl, title, description })
      setVideos(getAllCreatorVideosClient())
      setMessage("Video added. Opening the editor so you can start capturing timestamps.")
      router.push(`/creator/video/${video.id}/edit`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create a creator video from that URL.")
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <Link2 className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Paste a YouTube URL</h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="youtubeUrl">YouTube URL</Label>
              <Input
                id="youtubeUrl"
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="videoTitle">Optional title</Label>
              <Input
                id="videoTitle"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Give the trip a friendly working title"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="videoDescription">Optional description</Label>
            <Textarea
              id="videoDescription"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Short summary for the creator dashboard"
              rows={5}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={handleCreateVideo}>
            <PlayCircle className="mr-2 h-4 w-4" />
            Open Player and Start Mapping
          </Button>
          <p className="text-sm text-gray-500">{message}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {orderedVideos.map((video) => (
          <div key={video.id} className="rounded-2xl border p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-semibold text-gray-900">{video.title}</h2>
              <Badge variant="secondary">{video.status}</Badge>
            </div>
            <p className="mb-4 text-sm text-gray-600">{video.description}</p>
            <p className="mb-4 text-xs text-gray-500">{formatDuration(video.durationSeconds)} total runtime</p>
            <div className="flex gap-2">
              <Link href={`/creator/video/${video.id}/edit`}>
                <Button>Open Editor</Button>
              </Link>
              <Link href={`/watch/${video.id}`}>
                <Button variant="outline">Preview</Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
