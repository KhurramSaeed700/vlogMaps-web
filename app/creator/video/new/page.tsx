import { ContentPageShell } from "@/components/app-shell/content-page-shell"
import { CreatorAccessGuard } from "@/components/creator/creator-access-guard"
import { CreatorVideoWorkspace } from "@/components/creator/creator-video-workspace"

export default function NewCreatorVideoPage() {
  return (
    <ContentPageShell
      title="Creator Video Workspace"
      description="Paste a YouTube URL or pick an existing creator video, then jump straight into timestamp and map capture."
      backHref="/creator/dashboard"
      backLabel="Back to Dashboard"
      pageClassName="min-h-screen bg-background"
      mainClassName="container mx-auto max-w-5xl px-4 py-8"
      showIntro={false}
      framedContent={false}
    >
      <CreatorAccessGuard>
        <CreatorVideoWorkspace />
      </CreatorAccessGuard>
    </ContentPageShell>
  )
}
