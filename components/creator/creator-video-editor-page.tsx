"use client"

import { useEffect, useState } from "react"
import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { ContentPageShell } from "@/components/app-shell/content-page-shell"
import { CreatorAccessGuard } from "@/components/creator/creator-access-guard"
import { CreatorVideoEditor } from "@/components/creator/creator-video-editor"
import { fetchCreatorCloudVideoById } from "@/lib/creator-videos-cloud-client"
import type { TravelVideo } from "@/lib/demo-data"

const creatorEditorHeaderActionsId = "creator-editor-header-actions"

export function CreatorVideoEditorPage({ id }: { id: string }) {
  const router = useRouter()
  const { isLoaded: isUserLoaded, user } = useUser()
  const [video, setVideo] = useState<TravelVideo | null | undefined>(undefined)
  const isVideoReady = video !== undefined && video !== null
  const shouldUseEditorLayout = isVideoReady && isUserLoaded

  useEffect(() => {
    let isMounted = true
    setVideo(undefined)

    fetchCreatorCloudVideoById(id)
      .then((response) => {
        if (isMounted) {
          if (response.video && response.video.id !== id) {
            router.replace(`/creator/video/${response.video.id}/edit`)
          }
          setVideo(response.video ?? null)
        }
      })
      .catch(() => {
        if (isMounted) {
          setVideo(null)
        }
      })

    return () => {
      isMounted = false
    }
  }, [id, router])

  return (
    <ContentPageShell
      title={shouldUseEditorLayout ? `Edit: ${video.title}` : video === null ? "Video not found" : "Opening creator editor"}
      description={
        shouldUseEditorLayout
          ? "Paste a video, open the player, capture timestamps, and pair each moment with a location on the map."
          : video === null
            ? "This creator video could not be found in your database-backed creator workspace."
            : "Checking access and preparing the video workspace."
      }
      backHref={video === null ? "/creator/video/new" : "/creator/dashboard"}
      backLabel={video === null ? "Back to Workspace" : "Back to Dashboard"}
      mainClassName={shouldUseEditorLayout ? "w-full xl:fixed xl:inset-x-0 xl:bottom-0 xl:top-[73px] xl:overflow-hidden" : "w-full"}
      contentClassName={
        shouldUseEditorLayout
          ? "min-h-[calc(100vh-73px)] xl:h-full xl:min-h-0 xl:overflow-hidden"
          : "flex min-h-[calc(100vh-73px)] items-center justify-center px-4 text-sm text-slate-500"
      }
      showIntro={false}
      framedContent={false}
      showThemeToggle={false}
      headerActionsId={shouldUseEditorLayout ? creatorEditorHeaderActionsId : undefined}
    >
      <CreatorAccessGuard
        loadingTitle="Opening creator editor"
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
