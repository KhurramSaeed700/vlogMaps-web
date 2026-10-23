"use client"

import { memo } from "react"
import { GuidedTour, type GuidedTourStep } from "@/components/ui/guided-tour"
import { editorTourStartEvent, editorTourSteps, hasSeenEditorTour, markEditorTourSeen } from "@/lib/editor-tour"

function renderEditorStep(_step: GuidedTourStep, index: number) {
  const step = editorTourSteps[index]
  if (!("content" in step)) return null
  if (step.content === "types") return <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
    <li><strong className="text-foreground">Point:</strong> A location marker during travel or movement.</li>
    <li><strong className="text-foreground">Stop:</strong> A stay at a place.</li>
    <li><strong className="text-foreground">Flight:</strong> The flight path from takeoff to landing.</li>
  </ul>
  return <dl className="mt-3 space-y-2 text-sm">{[
    ["Space / K", "Play or pause"], ["J / L", "Back / forward 10 seconds"],
    ["Hold Space", "Play at 2× speed"], ["Home / End", "Beginning / end"],
    ["Esc", "Return to editor shortcuts"],
  ].map(([keys, action]) => <div key={keys} className="flex flex-wrap items-center justify-between gap-2"><dt><kbd className="inline-flex min-h-6 items-center justify-center rounded border border-border bg-muted px-2 text-center font-mono text-xs">{keys}</kbd></dt><dd className="text-muted-foreground">{action}</dd></div>)}</dl>
}

export const EditorGuidedTour = memo(function EditorGuidedTour({ enabled, onOpenChange }: {
  enabled: boolean
  onOpenChange: (open: boolean) => void
}) {
  return <GuidedTour enabled={enabled} steps={editorTourSteps} startEvent={editorTourStartEvent} hasSeen={hasSeenEditorTour} markSeen={markEditorTourSeen} focusReturnSelector='button[aria-label="Open editor settings"]' onOpenChange={onOpenChange} label="Editor tutorial" showChapters={false} renderStepContent={renderEditorStep} />
})
