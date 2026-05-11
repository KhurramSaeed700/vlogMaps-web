import { CreatorVideoEditorPage } from "@/components/creator/creator-video-editor-page"

export default async function EditCreatorVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  return <CreatorVideoEditorPage id={id} />
}
