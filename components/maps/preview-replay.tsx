"use client"

import { useCallback, useEffect, useState } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

export const previewReplayOfferMs = 10000

export function usePreviewReplayOffer() {
  const [cycle, setCycle] = useState<number | null>(null)
  const offer = useCallback(() => setCycle(current => (current ?? 0) + 1), [])
  const dismiss = useCallback(() => setCycle(null), [])
  useEffect(() => {
    if (cycle === null) return
    const timer = window.setTimeout(() => setCycle(null), previewReplayOfferMs)
    return () => window.clearTimeout(timer)
  }, [cycle])
  return { visible: cycle !== null, offer, dismiss }
}

export function PreviewReplayButton({ onReplay }: { onReplay: () => void }) {
  return <div className="pointer-events-none absolute bottom-4 left-1/2 z-40 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
    <Button type="button" onClick={onReplay} className="pointer-events-auto h-10 gap-2 whitespace-nowrap rounded-full border border-white/20 bg-slate-950/85 px-4 text-xs font-medium text-white shadow-lg backdrop-blur-md hover:bg-slate-900 focus-visible:ring-teal-300">
      <RotateCcw className="h-3.5 w-3.5 text-teal-300" />Watch preview again
    </Button>
  </div>
}
