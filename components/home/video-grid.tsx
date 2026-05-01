import type { HydratedTravelVideo } from "@/lib/youtube-client"
import { homeSkeletonCardCount } from "./home-preferences"
import { HomeVideoCard, HomeVideoSkeletonCard } from "./video-card"

interface HomeVideoGridProps {
  isCatalogLoading: boolean
  videos: HydratedTravelVideo[]
}

export function HomeVideoGrid({ isCatalogLoading, videos }: HomeVideoGridProps) {
  return (
    <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {isCatalogLoading &&
        Array.from({ length: homeSkeletonCardCount }, (_, index) => <HomeVideoSkeletonCard key={`home-skeleton-${index}`} />)}

      {videos.map((video) => (
        <HomeVideoCard key={video.id} video={video} />
      ))}
    </div>
  )
}
