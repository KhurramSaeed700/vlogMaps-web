import type { SetStateAction } from "react"
import type { CreatorVideoState } from "@/lib/creator-video-state"

export type EditorDocumentAction = {
  [K in keyof CreatorVideoState]: { type: K; value: SetStateAction<CreatorVideoState[K]> }
}[keyof CreatorVideoState] | { type: "replace"; state: CreatorVideoState }
  | { type: "restore-map"; state: Pick<CreatorVideoState, "points" | "tripRoute" | "routeShapes"> }

function updateField<K extends keyof CreatorVideoState>(state: CreatorVideoState, field: K, value: SetStateAction<CreatorVideoState[K]>) {
  const next = typeof value === "function" ? value(state[field]) : value
  return Object.is(state[field], next) ? state : { ...state, [field]: next }
}

// Pure transitions only: persistence, metadata sync and animation stay outside.
export function editorDocumentReducer(state: CreatorVideoState, action: EditorDocumentAction): CreatorVideoState {
  switch (action.type) {
    case "points": return updateField(state, "points", action.value)
    case "tripRoute": return updateField(state, "tripRoute", action.value)
    case "routeShapes": return updateField(state, "routeShapes", action.value)
    case "savedPlaces": return updateField(state, "savedPlaces", action.value)
    case "replace": return action.state
    case "restore-map": return { ...state, ...action.state }
  }
}

export interface EditorHistory<T> { undoStack: T[]; redoStack: T[] }
export type EditorHistoryAction<T> = { type: "record" | "undo" | "redo"; snapshot: T } | { type: "clear" }
export const editorHistoryLimit = 50

export function editorHistoryReducer<T>(state: EditorHistory<T>, action: EditorHistoryAction<T>): EditorHistory<T> {
  switch (action.type) {
    case "clear": return { undoStack: [], redoStack: [] }
    case "record": return { undoStack: [...state.undoStack.slice(-(editorHistoryLimit - 1)), action.snapshot], redoStack: [] }
    case "undo": return state.undoStack.length ? { undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, action.snapshot] } : state
    case "redo": return state.redoStack.length ? { undoStack: [...state.undoStack, action.snapshot], redoStack: state.redoStack.slice(0, -1) } : state
  }
}
