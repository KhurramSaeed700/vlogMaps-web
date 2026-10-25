"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Loader2, ListVideo } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { TravelVideo } from "@/lib/demo-data"
import type { YouTubePlaylistPreview } from "@/lib/youtube-playlist"
import { playlistEditorHref } from "@/lib/playlist-mapping"
import { getYouTubeThumbnailUrl } from "@/lib/youtube"
import { buildCreatorVideoStateSnapshot } from "@/lib/creator-videos"
import { fetchCreatorCloudVideos, uploadCreatorVideoToCloud } from "@/lib/creator-videos-cloud-client"

export function PlaylistImporter({ url, onImported, onBusyChange }: { url: string; onImported: (videos: TravelVideo[]) => void; onBusyChange: (busy: boolean) => void }) {
  const [playlist, setPlaylist] = useState<YouTubePlaylistPreview | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [existing, setExisting] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [retry, setRetry] = useState(0)
  const stopRef = useRef(false)
  const mountedRef = useRef(true)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; stopRef.current = true } }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setMessage(""); setPlaylist(null)
    Promise.all([
      fetch(`/api/creator/playlists?${new URLSearchParams({ url })}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "Unable to load playlist.")
        return body as YouTubePlaylistPreview
      }),
      fetchCreatorCloudVideos(controller.signal).then(response => {
        if (!response.configured || response.error || response.status) throw new Error("Unable to check your video library. Please try again.")
        return response.videos
      }),
    ]).then(([preview, videos]) => {
      if (controller.signal.aborted) return
      const imported = new Map(videos.map(video => [video.youtubeId, video.id]))
      setExisting(imported); setPlaylist(preview)
      setSelected(new Set(preview.items.filter(item => !imported.has(item.youtubeId)).map(item => item.youtubeId)))
    }).catch(error => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Unable to load playlist.") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [url, retry])

  async function importVideos() {
    if (!playlist || busy) return
    const items = playlist.items.filter(item => selected.has(item.youtubeId) && !existing.has(item.youtubeId))
    if (!items.length) return
    setBusy(true); onBusyChange(true); stopRef.current = false
    setProgress({ done: 0, total: items.length }); setMessage("")
    let imported = 0, failed = 0
    try {
      // Refresh before saving so retries skip items saved by a previous attempt.
      const library = await fetchCreatorCloudVideos()
      if (!library.configured || library.error || library.status) throw new Error("Unable to check your library. Try again before importing.")
      const known = new Map(library.videos.map(video => [video.youtubeId, video.id]))
      for (const [index, item] of items.entries()) {
        if (stopRef.current) break
        if (!known.has(item.youtubeId)) {
          const video: TravelVideo = {
            id: crypto.randomUUID(), youtubeId: item.youtubeId, title: item.title, creator: item.creator,
            creatorChannelUrl: item.channelId ? `https://www.youtube.com/channel/${item.channelId}` : `https://www.youtube.com/watch?v=${item.youtubeId}`,
            thumbnail: getYouTubeThumbnailUrl(item.youtubeId), durationSeconds: item.durationSeconds || 0,
            views: 0, mapViews: 0, likes: 0, status: "published", visibility: "private",
            createdAt: new Date().toISOString(), description: `Imported from ${playlist.title}.`, locations: [], keyframes: [], tags: ["creator", `playlist:${playlist.id}`, `playlist-position:${item.position}`, `playlist-title:${playlist.title.slice(0, 65)}`],
          }
          try {
            const result = await uploadCreatorVideoToCloud(video, buildCreatorVideoStateSnapshot(video))
            if (!result.saved || !result.video) throw new Error("Save failed")
            known.set(item.youtubeId, result.video.id); imported++
          } catch { failed++ }
        }
        if (mountedRef.current) { setExisting(new Map(known)); setProgress({ done: index + 1, total: items.length }) }
      }
      if (mountedRef.current) {
        setSelected(previous => new Set([...previous].filter(id => !known.has(id))))
        setMessage(`${imported} imported as private videos.${failed ? ` ${failed} failed—retry to import the remaining videos.` : stopRef.current ? " Import stopped. You can continue with the remaining videos." : " Ready to map."}`)
        const updated = await fetchCreatorCloudVideos()
        if (mountedRef.current && updated.configured && !updated.error) onImported(updated.videos)
      }
    } catch (error) { if (mountedRef.current) setMessage(error instanceof Error ? error.message : "Import failed. Please retry.") }
    finally { if (mountedRef.current) { setBusy(false); onBusyChange(false) } }
  }

  const available = playlist?.items.filter(item => !existing.has(item.youtubeId)) ?? []
  return (
    <section aria-label="Playlist import" aria-busy={loading || busy} className="space-y-4 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <div className="flex items-center gap-2"><ListVideo className="h-5 w-5" /><h2 className="font-semibold">{playlist?.title || "Playlist import"}</h2></div>
      {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading playlist…</p>}
      {playlist && <>
        <p className="text-sm text-muted-foreground">{playlist.items.length} available videos · {playlist.items.length - available.length} already in your library. Imported videos are private by default. Choose Public in your dashboard when you’re ready.</p>
        {playlist.unavailableCount > 0 && <p className="text-xs text-muted-foreground">{playlist.unavailableCount} unavailable videos skipped.</p>}
        {playlist.truncated && <p className="text-sm text-amber-600 dark:text-amber-400">Showing the first 500 playlist entries.</p>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy || !available.length} checked={available.length > 0 && available.every(item => selected.has(item.youtubeId))} onChange={event => setSelected(new Set(event.target.checked ? available.map(item => item.youtubeId) : []))} />Select all new videos</label>
        <ol className="max-h-96 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {playlist.items.map(item => <li key={item.youtubeId} className="flex items-center gap-3 p-2">
            <input type="checkbox" aria-label={`Import ${item.title}`} disabled={busy || existing.has(item.youtubeId)} checked={selected.has(item.youtubeId) && !existing.has(item.youtubeId)} onChange={event => setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(item.youtubeId); else next.delete(item.youtubeId); return next })} />
            <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">{item.position + 1}</span>
            <Image src={getYouTubeThumbnailUrl(item.youtubeId)} alt="" width={96} height={54} className="hidden rounded object-cover sm:block" />
            <div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.creator}</p></div>
            {existing.has(item.youtubeId) && <Link className="shrink-0 text-xs font-medium text-primary underline" href={playlistEditorHref(existing.get(item.youtubeId)!, playlist.id)}>Map video</Link>}
          </li>)}
        </ol>
        {busy && <div role="status" className="space-y-1 text-sm"><p>Importing {progress.done} of {progress.total}… Keep this page open.</p><progress className="w-full" value={progress.done} max={progress.total} /></div>}
        {playlist.items.some(item => existing.has(item.youtubeId)) && <Button asChild variant="outline"><Link href={`/creator/playlists/${encodeURIComponent(playlist.id)}`}>Open playlist workspace</Link></Button>}
        {playlist.items.some(item => existing.has(item.youtubeId)) && <Button asChild variant="outline"><Link href={playlistEditorHref(existing.get(playlist.items.find(item => existing.has(item.youtubeId))!.youtubeId)!, playlist.id)}>Start mapping playlist</Link></Button>}
        <div className="flex flex-wrap gap-2"><Button onClick={importVideos} disabled={busy || !selected.size}>{busy ? "Importing…" : `Import ${selected.size} videos`}</Button>{busy && <Button variant="outline" onClick={() => { stopRef.current = true }}>Stop after current video</Button>}</div>
      </>}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      {!loading && !playlist && <Button variant="outline" onClick={() => setRetry(value => value + 1)}>Try again</Button>}
    </section>
  )
}
