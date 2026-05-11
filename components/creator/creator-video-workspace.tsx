"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Clock3, ExternalLink, PlayCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { uploadCreatorVideoToCloud, fetchCreatorCloudVideos } from "@/lib/creator-videos-cloud-client"
import {
  buildCreatorVideoStateSnapshot,
  createLocalCreatorVideo,
  getAllCreatorVideosClient,
  mergeTravelVideos,
  updateLocalCreatorVideo,
  withSyncedVideoState,
} from "@/lib/creator-videos"
import { formatDuration, type TravelVideo } from "@/lib/demo-data"
import { resolveYouTubeDuration } from "@/lib/youtube-duration-client"

export function CreatorVideoWorkspace() {
  const router = useRouter()
  const isMountedRef = useRef(false)
  const resolvingDurationsRef = useRef(new Set<string>())
  const [videos, setVideos] = useState<TravelVideo[]>([])
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [message, setMessage] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    isMountedRef.current = true
    const localVideos = getAllCreatorVideosClient()
    setVideos(localVideos)

    fetchCreatorCloudVideos()
      .then((response) => {
        if (isMountedRef.current) {
          setVideos(mergeTravelVideos(localVideos, response.videos))
        }
      })
      .catch(() => undefined)

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const videosMissingDuration = videos.filter(
      (video) => video.youtubeId && video.durationSeconds <= 0 && !resolvingDurationsRef.current.has(video.id),
    )

    videosMissingDuration.forEach((video) => {
      resolvingDurationsRef.current.add(video.id)
      resolveYouTubeDuration(video.youtubeId)
        .then((duration) => {
          if (!isMountedRef.current || !duration) {
            return
          }

          updateLocalCreatorVideo(video.id, { durationSeconds: duration })
          setVideos((currentVideos) =>
            currentVideos.map((currentVideo) =>
              currentVideo.id === video.id ? { ...currentVideo, durationSeconds: duration } : currentVideo,
            ),
          )
        })
        .catch(() => undefined)
        .finally(() => {
          resolvingDurationsRef.current.delete(video.id)
        })
    })
  }, [videos])

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
      setMessage("Opening and syncing video...")
      const video = await createLocalCreatorVideo({ youtubeUrl })
      const state = buildCreatorVideoStateSnapshot(video)
      const uploadVideo = withSyncedVideoState(video, state, video.status)
      await uploadCreatorVideoToCloud(uploadVideo, state).catch(() => null)
      const cloudVideos = await fetchCreatorCloudVideos().catch(() => ({ videos: [] }))
      setVideos(mergeTravelVideos(getAllCreatorVideosClient(), cloudVideos.videos))
      router.push(`/creator/video/${video.id}/edit`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create a creator video from that URL.")
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Videos</h1>
          <p className="mt-1 text-sm text-slate-500">{orderedVideos.length} creator videos</p>
        </div>
      </header>

      <section className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            id="youtubeUrl"
            className="h-11"
            value={youtubeUrl}
            onChange={(event) => setYoutubeUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleCreateVideo()
              }
            }}
            placeholder="Paste YouTube URL"
          />
          <Button className="h-11 px-5" onClick={handleCreateVideo} disabled={isCreating}>
            <PlayCircle className="mr-2 h-4 w-4" />
            {isCreating ? "Opening..." : "Search"}
          </Button>
        </div>
        {message && <p className="text-sm text-slate-500">{message}</p>}
      </section>

      {orderedVideos.length === 0 ? (
        <div className="border-t border-slate-200 py-10">
          <p className="text-sm text-slate-500">No videos yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {orderedVideos.map((video) => (
            <div key={video.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative aspect-video w-24 flex-none overflow-hidden rounded-md bg-slate-100 sm:w-32">
                  <Image
                    src={video.thumbnail || "/placeholder.svg"}
                    alt={video.title}
                    fill
                    sizes="(min-width: 640px) 8rem, 6rem"
                    className="object-cover"
                  />
                </div>

                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <h2 className="truncate font-medium text-slate-950">{video.title}</h2>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatDuration(video.durationSeconds)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link href={`/creator/video/${video.id}/edit`}>
                  <Button size="sm">Open editor</Button>
                </Link>
                <Link href={`/watch/${video.id}`}>
                  <Button variant="ghost" size="icon" aria-label={`Preview ${video.title}`} title="Preview">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
