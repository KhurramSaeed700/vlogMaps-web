import HomePage from "@/components/home/home-page"
import { getPublishedTravelVideos } from "@/lib/demo-data"

export default function Page() {
  return <HomePage initialVideos={getPublishedTravelVideos()} />
}
