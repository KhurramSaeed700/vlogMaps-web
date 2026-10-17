import * as Sentry from "@sentry/nextjs"
import { sanitizeDiagnosticText, sanitizeDiagnosticValue } from "./privacy"

type Details = Record<string, string | number | boolean | null | undefined>
const recentErrors = new Map<string, number>()

// Call only at state transitions or failures, never from a map/player frame loop.
export function diagnosticEvent(action: string, details: Details = {}) {
  try {
    Sentry.addBreadcrumb({ category: "vlogmaps", message: action, level: "info", data: sanitizeDiagnosticValue(details) as Details })
  } catch { /* Monitoring must never break playback or saving. */ }
}

export function reportHandledError(error: unknown, operation: string, details: Details = {}) {
  if (error instanceof Error && error.name === "AbortError") return undefined
  const now = Date.now()
  const key = `${operation}:${details.videoId ?? ""}`
  const previous = recentErrors.get(key)
  if (previous !== undefined && now - previous < 60_000) return undefined
  if (recentErrors.size >= 100) recentErrors.clear()
  recentErrors.set(key, now)
  try {
    const client = Sentry.getClient()
    if (!client?.getDsn() || client.getOptions().enabled === false) return undefined
    const safeError = new Error(sanitizeDiagnosticText(error instanceof Error ? error.message : "An operation failed"))
    safeError.name = error instanceof Error ? error.name : "HandledError"
    if (error instanceof Error && error.stack) safeError.stack = sanitizeDiagnosticText(error.stack)
    return Sentry.withScope(scope => {
      scope.setTag("operation", operation)
      scope.setContext("diagnostics", sanitizeDiagnosticValue(details) as Details)
      return Sentry.captureException(safeError)
    })
  } catch { return undefined }
}
