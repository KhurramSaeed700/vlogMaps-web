import * as Sentry from "@sentry/nextjs"
import { sharedMonitoringOptions } from "./lib/monitoring/options"

if (sharedMonitoringOptions.enabled) {
  Sentry.init(sharedMonitoringOptions)
}
