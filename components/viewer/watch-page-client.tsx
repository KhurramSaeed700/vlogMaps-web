"use client"

import { useEffect, useState } from "react"
import { WatchExperience } from "@/components/viewer/watch-experience"
import { Card, CardContent } from "@/components/ui/card"
import { getTravelVideoByIdClient } from "@/lib/creator-videos"
import { hydrateTravelVideo, toHydratedTravelVideo, type HydratedTravelVideo } from "@/lib/youtube-client"

export function WatchPageClient({ id }: { id: string }) {
  const [video, setVideo] = useState<HydratedTravelVideo | null | undefined>(undefined)

  useEffect(() => {
    const baseVideo = getTravelVideoByIdClient(id)
    if (!baseVideo) {
      setVideo(null)
      return
    }

    setVideo(toHydratedTravelVideo(baseVideo))

    let isMounted = true
    hydrateTravelVideo(baseVideo).then((nextVideo) => {
      if (isMounted) {
        setVideo(nextVideo)
      }
    })

    return () => {
      isMounted = false
    }
  }, [id])

  if (video === undefined) {
    return (
      <div className="min-h-screen bg-black p-6">
        <Card>
          <CardContent className="p-6 text-sm text-gray-500">Loading watch experience...</CardContent>
        </Card>
      </div>
    )
  }

  if (video === null) {
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

  return <WatchExperience video={video} />
}
