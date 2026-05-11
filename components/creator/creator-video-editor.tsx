"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import * as Dialog from "@radix-ui/react-dialog"
import * as Popover from "@radix-ui/react-popover"
import { ArrowLeftRight, ArrowUp, Keyboard, MapPin, Pause, Pencil, Trash2, UploadCloud, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MapboxLocationPicker } from "@/components/maps/mapbox-location-picker"
import { YouTubePlayer } from "@/components/media/youtube-player"
import {
  emptyCreatorTripRoute,
  loadCreatorTripRoute,
  saveCreatorTripRoute,
  type CreatorTripEndpoint,
  type CreatorTripLocation,
  type CreatorTripRoute,
} from "@/lib/creator-trip-route"
import {
  loadCreatorRouteShapes,
  saveCreatorRouteShapes,
  type CreatorRouteShapePoint,
  type CreatorRouteShapes,
} from "@/lib/creator-route-shapes"
import type { TravelVideo } from "@/lib/demo-data"
import { formatDuration } from "@/lib/demo-data"
import {
  loadCreatorPoints,
  saveCreatorPoints,
  sortCreatorPoints,
  type CreatorMapPoint,
  type CreatorMapPointType,
  upsertCreatorPoint,
} from "@/lib/creator-points"
import { syncVideoRouteMetadata, updateLocalCreatorVideo, withSyncedVideoState } from "@/lib/creator-videos"
import { uploadCreatorVideoToCloud } from "@/lib/creator-videos-cloud-client"
import { loadCreatorVideoState, saveCreatorVideoState } from "@/lib/creator-video-state-client"
import type { CreatorVideoState } from "@/lib/creator-video-state"

interface CreatorVideoEditorProps {
  video: TravelVideo
  headerActionsTargetId?: string
}

interface DraftPoint {
  id?: string
  time: number
  stopEndTime?: number
  lat: number | null
  lng: number | null
  location: string
  description: string
  pointType: CreatorMapPointType
}

interface MapEditSnapshot {
  points: CreatorMapPoint[]
  tripRoute: CreatorTripRoute
  routeShapes: CreatorRouteShapes
  activeTripEndpoint: CreatorTripEndpoint | null
  draftPoint: DraftPoint | null
  isAwaitingMapPlacement: boolean
}

interface EditorShortcutState {
  draftPoint: DraftPoint | null
  isAwaitingMapPlacement: boolean
  isRecordingStop: boolean
  addTimestampPoint: (pointType: CreatorMapPointType) => void
  cancelPointEdit: () => void
  setStopEndTime: () => void
  startStopRecording: () => void
}

const resumeAutoplayDelaySeconds = 2.5
const resumeCountdownTickSeconds = 0.1
const editorTimeRenderStepSeconds = 0.25
const editorShortcutGroups = [
  { keys: "Q", action: "Add point" },
  { keys: "W", action: "Add stop or finish stop" },
  { keys: "Esc", action: "Cancel pending point or stop" },
  { keys: "Space / K", action: "Play or pause video" },
  { keys: "J", action: "Seek back 10 seconds" },
  { keys: "L", action: "Seek forward 10 seconds" },
  { keys: "Hold J / L", action: "Repeat seek after 0.5s" },
  { keys: "I", action: "Zoom map in on traveler" },
  { keys: "O", action: "Zoom map out on traveler" },
]

function createDraftPoint(point?: CreatorMapPoint): DraftPoint {
  if (!point) {
    return {
      id: undefined,
      time: 0,
      stopEndTime: undefined,
      lat: null,
      lng: null,
      location: "",
      description: "",
      pointType: "point",
    }
  }

  return {
    id: point.id,
    time: point.time,
    stopEndTime: point.stopEndTime,
    lat: point.lat,
    lng: point.lng,
    location: point.location,
    description: point.description,
    pointType: point.pointType === "stop" ? "stop" : "point",
  }
}

function getDraftLocation(pointType: CreatorMapPointType, time: number) {
  return pointType === "stop" ? `Stop at ${formatDuration(time)}` : `Point at ${formatDuration(time)}`
}

function getDraftDescription(pointType: CreatorMapPointType) {
  return pointType === "stop"
    ? "Stop captured from the creator editor."
    : "Route point captured from the creator editor."
}

function getDisplayTimestampName(point: CreatorMapPoint) {
  const name = point.location.trim()
  const pointType = point.pointType === "stop" ? "stop" : "point"
  return name && name !== getDraftLocation(pointType, point.time) ? name : ""
}

function shouldIgnorePlaybackShortcut(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName.toLowerCase()
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    tagName === "button" ||
    target.isContentEditable ||
    Boolean(target.closest('[role="combobox"]'))
  )
}

