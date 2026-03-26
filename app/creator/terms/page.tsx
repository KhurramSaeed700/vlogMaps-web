import { ContentPageShell } from "@/components/content-page-shell"

export default function CreatorTermsPage() {
  return (
    <ContentPageShell
      title="Creator Terms"
      description="These terms set expectations for ownership, accuracy, and respectful use of TravelMap creator tools."
      backHref="/creator/apply"
      backLabel="Back to Application"
    >
      <div className="space-y-4 text-sm text-gray-600">
        <p>Creators should only submit channels and videos they own or directly manage.</p>
        <p>Route data should be materially accurate and should not be used to impersonate real creators or trips.</p>
        <p>Use this page as a real route today, then replace the copy with reviewed policy language before launch.</p>
      </div>
    </ContentPageShell>
  )
}
