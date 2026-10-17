import { ContentPageShell } from "@/components/app-shell/content-page-shell"
import { ReportProblemButton } from "@/components/monitoring/report-problem-button"

export default function ContactPage() {
  return (
    <ContentPageShell
      title="Contact"
      description="Tell us about problems with videos, maps, or the editor."
    >
      <div className="space-y-4 text-sm text-gray-600">
        <p>Having trouble with a video, map, or editor? Describe what happened in a problem report. Please avoid including private information.</p>
        <ReportProblemButton />
      </div>
    </ContentPageShell>
  )
}
