import { sanitizeDiagnosticValue, sanitizeMonitoringEvent } from "./privacy"

export const monitoringDsn = process.env.NEXT_PUBLIC_SENTRY_DSN

// Local edits and hot reloads must not generate Sentry traffic unless explicitly opted in.
export const monitoringEnabled = Boolean(monitoringDsn) &&
  process.env.NEXT_PUBLIC_SENTRY_ENABLED !== "false" &&
  (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SENTRY_ENABLED === "true")

export const sharedMonitoringOptions = {
  dsn: monitoringDsn,
  enabled: monitoringEnabled,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  maxBreadcrumbs: 60,
  tracesSampleRate: 0.05,
  enableLogs: true,
  beforeBreadcrumb: <T extends { category?: string }>(breadcrumb: T) => breadcrumb.category === "vlogmaps" ? sanitizeDiagnosticValue(breadcrumb) as T : null,
  beforeSend: sanitizeMonitoringEvent,
  beforeSendSpan: <T>(span: T) => sanitizeDiagnosticValue(span) as T,
  beforeSendLog: <T>(log: T) => sanitizeDiagnosticValue(log) as T,
}
