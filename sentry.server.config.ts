import * as Sentry from "@sentry/nextjs"
import { sharedMonitoringOptions } from "./lib/monitoring/options"

if (sharedMonitoringOptions.enabled) {
  Sentry.init({
    ...sharedMonitoringOptions,
    integrations: integrations => integrations.filter(integration => !["Http", "Console"].includes(integration.name)).concat([
      Sentry.httpIntegration({ maxRequestBodySize: "none", disableIncomingRequestSpans: true, breadcrumbs: false }),
    ]),
  })
}
