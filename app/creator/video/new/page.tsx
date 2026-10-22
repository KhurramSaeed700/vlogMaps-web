import { extractYouTubePlaylistId } from "@/lib/youtube-playlist"
import { extractYouTubeId } from "@/lib/youtube"
import { ContentPageShell } from "@/components/app-shell/content-page-shell"
import { CreatorAccessGuard } from "@/components/creator/creator-access-guard"
import { CreatorVideoWorkspace } from "@/components/creator/creator-video-workspace"

export default async function NewCreatorVideoPage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const query = await searchParams
  const initialUrl = typeof query.url === "string" && (extractYouTubePlaylistId(query.url) || extractYouTubeId(query.url)) ? query.url : ""
  return (
    <ContentPageShell
      title="Creator Video Workspace"
      description="Paste a YouTube video or playlist URL, or pick an existing creator video, then jump straight into timestamp and map capture."
      backHref="/creator/dashboard"
      backLabel="Back to Dashboard"
      pageClassName="min-h-screen bg-background"
      mainClassName="container mx-auto max-w-5xl px-4 py-8"
      showIntro={false}
      framedContent={false}
    >
      <CreatorAccessGuard>
        <CreatorVideoWorkspace key={initialUrl} initialUrl={initialUrl} />
      </CreatorAccessGuard>
    </ContentPageShell>
  )
}
