import HomePage from "@/components/home/home-page"
import { listHomeFeedVideos } from "@/lib/home-feed"

// Never cache the personalized catalog across requests: visibility changes must take effect immediately.
export const dynamic = "force-dynamic"

export default async function Page() {
  const videos = await listHomeFeedVideos()
  // Detailed route geometry belongs on the watch page, not in the home-page HTML.
  const initialVideos = videos.map(({ routeShapes: _routeShapes, ...video }) => video)
  return <HomePage initialVideos={initialVideos} />
}
