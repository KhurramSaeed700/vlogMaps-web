"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import * as Menu from "@radix-ui/react-dropdown-menu"
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Circle, CloudOff, Eye, Globe, Link2, Loader2, Lock, MapPin, ListVideo, MoreHorizontal, Search, SlidersHorizontal, Trash2, UploadCloud, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCompactNumber, formatDuration, type TravelVideo } from "@/lib/demo-data"
import { filterDashboardVideos, type DashboardFilters, type DashboardSort } from "@/lib/creator-dashboard-content"
import { creatorPlaylistHref, type CreatorPlaylist } from "@/lib/creator-playlists"
import { getVideoMappingStatus } from "@/lib/video-mapping-status"
import { fetchCreatorVideoDetails } from "@/lib/creator-video-details-client"
import { playlistEditorHref } from "@/lib/playlist-mapping"
import { isVideoVisibility, normalizeVideoVisibility, videoVisibilities, videoVisibilityDescriptions, videoVisibilityLabels, type VideoVisibility } from "@/lib/video-visibility"

export interface CreatorContentTableProps {
  playlists?: CreatorPlaylist[]
  playlistId?: string
  videos: TravelVideo[]
  loading: boolean
  pendingId: string | null
  onEdit: (video: TravelVideo) => void
  onVisibility: (video: TravelVideo, value: VideoVisibility) => void
  onUpload: (video: TravelVideo) => void
  onUnpublish: (id: string, title: string) => void
  onDelete: (id: string, title: string) => void
}
const menuClass = "z-50 w-64 rounded-lg border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
const itemClass = "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 outline-none focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
const emptyPlaylists: CreatorPlaylist[] = []

