import * as Sentry from "@sentry/nextjs"
import { sharedMonitoringOptions } from "./lib/monitoring/options"
import { sanitizeDiagnosticValue, sanitizeMonitoringEvent } from "./lib/monitoring/privacy"

Sentry.init({
  ...sharedMonitoringOptions,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: process.env.NEXT_PUBLIC_SENTRY_REPLAY_ENABLED === "true" ? 0.1 : 0,
  // Ignore arbitrary console/DOM text; record deliberate diagnostic events instead.
  integrations: integrations => integrations.filter(integration => !["Breadcrumbs", "Console"].includes(integration.name)).concat([
    Sentry.breadcrumbsIntegration({ dom: false, fetch: false, xhr: false, history: false, sentry: false }),
    Sentry.feedbackIntegration({
      autoInject: false, colorScheme: "system", showName: false, showEmail: false,
      enableScreenshot: false, formTitle: "Report a problem", submitButtonLabel: "Send report",
      messagePlaceholder: "What happened, and what were you trying to do? Avoid including private information.",
      useSentryUser: { name: "", email: "" },
    }),
  ]),
  beforeBreadcrumb: breadcrumb => {
    if (breadcrumb.category !== "vlogmaps") return null
    return sanitizeDiagnosticValue(breadcrumb) as typeof breadcrumb
  },
})

// Feedback events bypass beforeSend in the SDK; apply the same privacy filter explicitly.
Sentry.addEventProcessor(event => event.type === "feedback" ? sanitizeMonitoringEvent(event) : event)

// Replay is optional and lazy: no video/canvas capture and no routine-session recording.
if (process.env.NEXT_PUBLIC_SENTRY_REPLAY_ENABLED === "true") {
  import("@sentry/nextjs").then(Sentry => {
    Sentry.addIntegration(Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true }))
  }).catch(() => { /* Errors and diagnostics remain available without replay. */ })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
