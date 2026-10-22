import { CreatorVideoEditorPage } from "@/components/creator/creator-video-editor-page"

export default async function EditCreatorVideoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ playlist?: string; from?: string }> }) {
  const { id } = await params

  const query = await searchParams
  const playlistId = typeof query.playlist === "string" && /^[A-Za-z0-9_-]{10,150}$/.test(query.playlist) ? query.playlist : undefined
  const previousVideoId = typeof query.from === "string" && /^[A-Za-z0-9_-]{1,150}$/.test(query.from) ? query.from : undefined
  return <CreatorVideoEditorPage key={`${id}:${playlistId ?? ""}`} id={id} playlistId={playlistId} previousVideoId={previousVideoId} />
}
