import { ContentPageShell } from "@/components/app-shell/content-page-shell"

export default function PrivacyPage() {
  return (
    <ContentPageShell
      title="Privacy Policy"
      description="This lightweight policy page keeps the footer flow intact while you wire in your final legal copy."
    >
      <div className="space-y-4 text-sm text-gray-600">
        <p>TravelMap stores account information through Clerk and is designed to support watch history, favorites, and creator applications.</p>
        <p>We use Sentry to diagnose application errors. Reports include technical details such as browser and device information, the page involved, and recent playback or map actions. Automatic reports filter account information, authentication tokens, request bodies, and route coordinates. Session replay is disabled.</p>
        <p>If you send a problem report, Sentry receives the description you enter. Please avoid including private information.</p>
        <p>Before launch, replace this placeholder with your final data-retention, cookies, analytics, and support contact details.</p>
        <p>Until then, avoid claiming production analytics, retention periods, or document handling workflows that are not implemented yet.</p>
      </div>
    </ContentPageShell>
  )
}
