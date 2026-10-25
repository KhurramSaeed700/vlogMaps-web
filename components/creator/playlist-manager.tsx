"use client"

import { useMemo, useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import * as Menu from "@radix-ui/react-dropdown-menu"
import { Check, ChevronDown, ListPlus, ListVideo, Loader2, Plus, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { formatDuration, type TravelVideo } from "@/lib/demo-data"
import type { CreatorPlaylist } from "@/lib/creator-playlists"

export function PlaylistManager({ videos, playlists, initialPlaylistId, initialVideoIds = [], onClose, onSaved }: {
  videos: TravelVideo[]; playlists: CreatorPlaylist[]; initialPlaylistId?: string; initialVideoIds?: string[]
  onClose: () => void; onSaved: () => Promise<void>
}) {
  const initial = playlists.find(playlist => playlist.id === initialPlaylistId)
  const [newPlaylistId] = useState(() => `vmaps_${crypto.randomUUID()}`)
  const [target, setTarget] = useState(initial?.id ?? "new")
  const [title, setTitle] = useState(initial?.title ?? "")
  const [selected, setSelected] = useState(() => new Set([...(initial?.videos.map(video => video.id) ?? []), ...initialVideoIds]))
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const editable = useMemo(() => videos.filter(video => video.viewerCanEdit !== false), [videos])
  const visible = useMemo(() => editable.filter(video => `${video.title} ${video.creator}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [editable, query])
  const allVisibleSelected = visible.length > 0 && visible.every(video => selected.has(video.id))
  const existing = playlists.find(playlist => playlist.id === target)
  const removed = existing?.videos.filter(video => !selected.has(video.id)).length ?? 0
  const added = [...selected].filter(id => !existing?.videos.some(video => video.id === id)).length
  const chooseTarget = (id: string) => {
    const playlist = playlists.find(item => item.id === id)
    setTarget(id); setTitle(playlist?.title ?? "")
    setSelected(new Set([...(playlist?.videos.map(video => video.id) ?? []), ...initialVideoIds])); setError("")
  }
  const toggle = (id: string, checked: boolean) => setSelected(current => {
    const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next
  })
  const save = async () => {
    if (busy || !title.trim() || (target === "new" && !selected.size)) return
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/creator/playlist-library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: target === "new" ? newPlaylistId : target, title: title.trim(), videoIds: [...selected] }) })
      const result = await response.json()
      if (!response.ok || !result.saved) throw new Error(result.error || "Unable to save playlist.")
      await onSaved(); onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save playlist. Try again.") }
    finally { setBusy(false) }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose() }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" />
    <Dialog.Content aria-busy={busy} className="fixed inset-x-3 top-1/2 z-[81] flex max-h-[90dvh] -translate-y-1/2 flex-col overflow-y-auto rounded-2xl border border-border bg-background text-foreground shadow-2xl sm:left-1/2 sm:right-auto sm:w-[640px] sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2">
      <div className="flex items-start gap-3 border-b border-border p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300"><ListPlus size={23} /></span>
        <div className="min-w-0 flex-1"><Dialog.Title className="text-lg font-semibold tracking-tight">{initialVideoIds.length ? "Add to playlist" : target === "new" ? "New playlist" : "Edit playlist"}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-muted-foreground">Organize your TravelMap library. Videos can belong to several playlists.</Dialog.Description></div>
        <Dialog.Close asChild><Button variant="ghost" size="icon" disabled={busy} aria-label="Close playlist editor"><X size={18} /></Button></Dialog.Close>
      </div>
      <div className="space-y-4 px-5 pb-4 pt-4">
        <Menu.Root><Menu.Trigger asChild><Button variant="outline" disabled={busy} className="w-full justify-between rounded-xl"><span className="flex min-w-0 items-center gap-2"><ListVideo size={16} /><span className="truncate">{existing?.title ?? "Create a new playlist"}</span></span><ChevronDown size={15} /></Button></Menu.Trigger><Menu.Portal><Menu.Content align="start" sideOffset={6} className="z-[90] max-h-64 w-[min(34rem,calc(100vw-4rem))] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
          <Menu.Item onSelect={() => chooseTarget("new")} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm outline-none focus:bg-accent"><Plus size={16} />Create new playlist</Menu.Item>
          <Menu.Separator className="my-1 h-px bg-border" />
          {playlists.map(playlist => <Menu.Item key={playlist.id} onSelect={() => chooseTarget(playlist.id)} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm outline-none focus:bg-accent"><ListVideo size={16} /><span className="flex-1 truncate">{playlist.title}</span><span className="text-xs text-muted-foreground">{playlist.videos.length}</span>{target === playlist.id && <Check size={15} />}</Menu.Item>)}
        </Menu.Content></Menu.Portal></Menu.Root>
        <div><label htmlFor="playlist-name" className="mb-1.5 block text-xs font-medium text-muted-foreground">Playlist name</label><Input id="playlist-name" value={title} maxLength={150} disabled={busy} onChange={event => setTitle(event.target.value)} placeholder="e.g. Alaska motorcycle adventure" className="h-11 rounded-xl" /></div>
        <div className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search your videos" aria-label="Search videos for playlist" className="rounded-xl pl-9" /></div>
        <div className="flex items-center justify-between text-xs"><label className="flex cursor-pointer items-center gap-2"><Checkbox checked={allVisibleSelected ? true : visible.some(video => selected.has(video.id)) ? "indeterminate" : false} disabled={busy || !visible.length} onCheckedChange={() => setSelected(current => { const next = new Set(current); for (const video of visible) { if (allVisibleSelected) next.delete(video.id); else next.add(video.id) } return next })} />Select {query ? "results" : "all"}</label><span className="text-muted-foreground">{selected.size} selected</span></div>
      </div>
      <div className="min-h-24 flex-1 overflow-y-auto border-y border-border px-2 py-2">
        {visible.map(video => <label key={video.id} className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${selected.has(video.id) ? "bg-teal-500/[0.07]" : "hover:bg-muted/60"}`}>
          <Checkbox aria-label={`Include ${video.title}`} checked={selected.has(video.id)} disabled={busy} onCheckedChange={checked => toggle(video.id, checked === true)} />
          <div className="relative w-24 shrink-0 overflow-hidden rounded-lg bg-muted"><img src={video.thumbnail || "/placeholder.svg"} alt="" loading="lazy" className="aspect-video w-full object-cover" />{video.durationSeconds > 0 && <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] text-white">{formatDuration(video.durationSeconds)}</span>}</div>
          <span className="min-w-0 flex-1"><span className="line-clamp-2 text-sm font-medium leading-5">{video.title}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{video.creator}</span></span>
        </label>)}
        {!visible.length && <div className="px-5 py-8 text-center text-sm text-muted-foreground">{editable.length ? "No videos match your search." : "Add videos to your library first, then create a playlist."}</div>}
      </div>
      <div className="space-y-3 p-5">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-xs text-xs text-muted-foreground">{target === "new" ? "Choose at least one video to get started." : selected.size === 0 ? "Removing every video removes this playlist. Your videos and maps stay in your library." : `${added} to add · ${removed} to remove. Videos and maps stay in your library.`}</p><div className="ml-auto flex gap-2"><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || !title.trim() || (target === "new" && !selected.size)} onClick={() => void save()} className="rounded-lg">{busy ? <Loader2 size={16} className="mr-2 animate-spin" /> : target === "new" ? <Plus size={16} className="mr-2" /> : <Check size={16} className="mr-2" />}{busy ? "Saving…" : target === "new" ? "Create playlist" : "Save changes"}</Button></div></div>
      </div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
