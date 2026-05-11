import HomePage from "@/components/home/home-page"
import { listPublishedCreatorVideosFromDb } from "@/lib/creator-videos-db"
import { mergeTravelVideos } from "@/lib/creator-videos"
import { getPublishedTravelVideos } from "@/lib/demo-data"

export default async function Page() {
  const cloudVideos = await listPublishedCreatorVideosFromDb()

  return <HomePage initialVideos={mergeTravelVideos(getPublishedTravelVideos(), cloudVideos)} />
}
