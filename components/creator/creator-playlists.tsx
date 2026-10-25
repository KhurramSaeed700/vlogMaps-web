"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, ArrowRight, ListVideo, Loader2, Pencil, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { CreatorContentTable, type CreatorContentTableProps } from "@/components/creator/creator-content-table"
import { creatorPlaylistHref, orderCreatorPlaylistVideos, type CreatorPlaylist } from "@/lib/creator-playlists"
import { playlistEditorHref } from "@/lib/playlist-mapping"
import type { YouTubePlaylistPreview } from "@/lib/youtube-playlist"

export function CreatorPlaylistCards({ playlists, loading, compact = false, onManage }: { onManage?: (playlist: CreatorPlaylist) => void; playlists: CreatorPlaylist[]; loading: boolean; compact?: boolean }) {
  const [query, setQuery] = useState("")
  const visible = playlists.filter(playlist => `${playlist.title} ${playlist.videos[0]?.creator}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <section aria-label="Your playlists" aria-busy={loading} className="mb-8 space-y-4">
    {compact ? <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Playlists</h2><Button asChild variant="ghost" size="sm"><Link href="/creator/playlists">View playlists<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div>
      : <div className="relative max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search your playlists" placeholder="Search your playlists" value={query} onChange={event => setQuery(event.target.value)} className="pl-9" /></div>}
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-[repeat(auto-fill,13rem)]">
      {loading ? Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-48 rounded-lg" />) : visible.map(playlist => <div key={playlist.id} className="min-w-0"><Link href={creatorPlaylistHref(playlist.id)} aria-label={`Open playlist ${playlist.title}`} className="group min-w-0 rounded-lg text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
        <div className="relative pt-2">
          <div aria-hidden="true" className="absolute inset-x-3 top-0 h-8 rounded-t-lg border border-foreground/10 bg-muted-foreground/25" />
          <div aria-hidden="true" className="absolute inset-x-1.5 top-1 h-8 rounded-t-lg border border-foreground/10 bg-muted-foreground/40" />
          <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
            <Image src={playlist.videos[0]?.thumbnail || '/placeholder.svg'} alt="" fill sizes="(max-width: 640px) 50vw, 208px" className="object-cover" />
            <span className="absolute bottom-1 right-1 inline-flex items-center gap-1 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white"><ListVideo className="h-3 w-3" aria-hidden="true" />{playlist.videos.length} videos</span>
          </div>
        </div>
        <div className="mt-2"><h3 className="line-clamp-2 text-sm font-medium leading-5">{playlist.title}</h3><p className="mt-0.5 text-xs leading-5 text-muted-foreground">Playlist</p><p className="text-xs font-medium leading-5 text-muted-foreground transition-colors group-hover:text-foreground group-hover:underline">View full playlist</p></div>
      </Link>{onManage && <Button variant="ghost" size="sm" className="mt-1 h-8 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground" onClick={() => onManage(playlist)}><Pencil className="mr-1.5 h-3 w-3" />Edit playlist</Button>}</div>)}
    </div>
    {!loading && !visible.length && <div className="rounded-xl border border-dashed border-border py-14 text-center"><ListVideo className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><h2 className="font-semibold">{query ? 'No playlists match your search' : 'Your playlists live here'}</h2><p className="mt-2 text-sm text-muted-foreground">{query ? 'Try another playlist name.' : 'Import a YouTube playlist to keep all its videos together.'}</p>{!query && <Button asChild className="mt-4"><Link href="/creator/dashboard">Import playlist</Link></Button>}</div>}
  </section>
}

export function CreatorPlaylistDetail({ playlist, tableProps }: { playlist: CreatorPlaylist; tableProps: Omit<CreatorContentTableProps, 'videos' | 'playlistId'> }) {
  const [preview, setPreview] = useState<YouTubePlaylistPreview | null>(null)
  const [loadingOrder, setLoadingOrder] = useState(true)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (playlist.videos.some(video => video.tags?.some(tag => tag.startsWith(`playlist-name:${playlist.id}:`)))) {
      setLoadingOrder(false); setPreview(null); setError(""); return
    }
    const controller = new AbortController()
    setLoadingOrder(true); setPreview(null); setError("")
    fetch(`/api/creator/playlists?${new URLSearchParams({ url: `https://www.youtube.com/playlist?list=${playlist.id}` })}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'YouTube playlist order is unavailable.')
        return body as YouTubePlaylistPreview
      })
      .then(value => { if (!controller.signal.aborted) setPreview(value) })
      .catch(() => { if (!controller.signal.aborted) setError('YouTube order is unavailable. Showing imported order.') })
      .finally(() => { if (!controller.signal.aborted) setLoadingOrder(false) })
    return () => controller.abort()
  }, [playlist.id, playlist.videos, retry])
  const ordered = useMemo(() => {
    const durations = new Map(preview?.items.map(item => [item.youtubeId, item.durationSeconds]))
    return orderCreatorPlaylistVideos(playlist.videos, preview).map(video => video.durationSeconds > 0 ? video : { ...video, durationSeconds: durations.get(video.youtubeId) || 0 })
  }, [playlist.videos, preview])
  const next = ordered.find(video => video.keyframes.length === 0) ?? ordered[0]
  return <section aria-label="Playlist workspace" className="space-y-6">
    <Button asChild variant="ghost" className="-ml-3"><Link href="/creator/playlists"><ArrowLeft className="mr-2 h-4 w-4" />All playlists</Link></Button>
    <div className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground sm:flex-row sm:items-center">
      <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Playlist</p><h2 className="text-xl font-semibold">{playlist.title}</h2><p className="text-sm text-muted-foreground">{ordered.length} imported videos · {playlist.mappedCount} with map points · {playlist.uploadedCount} uploaded</p><p className="text-xs text-muted-foreground">Map each episode, then continue to the next video.</p></div>
      <div className="flex flex-wrap gap-2">{tableProps.onManagePlaylist && <Button variant="outline" onClick={() => tableProps.onManagePlaylist?.(playlist)}><Pencil className="mr-2 h-4 w-4" />Edit playlist</Button>}
      {next && <Button asChild disabled={loadingOrder}><Link aria-disabled={loadingOrder} tabIndex={loadingOrder ? -1 : undefined} onClick={event => { if (loadingOrder) event.preventDefault() }} href={playlistEditorHref(next.id, playlist.id)}>{loadingOrder ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ListVideo className="mr-2 h-4 w-4" />}{playlist.mappedCount === ordered.length ? 'Review maps' : playlist.mappedCount ? 'Continue mapping' : 'Start mapping'}</Link></Button>}</div>
    </div>
    {loadingOrder && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading playlist order…</p>}
    {error && <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{error}<Button variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>Retry order</Button></div>}
    <CreatorContentTable key={playlist.id} {...tableProps} videos={ordered} playlistId={playlist.id} />
  </section>
}
