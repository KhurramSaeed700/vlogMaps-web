"use client"

import { memo } from "react"
import { EditorToolPractice } from "@/components/creator/editor-tool-practice"
import { GuidedTour, type GuidedTourStep } from "@/components/ui/guided-tour"
import { editorTourStartEvent, editorTourSteps, hasSeenEditorTour, markEditorTourSeen } from "@/lib/editor-tour"

function renderEditorStep(_step: GuidedTourStep, index: number) {
  const step = editorTourSteps[index]
  return "practice" in step ? <EditorToolPractice key={index} kind={step.practice} /> : null
}

export const EditorGuidedTour = memo(function EditorGuidedTour({ enabled, onOpenChange }: {
  enabled: boolean
  onOpenChange: (open: boolean) => void
}) {
  return <GuidedTour enabled={enabled} steps={editorTourSteps} startEvent={editorTourStartEvent} hasSeen={hasSeenEditorTour} markSeen={markEditorTourSeen} focusReturnSelector='button[aria-label="Open editor settings"]' onOpenChange={onOpenChange} label="Editor tutorial" renderStepContent={renderEditorStep} />
})
