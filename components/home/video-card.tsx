import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCompactNumber, formatDuration } from "@/lib/demo-data"
import type { HydratedTravelVideo } from "@/lib/youtube-client"

interface HomeVideoCardProps {
  video: HydratedTravelVideo
}

export function HomeVideoCard({ video }: HomeVideoCardProps) {
  return (
    <Link href={`/watch/${video.id}`} className="group block">
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-2xl bg-slate-100">
          <img
            src={video.thumbnail || "/placeholder.svg"}
            alt={video.title}
            className="aspect-video w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
          <div className="absolute left-3 top-3">
            <Badge className="border-0 bg-black/75 text-white">Live map</Badge>
          </div>
          <div className="absolute bottom-3 right-3 rounded bg-black/80 px-2 py-1 text-xs text-white">
            {formatDuration(video.durationSeconds)}
          </div>
        </div>

        <div className="space-y-1 px-1">
          {video.isMetadataLoading ? (
            <>
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-4 w-3/5" />
            </>
          ) : (
            <>
              <h2 className="line-clamp-2 text-[15px] font-semibold leading-5 text-slate-950">{video.title}</h2>
              <p className="text-sm text-slate-600">{video.creator}</p>
              <p className="text-sm text-slate-500">
                {video.hasLiveViewCount ? `${formatCompactNumber(video.views)} views - ` : ""}
                {video.locations[0] ?? "Route pending"}
              </p>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}

export function HomeVideoSkeletonCard() {
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl bg-slate-100">
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <div className="absolute left-3 top-3">
          <Skeleton className="h-6 w-16 rounded-full bg-slate-300/80" />
        </div>
        <div className="absolute bottom-3 right-3">
          <Skeleton className="h-6 w-14 rounded-md bg-slate-300/80" />
        </div>
      </div>

      <div className="space-y-2 px-1">
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  )
}
