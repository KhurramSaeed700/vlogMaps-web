import HomePage from "@/components/home/home-page"
import { listPublishedCreatorVideosFromDb } from "@/lib/creator-videos-db"

// Never cache the public catalog across requests: visibility changes must take effect immediately.
export const dynamic = "force-dynamic"

export default async function Page() {
  const videos = await listPublishedCreatorVideosFromDb()
  // Detailed route geometry belongs on the watch page, not in the home-page HTML.
  const initialVideos = videos.map(({ routeShapes: _routeShapes, ...video }) => video)
  return <HomePage initialVideos={initialVideos} />
}
