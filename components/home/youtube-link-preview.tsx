"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ListVideo, Loader2, Play } from "lucide-react"
import { formatCompactNumber, formatDuration } from "@/lib/demo-data"
import { extractYouTubePlaylistId } from "@/lib/youtube-playlist"
import { extractYouTubeId, getYouTubeThumbnailUrl } from "@/lib/youtube"
import type { YouTubeLinkPreviewData } from "@/lib/youtube-link-preview"

export function YouTubeLinkPreview({ url, userId, isCreator }: { url: string; userId?: string; isCreator: boolean }) {
  const playlistId = extractYouTubePlaylistId(url)
  const videoId = extractYouTubeId(url)
  const kind = playlistId ? "playlist" : "video"
  const requestKey = `${userId ?? "anonymous"}:${url.trim()}`
  const [result, setResult] = useState<{ key: string; data?: YouTubeLinkPreviewData; error?: string } | null>(null)
  const current = result?.key === requestKey ? result : null
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetch(`/api/youtube/link-preview?${new URLSearchParams({ url: url.trim() })}`, { cache: "no-store", signal: controller.signal }).then(async response => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "Unable to load preview.")
        if (!controller.signal.aborted) setResult({ key: requestKey, data: body })
      }).catch(error => { if (!controller.signal.aborted) setResult({ key: requestKey, error: error instanceof Error ? error.message : "Unable to load preview." }) })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [requestKey, url])
  const data = current?.data
  const thumbnail = data?.thumbnail || (videoId ? getYouTubeThumbnailUrl(videoId) : null)
  const creatorHref = data?.editVideoId ? `/creator/video/${encodeURIComponent(data.editVideoId)}/edit` : `/creator/video/new?${new URLSearchParams({ url: url.trim() })}`
  return (
    <div className="pointer-events-none absolute left-0 right-0 top-full z-50 pt-2">
      <div aria-label={`YouTube ${kind} preview`} className="pointer-events-auto flex w-full overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl">
        <div className="relative flex min-h-24 w-24 shrink-0 items-center justify-center overflow-hidden bg-muted sm:w-36">
          {thumbnail ? <Image src={thumbnail} alt="" fill sizes="144px" className="object-cover" /> : <ListVideo className="h-9 w-9 text-muted-foreground" />}
          <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded bg-black/80 px-1.5 py-1 text-[10px] font-semibold text-white">{playlistId ? <ListVideo className="h-3 w-3" /> : <Play className="h-3 w-3" />}{playlistId ? "Playlist" : data?.durationSeconds ? formatDuration(data.durationSeconds) : "Video"}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5 p-3">
          <p className="text-xs font-semibold text-muted-foreground">{playlistId ? `YouTube playlist${data?.totalVideos != null ? ` · ${data.totalVideos.toLocaleString()} videos` : ""}` : "YouTube video"}</p>
          <p className="line-clamp-2 text-sm font-semibold leading-5">{data?.title || (playlistId ? "YouTube playlist" : "YouTube video")}</p>
          {data?.creator && <p className="truncate text-xs text-muted-foreground">{data.creator}</p>}
          {!playlistId && data?.views != null && <p className="text-xs text-muted-foreground">{formatCompactNumber(data.views)} views</p>}
          {!current && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{playlistId ? "Loading playlist and video count…" : "Checking video…"}</p>}
          {current?.error && <p role="status" className="text-xs text-muted-foreground">{current.error}</p>}
          {data && <p className="text-xs text-muted-foreground">{data.added === null ? "VlogMaps availability could not be checked." : data.added ? playlistId ? "Videos from this playlist are already on VlogMaps." : "Already on VlogMaps." : "Not yet added to VlogMaps."}</p>}
          {isCreator && data && <Link href={creatorHref} className="inline-flex rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{data?.editVideoId ? "Edit in Creator Studio" : playlistId ? "Import playlist in Creator Studio" : "Add in Creator Studio"}</Link>}
        </div>
      </div>
    </div>
  )
}
