"use client"

import { useCallback, useReducer } from "react"
import { editorHistoryReducer, type EditorHistory, type EditorHistoryAction } from "@/lib/creator-editor-reducers"

export function useCreatorEditorHistory<T>() {
  const reducer = editorHistoryReducer<T>
  const [history, dispatch] = useReducer(reducer, { undoStack: [], redoStack: [] } as EditorHistory<T>)
  const recordHistory = useCallback((snapshot: T) => dispatch({ type: "record", snapshot } satisfies EditorHistoryAction<T>), [])
  const undoHistory = useCallback((snapshot: T) => dispatch({ type: "undo", snapshot } satisfies EditorHistoryAction<T>), [])
  const redoHistory = useCallback((snapshot: T) => dispatch({ type: "redo", snapshot } satisfies EditorHistoryAction<T>), [])
  const clearHistory = useCallback(() => dispatch({ type: "clear" }), [])
  return { ...history, recordHistory, undoHistory, redoHistory, clearHistory }
}
