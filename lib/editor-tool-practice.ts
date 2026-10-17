export type EditorPracticeKind = "point" | "stop" | "stop-end"
export type EditorPracticeState = {
  kind: EditorPracticeKind
  phase: "key" | "place" | "done"
  marker: { x: number; y: number } | null
}
export type EditorPracticeAction = { type: "key" } | { type: "place"; x: number; y: number } | { type: "reset" }

export function getEditorPracticeKey(kind: EditorPracticeKind) {
  return kind === "point" ? "Q" : "W"
}

export function createEditorPracticeState(kind: EditorPracticeKind): EditorPracticeState {
  return { kind, phase: "key", marker: kind === "stop-end" ? { x: 50, y: 50 } : null }
}

export function editorPracticeReducer(state: EditorPracticeState, action: EditorPracticeAction): EditorPracticeState {
  if (action.type === "reset") return createEditorPracticeState(state.kind)
  if (action.type === "key" && state.phase === "key") {
    return { ...state, phase: state.kind === "stop-end" ? "done" : "place" }
  }
  if (action.type === "place" && state.phase === "place") {
    return { ...state, phase: "done", marker: { x: Math.max(8, Math.min(92, action.x)), y: Math.max(18, Math.min(82, action.y)) } }
  }
  return state
}

export function matchesEditorPracticeKey(kind: EditorPracticeKind, event: Pick<KeyboardEvent, "key" | "code" | "repeat" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "isComposing">) {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing) return false
  const key = getEditorPracticeKey(kind)
  return event.code === `Key${key}` || event.key.toUpperCase() === key
}
