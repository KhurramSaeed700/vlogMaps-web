export const editorTourStorageKey = "travelmap.editor-tour.seen.v1"
export const editorTourStartEvent = "travelmap:editor-tour:start"
let seenThisSession = false

export function hasSeenEditorTour(storage: Pick<Storage, "getItem">) {
  if (seenThisSession) return true
  try { return storage.getItem(editorTourStorageKey) === "seen" } catch { return false }
}

export function markEditorTourSeen(storage: Pick<Storage, "setItem">) {
  seenThisSession = true
  try { storage.setItem(editorTourStorageKey, "seen") } catch { /* Avoid repeating this session if storage is blocked. */ }
}

export const editorTourSteps = [
  {
    section: "Get oriented",
    selectors: ['[data-editor-tour="player"]'],
    title: "Your video plays here",
    description: "",
  },
  {
    section: "Get oriented",
    selectors: ['[data-editor-tour="player"]'],
    content: "shortcuts",
    title: "Control your video",
    description: "Find the full list in Settings → Keybindings.",
  },
  {
    section: "Get oriented",
    selectors: ['[data-editor-tour="capture"]'],
    content: "types",
    title: "Choose a timestamp type",
    description: "",
  },
  {
    section: "Points & places",
    selectors: ['[data-editor-tour="map-search"]', '[data-editor-tour="map"]'],
    title: "Find a place before placing it",
    description: "Search and select a place, then choose Point or Stop at the correct video time. Searching alone doesn’t add a timestamp.",
  },
  {
    section: "Points & places",
    selectors: ['[data-editor-tour="landmark"]'],
    title: "Identify an unfamiliar landmark",
    description: "Capture this editor tab or upload a cropped screenshot to identify a landmark. Images go to Google Vision. Check the suggested location.",
  },
  {
    section: "Stops & flights",
    selectors: ['[data-editor-tour="stop"]'],
    title: "Record when a stop begins",
    description: "When the traveler arrives, press W and choose the location on the map.",
  },
  {
    section: "Stops & flights",
    selectors: ['[data-editor-tour="stop"]'],
    title: "Finish the stop at departure",
    description: "When the traveler leaves, press W again to end the stop.",
  },
  {
    section: "Stops & flights",
    selectors: ['[data-editor-tour="flight"]'],
    title: "Record the flight’s takeoff",
    description: "At takeoff, choose Flight or press E. Search for the departure airport and confirm, or place it on the map.",
  },
  {
    section: "Stops & flights",
    selectors: ['[data-editor-tour="flight"]'],
    title: "Pair it with a landing",
    description: "At arrival, choose Land or press E again. Confirm the destination airport to complete the flight.",
  },
  {
    section: "Review & refine",
    selectors: ['[data-editor-tour="timestamps"]'],
    title: "Read and replay the timestamp list",
    description: "Select a timestamp to replay that moment. Stops and flights show start and end times.",
  },
  {
    section: "Review & refine",
    selectors: ['[data-editor-tour="map"]'],
    title: "Correct a location or route",
    description: "Edit a timestamp to move its location. To reshape a ground route, select its line and drag the handle.",
  },
  {
    section: "Review & refine",
    selectors: ['button[aria-label="Undo map click"]', '[data-editor-tour="map"]'],
    title: "Recover from an unwanted change",
    description: "Undo and Redo step through supported edits. The trash button removes a timestamp; Escape cancels unfinished placement.",
  },
  {
    section: "Route & reuse",
    selectors: ['[data-editor-tour="trip-route"]'],
    title: "Set an overall trip route",
    description: "Open Trip route to set Start and End locations. These describe the overall trip; timestamps control video timing.",
  },
  {
    section: "Route & reuse",
    selectors: ['button[aria-label="Open saved places"]'],
    title: "Reuse places you visit often",
    description: "Save and name a place here. Reuse it later to add a timestamp without searching again.",
  },
  {
    section: "Route & reuse",
    selectors: ['button[aria-label="Track traveler"]', 'button[aria-label="Stop tracking traveler"]', '[data-editor-tour="map"]'],
    title: "Check the traveler’s movement",
    description: "Play and choose Track traveler to follow the route. Drag the map to explore freely.",
  },
  {
    section: "Save & preview",
    selectors: ['[data-editor-tour="timestamps"]'],
    title: "Understand drafts and saving",
    description: "Completed changes autosave. Edit panels still need Save. Check connection warnings to make sure cloud sync finishes.",
  },
  {
    section: "Save & preview",
    selectors: ['[data-editor-tour="preview"]'],
    title: "Test the journey as a viewer",
    description: "Choose Preview to check timing and movement on the watch page. Return here to make corrections.",
  },
  {
    section: "Save & preview",
    selectors: ['button[aria-label="Show keyboard shortcuts"]'],
    title: "Build speed with shortcuts",
    description: "Q adds a point, W records a stop, and E records a flight. Open Settings → Keybindings for all shortcuts.",
  },
  {
    section: "Save & preview",
    selectors: ['button[aria-label="Open editor settings"]'],
    title: "Start small and come back to this guide",
    description: "Adjust volume and appearance here. Choose Show editor tutorial whenever you need a refresher.",
  },
] as const
