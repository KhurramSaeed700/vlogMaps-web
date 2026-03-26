import { ContentPageShell } from "@/components/content-page-shell"

export default function TermsPage() {
  return (
    <ContentPageShell
      title="Terms of Service"
      description="A starter terms page so the account and footer flows no longer lead to missing routes."
    >
      <div className="space-y-4 text-sm text-gray-600">
        <p>TravelMap is intended for lawful viewing and creator uploads that you own or are authorized to use.</p>
        <p>Creators should only connect videos and map data that belong to them, and should not upload misleading location information.</p>
        <p>Replace this draft with reviewed legal language before public launch.</p>
      </div>
    </ContentPageShell>
  )
}
