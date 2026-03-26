"use client"

import { CreatorVideoEditorPage } from "@/components/creator-video-editor-page"

export default function EditCreatorVideoPage({ params }: { params: { id: string } }) {
  return <CreatorVideoEditorPage id={params.id} />
}
