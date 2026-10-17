"use client"

import { getFeedback } from "@sentry/nextjs"
import { Bug, Loader2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { diagnosticEvent, reportHandledError } from "@/lib/monitoring/diagnostics"

type FeedbackForm = { appendToDom(): void; open(): void; removeFromDom(): void }

export function ReportProblemButton({ compact = false }: { compact?: boolean }) {
  const formRef = useRef<FeedbackForm | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  useEffect(() => () => { formRef.current?.removeFromDom() }, [])

  async function openReport() {
    if (loading) return
    setLoading(true)
    setMessage("")
    try {
      if (!formRef.current) {
        const feedback = getFeedback()
        if (!feedback) throw new Error("Problem reports are unavailable. Please try again later.")
        formRef.current = await feedback.createForm()
        formRef.current.appendToDom()
      }
      diagnosticEvent("feedback.opened")
      formRef.current.open()
    } catch (error) {
      setMessage("Could not open the report form. Please check your connection and try again.")
      reportHandledError(error, "feedback.open")
    } finally { setLoading(false) }
  }

  return (
    <span className="relative inline-flex">
      <button type="button" onClick={() => { void openReport() }} disabled={loading}
        aria-label="Report a problem" title="Report a problem"
        className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg text-sm hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:opacity-50 ${compact ? "w-9" : "border border-current/20 px-3"}`}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Bug className="h-4 w-4" aria-hidden="true" />}
        {!compact && "Report a problem"}
      </button>
      {message && <span role="status" className="absolute right-0 top-full z-[60] mt-2 w-64 rounded-lg border bg-background p-3 text-sm text-foreground shadow-lg">{message}</span>}
    </span>
  )
}
