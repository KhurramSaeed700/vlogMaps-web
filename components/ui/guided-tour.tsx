"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TourStepPreview } from "@/components/ui/tour-step-preview"
import type { TourPreviewKind } from "@/lib/tour-visuals"
import { getGuidedTourPlacement } from "@/lib/guided-tour"

export type GuidedTourStep = { preview?: TourPreviewKind; section?: string; selectors: readonly string[]; title: string; description: string }

function findTarget(step: GuidedTourStep) {
  for (const selector of step.selectors) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) return element
    }
  }
  return null
}

type TargetRect = { top: number; bottom: number; left: number; width: number; height: number }

export function GuidedTour({ enabled, steps, startEvent, hasSeen, markSeen, focusReturnSelector, onOpenChange, renderStepContent, label = "Quick tour", showChapters = true }: {
  enabled: boolean
  steps: readonly GuidedTourStep[]
  startEvent: string
  hasSeen: (storage: Storage) => boolean
  markSeen: (storage: Storage) => void
  focusReturnSelector: string
  onOpenChange?: (open: boolean) => void
  showChapters?: boolean
  label?: string
  renderStepContent?: (step: GuidedTourStep, index: number) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const changeOpen = useCallback((next: boolean) => { setOpen(next); onOpenChange?.(next) }, [onOpenChange])
  const [stepIndex, setStepIndex] = useState(0)
  const [target, setTarget] = useState<TargetRect | null>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [panelHeight, setPanelHeight] = useState(260)
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const step = steps[stepIndex]
  const chapters = useMemo(() => steps.flatMap((item, index) =>
    item.section && item.section !== steps[index - 1]?.section ? [{ title: item.section, index }] : [],
  ), [steps])

  useEffect(() => {
    if (!enabled) return
    // Only introduce the page once its real controls have mounted.
    let storage: Storage
    try { storage = window.localStorage } catch { return }
    if (hasSeen(storage)) return
    if (!findTarget(steps[0])) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    markSeen(storage)
    changeOpen(true)
  }, [enabled, steps, hasSeen, markSeen, changeOpen])

  useEffect(() => {
    if (!enabled) return
    const restart = () => {
      previousFocusRef.current = document.querySelector<HTMLElement>(focusReturnSelector)
      setStepIndex(0)
      changeOpen(true)
    }
    window.addEventListener(startEvent, restart)
    return () => window.removeEventListener(startEvent, restart)
  }, [enabled, startEvent, focusReturnSelector, changeOpen])

  useLayoutEffect(() => {
    if (!open) return
    panelRef.current?.scrollTo({ top: 0, behavior: "instant" })
    let element = findTarget(step)
    if (!element) { changeOpen(false); return }
    const initial = element.getBoundingClientRect()
    if (initial.top < 80 || initial.bottom > window.innerHeight - 24) {
      element.scrollIntoView({ block: "center", behavior: "instant" })
    }
    const measure = () => {
      const current = findTarget(step)
      if (!current) return
      if (current !== element) { observer.unobserve(element!); element = current; observer.observe(current) }
      const rect = current.getBoundingClientRect()
      setTarget((previous) => previous && previous.top === rect.top && previous.left === rect.left && previous.width === rect.width && previous.height === rect.height ? previous : { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height })
      setViewport((previous) => previous.width === window.innerWidth && previous.height === window.innerHeight ? previous : { width: window.innerWidth, height: window.innerHeight })
      if (panelRef.current) setPanelHeight(panelRef.current.scrollHeight + 2)
    }
    const observer = new ResizeObserver(measure)
    measure()
    observer.observe(element)
    if (panelRef.current) observer.observe(panelRef.current)
    // Sample only while reading the tour; never observe the animated map subtree.
    const timer = window.setInterval(measure, 500)
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", measure, { capture: true, passive: true })
    return () => {
      observer.disconnect()
      window.clearInterval(timer)
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
    }
  }, [open, step, target?.width, changeOpen])

  const stepContent = renderStepContent?.(step, stepIndex)
  const placement = target ? getGuidedTourPlacement(target, viewport, panelHeight, Boolean(stepContent || step.preview)) : null
  const highlight = target ? {
    top: target.top - 6,
    left: target.left - 6,
    right: target.left + target.width + 6,
    bottom: target.bottom + 6,
  } : null
  const spotlightClip = highlight ? `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${highlight.left}px ${highlight.top}px, ${highlight.right}px ${highlight.top}px, ${highlight.right}px ${highlight.bottom}px, ${highlight.left}px ${highlight.bottom}px, ${highlight.left}px ${highlight.top}px)` : undefined
  const finish = () => changeOpen(false)
  const lastStep = stepIndex === steps.length - 1

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/60" style={{ clipPath: spotlightClip }} />
        {highlight && placement && (
          <div aria-hidden="true" className="pointer-events-none">
            <div
              aria-hidden="true"
              className="pointer-events-none fixed z-[101] box-border rounded-xl border border-white/90"
              style={{ top: highlight.top, left: highlight.left, width: Math.max(0, highlight.right - highlight.left), height: Math.max(0, highlight.bottom - highlight.top) }}
            />
          </div>
        )}
        <Dialog.Content
          ref={panelRef}
          onKeyDown={(event) => {
            // Keep page-level playback/map shortcuts out of the modal.
            // Escape still reaches Radix’s dismiss handler.
            if (event.key !== "Escape") event.stopPropagation()
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            previousFocusRef.current?.focus({ preventScroll: true })
          }}
          className="fixed z-[103] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-border bg-popover p-6 pb-0 text-popover-foreground shadow-[0_12px_44px_rgba(15,23,42,0.22)] focus:outline-none"
          style={placement ? { top: placement.top, left: placement.left, width: placement.width, maxHeight: placement.maxHeight } : { visibility: "hidden" }}
        >
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" className="absolute right-3 top-3 h-7 w-7 rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground" aria-label="Skip tutorial"><X className="h-3.5 w-3.5" /></Button>
          </Dialog.Close>
          {showChapters && chapters.length > 1 && (
            <label className="mb-3 block pr-7 text-xs text-muted-foreground">
              <span className="sr-only">Jump to chapter</span>
              <select
                aria-label="Jump to tutorial chapter"
                className="h-7 max-w-full rounded-md border-0 bg-popover pr-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                value={chapters.filter((chapter) => chapter.index <= stepIndex).at(-1)?.index ?? 0}
                onChange={(event) => setStepIndex(Number(event.target.value))}
              >
                {chapters.map((chapter) => <option key={chapter.index} value={chapter.index}>{chapter.title}</option>)}
              </select>
            </label>
          )}
          <Dialog.Title className="pr-5 text-[21px] font-bold leading-7 tracking-[-0.02em] text-popover-foreground">{step.title}</Dialog.Title>
          <Dialog.Description className={step.description ? "mt-1.5 text-sm leading-6 text-muted-foreground" : "sr-only"}>{step.description || step.title}</Dialog.Description>
          {stepContent || (step.preview ? <TourStepPreview key={stepIndex} kind={step.preview} /> : null)}
          <div className="sticky bottom-0 -mx-6 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-b-2xl bg-popover px-6 py-4">
            <span aria-label={`${label}: step ${stepIndex + 1} of ${steps.length}`} className="shrink-0 text-sm tabular-nums text-muted-foreground">{stepIndex + 1} of {steps.length}</span>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground" onClick={finish} aria-label="Skip tour">Skip tour</Button>
              {stepIndex > 0 && <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground" onClick={() => setStepIndex((index) => index - 1)} aria-label="Previous tutorial step">Back</Button>}
              <Button variant="ghost" size="sm" className="h-8 px-1 text-sm font-bold text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-400/10 dark:hover:text-indigo-200" onClick={() => lastStep ? finish() : setStepIndex((index) => index + 1)}>
                {lastStep ? "Got it" : "Next tip"}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
