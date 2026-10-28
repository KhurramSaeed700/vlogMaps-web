"use client"

import { memo, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ListVideo, Loader2, Search, X } from "lucide-react"
import { useRouter } from "next/navigation"
import * as Dialog from "@radix-ui/react-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fetchCreatorCloudVideos } from "@/lib/creator-videos-cloud-client"
import { groupCreatorPlaylists, type CreatorPlaylist } from "@/lib/creator-playlists"
import { playlistEditorHref } from "@/lib/playlist-mapping"
import { getVideoMappingStatus, type VideoMappingStatus } from "@/lib/video-mapping-status"
import { formatDuration } from "@/lib/demo-data"

const statusLabels: Record<VideoMappingStatus, string> = { mapped: "Mapped", mapping: "Mapping", "not-mapped": "Not mapped", checking: "Checking duration" }
const statusClasses: Record<VideoMappingStatus, string> = {
  mapped: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  mapping: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  "not-mapped": "bg-muted text-muted-foreground",
  checking: "bg-muted text-muted-foreground",
}

export const PlaylistMappingControls = memo(function PlaylistMappingControls({ playlistId, youtubeId, videoId, videoEnded = false, overlayTarget, currentMappingStatus, saveBeforeNext }: {
  playlistId: string
  youtubeId: string
  videoId: string
  videoEnded?: boolean
  overlayTarget?: HTMLElement | null
  currentMappingStatus?: VideoMappingStatus
  saveBeforeNext: () => Promise<boolean>
}) {
  const router = useRouter()
  const [playlist, setPlaylist] = useState<CreatorPlaylist | null>(null)
  const [open, setOpen] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [loadError, setLoadError] = useState("")
  const [retry, setRetry] = useState(0)
  const [query, setQuery] = useState("")
  const [endScreenError, setEndScreenError] = useState("")
  const savingRef = useRef(false)
  const autoAdvanceAttemptedRef = useRef(false)
  const activeRowRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    setPlaylist(null); setLoadError(""); setError(""); setEndScreenError("")
    fetchCreatorCloudVideos(controller.signal).then(response => {
      if (controller.signal.aborted) return
      if (!response.configured || response.error || response.status) throw new Error("Unable to load your playlist videos. Try again.")
      const local = groupCreatorPlaylists(response.videos).playlists.find(playlist => playlist.id === playlistId)
      if (!local?.videos.some(video => video.id === videoId || video.youtubeId === youtubeId)) throw new Error("This video is no longer in the playlist.")
      setPlaylist(local)
    }).catch(error => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Unable to load playlist.") })
    return () => controller.abort()
  }, [playlistId, videoId, youtubeId, retry])

  useEffect(() => {
    if (open && !query) activeRowRef.current?.scrollIntoView({ block: "nearest" })
  }, [open, playlist, query])

  const episodes = useMemo(() => playlist?.videos.map((video, index) => ({ video, index,
    status: video.id === videoId && currentMappingStatus ? currentMappingStatus : getVideoMappingStatus(video),
  })) ?? [], [playlist, videoId, currentMappingStatus])
  const index = episodes.findIndex(({ video }) => video.id === videoId || video.youtubeId === youtubeId)
  const previous = episodes[index - 1]?.video
  const next = index >= 0 ? episodes[index + 1]?.video : undefined
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleEpisodes = episodes.filter(({ video }) => video.title.toLocaleLowerCase().includes(normalizedQuery))
  const mapped = episodes.filter(episode => episode.status === "mapped").length
  const mapping = episodes.filter(episode => episode.status === "mapping" || episode.status === "checking").length
  const notMapped = episodes.length - mapped - mapping

  async function selectVideo(targetId: string, fromEndScreen = false) {
    if (savingRef.current || !playlist) return
    if (targetId === videoId) { setOpen(false); return }
    const target = playlist.videos.find(video => video.id === targetId && video.viewerCanEdit !== false)
    if (!target) return
    autoAdvanceAttemptedRef.current = true
    savingRef.current = true
    setSavingId(targetId); setError(""); setEndScreenError("")
    try {
      if (!await saveBeforeNext()) throw new Error("Finish placing or editing your current point and make sure your changes can save. Then try again.")
      router.push(playlistEditorHref(targetId, playlistId, targetId === next?.id ? videoId : undefined))
      setOpen(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Your changes could not be confirmed saved. Stay here and try again."
      if (fromEndScreen) setEndScreenError(message); else { setError(message); setOpen(true) }
    } finally { savingRef.current = false; setSavingId(null) }
  }

  const selectVideoRef = useRef(selectVideo)
  selectVideoRef.current = selectVideo
  useEffect(() => {
    if (!videoEnded) autoAdvanceAttemptedRef.current = false
  }, [videoEnded, videoId])
  const autoAdvanceId = videoEnded && next?.viewerCanEdit !== false && overlayTarget && !open && !savingId && !endScreenError
    ? next?.id : undefined
  useEffect(() => {
    if (!autoAdvanceId || autoAdvanceAttemptedRef.current) return
    const timer = setTimeout(() => {
      if (!autoAdvanceAttemptedRef.current) void selectVideoRef.current(autoAdvanceId, true)
    }, 5000)
    return () => clearTimeout(timer)
  }, [autoAdvanceId])

  const navClass = "flex h-8 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  return <>
    <div className="flex h-10 w-36 min-w-0 shrink-0 items-center gap-0.5 rounded-xl border border-border bg-gradient-to-b from-muted/60 to-muted/20 p-1 shadow-sm sm:w-48 lg:w-72">
      <button type="button" className={navClass} aria-label="Edit previous playlist video" disabled={!previous || previous.viewerCanEdit === false || Boolean(savingId)} onClick={() => previous && void selectVideo(previous.id)}><ChevronLeft size={18} /></button>
      <Dialog.Root open={open} onOpenChange={value => { if (!savingRef.current) setOpen(value) }}>
        <Dialog.Trigger asChild><button type="button" aria-label="Choose playlist video to edit" disabled={Boolean(savingId)} className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ListVideo className="hidden h-4 w-4 shrink-0 text-teal-600 sm:block dark:text-teal-300" />
          <span className="min-w-0 flex-1"><span className="hidden truncate text-[11px] font-medium sm:block" title={playlist?.title}>{playlist?.title ?? "Playlist"}</span><span className="block whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">{savingId ? "Saving…" : index >= 0 ? <>{index + 1}<span className="px-1">/</span>{episodes.length}<span className="hidden sm:inline"> videos</span></> : loadError ? "Try again" : "Loading…"}</span></span>
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </button></Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/60" />
          <Dialog.Content onKeyDown={event => event.stopPropagation()} onPointerDownOutside={event => { if (savingRef.current) event.preventDefault() }} className="fixed inset-x-2 bottom-2 top-16 z-[101] flex flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-4 sm:w-[460px] sm:max-w-[calc(100vw-2rem)]">
            <div className="flex items-start gap-3 border-b border-border p-4">
              <div className="min-w-0 flex-1"><Dialog.Title className="line-clamp-2 text-base font-semibold">{playlist?.title ?? "Playlist videos"}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-muted-foreground">Choose a video to edit. Your current changes save before switching.</Dialog.Description>
                {playlist && <p className="mt-2 text-xs text-muted-foreground">{episodes.length} videos · <span className="text-teal-600 dark:text-teal-300">{mapped} mapped</span> · <span className="text-yellow-700 dark:text-yellow-300">{mapping} in progress</span> · {notMapped} not mapped</p>}
              </div>
              <Dialog.Close asChild><button type="button" className={navClass} disabled={Boolean(savingId)} aria-label="Close playlist"><X size={18} /></button></Dialog.Close>
            </div>
            {playlist && <div className="relative mx-4 my-3"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search playlist videos" placeholder="Search playlist videos" value={query} onChange={event => setQuery(event.target.value)} className="h-10 rounded-xl pl-9" /></div>}
            {error && <p role="alert" className="mx-4 mb-3 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">{error}</p>}
            {savingId && <p role="status" className="mx-4 mb-3 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Saving your map…</p>}
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loadError ? <div className="space-y-3 p-3"><p role="alert" className="text-sm text-muted-foreground">{loadError}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>Retry playlist</Button></div> : !playlist ? <p role="status" className="p-3 text-sm text-muted-foreground">Loading playlist…</p> : !visibleEpisodes.length ? <p className="p-3 text-sm text-muted-foreground">No videos match your search.</p> : visibleEpisodes.map(({ video, index: position, status }) => <button key={video.id} ref={position === index ? activeRowRef : undefined} type="button" aria-current={position === index ? "true" : undefined} aria-label={`Edit ${video.title}`} aria-describedby={`playlist-mapping-status-${video.id}`} disabled={Boolean(savingId) || video.viewerCanEdit === false} onClick={() => void selectVideo(video.id)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50 ${position === index ? "bg-accent" : ""}`}>
                <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{position + 1}</span>
                <span className="relative w-20 shrink-0 overflow-hidden rounded-lg bg-muted sm:w-24"><img src={video.thumbnail || "/placeholder.svg"} alt="" loading="lazy" className="aspect-video w-full object-cover" />{video.durationSeconds > 0 && <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] text-white">{formatDuration(video.durationSeconds)}</span>}</span>
                <span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm font-medium">{video.title}</span><span className="mt-1.5 flex flex-wrap items-center gap-2"><span id={`playlist-mapping-status-${video.id}`} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusClasses[status]}`}>{statusLabels[status]}</span>{position === index && <span className="text-[10px] text-muted-foreground">Editing now</span>}{video.viewerCanEdit === false && <span className="text-[10px] text-muted-foreground">Read only</span>}</span></span>
              </button>)}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <button type="button" className={navClass} aria-label="Edit next playlist video" disabled={!next || next.viewerCanEdit === false || Boolean(savingId)} onClick={() => next && void selectVideo(next.id)}><ChevronRight size={18} /></button>
    </div>
    {videoEnded && next && next.viewerCanEdit !== false && overlayTarget && createPortal(
      <div className="absolute right-3 top-1/2 z-30 max-w-[calc(100%_-_2rem)] -translate-y-1/2 sm:right-5" onKeyDown={event => event.stopPropagation()}>
        <Button type="button" disabled={Boolean(savingId)} onClick={() => void selectVideo(next.id, true)} aria-label="Map next video; saves and opens automatically after 5 seconds" className="relative min-h-11 overflow-hidden rounded-xl bg-teal-700 px-5 font-semibold text-white shadow-lg hover:bg-teal-700">
          {autoAdvanceId && !autoAdvanceAttemptedRef.current && <span aria-hidden="true" className="route-intro-countdown-fill absolute inset-0 origin-left bg-teal-500" style={{ animationDuration: "5000ms" }} />}
          <span className="relative z-10 flex items-center gap-2">{savingId ? "Saving…" : "Map next video"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
        </Button>
        {endScreenError && <p role="alert" className="mt-2 max-w-64 rounded-lg bg-slate-950/90 p-3 text-xs text-amber-200">{endScreenError}</p>}
      </div>, overlayTarget
    )}
  </>
})
