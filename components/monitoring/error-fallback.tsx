"use client"

import { useEffect, useState } from "react"
import { reportHandledError } from "@/lib/monitoring/diagnostics"
import { ReportProblemButton } from "./report-problem-button"

export function ErrorFallback({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [eventId, setEventId] = useState<string>()
  useEffect(() => {
    const reference = reportHandledError(error, "page.render", { digest: error.digest })
    if (reference) setEventId(reference)
  }, [error])
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-background p-6 text-foreground">
      <section className="max-w-md space-y-4 rounded-2xl border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">Try opening this page again. If the problem continues, send a report so we can investigate.</p>
        {eventId && <p className="break-all text-xs text-muted-foreground">Report reference: {eventId}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white">Try again</button>
          <ReportProblemButton />
          <a href="/" className="px-2 py-2 text-sm underline">Back to home</a>
        </div>
      </section>
    </main>
  )
}
