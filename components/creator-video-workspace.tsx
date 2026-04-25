"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Link2, PlayCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createLocalCreatorVideo, getAllCreatorVideosClient } from "@/lib/creator-videos"
import { formatDuration, type TravelVideo } from "@/lib/demo-data"

export function CreatorVideoWorkspace() {
  const router = useRouter()
  const [videos, setVideos] = useState<TravelVideo[]>([])
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [message, setMessage] = useState("Paste a YouTube URL to start a new creator-mapped video.")
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    setVideos(getAllCreatorVideosClient())
  }, [])

  const orderedVideos = useMemo(
    () => [...videos].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [videos],
  )

  const handleCreateVideo = async () => {
    if (isCreating) {
      return
    }

    try {
      setIsCreating(true)
      setMessage("Fetching the video title and description from YouTube...")
      const video = await createLocalCreatorVideo({ youtubeUrl })
      setVideos(getAllCreatorVideosClient())
      setMessage("Video added. Opening the editor so you can start capturing timestamps.")
      router.push(`/creator/video/${video.id}/edit`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create a creator video from that URL.")
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <Link2 className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Paste a YouTube URL</h2>
        </div>

        <div className="space-y-2">
          <Label htmlFor="youtubeUrl">YouTube URL</Label>
          <Input
            id="youtubeUrl"
            value={youtubeUrl}
            onChange={(event) => setYoutubeUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
          />
          <p className="text-xs text-gray-500">
            The title and description will be pulled from YouTube automatically.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={handleCreateVideo} disabled={isCreating}>
            <PlayCircle className="mr-2 h-4 w-4" />
            {isCreating ? "Fetching Video Details..." : "Open Player and Start Mapping"}
          </Button>
          <p className="text-sm text-gray-500">{message}</p>
        </div>
      </div>

      {orderedVideos.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-slate-50 p-8 text-center">
          <h2 className="text-lg font-semibold text-gray-900">No creator videos yet</h2>
          <p className="mt-2 text-sm text-gray-500">
            The demo videos are gone. Paste a YouTube URL above to create your first mapped video.
          </p>
        </div>
      ) : (
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
      )}
    </div>
  )
}
