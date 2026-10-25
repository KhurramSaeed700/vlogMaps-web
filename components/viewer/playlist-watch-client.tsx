"use client"

import { useEffect, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { ChevronDown, ChevronLeft, ChevronRight, ListVideo, Play, X } from "lucide-react"
import { WatchExperience } from "@/components/viewer/watch-experience"
import type { CreatorPlaylist } from "@/lib/creator-playlists"
import { formatDuration } from "@/lib/demo-data"

export function PlaylistWatchClient({ playlist }: { playlist: CreatorPlaylist }) {
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const sync = () => {
      const id = new URLSearchParams(window.location.search).get("video")
      const position = playlist.videos.findIndex(video => video.id === id)
      setIndex(position < 0 ? 0 : position)
    }
    sync()
    window.addEventListener("popstate", sync)
    return () => window.removeEventListener("popstate", sync)
  }, [playlist.videos])

  const select = (position: number) => {
    if (position < 0 || position >= playlist.videos.length) return
    const url = new URL(window.location.href)
    url.searchParams.set("video", playlist.videos[position].id)
    window.history.pushState(null, "", url)
    setIndex(position)
    setOpen(false)
  }
  const video = playlist.videos[index]
  if (!video) return null
  const next = playlist.videos[index + 1]
  const navClass = "flex h-8 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.035] text-white/65 transition-colors hover:bg-white/10 hover:text-white disabled:bg-transparent disabled:opacity-25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400"
  const controls = <div className="flex h-11 w-36 min-w-0 shrink-0 items-center gap-0.5 rounded-xl border border-white/[0.12] bg-gradient-to-b from-white/[0.07] to-white/[0.025] p-1 text-white shadow-sm sm:w-48 lg:w-72 xl:w-80">
    <button className={navClass} aria-label="Previous video" disabled={index === 0} onClick={() => select(index - 1)}><ChevronLeft size={20} /></button>
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="group flex h-full min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-1.5 text-left transition-colors hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-400 md:justify-start" aria-label="Choose playlist video">
        <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-300/10 text-teal-300 sm:flex"><ListVideo size={15} /></span>
        <span className="min-w-0 flex-1"><span className="hidden truncate text-[11px] font-medium leading-4 text-white/90 md:block" title={playlist.title}>{playlist.title}</span><span className="flex items-center justify-center gap-1.5 whitespace-nowrap text-[10px] leading-4 text-white/40 md:justify-start"><span className="font-semibold tabular-nums text-teal-200/90">{index + 1}<span className="px-1 text-white/25">/</span>{playlist.videos.length}</span><span className="hidden sm:inline">videos</span></span></span><ChevronDown size={12} className="hidden shrink-0 text-white/35 transition-colors group-hover:text-white/70 md:block" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/65" />
        <Dialog.Content className="fixed inset-x-2 bottom-2 top-16 z-[81] flex flex-col rounded-2xl border border-white/15 bg-zinc-950 text-white shadow-2xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-4 sm:w-[440px] sm:max-w-[calc(100vw-2rem)]">
          <div className="flex items-start gap-3 border-b border-white/10 p-4">
            <div className="min-w-0 flex-1"><Dialog.Title className="text-base font-semibold">{playlist.title}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-white/50">{playlist.videos.length} videos · Choose an episode to explore its journey.</Dialog.Description></div>
            <Dialog.Close className={navClass} aria-label="Close playlist"><X size={20} /></Dialog.Close>
          </div>
          <div className="min-h-0 overflow-y-auto p-2">
            {playlist.videos.map((episode, position) => <button key={episode.id} aria-current={position === index ? "true" : undefined} onClick={() => select(position)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors focus-visible:outline focus-visible:outline-teal-400 ${position === index ? "bg-teal-400/15 text-teal-200" : "hover:bg-white/5"}`}>
              <span className="w-5 shrink-0 text-center text-xs text-white/50">{position === index ? <Play size={14} aria-label="Now playing" /> : position + 1}</span>
              <div className="relative w-24 shrink-0 overflow-hidden rounded-lg bg-white/5"><img src={episode.thumbnail || "/placeholder.svg"} alt="" loading="lazy" className="aspect-video w-full object-cover" />{episode.durationSeconds > 0 && <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] text-white">{formatDuration(episode.durationSeconds)}</span>}</div>
              <span className="min-w-0"><span className="line-clamp-2 text-sm font-medium">{episode.title}</span><span className="mt-1 block text-xs text-white/50">{position === index ? "Now playing" : episode.creator}</span></span>
            </button>)}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <button className={navClass} aria-label="Next video" disabled={!next} onClick={() => select(index + 1)}><ChevronRight size={20} /></button>
  </div>
  return <WatchExperience key={video.id} video={video} playlistControls={controls} onPlaylistVideoEnded={next ? () => select(index + 1) : undefined} />
}
