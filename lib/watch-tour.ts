export const watchTourStorageKey = "travelmap.watch-tour.seen.v1"
export const watchTourStartEvent = "travelmap:watch-tour:start"
let seenThisSession = false

export function hasSeenWatchTour(storage: Pick<Storage, "getItem">) {
  if (seenThisSession) return true
  try { return storage.getItem(watchTourStorageKey) === "seen" } catch { return false }
}

export function markWatchTourSeen(storage: Pick<Storage, "setItem">) {
  seenThisSession = true
  try { storage.setItem(watchTourStorageKey, "seen") } catch { /* Remember for this session if storage is blocked. */ }
}

export const watchTourSteps = [
  {
    selectors: ['[data-watch-tour="player"]'],
    preview: "journey",
    title: "Watch the video and follow the journey",
    description: "Play the video to follow the journey on the map. Playback pauses while this guide is open.",
  },
  {
    selectors: ['[data-watch-tour="map"]'],
    preview: "route",
    title: "Start with a route preview",
    description: "See the full route and total distance. Choose Start Tracking to skip the preview.",
  },
  {
    selectors: ['button[aria-label="Track traveler"]', 'button[aria-label="Stop tracking traveler"]', 'button[aria-label^="Start tracking"]', '[data-watch-tour="map"]'],
    preview: "journey",
    title: "Keep the traveler in view",
    description: "Track traveler keeps them centered. Drag to explore, then turn tracking back on to follow again.",
  },
  {
    selectors: ['section[aria-label="Video timestamps"]', 'button[aria-label="Open timestamps"]'],
    preview: "timestamps",
    title: "Jump straight to a place",
    description: "Choose a timestamp to jump to that moment. On phones, open the list with this button.",
  },
  {
    selectors: ['.mapboxgl-ctrl-group', '[data-watch-tour="map"]'],
    preview: "route",
    title: "Explore the map",
    description: "Drag to explore, use + / − to zoom, or select a location marker to jump there.",
  },
  {
    selectors: ['[data-watch-tour="player"]'],
    preview: "journey",
    title: "Adjust your viewing space",
    description: "Press F for a bigger video; Escape exits. On desktop, drag the divider to resize the panels.",
  },
  {
    selectors: ['button[aria-label="Open playback settings"]'],
    preview: "settings",
    title: "Set your volume and replay this guide",
    description: "Adjust volume or choose Show watch-page tour to see this guide again.",
  },
  {
    selectors: ['button[aria-label="Share video"]'],
    preview: "share",
    title: "Share the journey",
    description: "Share this journey or copy its link.",
  },
  {
    selectors: ['[aria-label="Back to home"]'],
    preview: "journey",
    title: "Find your next journey",
    description: "Go home to browse more journeys.",
  },
] as const

export const watchEditTourStep = {
  selectors: ['[aria-label="Edit this video"]'],
  preview: "edit",
  title: "Update your mapped journey",
  description: "Open the editor to add locations, adjust timestamps, and refine the route.",
} as const
