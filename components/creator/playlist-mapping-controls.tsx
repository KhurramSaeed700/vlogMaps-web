"use client"

import { memo, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import * as Dialog from "@radix-ui/react-dialog"
import { Button } from "@/components/ui/button"
import { fetchCreatorCloudVideos } from "@/lib/creator-videos-cloud-client"
import { getPlaylistMappingStep, playlistEditorHref } from "@/lib/playlist-mapping"
import type { YouTubePlaylistPreview } from "@/lib/youtube-playlist"

type MappingStep = NonNullable<ReturnType<typeof getPlaylistMappingStep>>
export const PlaylistMappingControls = memo(function PlaylistMappingControls({ playlistId, youtubeId, videoId, completionRequest = 0, saveBeforeNext }: { playlistId: string; youtubeId: string; videoId: string; completionRequest?: number; saveBeforeNext: () => Promise<boolean> }) {
  const router = useRouter()
  const [step, setStep] = useState<MappingStep | null>(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [saved, setSaved] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setStep(null); setLoadError("")
    Promise.all([
      fetch(`/api/creator/playlists?${new URLSearchParams({ url: `https://www.youtube.com/playlist?list=${playlistId}` })}`, { cache: "no-store", signal: controller.signal }).then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "Unable to load the next video.")
        return body as YouTubePlaylistPreview
      }),
      fetchCreatorCloudVideos(controller.signal).then(response => {
        if (!response.configured || response.error || response.status) throw new Error("Unable to check your playlist videos.")
        return response.videos
      }),
    ]).then(([playlist, videos]) => {
      if (controller.signal.aborted) return
      const nextStep = getPlaylistMappingStep(playlist, videos, youtubeId)
      if (!nextStep) throw new Error("This video is no longer in the playlist.")
      setStep(nextStep)
    }).catch(error => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Unable to load playlist.") })
    return () => controller.abort()
  }, [playlistId, youtubeId, retry])

  async function finish() {
    if (saving || !step) return
    setOpen(true); setSaving(true); setSaved(false); setMessage("")
    try {
      if (!await saveBeforeNext()) { setMessage("Finish placing or editing your current point, and make sure your changes can save. Then try again."); return }
      setSaved(true)
    } catch { setMessage("Your changes could not be confirmed saved. Stay here and try again.") }
    finally { setSaving(false) }
  }
  const finishRef = useRef(finish)
  finishRef.current = finish
  const handledCompletionRef = useRef(0)
  useEffect(() => {
    if (!step || completionRequest <= handledCompletionRef.current) return
    handledCompletionRef.current = completionRequest
    void finishRef.current()
  }, [completionRequest, step])
  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-8" disabled={!step && !loadError} onClick={loadError ? () => { setOpen(true); setMessage(loadError) } : finish} title={step ? `Playlist video ${step.position} of ${step.total}` : "Loading playlist order"}>Finish video{step ? ` · ${step.position}/${step.total}` : ""}</Button>
      <Dialog.Root open={open} onOpenChange={value => { if (!saving) setOpen(value) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/60" />
          <Dialog.Content onKeyDown={event => event.stopPropagation()} onPointerDownOutside={event => event.preventDefault()} className="fixed left-1/2 top-1/2 z-[101] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-xl">
            <Dialog.Title className="text-lg font-semibold">{saving ? "Saving your map…" : saved ? step?.next ? "Map the next video?" : "Playlist finished" : "Keep editing"}</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">{saving ? "Wait while your changes are saved." : saved ? step?.next ? `Your map is saved. Up next: ${step.next.title}` : "Your map is saved. You’ve reached the last imported video in this playlist." : message || loadError}</Dialog.Description>
            {!saving && <div className="flex flex-wrap justify-end gap-2">
              {saved ? <Button variant="outline" onClick={() => { setOpen(false); router.push("/creator/dashboard") }}>Creator dashboard</Button> : <Dialog.Close asChild><Button variant="outline">Keep editing</Button></Dialog.Close>}
              {loadError ? <Button onClick={() => { setOpen(false); setRetry(value => value + 1) }}>Retry playlist</Button> : saved && step?.next ? <Button onClick={() => { setOpen(false); router.push(playlistEditorHref(step.next!.id, playlistId, videoId)) }}>Yes, map next video</Button> : !saved ? <Button onClick={finish}>Try saving again</Button> : <Button onClick={() => router.push(`/creator/playlists/${encodeURIComponent(playlistId)}`)}>Back to playlist</Button>}
            </div>}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
})
