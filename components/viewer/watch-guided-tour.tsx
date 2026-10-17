"use client"

import { GuidedTour } from "@/components/ui/guided-tour"
import { hasSeenWatchTour, markWatchTourSeen, watchEditTourStep, watchTourStartEvent, watchTourSteps } from "@/lib/watch-tour"

const creatorSteps = [...watchTourSteps.slice(0, -1), watchEditTourStep, watchTourSteps[watchTourSteps.length - 1]]

export function WatchGuidedTour({ enabled, canEdit, onOpenChange }: {
  enabled: boolean
  canEdit: boolean
  onOpenChange: (open: boolean) => void
}) {
  return <GuidedTour enabled={enabled} steps={canEdit ? creatorSteps : watchTourSteps} startEvent={watchTourStartEvent} hasSeen={hasSeenWatchTour} markSeen={markWatchTourSeen} focusReturnSelector='button[aria-label="Open playback settings"]' onOpenChange={onOpenChange} label="Watch-page tour" />
}
