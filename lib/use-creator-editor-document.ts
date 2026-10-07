"use client"

import { useCallback, useReducer, type SetStateAction } from "react"
import type { CreatorVideoState } from "@/lib/creator-video-state"
import { editorDocumentReducer } from "@/lib/creator-editor-reducers"

export function useCreatorEditorDocument(initialState: CreatorVideoState) {
  const [document, dispatch] = useReducer(editorDocumentReducer, initialState)
  const setPoints = useCallback((value: SetStateAction<CreatorVideoState["points"]>) => dispatch({ type: "points", value }), [])
  const setTripRoute = useCallback((value: SetStateAction<CreatorVideoState["tripRoute"]>) => dispatch({ type: "tripRoute", value }), [])
  const setRouteShapes = useCallback((value: SetStateAction<CreatorVideoState["routeShapes"]>) => dispatch({ type: "routeShapes", value }), [])
  const setSavedPlaces = useCallback((value: SetStateAction<CreatorVideoState["savedPlaces"]>) => dispatch({ type: "savedPlaces", value }), [])
  const replaceDocument = useCallback((state: CreatorVideoState) => dispatch({ type: "replace", state }), [])
  const restoreMapDocument = useCallback((state: Pick<CreatorVideoState, "points" | "tripRoute" | "routeShapes">) => dispatch({ type: "restore-map", state }), [])
  return { ...document, setPoints, setTripRoute, setRouteShapes, setSavedPlaces, replaceDocument, restoreMapDocument }
}