export function CreatorContentTable({ videos, loading, pendingId, onEdit, onVisibility, onUpload, onUnpublish, onDelete, playlistId, playlists = emptyPlaylists }: CreatorContentTableProps) {
  const [filters, setFilters] = useState<DashboardFilters>({ query: "", status: "all", visibility: "all", sort: playlistId ? "playlist" : "date", ascending: Boolean(playlistId) })
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const playlistRows = useMemo(() => new Map(playlists.map(playlist => [`playlist:${playlist.id}`, playlist])), [playlists])
  const content = useMemo(() => [...videos, ...playlists.flatMap(playlist => {
    const first = playlist.videos[0]
    if (!first) return []
    return [{ ...first, id: `playlist:${playlist.id}`, title: playlist.title,
      description: `${playlist.videos.length} videos · ${playlist.uploadedCount} uploaded`,
      createdAt: playlist.videos.reduce((latest, video) => video.createdAt > latest ? video.createdAt : latest, first.createdAt),
      views: playlist.videos.reduce((total, video) => total + video.views, 0),
      mapViews: playlist.videos.reduce((total, video) => total + (video.mapViews || 0), 0),
      keyframes: playlist.videos.flatMap(video => video.keyframes),
    }]
  })], [videos, playlists])
  const matchesStatus = useMemo(() => (video: TravelVideo, status: DashboardFilters['status']) => {
    const playlist = playlistRows.get(video.id)
    return status === 'all' || (playlist ? playlist.videos.some(member => member.status === status) : video.status === status)
  }, [playlistRows])
  const filtered = useMemo(() => filterDashboardVideos(content.filter(video => {
    const playlist = playlistRows.get(video.id)
    return (playlist ? playlist.videos : [video]).some(member =>
      (filters.status === 'all' || member.status === filters.status) &&
      (filters.visibility === 'all' || member.status === 'published' && normalizeVideoVisibility(member.visibility) === filters.visibility))
  }), { ...filters, status: 'all', visibility: 'all' }), [content, filters, playlistRows])
  const positions = useMemo(() => new Map(videos.map((video, index) => [video.id, index + 1])), [videos])
  const editHref = (video: TravelVideo) => playlistId ? playlistEditorHref(video.id, playlistId) : `/creator/video/${video.id}/edit`
  const lastPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1)
  const currentPage = Math.min(page, lastPage)
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const [durations, setDurations] = useState<Record<string, number | null>>({})
  const [youtubeViews, setYoutubeViews] = useState<Record<string, number | null>>({})
  const [metadataRetry, setMetadataRetry] = useState(0)
  const metadataCandidates = visible.flatMap(video => {
    const playlist = playlistRows.get(video.id)
    // Only episodes with map points need duration checks for playlist totals.
    return playlist ? playlist.videos.filter(member => member.keyframes.length > 0 && member.durationSeconds <= 0) : [video]
  })
  const missingMetadata = [...new Map(metadataCandidates.filter(video => (!(video.youtubeId in youtubeViews) || durations[video.youtubeId] === null || youtubeViews[video.youtubeId] === null)).map(video => [video.youtubeId, video])).values()]
  const metadataPageKey = metadataCandidates.map(video => `${video.youtubeId}:${video.durationSeconds}`).join(',')
  useEffect(() => {
    if (!missingMetadata.length) return
    let cancelled = false
    void fetchCreatorVideoDetails(missingMetadata.map(video => video.youtubeId)).then(items => {
      if (cancelled) return
      setDurations(current => ({ ...current, ...Object.fromEntries(items.map(item => [item.youtubeId, item.durationSeconds || current[item.youtubeId] || null])) }))
      setYoutubeViews(current => ({ ...current, ...Object.fromEntries(items.map(item => [item.youtubeId, item.views ?? current[item.youtubeId] ?? null])) }))
    })
    return () => { cancelled = true }
    // Local duration updates must not restart the other in-flight requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadataPageKey, metadataRetry])
  useEffect(() => {
    const retry = () => setMetadataRetry(value => value + 1)
    window.addEventListener('online', retry)
    window.addEventListener('focus', retry)
    return () => { window.removeEventListener('online', retry); window.removeEventListener('focus', retry) }
  }, [])
  const updateFilters = (patch: Partial<DashboardFilters>) => { setFilters(current => ({ ...current, ...patch })); setPage(0) }
  const sortBy = (sort: DashboardSort) => updateFilters({ sort, ascending: filters.sort === sort ? !filters.ascending : false })
  const sortIcon = (sort: DashboardSort) => filters.sort === sort ? (filters.ascending ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : null
  const isFiltered = Boolean(filters.query || filters.status !== "all" || filters.visibility !== "all")

  return <section aria-label="Creator videos" aria-busy={loading} className="min-w-0">
    <div className="flex gap-6 border-b border-border" aria-label="Video status filters">
      {([['all', 'All videos'], ['published', 'Uploaded'], ['draft', 'Drafts']] as const).map(([status, label]) => <Button key={status} variant="ghost" onClick={() => updateFilters({ status })} aria-pressed={filters.status === status}
        className={`h-12 rounded-none border-b-2 px-1 hover:bg-transparent ${filters.status === status ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground"}`}>
        {label}<span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{content.filter(video => matchesStatus(video, status)).length}</span>
      </Button>)}
    </div>
    <div className="flex flex-wrap items-center gap-3 border-b border-border py-3">
      <div className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Search your videos" placeholder={playlists.length ? "Search videos and playlists" : "Search your videos"} value={filters.query} onChange={event => updateFilters({ query: event.target.value })} className="h-9 rounded-full bg-muted/50 pl-9 pr-9" />
        {filters.query && <Button variant="ghost" size="icon" aria-label="Clear video search" onClick={() => updateFilters({ query: '' })} className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full"><X className="h-3.5 w-3.5" /></Button>}
      </div>
      <Menu.Root><Menu.Trigger asChild><Button variant="ghost" size="sm" className="gap-2" aria-label="Filter video visibility"><SlidersHorizontal className="h-4 w-4" />{filters.visibility === 'all' ? 'Visibility' : videoVisibilityLabels[filters.visibility]}<ChevronDown className="h-3.5 w-3.5" /></Button></Menu.Trigger>
        <Menu.Portal><Menu.Content align="start" className={menuClass} sideOffset={6}>
          <Menu.RadioGroup value={filters.visibility} onValueChange={value => { if (value === 'all' || isVideoVisibility(value)) updateFilters({ visibility: value }) }}>
            {(['all', ...videoVisibilities] as const).map(value => <Menu.RadioItem key={value} value={value} className={itemClass}><span className="flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground"><Menu.ItemIndicator><Circle className="h-2 w-2 fill-current" /></Menu.ItemIndicator></span>{value === 'all' ? 'All visibility' : videoVisibilityLabels[value]}</Menu.RadioItem>)}
          </Menu.RadioGroup>
        </Menu.Content></Menu.Portal>
      </Menu.Root>
      {isFiltered && <Button variant="ghost" size="sm" onClick={() => updateFilters({ query: '', status: 'all', visibility: 'all' })}>Reset filters</Button>}
      {playlistId && <Button size="sm" variant={filters.sort === 'playlist' ? 'secondary' : 'ghost'} onClick={() => updateFilters({ sort: 'playlist', ascending: true })}>Playlist order</Button>}
      <span className="ml-auto text-xs text-muted-foreground" role="status">{loading ? 'Loading videos…' : `${filtered.length} ${playlists.length ? 'items' : filtered.length === 1 ? 'video' : 'videos'}`}</span>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px] border-collapse text-sm">
        <caption className="sr-only">Your videos and playlists with visibility, mapping status, keyframes, VlogMaps views and YouTube views. Open a playlist to see its videos.</caption>
        <thead><tr className="border-b border-border text-xs text-muted-foreground">
          <th scope="col" className="w-[46%] px-3 py-4 text-left font-medium">{playlists.length ? "Content" : "Video"}</th>
          <th scope="col" className="px-3 py-4 text-left font-medium">Visibility</th>
          <th scope="col" aria-sort={filters.sort === 'keyframes' ? filters.ascending ? 'ascending' : 'descending' : 'none'} className="px-3 py-4 text-right font-medium"><button className="inline-flex items-center gap-1.5 hover:text-foreground" onClick={() => sortBy('keyframes')}>Keyframes {sortIcon('keyframes')}</button></th>
          <th scope="col" aria-sort={filters.sort === 'views' ? filters.ascending ? 'ascending' : 'descending' : 'none'} className="px-3 py-4 text-right font-medium"><button className="inline-flex items-center gap-1.5 hover:text-foreground" onClick={() => sortBy('views')}>Views {sortIcon('views')}</button></th>
          <th scope="col" className="px-3 py-4 text-right font-medium" title="Views on YouTube">YT views</th>
          <th scope="col" className="px-3 py-4 text-right font-medium">Actions</th>
        </tr></thead>
        <tbody>
          {loading ? Array.from({ length: 5 }, (_, index) => <tr key={index} aria-hidden="true" className="border-b border-border"><td className="px-3 py-4"><div className="flex items-center gap-4"><Skeleton className="h-[68px] w-[120px] shrink-0" /><Skeleton className="h-4 w-48" /></div></td>{Array.from({ length: 5 }, (_, cell) => <td key={cell} className="px-3"><Skeleton className="h-4 w-14" /></td>)}</tr>) : visible.map(video => {
            const playlist = playlistRows.get(video.id)
            const playlistStates = playlist?.videos.map(member => getVideoMappingStatus({ ...member, durationSeconds: member.durationSeconds || durations[member.youtubeId] || 0 })) ?? []
            const playlistComplete = playlistStates.filter(state => state === 'mapped').length
            const playlistMapping = playlistStates.filter(state => state === 'mapping').length
            const playlistUnmapped = playlistStates.filter(state => state === 'not-mapped').length
            const playlistChecking = playlistStates.filter(state => state === 'checking').length
            if (playlist) return <tr key={video.id} className="border-b border-border hover:bg-muted/35">
              <td className="px-3 py-4"><Link href={creatorPlaylistHref(playlist.id)} aria-label={`Open playlist ${playlist.title}`} className="flex items-start gap-4 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="relative h-[68px] w-[120px] shrink-0 overflow-hidden rounded-md bg-muted"><Image src={video.thumbnail || '/placeholder.svg'} alt="" fill sizes="120px" className="object-cover" /><span className="absolute bottom-1 right-1 inline-flex items-center gap-1 rounded bg-black/80 px-1 text-[10px] text-white"><ListVideo className="h-3 w-3" />{playlist.videos.length} videos</span></div>
                <div className="min-w-0"><p className="line-clamp-2 font-medium leading-5 hover:underline">{playlist.title}</p><p className="mt-1 text-xs text-muted-foreground">Playlist · {playlist.videos.length} videos</p><p className={`mt-1 text-[11px] ${playlistMapping ? "text-yellow-700 dark:text-yellow-300" : playlistComplete ? "text-teal-700 dark:text-teal-300" : "text-muted-foreground"}`}><span className="text-teal-700 dark:text-teal-300">{playlistComplete} mapped</span> · <span className="text-yellow-700 dark:text-yellow-300">{playlistMapping} mapping</span> · <span className="text-muted-foreground">{playlistUnmapped} not mapped{playlistChecking > 0 ? ` · ${playlistChecking} checking…` : ''}</span></p></div>
              </Link></td>
              <td className="px-3 py-4 text-muted-foreground">{playlist.uploadedCount === 0 ? 'Draft' : playlist.uploadedCount === playlist.videos.length ? 'Uploaded' : 'Partly uploaded'}</td>
              <td className="px-3 py-4 text-right tabular-nums">{video.keyframes.length}</td><td className="px-3 py-4 text-right tabular-nums">{formatCompactNumber(video.mapViews || 0)}</td>
              <td className="px-3 py-4 text-right tabular-nums">{formatCompactNumber(video.views)}</td>
              <td className="px-3 py-4 text-right"><Button asChild variant="ghost" size="sm"><Link href={creatorPlaylistHref(playlist.id)}>Open playlist<ChevronRight className="ml-1 h-4 w-4" /></Link></Button></td>
            </tr>
            const mappingStatus = getVideoMappingStatus({ ...video, durationSeconds: video.durationSeconds || durations[video.youtubeId] || 0 })
            const mappingLabel = mappingStatus === 'mapped' ? 'Mapped' : mappingStatus === 'mapping' ? 'Mapping' : mappingStatus === 'checking' ? durations[video.youtubeId] === null ? 'Retry duration' : 'Checking…' : 'Not mapped'
            const editable = video.viewerCanEdit !== false
            const uploaded = video.status === 'published'
            const visibility = normalizeVideoVisibility(video.visibility)
            const Icon = visibility === 'private' ? Lock : visibility === 'unlisted' ? Link2 : Globe
            const busy = pendingId === video.id
            const disabled = Boolean(pendingId)
            return <tr key={video.id} className={`group border-b border-border transition-colors hover:bg-muted/35 ${editable ? 'cursor-pointer' : ''} ${mappingStatus === 'mapped' ? 'bg-teal-500/[0.035]' : mappingStatus === 'mapping' ? 'bg-yellow-500/[0.035]' : ''}`}
              onClick={event => { if (editable && !(event.target as HTMLElement).closest('a,button,[role="menuitem"],[role="menuitemradio"]')) onEdit(video) }}>
              <td className="px-3 py-4"><div className="flex items-start gap-4">
                {playlistId && <span className="w-5 shrink-0 pt-5 text-center text-xs tabular-nums text-muted-foreground">{positions.get(video.id)}</span>}
                <Link href={editable ? editHref(video) : `/watch/${video.id}`} aria-label={`${editable ? 'Edit' : 'Watch'} ${video.title}`} className="relative h-[68px] w-[120px] shrink-0 overflow-hidden rounded-md bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Image src={video.thumbnail || '/placeholder.svg'} alt="" fill sizes="120px" className="object-cover" />
                  <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] font-medium text-white">{(video.durationSeconds || durations[video.youtubeId]) ? formatDuration(video.durationSeconds || durations[video.youtubeId]!) : video.youtubeId in durations ? '—' : '…'}</span>
                </Link>
                <div className="min-w-0"><Link href={editable ? editHref(video) : `/watch/${video.id}`} className="line-clamp-2 font-medium leading-5 hover:underline">{video.title}</Link>
                  <p className="mt-1 line-clamp-1 max-w-md text-xs text-muted-foreground">{video.description || 'No description'}</p>
                  <div className="mt-1 flex h-4 items-center gap-2"><span title={mappingStatus === "checking" ? "Video duration is needed to check whether timestamps reach the final 5 minutes." : mappingStatus === "mapping" ? "Mapping has not reached the final 5 minutes of the video." : mappingStatus === "mapped" ? "Mapping reaches the final 5 minutes of the video." : "No map points yet."} className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 text-[11px] leading-4 font-medium ${mappingStatus === 'mapped' ? 'bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300' : mappingStatus === 'mapping' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300' : 'bg-muted text-muted-foreground'}`}><MapPin className="h-3 w-3" aria-hidden="true" />{mappingLabel}</span>{mappingStatus === 'checking' && durations[video.youtubeId] === null && <button type="button" aria-label={`Retry duration for ${video.title}`} title="Retry duration" className="shrink-0 text-xs text-muted-foreground hover:text-foreground" onClick={() => setMetadataRetry(value => value + 1)}>↻</button>}<span className="truncate text-[11px] text-muted-foreground">{video.locations.slice(0, 2).join(' · ')}</span></div>
                </div>
              </div></td>
              <td className="px-3 py-4">
                {uploaded && editable ? <Menu.Root><Menu.Trigger asChild><Button variant="ghost" size="sm" disabled={disabled} aria-label={`Change visibility for ${video.title}`} className="-ml-2 gap-2 px-2 font-normal">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4 text-muted-foreground" />}{busy ? 'Saving…' : videoVisibilityLabels[visibility]}<ChevronDown className="h-3 w-3 text-muted-foreground" /></Button></Menu.Trigger>
                  <Menu.Portal><Menu.Content className={menuClass} sideOffset={6}><Menu.Label className="px-3 py-2 text-xs text-muted-foreground">Visibility on TravelMap</Menu.Label><Menu.RadioGroup value={visibility} onValueChange={value => { if (isVideoVisibility(value)) onVisibility(video, value) }}>
                    {videoVisibilities.map(value => <Menu.RadioItem key={value} value={value} disabled={disabled} className={itemClass}><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-muted-foreground"><Menu.ItemIndicator><Circle className="h-2 w-2 fill-current" /></Menu.ItemIndicator></span><span>{videoVisibilityLabels[value]}<span className="mt-0.5 block text-xs text-muted-foreground">{videoVisibilityDescriptions[value]}</span></span></Menu.RadioItem>)}
                  </Menu.RadioGroup></Menu.Content></Menu.Portal>
                </Menu.Root> : <span className="inline-flex items-center gap-2 text-muted-foreground">{uploaded ? <Icon className="h-4 w-4" /> : <Lock className="h-4 w-4" />}{uploaded ? videoVisibilityLabels[visibility] : 'Draft'}</span>}
              </td>
              <td className="px-3 py-4 text-right tabular-nums">{video.keyframes.length}</td>
              <td className="px-3 py-4 text-right tabular-nums">{formatCompactNumber(video.mapViews || 0)}</td>
              <td className="px-3 py-4 text-right tabular-nums">{playlist ? formatCompactNumber(video.views) : youtubeViews[video.youtubeId] != null ? formatCompactNumber(youtubeViews[video.youtubeId]!) : video.views > 0 ? formatCompactNumber(video.views) : video.youtubeId in youtubeViews ? "—" : "…"}</td>
              <td className="px-3 py-4"><div className="flex justify-end gap-1">
                {!uploaded && editable && <Button variant="ghost" size="icon" aria-label={`Upload ${video.title}`} title="Upload video" disabled={disabled} onClick={() => onUpload(video)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}</Button>}
                <Button asChild variant="ghost" size="icon" title="Preview"><Link aria-label={`Preview ${video.title}`} href={`/watch/${video.id}`}><Eye className="h-4 w-4" /></Link></Button>
                <Menu.Root><Menu.Trigger asChild><Button variant="ghost" size="icon" aria-label={`Open options for ${video.title}`}><MoreHorizontal className="h-4 w-4" /></Button></Menu.Trigger><Menu.Portal><Menu.Content align="end" className={menuClass} sideOffset={6}>
                  {editable && <Menu.Item asChild><Link className={itemClass} href={editHref(video)}>Edit video</Link></Menu.Item>}
                  {uploaded && editable && <Menu.Item className={itemClass} disabled={disabled} onSelect={() => onUnpublish(video.id, video.title)}><CloudOff className="h-4 w-4" />Move to drafts</Menu.Item>}
                  <Menu.Item className={`${itemClass} text-destructive`} disabled={!editable || disabled} onSelect={() => onDelete(video.id, video.title)}><Trash2 className="h-4 w-4" />Delete video</Menu.Item>
                </Menu.Content></Menu.Portal></Menu.Root>
              </div></td>
            </tr>
          })}
          {!loading && !visible.length && <tr><td colSpan={6} className="px-6 py-16 text-center"><Search className="mx-auto mb-3 h-7 w-7 text-muted-foreground" /><p className="font-medium">{content.length ? 'No videos match your filters' : 'Your travel stories start here'}</p><p className="mt-2 text-sm text-muted-foreground">{content.length ? 'Try another search or reset your filters.' : 'Paste a YouTube URL above to create your first mapped video.'}</p>{isFiltered && <Button variant="outline" className="mt-4" onClick={() => updateFilters({ query: '', status: 'all', visibility: 'all' })}>Reset filters</Button>}</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="flex items-center justify-end gap-4 py-4 text-xs text-muted-foreground">
      <label className="flex items-center gap-2"><select aria-label="Rows per page" value={pageSize}
        onChange={event => { const size = Number(event.target.value); if ([10, 30, 50].includes(size)) { setPageSize(size); setPage(0) } }}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {[10, 30, 50].map(size => <option key={size} value={size}>{size}</option>)}
      </select><span>{playlists.length ? 'items' : 'videos'} per page</span></label><span>{filtered.length ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, filtered.length)} of ${filtered.length}` : '0 videos'}</span>
      <Button variant="ghost" size="icon" aria-label="Previous video page" disabled={loading || currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Next video page" disabled={loading || currentPage === lastPage} onClick={() => setPage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></Button>
    </div>
  </section>
}
