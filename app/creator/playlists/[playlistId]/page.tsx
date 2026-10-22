import { notFound } from "next/navigation"
import { CreatorStudio } from "@/components/creator/creator-studio"

export default async function CreatorPlaylistPage({ params }: { params: Promise<{ playlistId: string }> }) {
  const { playlistId } = await params
  if (!/^[A-Za-z0-9_-]{10,150}$/.test(playlistId)) notFound()
  return <CreatorStudio section="playlists" playlistId={playlistId} />
}
