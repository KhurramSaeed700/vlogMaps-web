import { groupCreatorPlaylists } from "@/lib/creator-playlists"
import type { HydratedTravelVideo } from "@/lib/youtube-client"
import { homeSkeletonCardCount } from "./home-preferences"
import { HomePlaylistCard, HomeVideoCard, HomeVideoSkeletonCard } from "./video-card"

interface HomeVideoGridProps {
  showPlaylists?: boolean
  isCatalogLoading: boolean
  videos: HydratedTravelVideo[]
}

export function HomeVideoGrid({ isCatalogLoading, videos, showPlaylists = true }: HomeVideoGridProps) {
  const playlists = showPlaylists ? groupCreatorPlaylists(videos).playlists : []
  return (
    <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {isCatalogLoading &&
        Array.from({ length: homeSkeletonCardCount }, (_, index) => <HomeVideoSkeletonCard key={`home-skeleton-${index}`} />)}

      {playlists.map(playlist => <HomePlaylistCard key={`playlist:${playlist.id}`} playlist={playlist} />)}

      {videos.map((video, index) => (
        <HomeVideoCard key={video.id} video={video} prioritizeThumbnail={index === 0} />
      ))}
    </div>
  )
}
