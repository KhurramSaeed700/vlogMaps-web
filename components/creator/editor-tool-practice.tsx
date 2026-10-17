"use client"

import { useEffect, useReducer, useRef } from "react"
import { Check, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createEditorPracticeState, editorPracticeReducer, getEditorPracticeKey, matchesEditorPracticeKey, type EditorPracticeKind } from "@/lib/editor-tool-practice"

export function EditorToolPractice({ kind }: { kind: EditorPracticeKind }) {
  const [state, dispatch] = useReducer(editorPracticeReducer, kind, createEditorPracticeState)
  const keyButtonRef = useRef<HTMLButtonElement>(null)
  const mapButtonRef = useRef<HTMLButtonElement>(null)
  const key = getEditorPracticeKey(kind)
  const name = kind === "point" ? "point" : "stop"
  const finished = state.phase === "done"
  const prompt = state.phase === "key"
    ? kind === "stop-end" ? "At departure, press W again or tap the key." : `Press ${key} or tap the key to choose ${name === "point" ? "Point" : "Stop"}.`
    : state.phase === "place" ? "Now click a spot on the practice map."
      : kind === "point" ? "Point added at 0:12. Nice!"
        : kind === "stop" ? "Stop started! Next, learn how to end it."
          : "Stop saved: 0:12–0:20. Nice!"

  useEffect(() => {
    if (state.phase === "key") keyButtonRef.current?.focus({ preventScroll: true })
    if (state.phase === "place") mapButtonRef.current?.focus({ preventScroll: true })
  }, [state.phase])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [role="combobox"]'))) return
      if (!matchesEditorPracticeKey(kind, event)) return
      // Capture only the practice shortcut, before the real editor sees it.
      event.preventDefault()
      event.stopPropagation()
      dispatch({ type: "key" })
    }
    window.addEventListener("keydown", handleKey, true)
    return () => window.removeEventListener("keydown", handleKey, true)
  }, [kind])

  return (
    <section aria-label={`${kind === "stop-end" ? "End stop" : name === "point" ? "Point" : "Start stop"} shortcut practice`} className="mt-4 space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-[11px] text-slate-500">Practice only · Your video stays unchanged</p>
      <div className="flex items-center gap-3">
        <Button
          ref={keyButtonRef}
          type="button"
          variant="outline"
          disabled={state.phase !== "key"}
          aria-label={`Try ${key}: ${kind === "stop-end" ? "end stop" : `add ${name}`}`}
          aria-keyshortcuts={key}
          onClick={() => dispatch({ type: "key" })}
          className="h-11 w-11 shrink-0 border-slate-200 bg-white font-mono text-lg font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600"
        >
          <kbd>{key}</kbd>
        </Button>
        <p role="status" aria-live="polite" className="text-sm leading-5 text-slate-600">{prompt}</p>
      </div>
      <button
        ref={mapButtonRef}
        type="button"
        disabled={state.phase !== "place"}
        aria-label={`Practice placing a ${name} on the map`}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          // Keyboard/screen-reader activation places the sample at its center.
          dispatch({ type: "place", x: event.detail === 0 ? 50 : (event.clientX - rect.left) / rect.width * 100, y: event.detail === 0 ? 50 : (event.clientY - rect.top) / rect.height * 100 })
        }}
        className={`relative block h-24 w-full overflow-hidden rounded-lg border border-emerald-500/25 bg-emerald-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${state.phase === "place" ? "cursor-crosshair ring-2 ring-orange-500/70" : "cursor-default"}`}
      >
        <svg viewBox="0 0 280 96" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 h-full w-full">
          <path d="M-10 25 L290 70 M60 -10 L105 106 M205 -10 L155 106" stroke="currentColor" strokeWidth="10" className="text-white/80" />
          <path d="M-10 25 L290 70 M60 -10 L105 106 M205 -10 L155 106" stroke="currentColor" strokeWidth="1" className="text-slate-500/30" />
        </svg>
        {state.marker ? (
          <MapPin aria-hidden="true" className={`absolute h-7 w-7 -translate-x-1/2 -translate-y-full ${kind === "point" ? "fill-orange-500/30 text-orange-600" : "fill-teal-500/30 text-teal-600"}`} style={{ left: `${state.marker.x}%`, top: `${state.marker.y}%` }} />
        ) : <span className="relative rounded bg-white/85 px-2 py-1 text-xs text-slate-500">{state.phase === "place" ? "Click here to place it" : "Practice map"}</span>}
      </button>
      {finished && (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600"><Check className="h-3.5 w-3.5" aria-hidden="true" />Step complete</span>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700" onClick={() => dispatch({ type: "reset" })}>Try again</Button>
        </div>
      )}
    </section>
  )
}
