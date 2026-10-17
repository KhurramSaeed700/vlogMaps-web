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
    preview: "journey",
    title: "Turn video moments into a mapped journey",
    description: "Find a video moment, choose Point, Stop, or Flight, then place it on the map. Use chapters to jump to a topic.",
  },
  {
    section: "Get oriented",
    selectors: ['[data-editor-tour="player"]'],
    preview: "journey",
    title: "Find the exact moment first",
    description: "Pause at the moment you want to map. Space / K plays or pauses; J / L seeks.",
  },
  {
    section: "Get oriented",
    selectors: ['[data-editor-tour="capture"]'],
    preview: "tools",
    title: "Choose the right kind of timestamp",
    description: "Point: one moment. Stop: time spent at a place. Flight: paired takeoff and landing.",
  },
  {
    section: "Points & places",
    selectors: ['[data-editor-tour="point"]'],
    practice: "point",
    preview: "tools",
    title: "Add your first point",
    description: "Try Q below, then click the practice map. In your video, pause at the right moment before adding a point.",
  },
  {
    section: "Points & places",
    selectors: ['[data-editor-tour="map"] input[role="combobox"]', '[data-editor-tour="map"]'],
    preview: "search",
    title: "Find a place before placing it",
    description: "Search and select a place, then choose Point or Stop at the correct video time. Searching alone doesn’t add a timestamp.",
  },
  {
    section: "Points & places",
    selectors: ['[data-editor-tour="landmark"]'],
    preview: "search",
    title: "Identify an unfamiliar landmark",
    description: "Capture this editor tab or upload a cropped screenshot to identify a landmark. Images go to Google Vision. Check the suggested location.",
  },
  {
    section: "Stops & flights",
    selectors: ['[data-editor-tour="stop"]'],
    practice: "stop",
    preview: "tools",
    title: "Record when a stop begins",
    description: "Try W below, then place the stop. In your video, do this when the traveler arrives.",
  },
  {
    section: "Stops & flights",
    selectors: ['[data-editor-tour="stop"]'],
    practice: "stop-end",
    preview: "tools",
    title: "Finish the stop at departure",
    description: "When the traveler leaves, press W again to end the stop. Try it below.",
  },
  {
    section: "Stops & flights",
    selectors: ['[data-editor-tour="flight"]'],
    preview: "flight",
    title: "Record the flight’s takeoff",
    description: "At takeoff, choose Flight or press E. Search for the departure airport and confirm, or place it on the map.",
  },
  {
    section: "Stops & flights",
    selectors: ['[data-editor-tour="flight"]'],
    preview: "flight",
    title: "Pair it with a landing",
    description: "At arrival, choose Land or press E again. Confirm the destination airport to complete the flight.",
  },
  {
    section: "Review & refine",
    selectors: ['[data-editor-tour="timestamps"]'],
    preview: "timestamps",
    title: "Read and replay the timestamp list",
    description: "Select a timestamp to replay that moment. Stops and flights show start and end times.",
  },
  {
    section: "Review & refine",
    selectors: ['button[aria-label^="Edit timestamp "]', '[data-editor-tour="timestamps"]'],
    preview: "edit",
    title: "Refine a saved timestamp",
    description: "Use the pencil to change a location’s name, time, or type. Choose Save to apply or Cancel to discard.",
  },
  {
    section: "Review & refine",
    selectors: ['[data-editor-tour="map"]'],
    preview: "route",
    title: "Correct a location or route",
    description: "Edit a timestamp to move its location. To reshape a ground route, select its line and drag the handle.",
  },
  {
    section: "Review & refine",
    selectors: ['button[aria-label="Undo map click"]', '[data-editor-tour="map"]'],
    preview: "edit",
    title: "Recover from an unwanted change",
    description: "Undo and Redo step through supported edits. The trash button removes a timestamp; Escape cancels unfinished placement.",
  },
  {
    section: "Route & reuse",
    selectors: ['[data-editor-tour="trip-route"]'],
    preview: "route",
    title: "Set an overall trip route",
    description: "Open Trip route to set Start and End locations. These describe the overall trip; timestamps control video timing.",
  },
  {
    section: "Route & reuse",
    selectors: ['button[aria-label="Open saved places"]'],
    preview: "saved",
    title: "Reuse places you visit often",
    description: "Save and name a place here. Reuse it later to add a timestamp without searching again.",
  },
  {
    section: "Route & reuse",
    selectors: ['button[aria-label="Track traveler"]', 'button[aria-label="Stop tracking traveler"]', '[data-editor-tour="map"]'],
    preview: "journey",
    title: "Check the traveler’s movement",
    description: "Play and choose Track traveler to follow the route. Drag the map to explore freely.",
  },
  {
    section: "Save & preview",
    selectors: ['[data-editor-tour="timestamps"]'],
    preview: "autosave",
    title: "Understand drafts and saving",
    description: "Completed changes autosave. Edit panels still need Save. Check connection warnings to make sure cloud sync finishes.",
  },
  {
    section: "Save & preview",
    selectors: ['[data-editor-tour="preview"]'],
    preview: "journey",
    title: "Test the journey as a viewer",
    description: "Choose Preview to check timing and movement on the watch page. Return here to make corrections.",
  },
  {
    section: "Save & preview",
    selectors: ['button[aria-label="Show keyboard shortcuts"]'],
    preview: "shortcuts",
    title: "Build speed with shortcuts",
    description: "Q: point. W: stop. E: flight. Open this button for the full shortcut list.",
  },
  {
    section: "Save & preview",
    selectors: ['button[aria-label="Open editor settings"]'],
    preview: "settings",
    title: "Start small and come back to this guide",
    description: "Adjust volume and appearance here. Choose Show editor tutorial whenever you need a refresher.",
  },
] as const
