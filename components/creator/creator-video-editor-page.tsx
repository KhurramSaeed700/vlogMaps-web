"use client"

import { useEffect, useState } from "react"
import { ContentPageShell } from "@/components/app-shell/content-page-shell"
import { CreatorAccessGuard } from "@/components/creator/creator-access-guard"
import { CreatorVideoEditor } from "@/components/creator/creator-video-editor"
import { getTravelVideoByIdClient } from "@/lib/creator-videos"
import type { TravelVideo } from "@/lib/demo-data"

const creatorEditorHeaderActionsId = "creator-editor-header-actions"

export function CreatorVideoEditorPage({ id }: { id: string }) {
  const [video, setVideo] = useState<TravelVideo | null | undefined>(undefined)
  const isEditorReady = video !== undefined && video !== null

  useEffect(() => {
    setVideo(getTravelVideoByIdClient(id) ?? null)
  }, [id])

  return (
    <ContentPageShell
      title={isEditorReady ? `Edit: ${video.title}` : video === null ? "Video not found" : "Opening creator editor"}
      description={
        isEditorReady
          ? "Paste a video, open the player, capture timestamps, and pair each moment with a location on the map."
          : video === null
            ? "This creator video could not be found in your local creator workspace."
            : "Checking access and preparing the video workspace."
      }
      backHref={video === null ? "/creator/video/new" : "/creator/dashboard"}
      backLabel={video === null ? "Back to Workspace" : "Back to Dashboard"}
      mainClassName={isEditorReady ? "w-full xl:fixed xl:inset-x-0 xl:bottom-0 xl:top-[73px] xl:overflow-hidden" : "w-full"}
      contentClassName={
        isEditorReady
          ? "min-h-[calc(100vh-73px)] xl:h-full xl:min-h-0 xl:overflow-hidden"
          : "flex min-h-[calc(100vh-73px)] items-center justify-center px-4 text-sm text-slate-500"
      }
      showIntro={false}
      framedContent={false}
      headerActionsId={isEditorReady ? creatorEditorHeaderActionsId : undefined}
    >
      <CreatorAccessGuard
        loadingTitle="Opening creator editor"
        loadingDescription="Checking your creator access and preparing the selected video."
        pendingLabel={video === undefined ? "Loading video" : null}
      >
        {video === null ? (
          <p>Video not found.</p>
        ) : video ? (
          <CreatorVideoEditor video={video} headerActionsTargetId={creatorEditorHeaderActionsId} />
        ) : null}
      </CreatorAccessGuard>
    </ContentPageShell>
  )
}
