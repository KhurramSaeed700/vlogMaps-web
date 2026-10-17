import * as Sentry from "@sentry/nextjs"
import { sharedMonitoringOptions } from "./lib/monitoring/options"

Sentry.init(sharedMonitoringOptions)