export function CreatorVideoEditor({ video, headerActionsTargetId }: CreatorVideoEditorProps) {
  const remoteSaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const remoteLoadRequestRef = useRef(0)
  const editorScrollRef = useRef<HTMLElement | null>(null)
  const currentTimeRef = useRef(0)
  const renderedCurrentTimeRef = useRef(0)
  const editorShortcutStateRef = useRef<EditorShortcutState | null>(null)
  const [points, setPoints] = useState<CreatorMapPoint[]>(() => loadCreatorPoints(video.id, video.keyframes))
  const [tripRoute, setTripRoute] = useState<CreatorTripRoute>(() => loadCreatorTripRoute(video.id))
  const [routeShapes, setRouteShapes] = useState<CreatorRouteShapes>(() => loadCreatorRouteShapes(video.id))
  const [activeTripEndpoint, setActiveTripEndpoint] = useState<CreatorTripEndpoint | null>(null)
  const [undoStack, setUndoStack] = useState<MapEditSnapshot[]>([])
  const [redoStack, setRedoStack] = useState<MapEditSnapshot[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [seekRequest, setSeekRequest] = useState<{ id: number; time: number } | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null)
  const [draftPoint, setDraftPoint] = useState<DraftPoint | null>(null)
  const [isAwaitingMapPlacement, setIsAwaitingMapPlacement] = useState(false)
  const [isTripRouteDialogOpen, setIsTripRouteDialogOpen] = useState(false)
  const [headerActionsElement, setHeaderActionsElement] = useState<HTMLElement | null>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [isRecordingStop, setIsRecordingStop] = useState(false)
  const [isUploadingVideo, setIsUploadingVideo] = useState(false)
  const [uploadMessage, setUploadMessage] = useState("")

  const commitCurrentTime = useCallback((time: number, force = false) => {
    if (!Number.isFinite(time)) {
      return
    }

    currentTimeRef.current = time
    if (force || Math.abs(time - renderedCurrentTimeRef.current) >= editorTimeRenderStepSeconds) {
      renderedCurrentTimeRef.current = time
      setCurrentTime(time)
    }
  }, [])

  const handleVideoTimeChange = useCallback(
    (time: number) => {
      commitCurrentTime(time)
    },
    [commitCurrentTime],
  )

  useEffect(() => {
    const nextPoints = loadCreatorPoints(video.id, video.keyframes)
    setPoints(nextPoints)
    setTripRoute(loadCreatorTripRoute(video.id))
    setRouteShapes(loadCreatorRouteShapes(video.id))
    setActiveTripEndpoint(null)
    setDraftPoint(null)
    setIsAwaitingMapPlacement(false)
    setIsRecordingStop(false)
    setUndoStack([])
    setRedoStack([])
    commitCurrentTime(0, true)
    setSeekRequest(null)
    setIsPlaying(false)
    setResumeCountdown(null)
    setIsTripRouteDialogOpen(false)
    setUploadMessage("")
  }, [commitCurrentTime, video.id, video.keyframes])

  useEffect(() => {
    if (!headerActionsTargetId) {
      setHeaderActionsElement(null)
      return
    }

    setHeaderActionsElement(document.getElementById(headerActionsTargetId))
  }, [headerActionsTargetId])

  useEffect(() => {
    const requestId = remoteLoadRequestRef.current + 1
    remoteLoadRequestRef.current = requestId
    const controller = new AbortController()

    loadCreatorVideoState(video.id, controller.signal)
      .then((response) => {
        if (controller.signal.aborted || remoteLoadRequestRef.current !== requestId) {
          return
        }

        if (response?.state) {
          setPoints(response.state.points)
          setTripRoute(response.state.tripRoute)
          setRouteShapes(response.state.routeShapes)
          saveCreatorPoints(video.id, response.state.points)
          saveCreatorTripRoute(video.id, response.state.tripRoute)
          saveCreatorRouteShapes(video.id, response.state.routeShapes)
          syncVideoRouteMetadata(
            video.id,
            response.state.points.map(({ id, ...point }) => point),
          )
          return
        }

        if (response?.configured) {
          const localState = {
            points: loadCreatorPoints(video.id, video.keyframes),
            tripRoute: loadCreatorTripRoute(video.id),
            routeShapes: loadCreatorRouteShapes(video.id),
          }
          queueRemoteStateSave(video.id, localState)
        }
      })
      .catch(() => {
        // Local storage remains the fallback when auth, network, or database config is unavailable.
      })

    return () => controller.abort()
  }, [video.id, video.keyframes])

  useEffect(() => {
    if (resumeCountdown === null) {
      return
    }

    if (resumeCountdown <= 0) {
      setResumeCountdown(null)
      setIsPlaying(true)
      return
    }

    const timer = window.setTimeout(() => {
      const nextCountdown = Math.max(0, Math.round((resumeCountdown - resumeCountdownTickSeconds) * 10) / 10)

      if (nextCountdown <= 0) {
        setResumeCountdown(null)
        setIsPlaying(true)
        return
      }

      setResumeCountdown(nextCountdown)
    }, 100)

    return () => window.clearTimeout(timer)
  }, [resumeCountdown])

  useEffect(() => {
    const scrollContainer = editorScrollRef.current
    if (!scrollContainer) {
      return
    }

    const handleScroll = () => {
      const nextShowScrollTop = scrollContainer.scrollTop > 360
      setShowScrollTop((current) => (current === nextShowScrollTop ? current : nextShowScrollTop))
    }

    handleScroll()
    scrollContainer.addEventListener("scroll", handleScroll, { passive: true })
    return () => scrollContainer.removeEventListener("scroll", handleScroll)
  }, [])

  const sortedPoints = useMemo(() => sortCreatorPoints(points), [points])
  const pointNumberById = useMemo(
    () => new Map(sortedPoints.map((point, index) => [point.id, index + 1])),
    [sortedPoints],
  )
  const displayedPoints = useMemo(
    () => sortedPoints.map((point, index) => ({ point, pointNumber: index + 1 })),
    [sortedPoints],
  )
  const activeTimelinePointId = useMemo(() => {
    let activePointId: string | null = null

    for (const point of sortedPoints) {
      if (currentTime + 0.001 < point.time) {
        break
      }

      activePointId = point.id
    }

    return activePointId
  }, [currentTime, sortedPoints])
  const latestPointStopCandidate = useMemo(() => {
    for (let index = sortedPoints.length - 1; index >= 0; index -= 1) {
      const point = sortedPoints[index]
      if (point.pointType !== "stop" && currentTime > point.time + 0.5) {
        return point
      }
    }

    return null
  }, [currentTime, sortedPoints])
  const latestPointStopCandidateNumber = latestPointStopCandidate
    ? pointNumberById.get(latestPointStopCandidate.id) ?? null
    : null

  const queueRemoteStateSave = (videoId: string, state: CreatorVideoState) => {
    const nextSave = remoteSaveQueueRef.current
      .catch(() => undefined)
      .then(() => saveCreatorVideoState(videoId, state))
      .then(() => undefined)
      .catch(() => undefined)

    remoteSaveQueueRef.current = nextSave
  }

  const persistEditorState = (nextState: CreatorVideoState) => {
    saveCreatorPoints(video.id, nextState.points)
    saveCreatorTripRoute(video.id, nextState.tripRoute)
    saveCreatorRouteShapes(video.id, nextState.routeShapes)
    syncVideoRouteMetadata(
      video.id,
      nextState.points.map(({ id, ...point }) => point),
    )
    queueRemoteStateSave(video.id, nextState)
  }

  const persistPoints = (nextPoints: CreatorMapPoint[]) => {
    setPoints(nextPoints)
    persistEditorState({
      points: nextPoints,
      tripRoute,
      routeShapes,
    })
  }

  const createMapEditSnapshot = (): MapEditSnapshot => ({
    points: points.map((point) => ({ ...point })),
    tripRoute: {
      start: tripRoute.start ? { ...tripRoute.start } : null,
      end: tripRoute.end ? { ...tripRoute.end } : null,
    },
    routeShapes: {
      trip: routeShapes.trip.map((point) => ({ ...point })),
      timestampLegs: Object.fromEntries(
        Object.entries(routeShapes.timestampLegs).map(([key, points]) => [key, points.map((point) => ({ ...point }))]),
      ),
    },
    activeTripEndpoint,
    draftPoint: draftPoint ? { ...draftPoint } : null,
    isAwaitingMapPlacement,
  })

  const persistTripRoute = (nextRoute: CreatorTripRoute) => {
    setTripRoute(nextRoute)
    persistEditorState({
      points,
      tripRoute: nextRoute,
      routeShapes,
    })
  }

  const persistRouteShapes = (nextRouteShapes: CreatorRouteShapes) => {
    setRouteShapes(nextRouteShapes)
    persistEditorState({
      points,
      tripRoute,
      routeShapes: nextRouteShapes,
    })
  }

  const recordMapEditSnapshot = () => {
    setUndoStack((currentStack) => [...currentStack.slice(-49), createMapEditSnapshot()])
    setRedoStack([])
  }

  const applyMapEditSnapshot = (snapshot: MapEditSnapshot) => {
    setResumeCountdown(null)
    setPoints(snapshot.points)
    setTripRoute(snapshot.tripRoute)
    setRouteShapes(snapshot.routeShapes)
    persistEditorState({
      points: snapshot.points,
      tripRoute: snapshot.tripRoute,
      routeShapes: snapshot.routeShapes,
    })
    setActiveTripEndpoint(snapshot.activeTripEndpoint)
    setDraftPoint(snapshot.draftPoint)
    setIsAwaitingMapPlacement(snapshot.isAwaitingMapPlacement)
  }

  const undoMapEdit = () => {
    const previousSnapshot = undoStack.at(-1)
    if (!previousSnapshot) {
      return
    }

    setUndoStack((currentStack) => currentStack.slice(0, -1))
    setRedoStack((currentStack) => [...currentStack, createMapEditSnapshot()])
    applyMapEditSnapshot(previousSnapshot)
  }

  const redoMapEdit = () => {
    const nextSnapshot = redoStack.at(-1)
    if (!nextSnapshot) {
      return
    }

    setRedoStack((currentStack) => currentStack.slice(0, -1))
    setUndoStack((currentStack) => [...currentStack, createMapEditSnapshot()])
    applyMapEditSnapshot(nextSnapshot)
  }

  const updateTripEndpoint = (endpoint: CreatorTripEndpoint, value: CreatorTripLocation) => {
    recordMapEditSnapshot()
    const nextRoute = {
      ...tripRoute,
      [endpoint]: value,
    }
    const nextRouteShapes = routeShapes.trip.length > 0 ? { ...routeShapes, trip: [] } : routeShapes

    setTripRoute(nextRoute)
    setRouteShapes(nextRouteShapes)
    persistEditorState({
      points,
      tripRoute: nextRoute,
      routeShapes: nextRouteShapes,
    })
    setActiveTripEndpoint(endpoint === "start" && !nextRoute.end ? "end" : null)
  }

  const clearTripRoute = () => {
    const nextRouteShapes = {
      ...routeShapes,
      trip: [],
    }

    setTripRoute(emptyCreatorTripRoute)
    setRouteShapes(nextRouteShapes)
    persistEditorState({
      points,
      tripRoute: emptyCreatorTripRoute,
      routeShapes: nextRouteShapes,
    })
    setActiveTripEndpoint(null)
  }

  const swapTripRouteEndpoints = () => {
    if (!tripRoute.start || !tripRoute.end) {
      return
    }

    recordMapEditSnapshot()
    const nextTripRoute = {
      start: tripRoute.end,
      end: tripRoute.start,
    }
    const nextRouteShapes = {
      ...routeShapes,
      trip: [...routeShapes.trip].reverse(),
    }

    setTripRoute(nextTripRoute)
    setRouteShapes(nextRouteShapes)
    persistEditorState({
      points,
      tripRoute: nextTripRoute,
      routeShapes: nextRouteShapes,
    })
    setActiveTripEndpoint(null)
  }

  const chooseTripEndpoint = (endpoint: CreatorTripEndpoint) => {
    setActiveTripEndpoint((current) => {
      const nextEndpoint = current === endpoint ? null : endpoint
      if (nextEndpoint) {
        setIsTripRouteDialogOpen(false)
      }

      return nextEndpoint
    })
  }

  const updateTripRouteShape = (points: CreatorRouteShapePoint[]) => {
    recordMapEditSnapshot()
    const nextRouteShapes = {
      ...routeShapes,
      trip: points,
    }

    setRouteShapes(nextRouteShapes)
    persistEditorState({
      points: sortedPoints,
      tripRoute,
      routeShapes: nextRouteShapes,
    })
  }

  const updateTimestampRouteShape = (legKey: string, points: CreatorRouteShapePoint[]) => {
    recordMapEditSnapshot()
    const nextRouteShapes = {
      ...routeShapes,
      timestampLegs: {
        ...routeShapes.timestampLegs,
        [legKey]: points,
      },
    }

    setRouteShapes(nextRouteShapes)
    persistEditorState({
      points: sortedPoints,
      tripRoute,
      routeShapes: nextRouteShapes,
    })
  }

  const addTimestampPoint = (pointType: CreatorMapPointType) => {
    const timestamp = currentTimeRef.current
    setResumeCountdown(null)
    setIsPlaying(false)
    setIsRecordingStop(false)
    setDraftPoint({
      id: undefined,
      time: timestamp,
      stopEndTime: undefined,
      lat: null,
      lng: null,
      location: getDraftLocation(pointType, timestamp),
      description: getDraftDescription(pointType),
      pointType,
    })
    setIsAwaitingMapPlacement(true)
  }

  const savePointFromMap = (value: { lat: number; lng: number }) => {
    if (!draftPoint) {
      return
    }

    recordMapEditSnapshot()
    const savedTime = draftPoint.time
    const nextDraft: DraftPoint = {
      ...draftPoint,
      time: savedTime,
      lat: value.lat,
      lng: value.lng,
      location: draftPoint.location.trim() || getDraftLocation(draftPoint.pointType, savedTime),
      description: draftPoint.description.trim() || getDraftDescription(draftPoint.pointType),
    }

    if (isRecordingStop && !draftPoint.id && draftPoint.pointType === "stop") {
      setDraftPoint(nextDraft)
      setIsAwaitingMapPlacement(false)
      setIsPlaying(false)
      setResumeCountdown(resumeAutoplayDelaySeconds)
      return
    }

    const nextPoints = upsertCreatorPoint(video.id, points, {
      ...nextDraft,
      lat: value.lat,
      lng: value.lng,
      location: nextDraft.location,
      description: nextDraft.description,
      pointType: nextDraft.pointType,
      stopEndTime: nextDraft.stopEndTime,
    })

    persistPoints(nextPoints)
    setDraftPoint(null)
    setIsAwaitingMapPlacement(false)
    setIsPlaying(false)
    setResumeCountdown(resumeAutoplayDelaySeconds)
  }

  const beginEditPoint = (point: CreatorMapPoint) => {
    setResumeCountdown(null)
    setIsPlaying(false)
    setDraftPoint(createDraftPoint(point))
    setIsAwaitingMapPlacement(true)
    setIsRecordingStop(false)
  }

  const saveDraftPointEdits = () => {
    if (!draftPoint?.id || draftPoint.lat === null || draftPoint.lng === null) {
      return
    }

    recordMapEditSnapshot()
    const nextDraft: DraftPoint = {
      ...draftPoint,
      location: draftPoint.location.trim() || getDraftLocation(draftPoint.pointType, draftPoint.time),
      description: draftPoint.description.trim() || getDraftDescription(draftPoint.pointType),
    }
    const nextPoints = upsertCreatorPoint(video.id, points, {
      ...nextDraft,
      lat: draftPoint.lat,
      lng: draftPoint.lng,
      location: nextDraft.location,
      description: nextDraft.description,
      pointType: nextDraft.pointType,
      stopEndTime:
        nextDraft.pointType === "stop" && typeof nextDraft.stopEndTime === "number" && nextDraft.stopEndTime > nextDraft.time
          ? nextDraft.stopEndTime
          : undefined,
    })

    persistPoints(nextPoints)
    setDraftPoint(null)
    setIsAwaitingMapPlacement(false)
    setIsPlaying(false)
    setResumeCountdown(null)
  }

  const saveDraftPointTimeFromVideo = () => {
    if (!draftPoint?.id || draftPoint.lat === null || draftPoint.lng === null) {
      return
    }

    const timestamp = currentTimeRef.current
    recordMapEditSnapshot()
    const nextDraft: DraftPoint = {
      ...draftPoint,
      time: timestamp,
      location: draftPoint.location.trim() || getDraftLocation(draftPoint.pointType, timestamp),
      description: draftPoint.description.trim() || getDraftDescription(draftPoint.pointType),
    }
    const nextPoints = upsertCreatorPoint(video.id, points, {
      ...nextDraft,
      lat: draftPoint.lat,
      lng: draftPoint.lng,
      location: nextDraft.location,
      description: nextDraft.description,
      pointType: nextDraft.pointType,
      stopEndTime:
        nextDraft.pointType === "stop" && typeof nextDraft.stopEndTime === "number" && nextDraft.stopEndTime > nextDraft.time
          ? nextDraft.stopEndTime
          : undefined,
    })

    persistPoints(nextPoints)
    setDraftPoint(null)
    setIsAwaitingMapPlacement(false)
    setIsPlaying(false)
    setResumeCountdown(resumeAutoplayDelaySeconds)
  }

  const updateDraftPointType = (pointType: CreatorMapPointType) => {
    if (!draftPoint) {
      return
    }

    setDraftPoint((currentDraft) => {
      if (!currentDraft) {
        return currentDraft
      }

      return {
        ...currentDraft,
        pointType,
        stopEndTime: pointType === "stop" ? currentDraft.stopEndTime : undefined,
        location: currentDraft.location.trim() ? currentDraft.location : getDraftLocation(pointType, currentDraft.time),
        description: currentDraft.description.trim() ? currentDraft.description : getDraftDescription(pointType),
      }
    })
  }

  const cancelPointEdit = () => {
    setResumeCountdown(null)
    setDraftPoint(null)
    setIsAwaitingMapPlacement(false)
    setIsRecordingStop(false)
  }

  const playFromMapTimestamp = (point: CreatorMapPoint) => {
    setResumeCountdown(null)
    commitCurrentTime(point.time, true)
    setSeekRequest((currentRequest) => ({
      id: (currentRequest?.id ?? 0) + 1,
      time: point.time,
    }))
    setIsPlaying(true)
    setDraftPoint(null)
    setIsAwaitingMapPlacement(false)
    setIsRecordingStop(false)
  }

  const deletePoint = (id: string) => {
    const nextPoints = points.filter((point) => point.id !== id)
    persistPoints(nextPoints)
    if (draftPoint?.id === id) {
      setDraftPoint(null)
      setIsAwaitingMapPlacement(false)
      setIsRecordingStop(false)
    }
  }

  const startStopRecording = () => {
    const timestamp = currentTimeRef.current
    setResumeCountdown(null)
    setIsPlaying(false)
    setDraftPoint({
      id: undefined,
      time: timestamp,
      stopEndTime: undefined,
      lat: null,
      lng: null,
      location: getDraftLocation("stop", timestamp),
      description: getDraftDescription("stop"),
      pointType: "stop",
    })
    setIsAwaitingMapPlacement(true)
    setIsRecordingStop(true)
  }

  const setStopEndTime = () => {
    const timestamp = currentTimeRef.current
    if (!draftPoint || draftPoint.pointType !== "stop" || draftPoint.lat === null || draftPoint.lng === null || timestamp <= draftPoint.time) {
      return
    }

    recordMapEditSnapshot()
    const stopEndTime = Math.max(timestamp, draftPoint.time + 0.5)
    const nextDraft: DraftPoint = {
      ...draftPoint,
      stopEndTime,
      location: draftPoint.location.trim() || getDraftLocation("stop", draftPoint.time),
      description: draftPoint.description.trim() || getDraftDescription("stop"),
    }
    const nextPoints = upsertCreatorPoint(video.id, points, {
      ...nextDraft,
      lat: draftPoint.lat,
      lng: draftPoint.lng,
      location: nextDraft.location,
      description: nextDraft.description,
      pointType: "stop",
      stopEndTime: nextDraft.stopEndTime,
    })

    persistPoints(nextPoints)
    setDraftPoint(null)
    setIsAwaitingMapPlacement(false)
    setIsRecordingStop(false)
    setResumeCountdown(null)
    setIsPlaying(true)
  }

  const convertLatestPointToStop = () => {
    const timestamp = currentTimeRef.current
    if (!latestPointStopCandidate || timestamp <= latestPointStopCandidate.time) {
      return
    }

    recordMapEditSnapshot()
    const stopEndTime = Math.max(timestamp, latestPointStopCandidate.time + 0.5)
    const nextPoints = upsertCreatorPoint(video.id, points, {
      ...latestPointStopCandidate,
      pointType: "stop",
      stopEndTime,
      location: latestPointStopCandidate.location.trim() || getDraftLocation("stop", latestPointStopCandidate.time),
      description: latestPointStopCandidate.description.trim() || getDraftDescription("stop"),
    })

    persistPoints(nextPoints)
    setDraftPoint(null)
    setIsAwaitingMapPlacement(false)
    setIsRecordingStop(false)
    setResumeCountdown(null)
  }

  useEffect(() => {
    editorShortcutStateRef.current = {
      draftPoint,
      isAwaitingMapPlacement,
      isRecordingStop,
      addTimestampPoint,
      cancelPointEdit,
      setStopEndTime,
      startStopRecording,
    }
  })

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const shortcutState = editorShortcutStateRef.current
      if (!shortcutState) {
        return
      }

      if (
        event.code === "Escape" &&
        !event.repeat &&
        shortcutState.draftPoint &&
        !shortcutState.draftPoint.id &&
        shortcutState.isAwaitingMapPlacement &&
        shortcutState.draftPoint.lat === null &&
        shortcutState.draftPoint.lng === null
      ) {
        event.preventDefault()
        shortcutState.cancelPointEdit()
        return
      }

      if (event.repeat || shouldIgnorePlaybackShortcut(event.target)) {
        return
      }

      if (event.code === "Space" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        setResumeCountdown(null)
        setIsPlaying((prev) => !prev)
        return
      }

      if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
        return
      }

      if (event.code === "KeyQ") {
        event.preventDefault()
        shortcutState.addTimestampPoint("point")
        return
      }

      if (event.code === "KeyW") {
        event.preventDefault()
        if (shortcutState.isRecordingStop) {
          shortcutState.setStopEndTime()
          return
        }

        shortcutState.startStopRecording()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  const activePointNumber = draftPoint?.id ? pointNumberById.get(draftPoint.id) ?? null : null
  const formatTripLocation = (location: CreatorTripLocation | null) => {
    if (!location) {
      return "Choose place"
    }

    return location.name?.trim() || "Saved place"
  }

  const scrollEditorToTop = () => {
    editorScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }

  const uploadEditedVideo = async () => {
    if (isUploadingVideo) {
      return
    }

    setIsUploadingVideo(true)
    setUploadMessage("")

    const state = {
      points: sortedPoints,
      tripRoute,
      routeShapes,
    }

    try {
      const response = await uploadCreatorVideoToCloud(withSyncedVideoState(video, state, "published"), state, {
        publish: true,
      })

      if (!response.configured) {
        setUploadMessage("Cloud database is not configured yet. Add DATABASE_URL in Vercel, then upload again.")
        return
      }

      setUploadMessage(response.saved ? "Uploaded to cloud." : "Upload failed. Please try again.")
    } finally {
      setIsUploadingVideo(false)
    }
  }

  const renderTimestampEditPanel = () => {
    if (!draftPoint?.id) {
      return null
    }

    return (
      <div
        className={`mx-2 mb-3 space-y-2 rounded-md border px-3 py-2 text-sm ${
          draftPoint.pointType === "stop"
            ? "border-teal-200 bg-teal-50 text-teal-950"
            : "border-orange-200 bg-orange-50 text-orange-950"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">Editing timestamp {activePointNumber ? `#${activePointNumber}` : ""}</span>
          <span>{formatDuration(draftPoint.time)}</span>
        </div>
        <p className="text-xs opacity-80">
          Click the map to update this timestamp location. Current video time: {formatDuration(currentTime)}.
        </p>
        <label className="block space-y-1">
          <span className="text-xs font-semibold opacity-80">Timestamp name</span>
          <Input
            value={draftPoint.location}
            onChange={(event) =>
              setDraftPoint((currentDraft) =>
                currentDraft ? { ...currentDraft, location: event.target.value } : currentDraft,
              )
            }
            placeholder={draftPoint.pointType === "stop" ? "Stop name" : "Point name"}
            className="h-8 border-white/70 bg-white text-slate-950 shadow-none"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            variant={draftPoint.pointType === "point" ? "default" : "outline"}
            className={
              draftPoint.pointType === "point"
                ? "h-8 bg-orange-600 text-white hover:bg-orange-700"
                : "h-8 border-orange-200 bg-white text-orange-700 hover:bg-orange-50"
            }
            onClick={() => updateDraftPointType("point")}
          >
            <MapPin className="mr-2 h-4 w-4" />
            Point
          </Button>
          <Button
            type="button"
            size="sm"
            variant={draftPoint.pointType === "stop" ? "default" : "outline"}
            className={
              draftPoint.pointType === "stop"
                ? "h-8 bg-teal-700 text-white hover:bg-teal-800"
                : "h-8 border-teal-200 bg-white text-teal-700 hover:bg-teal-50"
            }
            onClick={() => updateDraftPointType("stop")}
          >
            <Pause className="mr-2 h-4 w-4" />
            Stop
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className={`h-8 text-white ${
              draftPoint.pointType === "stop" ? "bg-teal-700 hover:bg-teal-800" : "bg-orange-600 hover:bg-orange-700"
            }`}
            onClick={saveDraftPointEdits}
          >
            Save
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 bg-white" onClick={saveDraftPointTimeFromVideo}>
            Set to current time
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 bg-white" onClick={cancelPointEdit}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Popover.Root>
        {headerActionsElement
          ? createPortal(
              <>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Edit Page
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={uploadEditedVideo}
                  disabled={isUploadingVideo}
                >
                  <UploadCloud className="mr-1 h-4 w-4" />
                  {isUploadingVideo ? "Uploading..." : "Upload"}
                </Button>
                <Popover.Trigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    aria-label="Show keyboard shortcuts"
                    title="Show keyboard shortcuts"
                  >
                    <Keyboard className="h-4 w-4" />
                  </Button>
                </Popover.Trigger>
              </>,
              headerActionsElement,
            )
          : null}
        <Popover.Portal>
          <Popover.Content
            align="end"
            side="bottom"
            sideOffset={8}
            className="z-50 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
          >
            <div className="flex items-center gap-2 border-b border-slate-100 px-2 pb-2 pt-1">
              <Keyboard className="h-4 w-4 text-slate-500" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shortcuts</span>
            </div>
            <div className="max-h-[22rem] overflow-y-auto px-1 py-1">
              {editorShortcutGroups.map((shortcut) => (
                <div key={shortcut.keys} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5">
                  <kbd className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px] font-semibold text-slate-700">
                    {shortcut.keys}
                  </kbd>
                  <span className="text-right text-xs leading-5 text-slate-600">{shortcut.action}</span>
                </div>
              ))}
            </div>
            <Popover.Arrow className="fill-white" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <div className="grid min-h-[calc(100vh-73px)] bg-white xl:h-full xl:min-h-0 xl:grid-cols-[minmax(360px,0.88fr)_minmax(0,1.55fr)] xl:overflow-hidden">
      <section
        ref={editorScrollRef}
        className="relative flex min-h-0 flex-col overflow-y-auto border-b border-slate-200 xl:h-full xl:border-b-0 xl:border-r"
      >
        <div
          className="relative w-full min-h-[360px] overflow-hidden bg-black xl:min-h-[390px] [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:h-full [&_iframe]:w-full"
          style={{ aspectRatio: "4 / 3" }}
        >
          <YouTubePlayer
            videoId={video.youtubeId}
            currentTime={currentTime}
            seekToTime={seekRequest?.time}
            seekRequestId={seekRequest?.id}
            isPlaying={isPlaying}
            volume={75}
            isMuted={false}
            showControls
            allowKeyboard
            onReady={(nextDuration) => {
              const resolvedDuration = nextDuration || video.durationSeconds
              updateLocalCreatorVideo(video.id, { durationSeconds: resolvedDuration })
            }}
            onTimeChange={handleVideoTimeChange}
            onPlayingChange={setIsPlaying}
          />
          {resumeCountdown !== null && (
            <div className="pointer-events-none absolute inset-x-0 bottom-14 z-10 flex justify-center px-4">
              <div className="flex items-center gap-3 rounded-full bg-slate-950/80 px-4 py-2 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/70">Autoplay in</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-600 text-lg font-bold leading-none">
                  {resumeCountdown.toFixed(1)}
                </span>
              </div>
            </div>
          )}
        </div>

        {uploadMessage && (
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600" aria-live="polite">
            {uploadMessage}
          </div>
        )}

        <div className="flex flex-col">
          <div className="p-3 lg:p-4">
            <section className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  className="h-8 px-3 font-semibold bg-orange-600 text-white hover:bg-orange-700"
                  onClick={() => addTimestampPoint("point")}
                >
                  <MapPin className="mr-2 h-4 w-4" />
                  <span>Add Point</span>
                  <kbd className="ml-1 text-[10px] font-medium leading-none text-white/55">[Q]</kbd>
                </Button>
                <Button
                  size="sm"
                  className="h-8 px-3 font-semibold bg-teal-700 text-white hover:bg-teal-800"
                  disabled={
                    isRecordingStop &&
                    (!draftPoint ||
                      draftPoint.pointType !== "stop" ||
                      draftPoint.lat === null ||
                      draftPoint.lng === null ||
                      currentTime <= draftPoint.time)
                  }
                  title={
                    isRecordingStop && (!draftPoint || draftPoint.lat === null || draftPoint.lng === null)
                      ? "Click the map to set the stop location first"
                      : undefined
                  }
                  onClick={isRecordingStop ? setStopEndTime : startStopRecording}
                >
                  <Pause className="mr-2 h-4 w-4" />
                  <span>{isRecordingStop ? "Set Stop" : "Add Stop"}</span>
                  <kbd className="ml-1 text-[10px] font-medium leading-none text-white/55">[W]</kbd>
                </Button>
              </div>
              {latestPointStopCandidate && latestPointStopCandidateNumber && !draftPoint && !isRecordingStop && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-auto w-full justify-between border-teal-200 bg-teal-50 px-3 py-2 text-left text-teal-950 hover:bg-teal-100"
                  onClick={convertLatestPointToStop}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Pause className="h-4 w-4 shrink-0" />
                    <span className="truncate font-semibold">Make #{latestPointStopCandidateNumber} a stop</span>
                  </span>
                  <span className="shrink-0 text-xs font-medium opacity-70">
                    {formatDuration(latestPointStopCandidate.time)}-{formatDuration(currentTime)}
                  </span>
                </Button>
              )}
            </section>

            <section className="mt-3 space-y-2 border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-950">Timestamps</h2>
                  <Badge variant="secondary">{sortedPoints.length}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Dialog.Root open={isTripRouteDialogOpen} onOpenChange={setIsTripRouteDialogOpen}>
                    <Dialog.Trigger asChild>
                      <Button variant="ghost" size="sm">
                        <ArrowLeftRight className="mr-2 h-4 w-4" />
                        Trip route
                      </Button>
                    </Dialog.Trigger>
                    <Dialog.Portal>
                      <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/45" />
                      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(calc(100vw-2rem),34rem)] overflow-hidden -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
                        <div className="flex items-center justify-between gap-3">
                          <Dialog.Title className="text-sm font-semibold text-slate-950">Trip route</Dialog.Title>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-blue-700"
                              onClick={swapTripRouteEndpoints}
                              disabled={!tripRoute.start || !tripRoute.end}
                              aria-label="Swap start and end"
                              title="Swap start and end"
                            >
                              <ArrowLeftRight className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 text-blue-700" onClick={clearTripRoute} disabled={!tripRoute.start && !tripRoute.end}>
                              Clear
                            </Button>
                            <Dialog.Close asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Close trip route">
                                <X className="h-4 w-4" />
                              </Button>
                            </Dialog.Close>
                          </div>
                        </div>
                        <Dialog.Description className="sr-only">Set the start and end locations for the trip route.</Dialog.Description>
                        <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-2">
                          <Button
                            variant={activeTripEndpoint === "start" ? "default" : "outline"}
                            size="sm"
                            className={`h-auto min-w-0 justify-start px-3 py-2 text-left ${activeTripEndpoint === "start" ? "bg-blue-600 text-white hover:bg-blue-700" : ""}`}
                            onClick={() => chooseTripEndpoint("start")}
                          >
                            <span className="min-w-0">
                              <span className="block text-xs font-semibold">Start</span>
                              <span className="block truncate text-xs opacity-80">{formatTripLocation(tripRoute.start)}</span>
                            </span>
                          </Button>
                          <Button
                            variant={activeTripEndpoint === "end" ? "default" : "outline"}
                            size="sm"
                            className={`h-auto min-w-0 justify-start px-3 py-2 text-left ${activeTripEndpoint === "end" ? "bg-blue-600 text-white hover:bg-blue-700" : ""}`}
                            onClick={() => chooseTripEndpoint("end")}
                          >
                            <span className="min-w-0">
                              <span className="block text-xs font-semibold">End</span>
                              <span className="block truncate text-xs opacity-80">{formatTripLocation(tripRoute.end)}</span>
                            </span>
                          </Button>
                        </div>
                      </Dialog.Content>
                    </Dialog.Portal>
                  </Dialog.Root>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/watch/${video.id}`}>
                      <MapPin className="mr-2 h-4 w-4" />
                      Preview
                    </Link>
                  </Button>
                </div>
              </div>

              {draftPoint && !draftPoint.id && (
                <div
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm ${
                    draftPoint.pointType === "stop" ? "bg-teal-50 text-teal-950" : "bg-orange-50 text-orange-900"
                  }`}
                >
                  <span className="font-medium">
                    {isRecordingStop
                      ? draftPoint.lat === null || draftPoint.lng === null
                        ? "Click map to place stop"
                        : "Stop recording"
                      : draftPoint.pointType === "stop"
                        ? "Pending stop"
                        : "Pending point"}
                  </span>
                  <span>
                    {isRecordingStop
                      ? `${formatDuration(draftPoint.time)} - ${formatDuration(currentTime)}`
                      : formatDuration(draftPoint.time)}
                  </span>
                </div>
              )}

              {sortedPoints.length === 0 ? (
                <p className="py-4 text-sm text-slate-500">No points yet.</p>
              ) : (
                <div className="divide-y divide-slate-200 overflow-x-hidden">
                  {displayedPoints.map(({ point, pointNumber }) => {
                    const isSelected = draftPoint?.id === point.id
                    const isCurrentTimestamp = activeTimelinePointId === point.id
                    const timestampName = getDisplayTimestampName(point)
                    const rowClassName = [
                      "min-w-0 border-l-4 transition-colors",
                      isCurrentTimestamp
                        ? "border-blue-500 bg-blue-50"
                        : isSelected
                          ? point.pointType === "stop"
                            ? "border-teal-600 bg-teal-50"
                            : "border-orange-500 bg-orange-50"
                          : "border-transparent",
                    ].join(" ")

                    return (
                      <div key={point.id} className={rowClassName}>
                        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_2rem_2rem] items-center gap-2 px-2 py-2.5">
                          <button
                            type="button"
                            className="group grid min-w-0 cursor-pointer grid-cols-[1.5rem_auto_minmax(0,1fr)] items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                            onClick={() => playFromMapTimestamp(point)}
                          >
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold leading-none text-white ${
                                point.pointType === "stop" ? "bg-teal-700" : "bg-orange-600"
                              }`}
                            >
                              {pointNumber}
                            </span>
                            <span
                              className={`whitespace-nowrap rounded-md px-1.5 py-1 text-sm font-semibold transition-colors group-hover:bg-blue-100 group-hover:text-blue-800 group-focus-visible:bg-blue-100 group-focus-visible:text-blue-800 ${
                                isCurrentTimestamp ? "bg-blue-600 text-white" : "text-slate-950"
                              }`}
                            >
                              {point.pointType === "stop" && typeof point.stopEndTime === "number"
                                ? `${formatDuration(point.time)}-${formatDuration(point.stopEndTime)}`
                                : formatDuration(point.time)}
                            </span>
                            <p className="truncate text-xs text-slate-500">
                              {point.pointType === "stop" ? "Stop - " : ""}
                              {timestampName ? `${timestampName} - ` : ""}
                              {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                            </p>
                          </button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-700 hover:text-blue-800"
                            aria-label={`Edit timestamp ${pointNumber}`}
                            onClick={() => beginEditPoint(point)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-700"
                            aria-label={`Delete timestamp ${pointNumber}`}
                            onClick={() => deletePoint(point.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {isSelected ? renderTimestampEditPanel() : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
        {showScrollTop && (
          <Button
            type="button"
            size="icon"
            className="sticky bottom-4 left-[calc(100%-3.5rem)] z-20 mb-4 h-10 w-10 rounded-full bg-slate-950 text-white shadow-lg hover:bg-slate-800"
            aria-label="Scroll to top"
            title="Scroll to top"
            onClick={scrollEditorToTop}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        )}
      </section>

      <section className="relative min-h-[620px] overflow-hidden bg-slate-100 xl:h-full xl:min-h-0">
        <MapboxLocationPicker
          value={draftPoint?.lat === null || draftPoint?.lng === null || !draftPoint ? null : { lat: draftPoint.lat, lng: draftPoint.lng }}
          points={sortedPoints}
          onChange={savePointFromMap}
          activePointNumber={activePointNumber}
          activePointType={draftPoint?.pointType}
          tripRoute={tripRoute}
          routeShapes={routeShapes}
          routeProgressTime={currentTime}
          liveRouteProgressTimeRef={currentTimeRef}
          isRouteShapingDisabled={isAwaitingMapPlacement}
          activeTripEndpoint={activeTripEndpoint}
          onTripEndpointChange={updateTripEndpoint}
          onTripRouteShapeChange={updateTripRouteShape}
          onTimestampRouteShapeChange={updateTimestampRouteShape}
          onTimestampClick={playFromMapTimestamp}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={undoMapEdit}
          onRedo={redoMapEdit}
          persistentViewKey={`creator-video-editor:${video.id}`}
          className="h-[64vh] min-h-[620px] xl:h-full xl:min-h-0"
        />
      </section>
      </div>
    </>
  )
}
