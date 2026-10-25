"use client"

import { useEffect, useState } from "react"
import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { ContentPageShell } from "@/components/app-shell/content-page-shell"
import { CreatorAccessGuard } from "@/components/creator/creator-access-guard"
import { CreatorVideoEditor } from "@/components/creator/creator-video-editor"
import { fetchCreatorCloudVideos, fetchCreatorCloudVideoById } from "@/lib/creator-videos-cloud-client"
import { getVideoPlaylistId } from "@/lib/playlist-mapping"
import { loadCreatorVideoState } from "@/lib/creator-video-state-client"
import { createPlaylistStartStop, getPreviousPlaylistVideo, type PlaylistStartStop } from "@/lib/playlist-continuity"
import type { TravelVideo } from "@/lib/demo-data"

const creatorEditorHeaderActionsId = "creator-editor-header-actions"
const creatorEditorHeaderLeadingActionsId = "creator-editor-header-leading-actions"

export function CreatorVideoEditorPage({ id, playlistId, previousVideoId }: { id: string; playlistId?: string; previousVideoId?: string }) {
  const router = useRouter()
  const { isLoaded: isUserLoaded, user } = useUser()
  const [playlistStartStop, setPlaylistStartStop] = useState<PlaylistStartStop | null>(null)
  const [video, setVideo] = useState<TravelVideo | null | undefined>(undefined)
  const isVideoReady = video !== undefined && video !== null
  const shouldUseEditorLayout = isVideoReady && isUserLoaded

  useEffect(() => {
    let isMounted = true
    setVideo(undefined)
    setPlaylistStartStop(null)
    const controller = new AbortController()

    fetchCreatorCloudVideoById(id, controller.signal)
      .then(async (response) => {
        if (isMounted) {
          if (response.video && response.video.id !== id) {
            router.replace(`/creator/video/${response.video.id}/edit${playlistId ? `?${new URLSearchParams({ playlist: playlistId })}` : ""}`)
          }
          const loadedVideo = response.video
          const sourcePlaylistId = playlistId ?? (loadedVideo ? getVideoPlaylistId(loadedVideo) : undefined)
          if (loadedVideo && loadedVideo.keyframes.length === 0 && sourcePlaylistId && loadedVideo.tags?.includes(`playlist:${sourcePlaylistId}`)) {
            try {
              const library = await fetchCreatorCloudVideos(controller.signal)
              const previous = previousVideoId
                ? library.videos.find(video => video.id === previousVideoId && video.id !== loadedVideo.id && video.tags?.includes(`playlist:${sourcePlaylistId}`))
                : getPreviousPlaylistVideo(library.videos, loadedVideo.id, sourcePlaylistId)
              if (previous) {
                const saved = await loadCreatorVideoState(previous.id, controller.signal)
                if (isMounted && saved?.configured) setPlaylistStartStop(createPlaylistStartStop(saved.state?.points ?? previous.keyframes))
              }
            } catch {
              // An unavailable previous episode must not prevent normal editing.
            }
          }
          if (isMounted) setVideo(loadedVideo ?? null)
        }
      })
      .catch(() => {
        if (isMounted) {
          setVideo(null)
        }
      })

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [id, router, playlistId, previousVideoId])

  const activePlaylistId = playlistId ?? (video ? getVideoPlaylistId(video) : undefined)

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
      backHref={video === null ? "/creator/dashboard" : activePlaylistId ? `/creator/playlists/${encodeURIComponent(activePlaylistId)}` : "/creator/dashboard"}
      backLabel={video === null ? "Back to Workspace" : activePlaylistId ? "Back to playlist" : "Back to Dashboard"}
      mainClassName={shouldUseEditorLayout ? "w-full xl:fixed xl:inset-x-0 xl:bottom-0 xl:top-[73px] xl:overflow-hidden" : "w-full"}
      contentClassName={
        shouldUseEditorLayout
          ? "min-h-[calc(100vh-73px)] xl:h-full xl:min-h-0 xl:overflow-hidden"
          : "flex min-h-[calc(100vh-73px)] items-center justify-center px-4 text-sm text-slate-500"
      }
      showIntro={false}
      framedContent={false}
      showThemeToggle={false}
      headerLeadingActionsId={shouldUseEditorLayout ? creatorEditorHeaderLeadingActionsId : undefined}
      headerActionsId={shouldUseEditorLayout ? creatorEditorHeaderActionsId : undefined}
    >
      <CreatorAccessGuard
        loadingTitle="Opening creator editor"
        pendingLabel={video === undefined ? "Loading video" : null}
      >
        {video === null ? (
          <p>Video not found.</p>
        ) : video ? (
          <CreatorVideoEditor
            key={video.id}
            video={video}
            playlistStartStop={playlistStartStop}
            playlistId={playlistId ?? getVideoPlaylistId(video)}
            headerLeadingActionsTargetId={creatorEditorHeaderLeadingActionsId}
            headerActionsTargetId={creatorEditorHeaderActionsId}
          />
        ) : null}
      </CreatorAccessGuard>
    </ContentPageShell>
  )
}
