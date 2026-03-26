import { ContentPageShell } from "@/components/content-page-shell"
import { Button } from "@/components/ui/button"

export default function ContactPage() {
  return (
    <ContentPageShell
      title="Contact"
      description="A simple support page so users have somewhere intentional to go while the full support flow is being built."
    >
      <div className="space-y-4 text-sm text-gray-600">
        <p>For now, the cleanest next step is to connect this page to your real support inbox or help desk.</p>
        <p>Good launch additions would be creator support, DMCA/copyright reporting, and account recovery guidance.</p>
        <a href="mailto:support@travelmap.example">
          <Button>Contact Support</Button>
        </a>
      </div>
    </ContentPageShell>
  )
}
