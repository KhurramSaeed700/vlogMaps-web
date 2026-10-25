"use client"

import { useEffect, useState } from "react"
import { Check, Copy } from "lucide-react"

export function CopyCoordinatesButton({ lat, lng }: { lat: number; lng: number }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle")
  useEffect(() => {
    if (status === "idle") return
    const timer = window.setTimeout(() => setStatus("idle"), 2000)
    return () => window.clearTimeout(timer)
  }, [status])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return <>
    <button type="button" title={status === "copied" ? "Coordinates copied" : "Copy coordinates"} aria-label="Copy coordinates"
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-zinc-200"
      onClick={async event => {
        event.stopPropagation()
        try {
          await navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
          setStatus("copied")
        } catch { setStatus("error") }
      }}>
      {status === "copied" ? <Check className="h-3.5 w-3.5 text-teal-600 dark:text-teal-300" /> : <Copy className="h-3 w-3" />}
    </button>
    <span className="sr-only" role="status">{status === "copied" ? "Coordinates copied" : status === "error" ? "Could not copy coordinates. Check clipboard permissions and try again." : ""}</span>
  </>
}
