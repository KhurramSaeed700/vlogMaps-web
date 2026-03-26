import { ContentPageShell } from "@/components/content-page-shell"

export default function CreatorGuidelinesPage() {
  return (
    <ContentPageShell
      title="Creator Guidelines"
      description="A practical guideline page for the creator application flow."
      backHref="/creator/apply"
      backLabel="Back to Application"
    >
      <div className="space-y-4 text-sm text-gray-600">
        <p>Prefer clear chaptering, meaningful keyframes, and concise descriptions that help viewers understand the route.</p>
        <p>Use location points to enhance the story, not to overload the map with every minor movement.</p>
        <p>As you build the backend, turn these into enforceable publishing rules and moderation checks.</p>
      </div>
    </ContentPageShell>
  )
}
