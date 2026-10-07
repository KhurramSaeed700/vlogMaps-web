"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import * as Menu from "@radix-ui/react-dropdown-menu"
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Circle, CloudOff, Eye, Globe, Link2, Loader2, Lock, MoreHorizontal, Search, SlidersHorizontal, Trash2, UploadCloud, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCompactNumber, formatDuration, type TravelVideo } from "@/lib/demo-data"
import { filterDashboardVideos, type DashboardFilters, type DashboardSort } from "@/lib/creator-dashboard-content"
import { isVideoVisibility, normalizeVideoVisibility, videoVisibilities, videoVisibilityDescriptions, videoVisibilityLabels, type VideoVisibility } from "@/lib/video-visibility"

interface Props {
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
const pageSize = 10

export function CreatorContentTable({ videos, loading, pendingId, onEdit, onVisibility, onUpload, onUnpublish, onDelete }: Props) {
  const [filters, setFilters] = useState<DashboardFilters>({ query: "", status: "all", visibility: "all", sort: "date", ascending: false })
  const [page, setPage] = useState(0)
  const filtered = useMemo(() => filterDashboardVideos(videos, filters), [videos, filters])
  const lastPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1)
  const currentPage = Math.min(page, lastPage)
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const updateFilters = (patch: Partial<DashboardFilters>) => { setFilters(current => ({ ...current, ...patch })); setPage(0) }
  const sortBy = (sort: DashboardSort) => updateFilters({ sort, ascending: filters.sort === sort ? !filters.ascending : false })
  const sortIcon = (sort: DashboardSort) => filters.sort === sort ? (filters.ascending ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : null
  const isFiltered = Boolean(filters.query || filters.status !== "all" || filters.visibility !== "all")

  return <section aria-label="Creator videos" aria-busy={loading} className="min-w-0">
    <div className="flex gap-6 border-b border-border" aria-label="Video status filters">
      {([['all', 'All videos'], ['published', 'Uploaded'], ['draft', 'Drafts']] as const).map(([status, label]) => <Button key={status} variant="ghost" onClick={() => updateFilters({ status })} aria-pressed={filters.status === status}
        className={`h-12 rounded-none border-b-2 px-1 hover:bg-transparent ${filters.status === status ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground"}`}>
        {label}<span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{status === 'all' ? videos.length : videos.filter(video => video.status === status).length}</span>
      </Button>)}
    </div>
    <div className="flex flex-wrap items-center gap-3 border-b border-border py-3">
      <div className="relative w-full sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Search your videos" placeholder="Search your videos" value={filters.query} onChange={event => updateFilters({ query: event.target.value })} className="h-9 rounded-full bg-muted/50 pl-9 pr-9" />
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
      <span className="ml-auto text-xs text-muted-foreground" role="status">{loading ? 'Loading videos…' : `${filtered.length} ${filtered.length === 1 ? 'video' : 'videos'}`}</span>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px] border-collapse text-sm">
        <caption className="sr-only">Your travel videos with visibility, upload date, keyframes and views. Click a video to edit.</caption>
        <thead><tr className="border-b border-border text-xs text-muted-foreground">
          <th scope="col" className="w-[46%] px-3 py-4 text-left font-medium">Video</th>
          <th scope="col" className="px-3 py-4 text-left font-medium">Visibility</th>
          <th scope="col" aria-sort={filters.sort === 'date' ? filters.ascending ? 'ascending' : 'descending' : 'none'} className="px-3 py-4 text-left font-medium"><button className="inline-flex items-center gap-1.5 hover:text-foreground" onClick={() => sortBy('date')}>Date {sortIcon('date')}</button></th>
          <th scope="col" aria-sort={filters.sort === 'keyframes' ? filters.ascending ? 'ascending' : 'descending' : 'none'} className="px-3 py-4 text-right font-medium"><button className="inline-flex items-center gap-1.5 hover:text-foreground" onClick={() => sortBy('keyframes')}>Keyframes {sortIcon('keyframes')}</button></th>
          <th scope="col" aria-sort={filters.sort === 'views' ? filters.ascending ? 'ascending' : 'descending' : 'none'} className="px-3 py-4 text-right font-medium"><button className="inline-flex items-center gap-1.5 hover:text-foreground" onClick={() => sortBy('views')}>Views {sortIcon('views')}</button></th>
          <th scope="col" className="px-3 py-4 text-right font-medium">Actions</th>
        </tr></thead>
        <tbody>
          {loading ? Array.from({ length: 5 }, (_, index) => <tr key={index} aria-hidden="true" className="border-b border-border"><td className="px-3 py-4"><div className="flex items-center gap-4"><Skeleton className="h-[68px] w-[120px] shrink-0" /><Skeleton className="h-4 w-48" /></div></td>{Array.from({ length: 5 }, (_, cell) => <td key={cell} className="px-3"><Skeleton className="h-4 w-14" /></td>)}</tr>) : visible.map(video => {
            const editable = video.viewerCanEdit !== false
            const uploaded = video.status === 'published'
            const visibility = normalizeVideoVisibility(video.visibility)
            const Icon = visibility === 'private' ? Lock : visibility === 'unlisted' ? Link2 : Globe
            const busy = pendingId === video.id
            const disabled = Boolean(pendingId)
            return <tr key={video.id} className={`group border-b border-border transition-colors hover:bg-muted/35 ${editable ? 'cursor-pointer' : ''}`}
              onClick={event => { if (editable && !(event.target as HTMLElement).closest('a,button,[role="menuitem"],[role="menuitemradio"]')) onEdit(video) }}>
              <td className="px-3 py-4"><div className="flex items-start gap-4">
                <Link href={editable ? `/creator/video/${video.id}/edit` : `/watch/${video.id}`} aria-label={`${editable ? 'Edit' : 'Watch'} ${video.title}`} className="relative h-[68px] w-[120px] shrink-0 overflow-hidden rounded-md bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Image src={video.thumbnail || '/placeholder.svg'} alt="" fill sizes="120px" className="object-cover" />
                  <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] font-medium text-white">{formatDuration(video.durationSeconds)}</span>
                </Link>
                <div className="min-w-0"><Link href={editable ? `/creator/video/${video.id}/edit` : `/watch/${video.id}`} className="line-clamp-2 font-medium leading-5 hover:underline">{video.title}</Link>
                  <p className="mt-1 line-clamp-1 max-w-md text-xs text-muted-foreground">{video.description || 'No description'}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{video.locations.slice(0, 2).join(' · ') || 'No mapped locations yet'}</p>
                </div>
              </div></td>
              <td className="px-3 py-4">
                {uploaded && editable ? <Menu.Root><Menu.Trigger asChild><Button variant="ghost" size="sm" disabled={disabled} aria-label={`Change visibility for ${video.title}`} className="-ml-2 gap-2 px-2 font-normal">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4 text-muted-foreground" />}{busy ? 'Saving…' : videoVisibilityLabels[visibility]}<ChevronDown className="h-3 w-3 text-muted-foreground" /></Button></Menu.Trigger>
                  <Menu.Portal><Menu.Content className={menuClass} sideOffset={6}><Menu.Label className="px-3 py-2 text-xs text-muted-foreground">Visibility on TravelMap</Menu.Label><Menu.RadioGroup value={visibility} onValueChange={value => { if (isVideoVisibility(value)) onVisibility(video, value) }}>
                    {videoVisibilities.map(value => <Menu.RadioItem key={value} value={value} disabled={disabled} className={itemClass}><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-muted-foreground"><Menu.ItemIndicator><Circle className="h-2 w-2 fill-current" /></Menu.ItemIndicator></span><span>{videoVisibilityLabels[value]}<span className="mt-0.5 block text-xs text-muted-foreground">{videoVisibilityDescriptions[value]}</span></span></Menu.RadioItem>)}
                  </Menu.RadioGroup></Menu.Content></Menu.Portal>
                </Menu.Root> : <span className="inline-flex items-center gap-2 text-muted-foreground">{uploaded ? <Icon className="h-4 w-4" /> : <Lock className="h-4 w-4" />}{uploaded ? videoVisibilityLabels[visibility] : 'Draft'}</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-xs"><span>{new Date(video.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span><span className="mt-1 block text-muted-foreground">{uploaded ? 'Uploaded' : 'Created'}</span></td>
              <td className="px-3 py-4 text-right tabular-nums">{video.keyframes.length}</td>
              <td className="px-3 py-4 text-right tabular-nums">{formatCompactNumber(video.views)}</td>
              <td className="px-3 py-4"><div className="flex justify-end gap-1">
                {!uploaded && editable && <Button variant="ghost" size="icon" aria-label={`Upload ${video.title}`} title="Upload video" disabled={disabled} onClick={() => onUpload(video)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}</Button>}
                <Button asChild variant="ghost" size="icon" title="Preview"><Link aria-label={`Preview ${video.title}`} href={`/watch/${video.id}`}><Eye className="h-4 w-4" /></Link></Button>
                <Menu.Root><Menu.Trigger asChild><Button variant="ghost" size="icon" aria-label={`Open options for ${video.title}`}><MoreHorizontal className="h-4 w-4" /></Button></Menu.Trigger><Menu.Portal><Menu.Content align="end" className={menuClass} sideOffset={6}>
                  {editable && <Menu.Item asChild><Link className={itemClass} href={`/creator/video/${video.id}/edit`}>Edit video</Link></Menu.Item>}
                  {uploaded && editable && <Menu.Item className={itemClass} disabled={disabled} onSelect={() => onUnpublish(video.id, video.title)}><CloudOff className="h-4 w-4" />Move to drafts</Menu.Item>}
                  <Menu.Item className={`${itemClass} text-destructive`} disabled={!editable || disabled} onSelect={() => onDelete(video.id, video.title)}><Trash2 className="h-4 w-4" />Delete video</Menu.Item>
                </Menu.Content></Menu.Portal></Menu.Root>
              </div></td>
            </tr>
          })}
          {!loading && !visible.length && <tr><td colSpan={6} className="px-6 py-16 text-center"><Search className="mx-auto mb-3 h-7 w-7 text-muted-foreground" /><p className="font-medium">{videos.length ? 'No videos match your filters' : 'Your travel stories start here'}</p><p className="mt-2 text-sm text-muted-foreground">{videos.length ? 'Try another search or reset your filters.' : 'Paste a YouTube URL above to create your first mapped video.'}</p>{isFiltered && <Button variant="outline" className="mt-4" onClick={() => updateFilters({ query: '', status: 'all', visibility: 'all' })}>Reset filters</Button>}</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="flex items-center justify-end gap-4 py-4 text-xs text-muted-foreground">
      <span>10 videos per page</span><span>{filtered.length ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, filtered.length)} of ${filtered.length}` : '0 videos'}</span>
      <Button variant="ghost" size="icon" aria-label="Previous video page" disabled={loading || currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Next video page" disabled={loading || currentPage === lastPage} onClick={() => setPage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></Button>
    </div>
  </section>
}
