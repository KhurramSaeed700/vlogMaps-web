export const homeTourStorageKey = "travelmap.home-tour.seen.v1"
export const homeTourStartEvent = "travelmap:home-tour:start"
let seenThisSession = false

export const homeTourSteps = [
  {
    target: "live-map",
    preview: "journey",
    title: "A video with a mapped journey",
    description: "Open a video to explore its mapped locations. The map follows along as you watch.",
  },
  {
    target: "watch-video",
    preview: "timestamps",
    title: "Pick a journey and follow along",
    description: "Choose a video to watch its journey. Use timestamps to jump to a place.",
  },
  {
    target: "settings",
    preview: "settings",
    title: "Make yourself comfortable",
    description: "Change volume, appearance, and travel categories here. You can replay this tour anytime.",
  },
] as const

export function hasSeenHomeTour(storage: Pick<Storage, "getItem">) {
  if (seenThisSession) return true
  try {
    return storage.getItem(homeTourStorageKey) === "seen"
  } catch {
    return false
  }
}

export function markHomeTourSeen(storage: Pick<Storage, "setItem">) {
  seenThisSession = true
  try {
    storage.setItem(homeTourStorageKey, "seen")
  } catch {
    // Still avoid repeating the tour during this session if storage is blocked.
  }
}

export function getHomeTourPlacement(
  target: { top: number; bottom: number; left: number; width: number },
  viewport: { width: number; height: number },
  panelHeight: number,
) {
  const margin = 16
  const width = Math.min(336, viewport.width - margin * 2)
  const left = Math.max(margin, Math.min(target.left, viewport.width - width - margin))
  const spaceBelow = Math.max(0, viewport.height - margin - target.bottom - 30)
  const spaceAbove = Math.max(0, target.top - margin - 30)
  const below = spaceBelow >= panelHeight || (spaceAbove < panelHeight && spaceBelow >= spaceAbove)
  const maxHeight = Math.min(panelHeight, below ? spaceBelow : spaceAbove)
  const preferredTop = below ? target.bottom + 30 : target.top - maxHeight - 30
  const top = Math.max(margin, Math.min(preferredTop, viewport.height - maxHeight - margin))
  return { width, left, top, below, maxHeight }
}
