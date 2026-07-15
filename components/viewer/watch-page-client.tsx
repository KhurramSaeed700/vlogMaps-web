"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { WatchExperience } from "@/components/viewer/watch-experience"
import { Card, CardContent } from "@/components/ui/card"
import { fetchCloudVideoById } from "@/lib/creator-videos-cloud-client"
import { getTravelVideoByIdClient } from "@/lib/creator-videos"
import { hydrateTravelVideo, toHydratedTravelVideo, type HydratedTravelVideo } from "@/lib/youtube-client"

interface WatchVideoState {
  video: HydratedTravelVideo
  viewerCanEdit: boolean
  editHref: string | null
}

export function WatchPageClient({ id }: { id: string }) {
  const router = useRouter()
  const [videoState, setVideoState] = useState<WatchVideoState | null | undefined>(undefined)

  useEffect(() => {
    const baseVideo = getTravelVideoByIdClient(id)
    let isMounted = true
    setVideoState(
      baseVideo
        ? {
            video: toHydratedTravelVideo(baseVideo),
            viewerCanEdit: false,
            editHref: null,
          }
        : undefined,
    )

    const resolveVideo = async () => {
      const cloudResponse = await fetchCloudVideoById(id).catch(() => ({
        video: null,
        viewerCanEdit: false,
        editHref: null,
      }))
      const resolvedVideo = cloudResponse.video ?? baseVideo
      const viewerCanEdit = Boolean(cloudResponse.viewerCanEdit)
      const editHref = cloudResponse.editHref ?? null

      if (!resolvedVideo) {
        if (isMounted) {
          setVideoState(null)
        }
        return
      }

      if (cloudResponse.video && cloudResponse.video.id !== id) {
        router.replace(`/watch/${cloudResponse.video.id}`)
      }

      if (isMounted) {
        setVideoState({
          video: toHydratedTravelVideo(resolvedVideo),
          viewerCanEdit,
          editHref,
        })
      }

      const hydratedVideo = await hydrateTravelVideo(resolvedVideo)
      if (isMounted) {
        setVideoState({
          video: hydratedVideo,
          viewerCanEdit,
          editHref,
        })
      }
    }

    resolveVideo()

    return () => {
      isMounted = false
    }
  }, [id, router])

  if (videoState === undefined) {
    return (
      <div className="min-h-screen bg-black p-6">
        <Card>
          <CardContent className="p-6 text-sm text-gray-500">Loading watch experience...</CardContent>
        </Card>
      </div>
    )
  }

  if (videoState === null) {
    return (
      <div className="min-h-screen bg-black p-6">
          <Card>
            <CardContent className="p-6 text-sm text-gray-500">
            This video could not be found. If it came from a pasted YouTube URL, launch it again from the homepage or creator workspace.
            </CardContent>
          </Card>
        </div>
    )
  }

  return (
    <WatchExperience
      video={videoState.video}
      viewerCanEdit={videoState.viewerCanEdit}
      editHref={videoState.editHref}
    />
  )
}
