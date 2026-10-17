const privateKey = /password|secret|token|authorization|cookie|email|^user$|^ip$|ip_address|latitude|longitude|^lat$|^lng$|coordinates|savedplaces|routeshapes|^points$|^body$|^vars$|^formdata$|^url\.(query|fragment)$|^db\.(statement|query)/i

export function sanitizeDiagnosticText(value: string) {
  return value
    .replace(/\b[a-z][a-z\d+.-]*:\/\/[^\s"'<>]+/gi, (url) => {
      try { const parsed = new URL(url); return `${parsed.protocol}//${parsed.host}${parsed.pathname}` } catch { return "[url]" }
    })
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|pk)\.ey[A-Za-z0-9._-]+/g, "[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g, "[coordinates]")
    .slice(0, 2000)
}

export function sanitizeDiagnosticValue(value: unknown, depth = 0): unknown {
  if (depth > 7) return "[truncated]"
  if (typeof value === "string") return sanitizeDiagnosticText(value)
  if (value === null || typeof value === "boolean" || typeof value === "number") return value
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitizeDiagnosticValue(item, depth + 1))
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [
      key, privateKey.test(key) ? "[redacted]" : sanitizeDiagnosticValue(item, depth + 1),
    ]))
  }
  return undefined
}

export function sanitizeMonitoringEvent<T>(event: T): T | null {
  const source = event as Record<string, any>
  const exceptions = source.exception?.values ?? []
  const frames = exceptions.flatMap((value: any) => value.stacktrace?.frames ?? [])
  if (frames.length && frames.every((frame: any) => /^(chrome|moz|safari)-extension:\/\//.test(frame.filename ?? frame.abs_path ?? ""))) return null
  if (exceptions.some((value: any) => value.type === "AbortError")) return null
  const result = sanitizeDiagnosticValue(source) as Record<string, any>
  delete result.user
  if (result.type === "feedback" && result.contexts?.feedback) {
    delete result.contexts.feedback.contact_email
    delete result.contexts.feedback.name
  }
  if (result.request) {
    delete result.request.headers
    delete result.request.cookies
    delete result.request.data
    delete result.request.query_string
    delete result.request.env
  }
  return result as T
}
