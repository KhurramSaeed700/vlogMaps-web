import { ContentPageShell } from "@/components/content-page-shell"
import { CreatorAccessGuard } from "@/components/creator-access-guard"
import { CreatorVideoWorkspace } from "@/components/creator-video-workspace"

export default function NewCreatorVideoPage() {
  return (
    <ContentPageShell
      title="Creator Video Workspace"
      description="Paste a YouTube URL or pick an existing creator video, then jump straight into timestamp and map capture."
      backHref="/creator/dashboard"
      backLabel="Back to Dashboard"
    >
      <CreatorAccessGuard>
        <CreatorVideoWorkspace />
      </CreatorAccessGuard>
    </ContentPageShell>
  )
}
