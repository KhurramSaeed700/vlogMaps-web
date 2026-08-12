import type { CreatorVideoState } from "@/lib/creator-video-state"

const creatorStateOutboxVersion = 1

export interface PendingCreatorVideoState {
  version: typeof creatorStateOutboxVersion
  revision: string
  savedAt: number
  state: CreatorVideoState
}

function creatorStateOutboxStorageKey(videoId: string) {
  return `travelmap:creator-state-outbox:v${creatorStateOutboxVersion}:${videoId}`
}

function isPendingCreatorVideoState(value: unknown): value is PendingCreatorVideoState {
  if (!value || typeof value !== "object") {
    return false
  }

  const pendingState = value as Partial<PendingCreatorVideoState>
  const state = pendingState.state as Partial<CreatorVideoState> | undefined

  if (!state) {
    return false
  }

  return (
    pendingState.version === creatorStateOutboxVersion &&
    typeof pendingState.revision === "string" &&
    Boolean(pendingState.revision) &&
    typeof pendingState.savedAt === "number" &&
    Number.isFinite(pendingState.savedAt) &&
    Array.isArray(state.points) &&
    Boolean(state.tripRoute) &&
    typeof state.tripRoute === "object" &&
    Boolean(state.routeShapes) &&
    typeof state.routeShapes === "object" &&
    Array.isArray(state.savedPlaces)
  )
}

function createRevision() {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)

  return `${Date.now().toString(36)}-${randomPart}`
}

export function loadPendingCreatorVideoState(videoId: string) {
  if (typeof window === "undefined") {
    return null
  }

  const storageKey = creatorStateOutboxStorageKey(videoId)
  try {
    const rawState = window.localStorage.getItem(storageKey)
    const parsedState = rawState ? (JSON.parse(rawState) as unknown) : null
    if (isPendingCreatorVideoState(parsedState)) {
      return parsedState
    }

    if (rawState) {
      window.localStorage.removeItem(storageKey)
    }
  } catch {
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      // Storage can be completely unavailable in private or restricted contexts.
    }
  }

  return null
}

export function savePendingCreatorVideoState(videoId: string, state: CreatorVideoState) {
  if (typeof window === "undefined") {
    return null
  }

  const pendingState: PendingCreatorVideoState = {
    version: creatorStateOutboxVersion,
    revision: createRevision(),
    savedAt: Date.now(),
    state,
  }

  try {
    // Keep only the newest complete snapshot. This bounds storage and makes rapid
    // edits coalesce naturally instead of building an operation-by-operation queue.
    window.localStorage.setItem(creatorStateOutboxStorageKey(videoId), JSON.stringify(pendingState))
    return pendingState
  } catch {
    return null
  }
}

export function clearPendingCreatorVideoState(videoId: string, acknowledgedRevision: string) {
  if (typeof window === "undefined") {
    return false
  }

  const pendingState = loadPendingCreatorVideoState(videoId)
  if (!pendingState || pendingState.revision !== acknowledgedRevision) {
    return false
  }

  try {
    window.localStorage.removeItem(creatorStateOutboxStorageKey(videoId))
    return true
  } catch {
    return false
  }
}
