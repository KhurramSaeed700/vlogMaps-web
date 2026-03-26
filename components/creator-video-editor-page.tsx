"use client"

import { useEffect, useState } from "react"
import { ContentPageShell } from "@/components/content-page-shell"
import { CreatorAccessGuard } from "@/components/creator-access-guard"
import { CreatorVideoEditor } from "@/components/creator-video-editor"
import { Card, CardContent } from "@/components/ui/card"
import { getTravelVideoByIdClient } from "@/lib/creator-videos"
import type { TravelVideo } from "@/lib/demo-data"

export function CreatorVideoEditorPage({ id }: { id: string }) {
  const [video, setVideo] = useState<TravelVideo | null | undefined>(undefined)

  useEffect(() => {
    setVideo(getTravelVideoByIdClient(id) ?? null)
  }, [id])

  if (video === undefined) {
    return (
      <ContentPageShell
        title="Loading video"
        description="Resolving the creator video before opening the editor."
        backHref="/creator/dashboard"
        backLabel="Back to Dashboard"
      >
        <Card>
          <CardContent className="p-6 text-sm text-gray-500">Loading creator video...</CardContent>
        </Card>
      </ContentPageShell>
    )
  }

  if (video === null) {
    return (
      <ContentPageShell
        title="Video not found"
        description="This creator video could not be found in the demo data or your local creator workspace."
        backHref="/creator/video/new"
        backLabel="Back to Workspace"
      >
        <Card>
          <CardContent className="p-6 text-sm text-gray-500">
            Add the YouTube URL again from the creator workspace if this was a locally created draft.
          </CardContent>
        </Card>
      </ContentPageShell>
    )
  }

  return (
    <ContentPageShell
      title={`Edit: ${video.title}`}
      description="Paste a video, open the player, capture timestamps, and pair each moment with a location on the map."
      backHref="/creator/dashboard"
      backLabel="Back to Dashboard"
    >
      <CreatorAccessGuard>
        <CreatorVideoEditor video={video} />
      </CreatorAccessGuard>
    </ContentPageShell>
  )
}
