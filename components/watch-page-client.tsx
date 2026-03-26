"use client"

import { useEffect, useState } from "react"
import { WatchExperience } from "@/components/watch-experience"
import { Card, CardContent } from "@/components/ui/card"
import { getTravelVideoByIdClient } from "@/lib/creator-videos"
import type { TravelVideo } from "@/lib/demo-data"

export function WatchPageClient({ id }: { id: string }) {
  const [video, setVideo] = useState<TravelVideo | null | undefined>(undefined)

  useEffect(() => {
    setVideo(getTravelVideoByIdClient(id) ?? null)
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
            This video could not be found. If it was added from a pasted YouTube URL, recreate it from the creator workspace.
          </CardContent>
        </Card>
      </div>
    )
  }

  return <WatchExperience video={video} />
}
