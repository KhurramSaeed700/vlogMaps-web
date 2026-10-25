import { notFound } from "next/navigation"
import { PlaylistWatchClient } from "@/components/viewer/playlist-watch-client"
import { groupCreatorPlaylists } from "@/lib/creator-playlists"
import { listHomeFeedVideos } from "@/lib/home-feed"

export const dynamic = "force-dynamic"

export default async function PlaylistPage({ params }: { params: Promise<{ playlistId: string }> }) {
  const { playlistId } = await params
  if (!/^[A-Za-z0-9_-]{10,150}$/.test(playlistId)) notFound()
  const playlist = groupCreatorPlaylists(await listHomeFeedVideos()).playlists.find(item => item.id === playlistId)
  if (!playlist) notFound()
  return <PlaylistWatchClient playlist={playlist} />
}
