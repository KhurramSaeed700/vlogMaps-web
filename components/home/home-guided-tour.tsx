"use client"

import { GuidedTour } from "@/components/ui/guided-tour"
import { hasSeenHomeTour, homeTourStartEvent, homeTourSteps, markHomeTourSeen } from "@/lib/home-tour"

const steps = homeTourSteps.map((step) => ({ ...step, selectors: [`[data-home-tour="${step.target}"]`] }))

export function HomeGuidedTour({ enabled }: { enabled: boolean }) {
  return <GuidedTour enabled={enabled} steps={steps} startEvent={homeTourStartEvent} hasSeen={hasSeenHomeTour} markSeen={markHomeTourSeen} focusReturnSelector='[data-home-tour="settings"]' />
}
