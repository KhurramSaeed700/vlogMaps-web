import * as Sentry from "@sentry/nextjs"
import { sharedMonitoringOptions } from "./lib/monitoring/options"

export async function register() {
  if (!sharedMonitoringOptions.enabled) return
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config")
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config")
}

export const onRequestError = sharedMonitoringOptions.enabled ? Sentry.captureRequestError : () => {}
