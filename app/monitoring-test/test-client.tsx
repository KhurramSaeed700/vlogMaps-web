"use client"

import { flush, getClient } from "@sentry/nextjs"
import { useEffect, useState } from "react"
import { ReportProblemButton } from "@/components/monitoring/report-problem-button"
import { diagnosticEvent, reportHandledError } from "@/lib/monitoring/diagnostics"

export function MonitoringTest() {
  const [delivery, setDelivery] = useState("")
  useEffect(() => getClient()?.on("afterSendEvent", (event, response) => {
    setDelivery(`${event.type ?? "error"}: HTTP ${response?.statusCode ?? "no response"}; ${event.event_id}`)
  }), [])
  const [result, setResult] = useState("")
  const [sending, setSending] = useState(false)
  async function verify() {
    setSending(true)
    diagnosticEvent("monitoring.verification", { source: "development-test" })
    const eventId = reportHandledError(new Error("VlogMaps monitoring verification"), "monitoring.verification")
    const sent = await flush(5000)
    setResult(eventId ? `${sent ? "Queue flushed" : "Queued"}: ${eventId}` : "No new event. Wait one minute before retrying; check the DSN configuration if needed.")
    setSending(false)
  }
  async function verifyServer() {
    setSending(true)
    try {
      const response = await fetch("/api/monitoring-test", { method: "POST" })
      const report = await response.json()
      setResult(`Server status ${response.status}; request ${report.requestId}; event ${report.eventId ?? "deduplicated"}`)
    } catch { setResult("Could not reach the development test endpoint.") }
    finally { setSending(false) }
  }
  return <main className="mx-auto max-w-xl space-y-6 p-8">
    <h1 className="text-2xl font-semibold">Monitoring verification</h1>
    <p>This page is available only in development. Send a controlled error, then confirm it appears in the VlogMaps Sentry project.</p>
    <button type="button" disabled={sending} className="rounded-lg bg-orange-600 px-4 py-2 text-white disabled:opacity-50" onClick={() => { void verify() }}>{sending ? "Sending…" : "Send test error"}</button>
    <button type="button" disabled={sending} className="ml-3 rounded-lg border px-4 py-2 disabled:opacity-50" onClick={() => { void verifyServer() }}>Send server test error</button>
    <p role="status" className="break-all">{result}</p>
    <p role="status" className="break-all">{delivery}</p>
    <ReportProblemButton />
  </main>
}
