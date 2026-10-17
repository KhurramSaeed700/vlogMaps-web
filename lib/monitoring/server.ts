import * as Sentry from "@sentry/nextjs"
import { reportHandledError } from "./diagnostics"
import { sanitizeDiagnosticText } from "./privacy"

export function reportServerFailure(error: unknown, operation: string) {
  const requestId = crypto.randomUUID()
  const eventId = reportHandledError(error, operation, { requestId })
  const data = {
    operation, requestId, eventId,
    errorName: error instanceof Error ? error.name : "UnknownError",
    message: sanitizeDiagnosticText(error instanceof Error ? error.message : "Operation failed"),
  }
  console.error(JSON.stringify({ level: "error", ...data }))
  try { Sentry.logger.error("API operation failed", data) } catch { /* Console logs remain available. */ }
  return { requestId, eventId }
}
