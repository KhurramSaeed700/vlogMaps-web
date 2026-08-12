"use client"

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useTheme } from "next-themes"
import * as Dialog from "@radix-ui/react-dialog"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import * as Popover from "@radix-ui/react-popover"
import { ArrowDownUp, ArrowLeftRight, ArrowUp, Bookmark, ChevronDown, Keyboard, MapPin, Moon, Pause, Pencil, Plane, Settings, Sun, Trash2, UploadCloud, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { SplitViewResizer } from "@/components/ui/split-view-resizer"
import { MapboxLocationPicker } from "@/components/maps/mapbox-location-picker"
import { YouTubePlayer } from "@/components/media/youtube-player"
import { AutoplayCountdown, autoplayCountdownSeconds } from "@/components/media/autoplay-countdown"
import { PlaybackSettingsSection } from "@/components/settings/playback-settings-section"
import { getAirportCodeLocation } from "@/lib/airport-codes"
import { getCompletedFlightPairs } from "@/lib/flight-path"
import {
  emptyCreatorTripRoute,
  type CreatorTripEndpoint,
  type CreatorTripLocation,
  type CreatorTripRoute,
} from "@/lib/creator-trip-route"
import {
  type CreatorRouteShapePoint,
  type CreatorRouteShapes,
} from "@/lib/creator-route-shapes"
import {
  type CreatorSavedPlace,
} from "@/lib/creator-saved-places"
import type { TravelVideo } from "@/lib/demo-data"
import { formatDuration } from "@/lib/demo-data"
import {
  sortCreatorPoints,
  type CreatorMapPoint,
  type CreatorMapPointType,
  upsertCreatorPoint,
} from "@/lib/creator-points"
import { syncVideoRouteMetadata, updateLocalCreatorVideo, withSyncedVideoState } from "@/lib/creator-videos"
import { uploadCreatorVideoToCloud } from "@/lib/creator-videos-cloud-client"
import { loadCreatorVideoState } from "@/lib/creator-video-state-client"
import type { CreatorVideoState } from "@/lib/creator-video-state"
import { clearCreatorVideoStateLocalCache, loadCreatorVideoStateLocalCache } from "@/lib/creator-video-state-local"
import { loadPendingCreatorVideoState } from "@/lib/creator-video-state-outbox"
import { type CreatorAutosaveStatus, useCreatorVideoStateAutosave } from "@/lib/use-creator-video-state-autosave"
import { usePlaybackPreferences } from "@/lib/use-playback-preferences"

interface CreatorVideoEditorProps {
  video: TravelVideo
  headerLeadingActionsTargetId?: string
  headerActionsTargetId?: string
}

interface DraftPoint {
  id?: string
  time: number
  stopEndTime?: number
  flightId?: string
  flightPhase?: "takeoff" | "landing"
  lat: number | null
  lng: number | null
  location: string
  description: string
  airportCity?: string
  pointType: CreatorMapPointType
}

interface ResolvedAirportPreview {
  code: string
  name: string
  city: string
  lat: number
  lng: number
}

type FlightEditEndpoint = "takeoff" | "landing"
type FlightEditLocationMode = "airport" | "map"

interface MapEditSnapshot {
  points: CreatorMapPoint[]
  tripRoute: CreatorTripRoute
  routeShapes: CreatorRouteShapes
  activeTripEndpoint: CreatorTripEndpoint | null
  draftPoint: DraftPoint | null
  draftFlightLandingPoint: DraftPoint | null
  activeFlightEditEndpoint: FlightEditEndpoint
  flightEditLocationModes: Record<FlightEditEndpoint, FlightEditLocationMode>
  isAwaitingMapPlacement: boolean
}

interface EditorShortcutState {
  draftPoint: DraftPoint | null
  isAwaitingMapPlacement: boolean
  isPlacingSavedPlace: boolean
  isRecordingStop: boolean
  addTimestampPoint: (pointType: CreatorMapPointType) => void
  cancelSavedPlacePlacement: () => void
  cancelPointEdit: () => void
  setStopEndTime: () => void
  startFlightPoint: () => void
  startStopRecording: () => void
}

interface FlightAirportPrompt {
  role: "takeoff" | "landing"
  timestamp: number
  resumeOnCancel: boolean
  mode: "choose" | "airport" | "map"
}

interface SavedPlaceUsePrompt {
  place: CreatorSavedPlace
  timestamp: number
  resumePlayback: boolean
}

interface SavedPlaceLocationPrompt {
  lat: number
  lng: number
  resumePlayback: boolean
}

interface PendingNearbyPlaceLookup {
  requestId: number
  lat: number
  lng: number
  promise: Promise<string | null>
}

const resumeAutoplayDelaySeconds = autoplayCountdownSeconds
const resumeCountdownTickSeconds = 1
const editorTimeRenderStepSeconds = 0.25
const editorDefaultSplitPercent = 47

function loadRestorableCreatorVideoState(video: Pick<TravelVideo, "id" | "keyframes">) {
  return loadPendingCreatorVideoState(video.id)?.state ?? loadCreatorVideoStateLocalCache(video.id, video.keyframes)
}

const editorShortcutGroups = [
  { keys: "Q", action: "Add point" },
  { keys: "W", action: "Add stop or finish stop" },
  { keys: "E", action: "Record flight takeoff or landing" },
  { keys: "F", action: "Enter or exit video fullscreen" },
  { keys: "M", action: "Mute or unmute video" },
  { keys: "Esc", action: "Cancel pending point or stop" },
  { keys: "Space / K", action: "Play or pause video" },
  { keys: "J", action: "Seek back 10 seconds" },
  { keys: "L", action: "Seek forward 10 seconds" },
  { keys: "Hold J / L", action: "Repeat seek after 0.5s" },
  { keys: "↑ / ↓", action: "Increase or decrease volume" },
  { keys: "I", action: "Zoom map in on traveler" },
  { keys: "O", action: "Zoom map out on traveler" },
]

function createDraftPoint(point?: CreatorMapPoint): DraftPoint {
  if (!point) {
    return {
      id: undefined,
      time: 0,
      stopEndTime: undefined,
      flightId: undefined,
      flightPhase: undefined,
      lat: null,
      lng: null,
      location: "",
      description: "",
      airportCity: undefined,
      pointType: "point",
    }
  }

  const knownAirport = point.pointType === "flight" ? getAirportCodeLocation(point.location) : null

  return {
    id: point.id,
    time: point.time,
    stopEndTime: point.stopEndTime,
    flightId: point.flightId,
    flightPhase: point.flightPhase,
    lat: point.lat,
    lng: point.lng,
    location: point.location,
    description: point.description,
    airportCity: knownAirport?.city,
    pointType: point.pointType === "stop" || point.pointType === "flight" ? point.pointType : "point",
  }
}

function toPersistedDraftPoint<T extends { airportCity?: string }>(draftPoint: T): Omit<T, "airportCity"> {
  const { airportCity: _airportCity, ...persistedPoint } = draftPoint
  return persistedPoint
}

function getAirportCityFromSearchResult(placeName: string, airportName: string) {
  const placeParts = placeName
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)

  if (placeParts[0]?.toLocaleLowerCase() === airportName.trim().toLocaleLowerCase()) {
    placeParts.shift()
  }

  return placeParts[0] ?? "Unknown city"
}

function AirportConfirmation({ airport }: { airport: Pick<ResolvedAirportPreview, "code" | "name" | "city"> }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-w-0 items-start gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-2 text-left"
    >
      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[11px] font-semibold text-slate-900 dark:text-zinc-100">
          {airport.name}
        </p>
        <p className="mt-0.5 text-[10px] text-slate-600 dark:text-zinc-400">
          {airport.city} · {airport.code}
        </p>
      </div>
    </div>
  )
}

function AirportSearchStatus() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-10 items-center gap-2 rounded-md border border-sky-500/20 bg-sky-500/10 px-2.5 py-2 text-[11px] font-semibold text-sky-700 dark:text-sky-300"
    >
      <span>Searching airport</span>
      <span className="flex items-end gap-0.5" aria-hidden="true">
        <span className="animate-bounce [animation-delay:-300ms]">.</span>
        <span className="animate-bounce [animation-delay:-150ms]">.</span>
        <span className="animate-bounce">.</span>
      </span>
    </div>
  )
}

function getDraftLocation(pointType: CreatorMapPointType, time: number, pointNumber?: number | null) {
  if (pointType === "flight") {
    return `Airport at ${formatDuration(time)}`
  }

  if (pointType === "stop") {
    return pointNumber ? `Stop point #${pointNumber}` : "Stop point"
  }

  return `Point at ${formatDuration(time)}`
}

function isGeneratedStopName(value: string) {
  const name = value.trim()
  return !name || /^Stop at \d+(?::\d{2}){1,2}$/i.test(name) || /^Stop point(?: #\d+)?$/i.test(name)
}

function getNearbyTimestampName(pointType: CreatorMapPointType, nearbyPlaceName: string) {
  return pointType === "stop" ? `Stay at ${nearbyPlaceName}` : nearbyPlaceName
}

function parseTimestampInput(value: string) {
  const parts = value.trim().split(":")
  if (parts.length < 1 || parts.length > 3 || parts.some((part) => part.trim() === "")) {
    return null
  }

  const values = parts.map(Number)
  if (values.some((part) => !Number.isFinite(part) || part < 0)) {
    return null
  }

  if (values.length === 1) {
    return values[0]
  }

  const seconds = values[values.length - 1]
  const minutes = values[values.length - 2]
  if (seconds >= 60 || (values.length === 3 && minutes >= 60)) {
    return null
  }

  return values.length === 3
    ? values[0] * 3600 + minutes * 60 + seconds
    : minutes * 60 + seconds
}

function getDraftDescription(pointType: CreatorMapPointType) {
  if (pointType === "flight") {
    return "Flight airport captured from the creator editor."
  }

  return pointType === "stop"
    ? "Stop captured from the creator editor."
    : "Route point captured from the creator editor."
}

function getDisplayTimestampName(point: CreatorMapPoint) {
  const name = point.location.trim()
  const pointType = point.pointType === "stop" || point.pointType === "flight" ? point.pointType : "point"
  return name && name !== getDraftLocation(pointType, point.time) ? name : ""
}

function formatTravelDestinationName(value: string) {
  let destination = value.trim()
  if (destination === destination.toLowerCase()) {
    destination = destination.replace(/(^|[\s-])([a-z])/g, (_, prefix: string, letter: string) => {
      return `${prefix}${letter.toUpperCase()}`
    })
  }

  return destination
}

function getTravelDestinationName(point: CreatorMapPoint) {
  const rawName = getDisplayTimestampName(point)
  if (!rawName || isGeneratedStopName(rawName)) {
    return null
  }

  let destination = rawName.replace(/^stay\s+at\s+/i, "").trim()
  const trailingPlace = destination.match(/\bin\s+([^,]+)$/i)?.[1]?.trim()
  if (trailingPlace) {
    destination = trailingPlace
  } else {
    destination = destination.split(",")[0]?.trim() ?? ""
  }

  if (!destination) {
    return null
  }

  return formatTravelDestinationName(destination)
}

function getTravelSummary(
  fromPoint: CreatorMapPoint,
  toPoint: CreatorMapPoint,
  departureTime: number,
  arrivalTime: number,
) {
  if (fromPoint.pointType === "flight" || toPoint.pointType === "flight") {
    return null
  }

  const travelDurationSeconds = arrivalTime - departureTime
  if (travelDurationSeconds < 8) {
    return null
  }

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = toRadians(toPoint.lat - fromPoint.lat)
  const longitudeDelta = toRadians(toPoint.lng - fromPoint.lng)
  const fromLatitude = toRadians(fromPoint.lat)
  const toLatitude = toRadians(toPoint.lat)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2
  const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  if (distanceKm < 0.1 || distanceKm > 2500) {
    return null
  }

  const fromName = getTravelDestinationName(fromPoint)
  const toName = getTravelDestinationName(toPoint)
  if (!fromName || !toName || fromName.toLocaleLowerCase() === toName.toLocaleLowerCase()) {
    return null
  }

  return `traveled from ${fromName} to ${toName}`
}

function normalizeAirportCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4)
}

function createFlightId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }

  return `flight-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function createSavedPlaceId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }

  return `place-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getTimestampAccentClass(pointType?: CreatorMapPointType) {
  if (pointType === "flight") {
    return "bg-sky-600"
  }

  return pointType === "stop" ? "bg-teal-700" : "bg-orange-600"
}

interface TimestampDisplayRow {
  key: string
  point: CreatorMapPoint
  landingPoint?: CreatorMapPoint
}

function getFlightAirportCode(point: CreatorMapPoint) {
  if (point.location === "Map point") {
    return "Map point"
  }

  return normalizeAirportCode(point.location) || "Airport"
}

function getPendingFlightTakeoff(points: CreatorMapPoint[]) {
  const completedFlightIds = new Set(getCompletedFlightPairs(points).map((flight) => flight.flightId))
  let explicitTakeoff: CreatorMapPoint | null = null

  for (const point of points) {
    if (
      point.pointType === "flight" &&
      point.flightPhase === "takeoff" &&
      point.flightId &&
      !completedFlightIds.has(point.flightId)
    ) {
      explicitTakeoff = point
    }
  }

  if (explicitTakeoff) {
    return explicitTakeoff
  }

  let pendingTakeoff: CreatorMapPoint | null = null

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (point.pointType !== "flight" || point.flightId || point.flightPhase) {
      continue
    }

    const nextPoint = points[index + 1]
    if (
      nextPoint?.pointType === "flight" &&
      !nextPoint.flightId &&
      !nextPoint.flightPhase
    ) {
      index += 1
      continue
    }

    pendingTakeoff = point
  }

  return pendingTakeoff
}

function buildTimestampDisplayRows(points: CreatorMapPoint[]) {
  const rows: TimestampDisplayRow[] = []
  const completedFlights = getCompletedFlightPairs(points)
  const landingByFlightId = new Map(
    completedFlights.map((flight) => [flight.flightId, flight.landing]),
  )
  const consumedLandingIds = new Set(completedFlights.map((flight) => flight.landing.id))

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const nextPoint = points[index + 1]

    if (
      point.pointType === "flight" &&
      point.flightPhase === "takeoff" &&
      point.flightId
    ) {
      const landingPoint = landingByFlightId.get(point.flightId)
      rows.push({
        key: point.flightId,
        point,
        landingPoint,
      })
      continue
    }

    if (consumedLandingIds.has(point.id)) {
      continue
    }

    if (
      point.pointType === "flight" &&
      !point.flightId &&
      !point.flightPhase &&
      nextPoint?.pointType === "flight" &&
      !nextPoint.flightId &&
      !nextPoint.flightPhase
    ) {
      rows.push({
        key: `${point.id}:${nextPoint.id}`,
        point,
        landingPoint: nextPoint,
      })
      index += 1
      continue
    }

    rows.push({
      key: point.id,
      point,
    })
  }

  return rows
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

export function CreatorVideoEditor({
  video,
  headerLeadingActionsTargetId,
  headerActionsTargetId,
}: CreatorVideoEditorProps) {
  const remoteLoadRequestRef = useRef(0)
  const editorScrollRef = useRef<HTMLElement | null>(null)
  const splitViewRef = useRef<HTMLDivElement>(null)
  const currentTimeRef = useRef(0)
  const renderedCurrentTimeRef = useRef(0)
  const editorShortcutStateRef = useRef<EditorShortcutState | null>(null)
  const localStateRevisionRef = useRef(0)
  const nearbyPlaceLookupRequestRef = useRef(0)
  const nearbyPlaceLookupControllerRef = useRef<AbortController | null>(null)
  const pendingNearbyPlaceLookupRef = useRef<PendingNearbyPlaceLookup | null>(null)
  const draftPointRef = useRef<DraftPoint | null>(null)
  const isCompletingStopRef = useRef(false)
  const timestampNameInputRef = useRef<HTMLInputElement | null>(null)
  const savedPlacePlacementResumePlaybackRef = useRef(false)
  const initialEditorStateRef = useRef<{ videoId: string; state: CreatorVideoState } | null>(null)
  if (!initialEditorStateRef.current || initialEditorStateRef.current.videoId !== video.id) {
    initialEditorStateRef.current = {
      videoId: video.id,
      state: loadRestorableCreatorVideoState(video),
    }
  }
  const initialEditorState = initialEditorStateRef.current.state
  const [points, setPoints] = useState<CreatorMapPoint[]>(initialEditorState.points)
  const [tripRoute, setTripRoute] = useState<CreatorTripRoute>(initialEditorState.tripRoute)
  const [routeShapes, setRouteShapes] = useState<CreatorRouteShapes>(initialEditorState.routeShapes)
  const [savedPlaces, setSavedPlaces] = useState<CreatorSavedPlace[]>(initialEditorState.savedPlaces)
  const [activeTripEndpoint, setActiveTripEndpoint] = useState<CreatorTripEndpoint | null>(null)
  const [undoStack, setUndoStack] = useState<MapEditSnapshot[]>([])
  const [redoStack, setRedoStack] = useState<MapEditSnapshot[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [seekRequest, setSeekRequest] = useState<{ id: number; time: number } | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(resumeAutoplayDelaySeconds)
  const [draftPoint, setDraftPoint] = useState<DraftPoint | null>(null)
  const [draftFlightLandingPoint, setDraftFlightLandingPoint] = useState<DraftPoint | null>(null)
  const [activeFlightEditEndpoint, setActiveFlightEditEndpoint] = useState<FlightEditEndpoint>("takeoff")
  const [flightEditLocationModes, setFlightEditLocationModes] = useState<Record<FlightEditEndpoint, FlightEditLocationMode>>({
    takeoff: "airport",
    landing: "airport",
  })
  const [isAwaitingMapPlacement, setIsAwaitingMapPlacement] = useState(false)
  const [isTripRouteDialogOpen, setIsTripRouteDialogOpen] = useState(false)
  const [isTimestampSortAscending, setIsTimestampSortAscending] = useState(true)
  const [headerLeadingActionsElement, setHeaderLeadingActionsElement] = useState<HTMLElement | null>(null)
  const [headerActionsElement, setHeaderActionsElement] = useState<HTMLElement | null>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [isLoadingSavedState, setIsLoadingSavedState] = useState(true)
  const [isRecordingStop, setIsRecordingStop] = useState(false)
  const [flightAirportPrompt, setFlightAirportPrompt] = useState<FlightAirportPrompt | null>(null)
  const [flightAirportCode, setFlightAirportCode] = useState("")
  const [flightAirportPreview, setFlightAirportPreview] = useState<ResolvedAirportPreview | null>(null)
  const [isResolvingAirportCode, setIsResolvingAirportCode] = useState(false)
  const [airportCodeMessage, setAirportCodeMessage] = useState("")
  const [isResolvingNearbyPlace, setIsResolvingNearbyPlace] = useState(false)
  const [isTimestampNameEditing, setIsTimestampNameEditing] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [isUploadingVideo, setIsUploadingVideo] = useState(false)
  const [uploadMessage, setUploadMessage] = useState("")
  const [isSavedPlacesOpen, setIsSavedPlacesOpen] = useState(false)
  const [newSavedPlaceName, setNewSavedPlaceName] = useState("")
  const [savedPlaceMessage, setSavedPlaceMessage] = useState("")
  const [editingSavedPlaceId, setEditingSavedPlaceId] = useState<string | null>(null)
  const [editingSavedPlaceName, setEditingSavedPlaceName] = useState("")
  const [savedPlaceUsePrompt, setSavedPlaceUsePrompt] = useState<SavedPlaceUsePrompt | null>(null)
  const [savedPlaceLocationPrompt, setSavedPlaceLocationPrompt] = useState<SavedPlaceLocationPrompt | null>(null)
  const [isPlacingSavedPlace, setIsPlacingSavedPlace] = useState(false)
  const [isThemeMounted, setIsThemeMounted] = useState(false)
  draftPointRef.current = draftPoint
  const handleAutosaveStatus = useCallback((status: CreatorAutosaveStatus) => {
    if (status === "saved") {
      setSaveMessage("")
      return
    }

    if (status === "local-error") {
      setSaveMessage("This browser could not create a local backup. Free some browser storage and try again.")
      return
    }

    if (status === "retrying") {
      setSaveMessage("")
      return
    }

    setSaveMessage(typeof navigator !== "undefined" && !navigator.onLine ? "Saved in this browser. Waiting for connection." : "")
  }, [])
  const { saveState: saveAutosavedState, schedulePendingSave } = useCreatorVideoStateAutosave({
    videoId: video.id,
    onStatusChange: handleAutosaveStatus,
  })
  const { resolvedTheme, setTheme } = useTheme()
  const isDarkMode = isThemeMounted && resolvedTheme === "dark"
  const { preferences: playbackPreferences, updatePreferences: updatePlaybackPreferences } =
    usePlaybackPreferences()
  const handleVolumeChange = useCallback((volume: number) => {
    updatePlaybackPreferences({ volume })
  }, [updatePlaybackPreferences])

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

  const scheduleAutoplay = useCallback(() => {
    setIsPlaying(false)
    setResumeCountdown(resumeAutoplayDelaySeconds)
  }, [])

  const handleEditorPlayingChange = useCallback((nextIsPlaying: boolean) => {
    if (nextIsPlaying) {
      setResumeCountdown(null)
    }
    setIsPlaying(nextIsPlaying)
  }, [])

  useEffect(() => {
    setIsThemeMounted(true)
  }, [])

  useEffect(() => {
    nearbyPlaceLookupRequestRef.current += 1
    nearbyPlaceLookupControllerRef.current?.abort()
    nearbyPlaceLookupControllerRef.current = null
    pendingNearbyPlaceLookupRef.current = null
    draftPointRef.current = null
    isCompletingStopRef.current = false
    const nextState = loadRestorableCreatorVideoState(video)
    setPoints(nextState.points)
    setTripRoute(nextState.tripRoute)
    setRouteShapes(nextState.routeShapes)
    setSavedPlaces(nextState.savedPlaces)
    setActiveTripEndpoint(null)
    setDraftPoint(null)
    setIsAwaitingMapPlacement(false)
    setIsRecordingStop(false)
    setIsResolvingNearbyPlace(false)
    setIsTimestampNameEditing(false)
    setFlightAirportPrompt(null)
    setFlightAirportCode("")
    setAirportCodeMessage("")
    setUndoStack([])
    setRedoStack([])
    commitCurrentTime(0, true)
    setSeekRequest(null)
    setIsPlaying(false)
    setResumeCountdown(resumeAutoplayDelaySeconds)
    setIsTripRouteDialogOpen(false)
    setIsLoadingSavedState(true)
    setSaveMessage("")
    setUploadMessage("")
    setIsSavedPlacesOpen(false)
    setNewSavedPlaceName("")
    setSavedPlaceMessage("")
    setEditingSavedPlaceId(null)
    setEditingSavedPlaceName("")
    setSavedPlaceUsePrompt(null)
    setSavedPlaceLocationPrompt(null)
    setIsPlacingSavedPlace(false)

    return () => {
      nearbyPlaceLookupControllerRef.current?.abort()
    }
  }, [commitCurrentTime, video.id, video.keyframes])

  useEffect(() => {
    if (!headerLeadingActionsTargetId) {
      setHeaderLeadingActionsElement(null)
      return
    }

    setHeaderLeadingActionsElement(document.getElementById(headerLeadingActionsTargetId))
  }, [headerLeadingActionsTargetId])

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
    setIsLoadingSavedState(true)

    const pendingBeforeLoad = loadPendingCreatorVideoState(video.id)
    if (pendingBeforeLoad) {
      const localState = pendingBeforeLoad.state
      setPoints(localState.points)
      setTripRoute(localState.tripRoute)
      setRouteShapes(localState.routeShapes)
      setSavedPlaces(localState.savedPlaces)
      syncVideoRouteMetadata(
        video.id,
        localState.points.map(({ id, ...point }) => point),
      )
      schedulePendingSave(0)
      setIsLoadingSavedState(false)
      return
    }

    const localRevisionAtStart = localStateRevisionRef.current
    const controller = new AbortController()

    loadCreatorVideoState(video.id, controller.signal)
      .then((response) => {
        if (
          controller.signal.aborted ||
          remoteLoadRequestRef.current !== requestId ||
          localStateRevisionRef.current !== localRevisionAtStart
        ) {
          return
        }

        const pendingState = loadPendingCreatorVideoState(video.id)
        const localState = pendingState?.state ?? loadCreatorVideoStateLocalCache(video.id, video.keyframes)

        // A pending local revision is always newer than the database snapshot. It
        // remains authoritative until that exact revision receives an acknowledgement.
        if (pendingState) {
          setPoints(localState.points)
          setTripRoute(localState.tripRoute)
          setRouteShapes(localState.routeShapes)
          setSavedPlaces(localState.savedPlaces)
          syncVideoRouteMetadata(
            video.id,
            localState.points.map(({ id, ...point }) => point),
          )
          schedulePendingSave(0)
          return
        }

        if (response?.state) {
          const shouldKeepLocalPoints = localState.points.length > 0 && response.state.points.length === 0
          const shouldKeepLocalPlaces = localState.savedPlaces.length > 0 && response.state.savedPlaces.length === 0
          const nextState = {
            ...(shouldKeepLocalPoints ? localState : response.state),
            savedPlaces: shouldKeepLocalPlaces ? localState.savedPlaces : response.state.savedPlaces,
          }

          setPoints(nextState.points)
          setTripRoute(nextState.tripRoute)
          setRouteShapes(nextState.routeShapes)
          setSavedPlaces(nextState.savedPlaces)
          syncVideoRouteMetadata(
            video.id,
            nextState.points.map(({ id, ...point }) => point),
          )
          if (shouldKeepLocalPoints || shouldKeepLocalPlaces) {
            saveAutosavedState(nextState)
          } else {
            clearCreatorVideoStateLocalCache(video.id)
          }
          return
        }

        if (response?.configured) {
          saveAutosavedState(localState)
        }
      })
      .catch(() => {
        schedulePendingSave()
      })
      .finally(() => {
        if (!controller.signal.aborted && remoteLoadRequestRef.current === requestId) {
          setIsLoadingSavedState(false)
        }
      })

    return () => controller.abort()
  }, [saveAutosavedState, schedulePendingSave, video.id, video.keyframes])

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
      const nextCountdown = Math.max(0, resumeCountdown - resumeCountdownTickSeconds)

      if (nextCountdown <= 0) {
        setResumeCountdown(null)
        setIsPlaying(true)
        return
      }

      setResumeCountdown(nextCountdown)
    }, 1000)

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
  const pendingFlightTakeoff = useMemo(() => getPendingFlightTakeoff(sortedPoints), [sortedPoints])
  const timestampRows = useMemo(() => buildTimestampDisplayRows(sortedPoints), [sortedPoints])
  const pointNumberById = useMemo(
    () =>
      new Map(
        timestampRows.flatMap((row, index) =>
          [row.point.id, row.landingPoint?.id]
            .filter((id): id is string => Boolean(id))
            .map((id) => [id, index + 1] as const),
        ),
      ),
    [timestampRows],
  )
  const displayedRows = useMemo(() => {
    return isTimestampSortAscending ? timestampRows : [...timestampRows].reverse()
  }, [isTimestampSortAscending, timestampRows])
  const travelSummaryAfterRowKey = useMemo(() => {
    const summaries = new Map<string, string>()

    for (let index = 0; index < displayedRows.length - 1; index += 1) {
      const currentRow = displayedRows[index]
      const nextRow = displayedRows[index + 1]
      const fromRow = isTimestampSortAscending ? currentRow : nextRow
      const toRow = isTimestampSortAscending ? nextRow : currentRow
      const departureTime =
        fromRow.point.pointType === "stop" && typeof fromRow.point.stopEndTime === "number"
          ? fromRow.point.stopEndTime
          : fromRow.point.time
      const summary = getTravelSummary(fromRow.point, toRow.point, departureTime, toRow.point.time)
      if (summary) {
        summaries.set(currentRow.key, summary)
      }
    }

    return summaries
  }, [displayedRows, isTimestampSortAscending])
  const getDraftPointNumber = (point: Pick<DraftPoint, "id">) =>
    point.id ? pointNumberById.get(point.id) ?? null : displayedRows.length + 1
  const getDraftLocationFallback = (point: DraftPoint) =>
    getDraftLocation(point.pointType, point.time, getDraftPointNumber(point))
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
  const persistEditorState = (nextState: CreatorVideoState) => {
    localStateRevisionRef.current += 1
    syncVideoRouteMetadata(
      video.id,
      nextState.points.map(({ id, ...point }) => point),
    )
    saveAutosavedState(nextState)
  }

  const persistPoints = (nextPoints: CreatorMapPoint[]) => {
    setPoints(nextPoints)
    persistEditorState({
      points: nextPoints,
      tripRoute,
      routeShapes,
      savedPlaces,
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
    draftFlightLandingPoint: draftFlightLandingPoint ? { ...draftFlightLandingPoint } : null,
    activeFlightEditEndpoint,
    flightEditLocationModes: { ...flightEditLocationModes },
    isAwaitingMapPlacement,
  })

  const persistTripRoute = (nextRoute: CreatorTripRoute) => {
    setTripRoute(nextRoute)
    persistEditorState({
      points,
      tripRoute: nextRoute,
      routeShapes,
      savedPlaces,
    })
  }

  const persistRouteShapes = (nextRouteShapes: CreatorRouteShapes) => {
    setRouteShapes(nextRouteShapes)
    persistEditorState({
      points,
      tripRoute,
      routeShapes: nextRouteShapes,
      savedPlaces,
    })
  }

  const persistSavedPlaces = (nextSavedPlaces: CreatorSavedPlace[]) => {
    setSavedPlaces(nextSavedPlaces)
    persistEditorState({
      points,
      tripRoute,
      routeShapes,
      savedPlaces: nextSavedPlaces,
    })
  }

  const beginSavedPlacePlacement = () => {
    if (draftPoint || isRecordingStop || pendingFlightTakeoff || flightAirportPrompt) {
      setSavedPlaceMessage("Finish the current timestamp first.")
      return
    }

    savedPlacePlacementResumePlaybackRef.current = isPlaying
    setResumeCountdown(null)
    setIsPlaying(false)
    setSavedPlaceMessage("")
    setIsSavedPlacesOpen(false)
    setIsPlacingSavedPlace(true)
  }

  const cancelSavedPlacePlacement = () => {
    const shouldResume = savedPlacePlacementResumePlaybackRef.current
    savedPlacePlacementResumePlaybackRef.current = false
    setIsPlacingSavedPlace(false)
    setNewSavedPlaceName("")
    if (shouldResume) {
      scheduleAutoplay()
    }
  }

  const markSavedPlaceLocation = (location: { lat: number; lng: number }) => {
    setIsPlacingSavedPlace(false)
    setNewSavedPlaceName("")
    setSavedPlaceLocationPrompt({
      ...location,
      resumePlayback: savedPlacePlacementResumePlaybackRef.current,
    })
    savedPlacePlacementResumePlaybackRef.current = false
  }

  const cancelSavedPlaceLocationPrompt = () => {
    const shouldResume = savedPlaceLocationPrompt?.resumePlayback ?? false
    setSavedPlaceLocationPrompt(null)
    setNewSavedPlaceName("")
    if (shouldResume) {
      scheduleAutoplay()
    }
  }

  const saveMarkedPlace = () => {
    const name = newSavedPlaceName.trim()
    if (!name) {
      setSavedPlaceMessage("Enter a name.")
      return
    }

    if (!savedPlaceLocationPrompt) {
      return
    }

    const { lat, lng, resumePlayback } = savedPlaceLocationPrompt
    const nextSavedPlaces = [
      ...savedPlaces,
      {
        id: createSavedPlaceId(),
        name: name.slice(0, 120),
        lat,
        lng,
      },
    ]
    persistSavedPlaces(nextSavedPlaces)
    setSavedPlaceLocationPrompt(null)
    setNewSavedPlaceName("")
    setSavedPlaceMessage(`${name} saved.`)
    setIsSavedPlacesOpen(true)
    if (resumePlayback) {
      scheduleAutoplay()
    }
  }

  const renameSavedPlace = (placeId: string) => {
    const name = editingSavedPlaceName.trim()
    if (!name) {
      setSavedPlaceMessage("Enter a name.")
      return
    }

    persistSavedPlaces(
      savedPlaces.map((place) =>
        place.id === placeId ? { ...place, name: name.slice(0, 120) } : place,
      ),
    )
    setEditingSavedPlaceId(null)
    setEditingSavedPlaceName("")
    setSavedPlaceMessage("Place renamed.")
  }

  const deleteSavedPlace = (placeId: string) => {
    persistSavedPlaces(savedPlaces.filter((place) => place.id !== placeId))
    setEditingSavedPlaceId((currentId) => (currentId === placeId ? null : currentId))
    setSavedPlaceMessage("Place removed.")
  }

  const chooseSavedPlace = (place: CreatorSavedPlace) => {
    if (draftPoint || isRecordingStop || pendingFlightTakeoff || flightAirportPrompt) {
      setSavedPlaceMessage("Finish the current timestamp first.")
      return
    }

    setSavedPlaceUsePrompt({
      place,
      timestamp: currentTimeRef.current,
      resumePlayback: isPlaying,
    })
    setResumeCountdown(null)
    setIsPlaying(false)
    setIsSavedPlacesOpen(false)
  }

  const cancelSavedPlaceUse = () => {
    const shouldResume = savedPlaceUsePrompt?.resumePlayback ?? false
    setSavedPlaceUsePrompt(null)
    if (shouldResume) {
      scheduleAutoplay()
    }
  }

  const useSavedPlace = (pointType: "point" | "stop") => {
    if (!savedPlaceUsePrompt) {
      return
    }

    const { place, timestamp, resumePlayback } = savedPlaceUsePrompt
    setSavedPlaceUsePrompt(null)
    setResumeCountdown(null)

    if (pointType === "stop") {
      setDraftPoint({
        id: undefined,
        time: timestamp,
        stopEndTime: undefined,
        lat: place.lat,
        lng: place.lng,
        location: `Stay at ${place.name}`,
        description: `Saved place: ${place.name}`,
        pointType: "stop",
      })
      setIsAwaitingMapPlacement(false)
      setIsRecordingStop(true)
      scheduleAutoplay()
      return
    }

    recordMapEditSnapshot()
    const nextPoints = upsertCreatorPoint(video.id, points, {
      time: timestamp,
      lat: place.lat,
      lng: place.lng,
      location: place.name,
      description: `Saved place: ${place.name}`,
      pointType: "point",
    })
    persistPoints(nextPoints)
    if (resumePlayback) {
      scheduleAutoplay()
    }
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
      savedPlaces,
    })
    setActiveTripEndpoint(snapshot.activeTripEndpoint)
    setDraftPoint(snapshot.draftPoint)
    setDraftFlightLandingPoint(snapshot.draftFlightLandingPoint)
    setActiveFlightEditEndpoint(snapshot.activeFlightEditEndpoint)
    setFlightEditLocationModes(snapshot.flightEditLocationModes)
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
      savedPlaces,
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
      savedPlaces,
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
      savedPlaces,
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
      savedPlaces,
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
      savedPlaces,
    })
  }

  const addTimestampPoint = (pointType: CreatorMapPointType) => {
    if (pendingFlightTakeoff || draftPoint || isRecordingStop || flightAirportPrompt || isPlacingSavedPlace) {
      return
    }

    const timestamp = currentTimeRef.current
    setResumeCountdown(null)
    setIsPlaying(false)
    setIsRecordingStop(false)
    const nextDraft: DraftPoint = {
      id: undefined,
      time: timestamp,
      stopEndTime: undefined,
      lat: null,
      lng: null,
      location:
        pointType === "flight"
          ? ""
          : getDraftLocation(pointType, timestamp, displayedRows.length + 1),
      description: getDraftDescription(pointType),
      pointType,
    }
    draftPointRef.current = nextDraft
    setDraftPoint(nextDraft)
    setIsAwaitingMapPlacement(true)
    setIsTimestampNameEditing(false)
  }

  const startFlightPoint = () => {
    if (draftPoint || isRecordingStop || flightAirportPrompt || isResolvingAirportCode || isPlacingSavedPlace) {
      return
    }

    const role = pendingFlightTakeoff ? "landing" : "takeoff"
    const timestamp = pendingFlightTakeoff
      ? Math.max(currentTimeRef.current, pendingFlightTakeoff.time + 0.5)
      : currentTimeRef.current

    setResumeCountdown(null)
    setIsPlaying(false)
    setFlightAirportCode("")
    setFlightAirportPreview(null)
    setAirportCodeMessage("")
    setFlightAirportPrompt({
      role,
      timestamp,
      resumeOnCancel: role === "landing" || isPlaying,
      mode: "choose",
    })
  }

  const resolveAirportCodeLocation = async (airportCode: string) => {
    const knownAirport = getAirportCodeLocation(airportCode)
    if (knownAirport) {
      return {
        code: airportCode,
        name: knownAirport.name,
        city: knownAirport.city,
        lat: knownAirport.lat,
        lng: knownAirport.lng,
      }
    }

    const response = await fetch(`/api/location-search?q=${encodeURIComponent(`${airportCode} airport`)}`, {
      cache: "no-store",
    })

    if (!response.ok) {
      return null
    }

    const body = (await response.json()) as {
      features?: Array<{ center?: [number, number]; place_name?: string; text?: string }>
    }
    const exactCodePattern = new RegExp(`(^|[^A-Z0-9])${airportCode}([^A-Z0-9]|$)`, "i")
    const feature = body.features?.find((nextFeature) => {
      if (!Array.isArray(nextFeature.center) || nextFeature.center.length < 2) {
        return false
      }

      const label = `${nextFeature.text ?? ""} ${nextFeature.place_name ?? ""}`
      return exactCodePattern.test(label) && /\bairport\b/i.test(label)
    })
    if (!feature?.center) {
      return null
    }

    const airportName = feature.text?.trim() || feature.place_name || `${airportCode} airport`
    return {
      code: airportCode,
      name: airportName,
      city: getAirportCityFromSearchResult(feature.place_name ?? "", airportName),
      lat: feature.center[1],
      lng: feature.center[0],
    }
  }

  const cancelFlightAirportPrompt = () => {
    const shouldResume = flightAirportPrompt?.resumeOnCancel ?? false
    setFlightAirportPrompt(null)
    setFlightAirportCode("")
    setFlightAirportPreview(null)
    setAirportCodeMessage("")

    if (shouldResume) {
      scheduleAutoplay()
    }
  }

  const previewFlightAirportCode = async () => {
    const airportCode = normalizeAirportCode(flightAirportCode)
    if (!airportCode || flightAirportPreview?.code === airportCode) {
      return
    }

    setIsResolvingAirportCode(true)
    setAirportCodeMessage("")
    try {
      const airport = await resolveAirportCodeLocation(airportCode)
      setFlightAirportPreview(airport)
      if (!airport) {
        setAirportCodeMessage("That airport could not be found. Check the code and try again.")
      }
    } catch {
      setFlightAirportPreview(null)
      setAirportCodeMessage("That airport could not be found. Check the code and try again.")
    } finally {
      setIsResolvingAirportCode(false)
    }
  }

  const saveFlightAirport = async () => {
    if (!flightAirportPrompt || flightAirportPrompt.mode !== "airport") {
      return
    }

    const airportCode = normalizeAirportCode(flightAirportCode)
    if (!airportCode) {
      setAirportCodeMessage(`Enter the ${flightAirportPrompt.role} airport code first.`)
      return
    }

    setIsResolvingAirportCode(true)
    setAirportCodeMessage("")

    try {
      const airport = await resolveAirportCodeLocation(airportCode)
      if (!airport) {
        setAirportCodeMessage("That airport could not be found. Check the code and try again.")
        return
      }

      const takeoffPoint = flightAirportPrompt.role === "landing" ? pendingFlightTakeoff : null
      if (flightAirportPrompt.role === "landing" && !takeoffPoint) {
        setAirportCodeMessage("The takeoff timestamp is missing. Start this flight again.")
        return
      }

      const timestamp =
        takeoffPoint
          ? Math.max(flightAirportPrompt.timestamp, takeoffPoint.time + 0.5)
          : flightAirportPrompt.timestamp
      const flightId = takeoffPoint?.flightId || createFlightId()
      const pointsWithIdentifiedTakeoff =
        takeoffPoint && (!takeoffPoint.flightId || takeoffPoint.flightPhase !== "takeoff")
          ? upsertCreatorPoint(video.id, points, {
              ...takeoffPoint,
              flightId,
              flightPhase: "takeoff",
            })
          : points

      recordMapEditSnapshot()
      const nextPoints = upsertCreatorPoint(video.id, pointsWithIdentifiedTakeoff, {
        time: timestamp,
        location: airport.code,
        description: airport.name,
        lat: airport.lat,
        lng: airport.lng,
        pointType: "flight",
        flightId,
        flightPhase: flightAirportPrompt.role,
      })

      persistPoints(nextPoints)
      setFlightAirportPrompt(null)
      setFlightAirportCode("")
      setFlightAirportPreview(null)
      setAirportCodeMessage("")
      scheduleAutoplay()
    } catch {
      setAirportCodeMessage("That airport could not be found. Check the code and try again.")
    } finally {
      setIsResolvingAirportCode(false)
    }
  }

  const saveFlightPointFromMap = (location: { lat: number; lng: number }) => {
    if (!flightAirportPrompt || flightAirportPrompt.mode !== "map") {
      return
    }

    const role = flightAirportPrompt.role
    const takeoffPoint = role === "landing" ? pendingFlightTakeoff : null
    if (role === "landing" && !takeoffPoint) {
      setAirportCodeMessage("The takeoff point is missing. Start this flight again.")
      return
    }

    const timestamp = takeoffPoint
      ? Math.max(currentTimeRef.current, takeoffPoint.time + 0.5)
      : flightAirportPrompt.timestamp
    const flightId = takeoffPoint?.flightId || createFlightId()
    const pointsWithIdentifiedTakeoff =
      takeoffPoint && (!takeoffPoint.flightId || takeoffPoint.flightPhase !== "takeoff")
        ? upsertCreatorPoint(video.id, points, {
            ...takeoffPoint,
            flightId,
            flightPhase: "takeoff",
          })
        : points

    recordMapEditSnapshot()
    const nextPoints = upsertCreatorPoint(video.id, pointsWithIdentifiedTakeoff, {
      time: timestamp,
      location: "Map point",
      description: role === "takeoff" ? "Map-selected takeoff" : "Map-selected landing",
      lat: location.lat,
      lng: location.lng,
      pointType: "flight",
      flightId,
      flightPhase: role,
    })
    persistPoints(nextPoints)
    setAirportCodeMessage("")

    if (role === "takeoff") {
      setFlightAirportPrompt({
        role: "landing",
        timestamp,
        resumeOnCancel: true,
        mode: "map",
      })
      scheduleAutoplay()
      return
    }

    setFlightAirportPrompt(null)
    if (!isPlaying) {
      scheduleAutoplay()
    }
  }

  const resolveDraftAirportCode = async () => {
    if (!draftPoint?.id || draftPoint.pointType !== "flight") {
      return
    }

    const airportCode = normalizeAirportCode(draftPoint.location)
    if (!airportCode) {
      setAirportCodeMessage("Enter the airport code first.")
      return
    }

    setIsResolvingAirportCode(true)
    setAirportCodeMessage("")

    try {
      const airport = await resolveAirportCodeLocation(airportCode)
      if (!airport) {
        setAirportCodeMessage("That airport could not be found. Check the code and try again.")
        return
      }

      recordMapEditSnapshot()
      const nextPoints = upsertCreatorPoint(video.id, points, {
        ...toPersistedDraftPoint(draftPoint),
        location: airport.code,
        description: airport.name,
        lat: airport.lat,
        lng: airport.lng,
        pointType: "flight",
      })

      persistPoints(nextPoints)
      setDraftPoint(null)
      setDraftFlightLandingPoint(null)
      setIsAwaitingMapPlacement(false)
      setAirportCodeMessage("")
    } catch {
      setAirportCodeMessage("That airport could not be found. Check the code and try again.")
    } finally {
      setIsResolvingAirportCode(false)
    }
  }

  const cancelNearbyPlaceLookup = () => {
    nearbyPlaceLookupRequestRef.current += 1
    nearbyPlaceLookupControllerRef.current?.abort()
    nearbyPlaceLookupControllerRef.current = null
    pendingNearbyPlaceLookupRef.current = null
    setIsResolvingNearbyPlace(false)
  }

  const beginNearbyPlaceLookup = (value: { lat: number; lng: number }) => {
    const requestId = nearbyPlaceLookupRequestRef.current + 1
    nearbyPlaceLookupRequestRef.current = requestId
    nearbyPlaceLookupControllerRef.current?.abort()

    const controller = new AbortController()
    nearbyPlaceLookupControllerRef.current = controller
    setIsResolvingNearbyPlace(true)

    const promise = fetch(
      `/api/location-nearby?lat=${encodeURIComponent(value.lat)}&lng=${encodeURIComponent(value.lng)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) {
          return null
        }

        const result = (await response.json()) as { name?: string | null; locality?: string | null }
        const name = result.name?.trim() || ""
        const locality = result.locality?.trim() || ""
        if (name && locality && !name.toLocaleLowerCase().includes(locality.toLocaleLowerCase())) {
          return `${name} in ${locality}`
        }

        return name || locality || null
      })
      .catch(() => null)

    const pendingLookup: PendingNearbyPlaceLookup = {
      requestId,
      lat: value.lat,
      lng: value.lng,
      promise,
    }
    pendingNearbyPlaceLookupRef.current = pendingLookup

    void promise.finally(() => {
      if (nearbyPlaceLookupRequestRef.current !== requestId) {
        return
      }

      pendingNearbyPlaceLookupRef.current = null
      nearbyPlaceLookupControllerRef.current = null
      setIsResolvingNearbyPlace(false)
    })

    return pendingLookup
  }

  const savePointFromMap = async (value: { lat: number; lng: number }) => {
    if (!draftPoint) {
      return
    }

    const wasAwaitingMapPlacement = isAwaitingMapPlacement
    const sourceDraft = draftPoint
    const savedTime = draftPoint.time
    const placedDraft: DraftPoint = {
      ...draftPoint,
      time: savedTime,
      lat: value.lat,
      lng: value.lng,
      location: draftPoint.location.trim() || getDraftLocation(draftPoint.pointType, savedTime),
      description: draftPoint.description.trim() || getDraftDescription(draftPoint.pointType),
    }
    const pendingLookup = draftPoint.pointType === "flight" ? null : beginNearbyPlaceLookup(value)

    if (sourceDraft.id) {
      draftPointRef.current = placedDraft
      setDraftPoint(placedDraft)
      setIsAwaitingMapPlacement(false)
      setIsTimestampNameEditing(false)

      void pendingLookup?.promise.then((nearbyPlaceName) => {
        if (!nearbyPlaceName || nearbyPlaceLookupRequestRef.current !== pendingLookup.requestId) {
          return
        }

        setDraftPoint((currentDraft) => {
          if (
            !currentDraft ||
            currentDraft.id !== sourceDraft.id ||
            currentDraft.lat !== value.lat ||
            currentDraft.lng !== value.lng
          ) {
            return currentDraft
          }

          const namedDraft = {
            ...currentDraft,
            location: getNearbyTimestampName(currentDraft.pointType, nearbyPlaceName),
          }
          draftPointRef.current = namedDraft
          return namedDraft
        })
      })
      return
    }

    if (isRecordingStop && !draftPoint.id && draftPoint.pointType === "stop") {
      recordMapEditSnapshot()
      draftPointRef.current = placedDraft
      setDraftPoint(placedDraft)
      setIsAwaitingMapPlacement(false)
      setIsTimestampNameEditing(false)
      if (wasAwaitingMapPlacement) {
        scheduleAutoplay()
      }

      void pendingLookup?.promise.then((nearbyPlaceName) => {
        if (!nearbyPlaceName || nearbyPlaceLookupRequestRef.current !== pendingLookup.requestId) {
          return
        }

        setDraftPoint((currentDraft) => {
          if (
            !currentDraft ||
            currentDraft.pointType !== "stop" ||
            currentDraft.lat !== value.lat ||
            currentDraft.lng !== value.lng
          ) {
            return currentDraft
          }

          const namedDraft = {
            ...currentDraft,
            location: getNearbyTimestampName("stop", nearbyPlaceName),
          }
          draftPointRef.current = namedDraft
          return namedDraft
        })
      })
      return
    }

    const nearbyPlaceName = pendingLookup ? await pendingLookup.promise : null
    if (pendingLookup && nearbyPlaceLookupRequestRef.current !== pendingLookup.requestId) {
      return
    }

    const nextDraft: DraftPoint = {
      ...placedDraft,
      location: nearbyPlaceName
        ? getNearbyTimestampName(placedDraft.pointType, nearbyPlaceName)
        : placedDraft.location,
    }

    recordMapEditSnapshot()
    const nextPoints = upsertCreatorPoint(video.id, points, {
      ...toPersistedDraftPoint(nextDraft),
      lat: value.lat,
      lng: value.lng,
      location: nextDraft.location,
      description: nextDraft.description,
      pointType: nextDraft.pointType,
      stopEndTime: nextDraft.stopEndTime,
    })

    persistPoints(nextPoints)
    draftPointRef.current = null
    setDraftPoint(null)
    setDraftFlightLandingPoint(null)
    setIsAwaitingMapPlacement(false)
    setIsTimestampNameEditing(false)
    setAirportCodeMessage("")
    setIsPlaying(false)
    setResumeCountdown(nextDraft.pointType === "flight" ? null : resumeAutoplayDelaySeconds)
  }

  const beginEditPoint = (point: CreatorMapPoint, landingPoint?: CreatorMapPoint) => {
    setResumeCountdown(null)
    setIsPlaying(false)
    setIsTimestampNameEditing(false)
    const nextDraft = createDraftPoint(point)
    const nextLandingDraft = point.pointType === "flight" && landingPoint
      ? createDraftPoint(landingPoint)
      : null
    if (nextDraft.pointType === "stop") {
      const pointIndex = sortedPoints.findIndex((candidate) => candidate.id === point.id)
      const nextPoint = pointIndex >= 0 ? sortedPoints[pointIndex + 1] : null
      const pointNumber = pointNumberById.get(point.id) ?? null
      nextDraft.stopEndTime =
        typeof nextDraft.stopEndTime === "number" && nextDraft.stopEndTime > nextDraft.time
          ? nextDraft.stopEndTime
          : nextPoint && nextPoint.time > nextDraft.time
            ? nextPoint.time
            : nextDraft.time + 30
      if (isGeneratedStopName(nextDraft.location)) {
        nextDraft.location = getDraftLocation("stop", nextDraft.time, pointNumber)
      }
    }
    draftPointRef.current = nextDraft
    setDraftPoint(nextDraft)
    setDraftFlightLandingPoint(nextLandingDraft)
    setActiveFlightEditEndpoint("takeoff")
    setFlightEditLocationModes({
      takeoff: nextDraft.location === "Map point" ? "map" : "airport",
      landing: nextLandingDraft?.location === "Map point" ? "map" : "airport",
    })
    setIsAwaitingMapPlacement(false)
    setIsRecordingStop(false)
  }

  const resetDraftPointLocation = () => {
    if (!draftPoint?.id || draftPoint.pointType === "flight") {
      return
    }

    cancelNearbyPlaceLookup()
    const nextDraft: DraftPoint = {
      ...draftPoint,
      lat: null,
      lng: null,
    }
    draftPointRef.current = nextDraft
    setDraftPoint(nextDraft)
    setIsAwaitingMapPlacement(true)
  }

  const updateDraftFlightEndpoint = (
    endpoint: FlightEditEndpoint,
    updater: (currentDraft: DraftPoint) => DraftPoint,
  ) => {
    if (endpoint === "takeoff") {
      setDraftPoint((currentDraft) => {
        if (!currentDraft || currentDraft.pointType !== "flight") {
          return currentDraft
        }

        const nextDraft = updater(currentDraft)
        draftPointRef.current = nextDraft
        return nextDraft
      })
      return
    }

    setDraftFlightLandingPoint((currentDraft) => {
      if (!currentDraft || currentDraft.pointType !== "flight") {
        return currentDraft
      }

      return updater(currentDraft)
    })
  }

  const setDraftFlightTime = (endpoint: FlightEditEndpoint, seconds: number) => {
    if (
      !draftPoint ||
      draftPoint.pointType !== "flight" ||
      !draftFlightLandingPoint ||
      !Number.isFinite(seconds) ||
      seconds < 0
    ) {
      return "Enter a valid non-negative time."
    }

    if (endpoint === "takeoff" && seconds >= draftFlightLandingPoint.time) {
      return "Takeoff must be before landing."
    }

    if (endpoint === "landing" && seconds <= draftPoint.time) {
      return "Landing must be after takeoff."
    }

    updateDraftFlightEndpoint(endpoint, (currentDraft) => ({ ...currentDraft, time: seconds }))
    return null
  }

  const handleDraftFlightTimeBlur = (endpoint: FlightEditEndpoint, input: HTMLInputElement) => {
    const parsedTime = parseTimestampInput(input.value)
    const error = parsedTime === null
      ? "Enter time as seconds, m:ss, or h:mm:ss."
      : setDraftFlightTime(endpoint, parsedTime)

    if (!error) {
      input.setCustomValidity("")
      return
    }

    input.setCustomValidity(error)
    input.reportValidity()
    input.value = formatDuration(endpoint === "takeoff" ? draftPoint?.time ?? 0 : draftFlightLandingPoint?.time ?? 0)
    window.setTimeout(() => input.setCustomValidity(""), 0)
  }

  const useCurrentVideoTimeForFlight = (endpoint: FlightEditEndpoint) => {
    setDraftFlightTime(endpoint, currentTimeRef.current)
  }

  const beginDraftFlightMapPlacement = (endpoint: FlightEditEndpoint) => {
    setActiveFlightEditEndpoint(endpoint)
    setFlightEditLocationModes((currentModes) => ({ ...currentModes, [endpoint]: "map" }))
    setAirportCodeMessage("")
    setIsAwaitingMapPlacement(true)
  }

  const useDraftFlightAirportCode = async (endpoint: FlightEditEndpoint) => {
    const endpointDraft = endpoint === "takeoff" ? draftPoint : draftFlightLandingPoint
    if (!endpointDraft || endpointDraft.pointType !== "flight") {
      return
    }

    const airportCode = normalizeAirportCode(endpointDraft.location)
    if (!airportCode) {
      setAirportCodeMessage(`Enter the ${endpoint} airport code first.`)
      return
    }

    setActiveFlightEditEndpoint(endpoint)
    setFlightEditLocationModes((currentModes) => ({ ...currentModes, [endpoint]: "airport" }))
    setAirportCodeMessage("")
    setIsAwaitingMapPlacement(false)

    setIsResolvingAirportCode(true)
    try {
      const airport = await resolveAirportCodeLocation(airportCode)
      if (!airport) {
        setAirportCodeMessage(`Airport code ${airportCode} could not be verified. Pick it on the map instead.`)
        return
      }

      updateDraftFlightEndpoint(endpoint, (currentDraft) => ({
        ...currentDraft,
        location: airport.code,
        description: airport.name,
        airportCity: airport.city,
        lat: airport.lat,
        lng: airport.lng,
      }))
    } catch {
      setAirportCodeMessage(`Airport code ${airportCode} could not be verified. Pick it on the map instead.`)
    } finally {
      setIsResolvingAirportCode(false)
    }
  }

  const placeDraftFlightEndpoint = (value: { lat: number; lng: number }) => {
    if (!draftPoint?.id || draftPoint.pointType !== "flight" || !draftFlightLandingPoint?.id) {
      return
    }

    updateDraftFlightEndpoint(activeFlightEditEndpoint, (currentDraft) => ({
      ...currentDraft,
      lat: value.lat,
      lng: value.lng,
    }))
    setFlightEditLocationModes((currentModes) => ({
      ...currentModes,
      [activeFlightEditEndpoint]: "map",
    }))
    setAirportCodeMessage("")
    setIsAwaitingMapPlacement(false)
  }

  const saveDraftFlightPairEdits = async () => {
    if (!draftPoint?.id || draftPoint.pointType !== "flight" || !draftFlightLandingPoint?.id) {
      return
    }

    if (draftPoint.time >= draftFlightLandingPoint.time) {
      setAirportCodeMessage("Takeoff must be before landing.")
      return
    }

    setIsResolvingAirportCode(true)
    setAirportCodeMessage("")

    try {
      const resolveEndpoint = async (endpoint: FlightEditEndpoint, endpointDraft: DraftPoint) => {
        if (flightEditLocationModes[endpoint] === "map") {
          if (endpointDraft.lat === null || endpointDraft.lng === null) {
            return null
          }

          const manualCode = endpointDraft.location === "Map point"
            ? ""
            : normalizeAirportCode(endpointDraft.location)
          return {
            ...endpointDraft,
            location: manualCode || "Map point",
            description: endpoint === "takeoff" ? "Map-selected takeoff" : "Map-selected landing",
            lat: endpointDraft.lat,
            lng: endpointDraft.lng,
          }
        }

        const airportCode = normalizeAirportCode(endpointDraft.location)
        if (!airportCode) {
          return null
        }

        const airport = await resolveAirportCodeLocation(airportCode)
        if (!airport) {
          return null
        }

        return {
          ...endpointDraft,
          location: airport.code,
          description: airport.name,
          lat: airport.lat,
          lng: airport.lng,
        }
      }

      const [takeoffDraft, landingDraft] = await Promise.all([
        resolveEndpoint("takeoff", draftPoint),
        resolveEndpoint("landing", draftFlightLandingPoint),
      ])

      if (!takeoffDraft || !landingDraft) {
        setAirportCodeMessage("Enter valid airport codes or pick both locations on the map.")
        return
      }

      const flightId = draftPoint.flightId || draftFlightLandingPoint.flightId || createFlightId()
      recordMapEditSnapshot()
      let nextPoints = upsertCreatorPoint(video.id, points, {
        ...toPersistedDraftPoint(takeoffDraft),
        flightId,
        flightPhase: "takeoff",
        pointType: "flight",
      })
      nextPoints = upsertCreatorPoint(video.id, nextPoints, {
        ...toPersistedDraftPoint(landingDraft),
        flightId,
        flightPhase: "landing",
        pointType: "flight",
      })

      persistPoints(nextPoints)
      draftPointRef.current = null
      setDraftPoint(null)
      setDraftFlightLandingPoint(null)
      setIsAwaitingMapPlacement(false)
      setAirportCodeMessage("")
      setResumeCountdown(null)
    } catch {
      setAirportCodeMessage("The flight could not be updated. Check the airport codes and try again.")
    } finally {
      setIsResolvingAirportCode(false)
    }
  }

  const saveDraftPointEdits = () => {
    if (!draftPoint?.id || draftPoint.lat === null || draftPoint.lng === null) {
      return
    }

    recordMapEditSnapshot()
    const nextDraft: DraftPoint = {
      ...draftPoint,
      location: draftPoint.location.trim() || getDraftLocationFallback(draftPoint),
      description: draftPoint.description.trim() || getDraftDescription(draftPoint.pointType),
    }
    const nextPoints = upsertCreatorPoint(video.id, points, {
      ...toPersistedDraftPoint(nextDraft),
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
    draftPointRef.current = null
    setDraftPoint(null)
    setDraftFlightLandingPoint(null)
    setIsAwaitingMapPlacement(false)
    setIsTimestampNameEditing(false)
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
      location: draftPoint.location.trim() || getDraftLocation(draftPoint.pointType, timestamp, getDraftPointNumber(draftPoint)),
      description: draftPoint.description.trim() || getDraftDescription(draftPoint.pointType),
    }
    const nextPoints = upsertCreatorPoint(video.id, points, {
      ...toPersistedDraftPoint(nextDraft),
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
    draftPointRef.current = null
    setDraftPoint(null)
    setDraftFlightLandingPoint(null)
    setIsAwaitingMapPlacement(false)
    setIsTimestampNameEditing(false)
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

      const currentDefaultLocation = getDraftLocation(currentDraft.pointType, currentDraft.time)
      const currentDefaultDescription = getDraftDescription(currentDraft.pointType)
      const shouldReplaceLocation =
        currentDraft.pointType === "stop"
          ? isGeneratedStopName(currentDraft.location)
          : !currentDraft.location.trim() || currentDraft.location === currentDefaultLocation
      const shouldReplaceDescription =
        !currentDraft.description.trim() || currentDraft.description === currentDefaultDescription
      const nextStopEndTime =
        pointType === "stop"
          ? typeof currentDraft.stopEndTime === "number" && currentDraft.stopEndTime > currentDraft.time
            ? currentDraft.stopEndTime
            : currentDraft.time + 30
          : undefined

      const nextDraft = {
        ...currentDraft,
        pointType,
        stopEndTime: nextStopEndTime,
        flightId: pointType === "flight" ? currentDraft.flightId : undefined,
        flightPhase: pointType === "flight" ? currentDraft.flightPhase : undefined,
        location:
          pointType === "flight"
            ? normalizeAirportCode(currentDraft.location)
            : shouldReplaceLocation
              ? getDraftLocation(pointType, currentDraft.time, getDraftPointNumber(currentDraft))
              : currentDraft.location,
        description: shouldReplaceDescription ? getDraftDescription(pointType) : currentDraft.description,
      }
      draftPointRef.current = nextDraft
      return nextDraft
    })
  }

  const setDraftStopTime = (field: "start" | "end", seconds: number) => {
    if (!draftPoint || draftPoint.pointType !== "stop" || !Number.isFinite(seconds) || seconds < 0) {
      return "Enter a valid non-negative time."
    }

    if (field === "start" && typeof draftPoint.stopEndTime === "number" && seconds >= draftPoint.stopEndTime) {
      return "The start time must be before the end time."
    }

    if (field === "end" && seconds <= draftPoint.time) {
      return "The end time must be after the start time."
    }

    setDraftPoint((currentDraft) => {
      if (!currentDraft || currentDraft.pointType !== "stop") {
        return currentDraft
      }

      const shouldRename = isGeneratedStopName(currentDraft.location)
      return field === "start"
        ? {
            ...currentDraft,
            time: seconds,
            location: shouldRename
              ? getDraftLocation("stop", seconds, getDraftPointNumber(currentDraft))
              : currentDraft.location,
          }
        : { ...currentDraft, stopEndTime: seconds }
    })
    return null
  }

  const handleDraftStopTimeBlur = (field: "start" | "end", input: HTMLInputElement) => {
    const parsedTime = parseTimestampInput(input.value)
    const error = parsedTime === null
      ? "Enter time as seconds, m:ss, or h:mm:ss."
      : setDraftStopTime(field, parsedTime)

    if (!error) {
      input.setCustomValidity("")
      return
    }

    input.setCustomValidity(error)
    input.reportValidity()
    input.value = formatDuration(field === "start" ? draftPoint?.time ?? 0 : draftPoint?.stopEndTime ?? 0)
    window.setTimeout(() => input.setCustomValidity(""), 0)
  }

  const useCurrentVideoTimeForStop = (field: "start" | "end") => {
    setDraftStopTime(field, currentTimeRef.current)
  }

  const cancelPointEdit = () => {
    cancelNearbyPlaceLookup()
    isCompletingStopRef.current = false
    setIsTimestampNameEditing(false)
    setResumeCountdown(null)
    setAirportCodeMessage("")
    draftPointRef.current = null
    setDraftPoint(null)
    setIsAwaitingMapPlacement(false)
    setIsRecordingStop(false)
  }

  const playFromTimestamp = (time: number) => {
    cancelNearbyPlaceLookup()
    setResumeCountdown(null)
    commitCurrentTime(time, true)
    setSeekRequest((currentRequest) => ({
      id: (currentRequest?.id ?? 0) + 1,
      time,
    }))
    setIsPlaying(true)
    draftPointRef.current = null
    setIsTimestampNameEditing(false)
    setDraftPoint(null)
    setDraftFlightLandingPoint(null)
    setIsAwaitingMapPlacement(false)
    setIsRecordingStop(false)
  }

  const playFromMapTimestamp = (point: CreatorMapPoint) => {
    playFromTimestamp(point.time)
  }

  const deleteTimestampRow = (row: TimestampDisplayRow) => {
    const pointIdsToDelete = new Set([row.point.id, row.landingPoint?.id].filter(Boolean))
    const nextPoints = points.filter((point) => !pointIdsToDelete.has(point.id))
    persistPoints(nextPoints)
    if (draftPoint?.id && pointIdsToDelete.has(draftPoint.id)) {
      cancelNearbyPlaceLookup()
      draftPointRef.current = null
      setDraftPoint(null)
      setDraftFlightLandingPoint(null)
      setIsAwaitingMapPlacement(false)
      setIsRecordingStop(false)
      setIsTimestampNameEditing(false)
    }
  }

  const startStopRecording = () => {
    if (pendingFlightTakeoff || isPlacingSavedPlace) {
      return
    }

    const timestamp = currentTimeRef.current
    setResumeCountdown(null)
    setIsPlaying(false)
    const nextDraft: DraftPoint = {
      id: undefined,
      time: timestamp,
      stopEndTime: undefined,
      lat: null,
      lng: null,
      location: getDraftLocation("stop", timestamp, displayedRows.length + 1),
      description: getDraftDescription("stop"),
      pointType: "stop",
    }
    draftPointRef.current = nextDraft
    setDraftPoint(nextDraft)
    setIsAwaitingMapPlacement(true)
    setIsRecordingStop(true)
    setIsTimestampNameEditing(false)
  }

  const setStopEndTime = async () => {
    const timestamp = currentTimeRef.current
    const initialDraft = draftPointRef.current ?? draftPoint
    if (
      isCompletingStopRef.current ||
      !initialDraft ||
      initialDraft.pointType !== "stop" ||
      initialDraft.lat === null ||
      initialDraft.lng === null ||
      timestamp <= initialDraft.time
    ) {
      return
    }

    isCompletingStopRef.current = true
    try {
      const pendingLookup = pendingNearbyPlaceLookupRef.current
      const nearbyPlaceName =
        pendingLookup && pendingLookup.lat === initialDraft.lat && pendingLookup.lng === initialDraft.lng
          ? await pendingLookup.promise
          : null
      const currentDraft = draftPointRef.current
      if (
        !currentDraft ||
        currentDraft.pointType !== "stop" ||
        currentDraft.lat !== initialDraft.lat ||
        currentDraft.lng !== initialDraft.lng
      ) {
        return
      }

      recordMapEditSnapshot()
      const stopEndTime = Math.max(timestamp, currentDraft.time + 0.5)
      const nextDraft: DraftPoint = {
        ...currentDraft,
        stopEndTime,
        location: nearbyPlaceName
          ? getNearbyTimestampName("stop", nearbyPlaceName)
          : currentDraft.location.trim() || getDraftLocation("stop", currentDraft.time, displayedRows.length + 1),
        description: currentDraft.description.trim() || getDraftDescription("stop"),
      }
      const nextPoints = upsertCreatorPoint(video.id, points, {
        ...toPersistedDraftPoint(nextDraft),
        lat: currentDraft.lat,
        lng: currentDraft.lng,
        location: nextDraft.location,
        description: nextDraft.description,
        pointType: "stop",
        stopEndTime: nextDraft.stopEndTime,
      })

      persistPoints(nextPoints)
      draftPointRef.current = null
      setDraftPoint(null)
      setIsAwaitingMapPlacement(false)
      setIsRecordingStop(false)
      setIsTimestampNameEditing(false)
      if (!isPlaying) {
        scheduleAutoplay()
      }
    } finally {
      isCompletingStopRef.current = false
    }
  }

  useEffect(() => {
    editorShortcutStateRef.current = {
      draftPoint,
      isAwaitingMapPlacement,
      isPlacingSavedPlace,
      isRecordingStop,
      addTimestampPoint,
      cancelSavedPlacePlacement,
      cancelPointEdit,
      setStopEndTime,
      startFlightPoint,
      startStopRecording,
    }
  })

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const shortcutState = editorShortcutStateRef.current
      if (!shortcutState) {
        return
      }

      if (event.code === "Escape" && !event.repeat && shortcutState.isPlacingSavedPlace) {
        event.preventDefault()
        shortcutState.cancelSavedPlacePlacement()
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
        return
      }

      if (event.code === "KeyE") {
        event.preventDefault()
        shortcutState.startFlightPoint()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  const activePointNumber = draftPoint ? getDraftPointNumber(draftPoint) : null
  const activeDraftMapPoint =
    draftPoint?.pointType === "flight" && draftFlightLandingPoint && activeFlightEditEndpoint === "landing"
      ? draftFlightLandingPoint
      : draftPoint
  const isPlacingPoint = Boolean(
    draftPoint &&
      !draftPoint.id &&
      draftPoint.pointType === "point" &&
      isAwaitingMapPlacement,
  )
  const isCapturingFlight = Boolean(flightAirportPrompt || pendingFlightTakeoff)
  const isPlacingFlightOnMap = flightAirportPrompt?.mode === "map"
  const canUploadVideo = video.status !== "published"
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
      savedPlaces,
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

  const enableTimestampNameEditing = () => {
    setIsTimestampNameEditing(true)
    window.requestAnimationFrame(() => {
      timestampNameInputRef.current?.focus()
      timestampNameInputRef.current?.select()
    })
  }

  const renderTimestampEditPanel = () => {
    if (!draftPoint?.id) {
      return null
    }

    const flightEditEndpoints: Array<{ endpoint: FlightEditEndpoint; label: string; point: DraftPoint }> =
      draftPoint.pointType === "flight" && draftFlightLandingPoint
        ? [
            { endpoint: "takeoff", label: "Takeoff", point: draftPoint },
            { endpoint: "landing", label: "Landing", point: draftFlightLandingPoint },
          ]
        : []

    return (
      <div
        className={`mx-2 mb-3 space-y-2 rounded-md border px-3 py-2 text-sm ${
          draftPoint.pointType === "flight"
            ? "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-100"
            : draftPoint.pointType === "stop"
              ? "border-teal-200 bg-teal-50 text-teal-950 dark:border-teal-400/30 dark:bg-teal-500/10 dark:text-teal-100"
              : "border-orange-200 bg-orange-50 text-orange-950 dark:border-orange-400/30 dark:bg-orange-500/10 dark:text-orange-100"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">Editing timestamp {activePointNumber ? `#${activePointNumber}` : ""}</span>
          <span>
            {draftPoint.pointType === "flight" && draftFlightLandingPoint
              ? `${formatDuration(draftPoint.time)}–${formatDuration(draftFlightLandingPoint.time)}`
              : draftPoint.pointType === "stop" && typeof draftPoint.stopEndTime === "number"
              ? `${formatDuration(draftPoint.time)}–${formatDuration(draftPoint.stopEndTime)}`
              : formatDuration(draftPoint.time)}
          </span>
        </div>
        <p className="text-xs opacity-80">
          {draftPoint.pointType === "flight" && draftFlightLandingPoint
            ? isAwaitingMapPlacement
              ? `Click the map to set the ${activeFlightEditEndpoint} location.`
              : "Choose an endpoint below, then use its airport code or pick it on the map."
            : isAwaitingMapPlacement
              ? "Click the map to set the new location."
              : "Drag the numbered map marker to update this timestamp location."} Current video time: {formatDuration(currentTime)}.
        </p>
        {flightEditEndpoints.length > 0 ? (
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold opacity-80">Flight endpoints</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {flightEditEndpoints.map(({ endpoint, label, point }) => {
                const isActiveEndpoint = activeFlightEditEndpoint === endpoint
                const locationMode = flightEditLocationModes[endpoint]

                return (
                  <div
                    key={endpoint}
                    className={`space-y-2 rounded-md border p-2 transition-colors ${
                      isActiveEndpoint
                        ? "border-sky-500 bg-sky-100/80 dark:border-sky-300/60 dark:bg-sky-400/10"
                        : "border-sky-200/80 bg-white/60 dark:border-white/10 dark:bg-black/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
                      <span className="text-[10px] font-semibold opacity-70">
                        {locationMode === "map" ? "Map location" : "Airport code"}
                      </span>
                    </div>
                    <label className="block space-y-1">
                      <span className="block text-xs opacity-75">Airport code</span>
                      <Input
                        value={point.location === "Map point" ? "" : point.location}
                        aria-label={`${label} airport code`}
                        placeholder={endpoint === "takeoff" ? "CDG" : "CAI"}
                        className="h-8 border-white/70 bg-white text-slate-950 shadow-none dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
                        onFocus={() => setActiveFlightEditEndpoint(endpoint)}
                        onBlur={() => {
                          void useDraftFlightAirportCode(endpoint)
                        }}
                        onChange={(event) => {
                          const airportCode = normalizeAirportCode(event.target.value)
                          const knownAirport = getAirportCodeLocation(airportCode)
                          updateDraftFlightEndpoint(endpoint, (currentDraft) => ({
                            ...currentDraft,
                            location: airportCode,
                            description: knownAirport?.name ?? "",
                            airportCity: knownAirport?.city,
                          }))
                          setFlightEditLocationModes((currentModes) => ({
                            ...currentModes,
                            [endpoint]: "airport",
                          }))
                        }}
                      />
                    </label>
                    {isResolvingAirportCode && isActiveEndpoint && locationMode === "airport" ? (
                      <AirportSearchStatus />
                    ) : locationMode === "airport" && point.location && point.description && point.airportCity ? (
                      <AirportConfirmation
                        airport={{
                          code: point.location,
                          name: point.description,
                          city: point.airportCity,
                        }}
                      />
                    ) : null}
                    <label className="block space-y-1">
                      <span className="block text-xs opacity-75">Video time</span>
                      <Input
                        key={`flight-${endpoint}-${point.id}-${point.time}`}
                        defaultValue={formatDuration(point.time)}
                        inputMode="decimal"
                        aria-label={`${label} time`}
                        className="h-8 border-white/70 bg-white text-slate-950 shadow-none dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
                        onFocus={() => setActiveFlightEditEndpoint(endpoint)}
                        onBlur={(event) => handleDraftFlightTimeBlur(endpoint, event.currentTarget)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur()
                        }}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 bg-white px-2 text-[11px] dark:bg-zinc-950/70"
                        onClick={() => useCurrentVideoTimeForFlight(endpoint)}
                      >
                        Use video time
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={locationMode === "map" ? "default" : "outline"}
                        className="h-7 px-2 text-[11px]"
                        onClick={() => beginDraftFlightMapPlacement(endpoint)}
                      >
                        Pick on map
                      </Button>
                    </div>
                    {locationMode === "map" && point.lat !== null && point.lng !== null ? (
                      <p className="truncate text-[10px] opacity-65">
                        {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                      </p>
                    ) : (
                      <button
                        type="button"
                        className="text-left text-[10px] font-semibold text-sky-700 hover:underline dark:text-sky-300"
                        onClick={() => useDraftFlightAirportCode(endpoint)}
                      >
                        Use airport code
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] opacity-65">Enter seconds, m:ss, or h:mm:ss.</p>
          </fieldset>
        ) : null}
        {flightEditEndpoints.length === 0 ? <div className="block space-y-1">
          <span className="text-xs font-semibold opacity-80">
            {draftPoint.pointType === "flight" ? "Airport code" : "Timestamp name"}
          </span>
          <div className="relative">
            <Input
              ref={timestampNameInputRef}
              value={draftPoint.location}
              readOnly={draftPoint.pointType !== "flight" && !isTimestampNameEditing}
              aria-label={draftPoint.pointType === "flight" ? "Airport code" : "Timestamp name"}
              onChange={(event) =>
                setDraftPoint((currentDraft) =>
                  currentDraft
                    ? {
                        ...currentDraft,
                        location:
                          currentDraft.pointType === "flight"
                            ? normalizeAirportCode(event.target.value)
                            : event.target.value,
                      }
                    : currentDraft,
                )
              }
              placeholder={draftPoint.pointType === "flight" ? "LHE" : draftPoint.pointType === "stop" ? "Stop name" : "Point name"}
              className={`h-8 border-white/70 bg-white text-slate-950 shadow-none dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100 ${
                draftPoint.pointType === "flight" ? "" : "pr-9 read-only:cursor-default"
              }`}
            />
            {draftPoint.pointType !== "flight" ? (
              <button
                type="button"
                className={`absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white ${
                  isTimestampNameEditing ? "bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white" : ""
                }`}
                aria-label="Edit timestamp name"
                title={isTimestampNameEditing ? "Timestamp name is editable" : "Edit timestamp name"}
                disabled={isResolvingNearbyPlace}
                onClick={enableTimestampNameEditing}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div> : null}
        {draftPoint.pointType === "stop" && typeof draftPoint.stopEndTime === "number" ? (
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-semibold opacity-80">Stop time range</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="min-w-0 space-y-1">
                <span className="block text-xs opacity-75">Start</span>
                <Input
                  key={`stop-start-${draftPoint.id}-${draftPoint.time}`}
                  defaultValue={formatDuration(draftPoint.time)}
                  inputMode="decimal"
                  aria-label="Stop start time"
                  className="h-8 border-white/70 bg-white text-slate-950 shadow-none dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
                  onBlur={(event) => handleDraftStopTimeBlur("start", event.currentTarget)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur()
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 w-full bg-white px-2 text-xs dark:bg-zinc-950/70"
                  disabled={currentTime >= draftPoint.stopEndTime}
                  onClick={() => useCurrentVideoTimeForStop("start")}
                >
                  Use video time
                </Button>
              </label>
              <label className="min-w-0 space-y-1">
                <span className="block text-xs opacity-75">End</span>
                <Input
                  key={`stop-end-${draftPoint.id}-${draftPoint.stopEndTime}`}
                  defaultValue={formatDuration(draftPoint.stopEndTime)}
                  inputMode="decimal"
                  aria-label="Stop end time"
                  className="h-8 border-white/70 bg-white text-slate-950 shadow-none dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
                  onBlur={(event) => handleDraftStopTimeBlur("end", event.currentTarget)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur()
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 w-full bg-white px-2 text-xs dark:bg-zinc-950/70"
                  disabled={currentTime <= draftPoint.time}
                  onClick={() => useCurrentVideoTimeForStop("end")}
                >
                  Use video time
                </Button>
              </label>
            </div>
            <p className="text-[11px] opacity-65">Enter seconds, m:ss, or h:mm:ss.</p>
          </fieldset>
        ) : null}
        {draftPoint.pointType !== "flight" && (
          <div className="space-y-1">
            <span className="block text-xs font-semibold opacity-80">Timestamp type</span>
            <button
              type="button"
              role="switch"
              aria-checked={draftPoint.pointType === "stop"}
              aria-label={`Timestamp type: ${draftPoint.pointType}. Switch to ${draftPoint.pointType === "stop" ? "point" : "stop"}`}
              onClick={() => updateDraftPointType(draftPoint.pointType === "stop" ? "point" : "stop")}
              className="relative grid h-9 w-full grid-cols-2 items-center overflow-hidden rounded-md border border-slate-300 bg-white p-1 text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 dark:border-white/20 dark:bg-zinc-950/70 dark:focus-visible:ring-white"
            >
              <span
                aria-hidden="true"
                className={`absolute inset-y-1 left-1 w-[calc(50%-0.375rem)] rounded transition-transform duration-200 ease-out ${
                  draftPoint.pointType === "stop" ? "translate-x-[calc(100%+0.25rem)] bg-teal-700" : "translate-x-0 bg-orange-600"
                }`}
              />
              <span
                className={`relative z-10 transition-colors ${
                  draftPoint.pointType === "point" ? "text-white" : "text-slate-600 dark:text-slate-300"
                }`}
              >
                Point
              </span>
              <span
                className={`relative z-10 transition-colors ${
                draftPoint.pointType === "stop"
                    ? "text-white"
                    : "text-slate-600 dark:text-slate-300"
                }`}
              >
                Stop
              </span>
            </button>
            <p className="text-xs opacity-70">Switch between a single point and a stop with a duration.</p>
          </div>
        )}
        {draftPoint.pointType === "flight" && airportCodeMessage ? (
          <p className="text-xs font-medium text-red-700 dark:text-red-300" role="alert">
            {airportCodeMessage}
          </p>
        ) : null}
        {draftPoint.pointType !== "flight" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 bg-white dark:bg-zinc-950/70"
              disabled={isAwaitingMapPlacement}
              onClick={resetDraftPointLocation}
            >
              Reset coordinates
            </Button>
            {draftPoint.pointType === "point" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 bg-white dark:bg-zinc-950/70"
                disabled={draftPoint.lat === null || draftPoint.lng === null}
                onClick={saveDraftPointTimeFromVideo}
              >
                Set to current time
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className={`h-8 text-white ${
              draftPoint.pointType === "flight"
                ? "bg-sky-600 hover:bg-sky-700"
                : draftPoint.pointType === "stop"
                  ? "bg-teal-700 hover:bg-teal-800"
                  : "bg-orange-600 hover:bg-orange-700"
            }`}
            disabled={
              isResolvingAirportCode ||
              (draftPoint.pointType === "flight" && draftFlightLandingPoint
                ? (flightEditLocationModes.takeoff === "map" && (draftPoint.lat === null || draftPoint.lng === null)) ||
                  (flightEditLocationModes.landing === "map" &&
                    (draftFlightLandingPoint.lat === null || draftFlightLandingPoint.lng === null))
                : draftPoint.pointType !== "flight" && (draftPoint.lat === null || draftPoint.lng === null))
            }
            onClick={
              draftPoint.pointType === "flight" && draftFlightLandingPoint
                ? saveDraftFlightPairEdits
                : draftPoint.pointType === "flight"
                  ? resolveDraftAirportCode
                  : saveDraftPointEdits
            }
          >
            {isResolvingAirportCode ? "Finding airport..." : "Save"}
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 bg-white dark:bg-zinc-950/70" onClick={cancelPointEdit}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  const renderFlightCapturePanel = () => {
    if (!flightAirportPrompt) {
      return null
    }

    const roleLabel = flightAirportPrompt.role === "takeoff" ? "takeoff" : "landing"

    return (
      <div className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-sky-950 shadow-sm dark:border-sky-400/35 dark:bg-sky-500/10 dark:text-sky-100">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white shadow-md shadow-sky-600/20">
            <Plane className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">
              {flightAirportPrompt.mode === "choose"
                ? `Set flight ${roleLabel}`
                : flightAirportPrompt.mode === "map"
                  ? `Select ${roleLabel} on the map`
                  : `Enter ${roleLabel} airport`}
            </p>
            {flightAirportPrompt.mode === "map" ? (
              <p className="mt-0.5 text-xs leading-5 opacity-80">
                {flightAirportPrompt.role === "takeoff"
                  ? "Click the map for takeoff."
                  : "Video is playing. Click the map at landing."}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-mr-1 -mt-1 h-8 w-8 shrink-0"
            aria-label="Cancel flight entry"
            disabled={isResolvingAirportCode}
            onClick={cancelFlightAirportPrompt}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {flightAirportPrompt.mode === "choose" ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className="rounded-lg border border-sky-300 bg-white p-3 text-left transition-colors hover:border-sky-500 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-sky-300/25 dark:bg-zinc-950/70 dark:hover:bg-sky-500/10"
              onClick={() => {
                setFlightAirportCode("")
                setAirportCodeMessage("")
                setFlightAirportPrompt((currentPrompt) =>
                  currentPrompt ? { ...currentPrompt, mode: "airport" } : currentPrompt,
                )
              }}
            >
              <span className="block text-sm font-bold">Use airport code</span>
              <span className="mt-1 block text-xs leading-4 opacity-70">Enter the takeoff or landing airport.</span>
            </button>
            <button
              type="button"
              className="rounded-lg border border-sky-300 bg-white p-3 text-left transition-colors hover:border-sky-500 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-sky-300/25 dark:bg-zinc-950/70 dark:hover:bg-sky-500/10"
              onClick={() => {
                setAirportCodeMessage("")
                setFlightAirportPrompt((currentPrompt) =>
                  currentPrompt ? { ...currentPrompt, mode: "map" } : currentPrompt,
                )
              }}
            >
              <span className="flex items-center gap-1.5 text-sm font-bold">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                Pick on map
              </span>
              <span className="mt-1 block text-xs leading-4 opacity-70">Pick takeoff, play, then pick landing.</span>
            </button>
          </div>
        ) : null}

        {flightAirportPrompt.mode === "airport" ? (
          <form
            className="mt-3 space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              void saveFlightAirport()
            }}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input
                autoFocus
                value={flightAirportCode}
                onChange={(event) => {
                  const airportCode = normalizeAirportCode(event.target.value)
                  const knownAirport = getAirportCodeLocation(airportCode)
                  setFlightAirportCode(airportCode)
                  setFlightAirportPreview(knownAirport)
                  setAirportCodeMessage("")
                }}
                onBlur={() => {
                  void previewFlightAirportCode()
                }}
                placeholder={flightAirportPrompt.role === "takeoff" ? "e.g. LHE" : "e.g. IST"}
                autoComplete="off"
                inputMode="text"
                aria-label={`${roleLabel} airport code`}
                aria-invalid={airportCodeMessage ? true : undefined}
                aria-describedby={airportCodeMessage ? "flight-airport-error" : undefined}
                className="h-9 border-sky-300 bg-white font-semibold uppercase tracking-[0.12em] text-slate-950 dark:border-sky-300/25 dark:bg-zinc-950 dark:text-white"
              />
              <Button
                type="submit"
                size="sm"
                className="h-9 bg-sky-600 text-white hover:bg-sky-700"
                disabled={isResolvingAirportCode || !flightAirportCode}
              >
                {isResolvingAirportCode ? "Finding..." : flightAirportPrompt.role === "takeoff" ? "Save & play" : "Complete"}
              </Button>
            </div>
            {isResolvingAirportCode ? (
              <AirportSearchStatus />
            ) : flightAirportPreview ? (
              <AirportConfirmation airport={flightAirportPreview} />
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="text-xs font-semibold text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                onClick={() => {
                  setAirportCodeMessage("")
                  setFlightAirportPreview(null)
                  setFlightAirportPrompt((currentPrompt) =>
                    currentPrompt ? { ...currentPrompt, mode: "choose" } : currentPrompt,
                  )
                }}
              >
                Back to options
              </button>
              <span className="text-xs tabular-nums opacity-70">{formatDuration(flightAirportPrompt.timestamp)}</span>
            </div>
          </form>
        ) : null}

        {flightAirportPrompt.mode === "map" ? (
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-xs font-semibold text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
              onClick={() => {
                setFlightAirportCode("")
                setAirportCodeMessage("")
                setFlightAirportPrompt((currentPrompt) =>
                  currentPrompt ? { ...currentPrompt, mode: "airport" } : currentPrompt,
                )
              }}
            >
              Use airport code instead
            </button>
            <span className="text-xs tabular-nums opacity-70">
              {flightAirportPrompt.role === "takeoff"
                ? formatDuration(flightAirportPrompt.timestamp)
                : "Waiting for landing"}
            </span>
          </div>
        ) : null}

        {airportCodeMessage ? (
          <p id="flight-airport-error" className="mt-2 text-xs font-medium text-red-700 dark:text-red-300" role="alert">
            {airportCodeMessage}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <>
      {headerLeadingActionsElement
        ? createPortal(
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-white/15 dark:bg-white/10 dark:text-white/65">
              Edit Page
            </span>,
            headerLeadingActionsElement,
          )
        : null}
      <Popover.Root>
        {headerActionsElement
          ? createPortal(
              <>
                {canUploadVideo && (
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
                )}
                <Popover.Root open={isSavedPlacesOpen} onOpenChange={setIsSavedPlacesOpen}>
                  <Popover.Trigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={`h-8 gap-1.5 ${
                        isPlacingSavedPlace
                          ? "border-orange-300 bg-orange-100 text-orange-900 dark:border-orange-400/40 dark:bg-orange-500/15 dark:text-orange-100"
                          : ""
                      }`}
                      aria-label="Open saved places"
                      aria-pressed={isPlacingSavedPlace}
                    >
                      <Bookmark className="h-4 w-4" />
                      <span className="hidden sm:inline">Places</span>
                      {savedPlaces.length > 0 ? (
                        <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-bold tabular-nums text-slate-600 dark:bg-white/10 dark:text-zinc-300">
                          {savedPlaces.length}
                        </span>
                      ) : null}
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      align="end"
                      sideOffset={8}
                      className="z-[80] w-[min(calc(100vw-2rem),22rem)] rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-2xl outline-none"
                    >
                      <div className="flex items-start gap-3 px-1 pb-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                          <Bookmark className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold">Saved places</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">Reuse locations without finding them again.</p>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 w-full justify-start border-orange-200 bg-orange-50 px-3 text-orange-900 hover:bg-orange-100 dark:border-orange-400/25 dark:bg-orange-500/10 dark:text-orange-100 dark:hover:bg-orange-500/15"
                        onClick={beginSavedPlacePlacement}
                      >
                        <span className="mr-2 flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 text-white">
                          <MapPin className="h-4 w-4" />
                        </span>
                        <span className="text-sm font-semibold">Mark a place on the map</span>
                      </Button>

                      {savedPlaceMessage ? (
                        <p className="px-1 pt-2 text-xs font-medium text-muted-foreground" role="status">
                          {savedPlaceMessage}
                        </p>
                      ) : null}

                      <div className="my-3 h-px bg-border" />
                      <div className="max-h-72 space-y-1 overflow-y-auto">
                        {savedPlaces.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
                            Mark a location once, then reuse it anytime.
                          </div>
                        ) : (
                          savedPlaces.map((place) =>
                            editingSavedPlaceId === place.id ? (
                              <form
                                key={place.id}
                                className="flex items-center gap-2 rounded-lg bg-muted/60 p-2"
                                onSubmit={(event) => {
                                  event.preventDefault()
                                  renameSavedPlace(place.id)
                                }}
                              >
                                <Input
                                  autoFocus
                                  value={editingSavedPlaceName}
                                  maxLength={120}
                                  aria-label={`Rename ${place.name}`}
                                  className="h-8 min-w-0"
                                  onChange={(event) => setEditingSavedPlaceName(event.target.value)}
                                />
                                <Button type="submit" size="sm" className="h-8 px-2.5">Save</Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  aria-label="Cancel rename"
                                  onClick={() => {
                                    setEditingSavedPlaceId(null)
                                    setEditingSavedPlaceName("")
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </form>
                            ) : (
                              <div key={place.id} className="group flex items-center gap-1 rounded-lg border border-transparent p-1 hover:border-border hover:bg-muted/50">
                                <button
                                  type="button"
                                  className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onClick={() => chooseSavedPlace(place)}
                                >
                                  <span className="block truncate text-sm font-semibold">{place.name}</span>
                                  <span className="block truncate text-[11px] tabular-nums text-muted-foreground">
                                    {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
                                  </span>
                                </button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 shrink-0"
                                  aria-label={`Rename ${place.name}`}
                                  title="Rename place"
                                  onClick={() => {
                                    setEditingSavedPlaceId(place.id)
                                    setEditingSavedPlaceName(place.name)
                                    setSavedPlaceMessage("")
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10"
                                  aria-label={`Delete ${place.name}`}
                                  title="Delete place"
                                  onClick={() => deleteSavedPlace(place.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ),
                          )
                        )}
                      </div>
                      <Popover.Arrow className="fill-popover" />
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-white"
                      aria-label="Open editor settings"
                      title="Editor settings"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="end"
                      sideOffset={8}
                      className="z-[70] w-[min(calc(100vw-2rem),19rem)] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-xl"
                    >
                      <div className="px-2.5 pb-2 pt-1">
                        <p className="text-sm font-semibold text-foreground">Editor settings</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Control playback and appearance.</p>
                      </div>
                      <PlaybackSettingsSection
                        preferences={playbackPreferences}
                        onChange={updatePlaybackPreferences}
                      />
                      <DropdownMenu.Separator className="my-2 h-px bg-border" />
                      <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Appearance
                      </div>
                      <DropdownMenu.Item
                        asChild
                        disabled={!isThemeMounted}
                        onSelect={(event) => {
                          event.preventDefault()
                          setTheme(isDarkMode ? "light" : "dark")
                        }}
                      >
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isDarkMode}
                          className="flex w-full cursor-pointer select-none items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm text-popover-foreground outline-none transition-colors hover:bg-accent focus:bg-accent focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                          disabled={!isThemeMounted}
                        >
                          {isDarkMode ? (
                            <Moon className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Sun className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="flex-1">{isDarkMode ? "Dark mode" : "Light mode"}</span>
                          <span
                            className={`relative h-5 w-9 rounded-full border transition-colors ${
                              isDarkMode ? "border-primary bg-primary" : "border-border bg-muted"
                            }`}
                            aria-hidden="true"
                          >
                            <span
                              className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-background shadow-sm transition-transform ${
                                isDarkMode ? "translate-x-4" : "translate-x-0.5"
                              }`}
                            />
                          </span>
                        </button>
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
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

      <Dialog.Root
        open={savedPlaceLocationPrompt !== null}
        onOpenChange={(open) => {
          if (!open && savedPlaceLocationPrompt) {
            cancelSavedPlaceLocationPrompt()
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[90] bg-slate-950/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[91] w-[min(92vw,27rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-orange-200/70 bg-white p-5 text-slate-950 shadow-2xl outline-none dark:border-orange-400/25 dark:bg-zinc-950 dark:text-zinc-50">
            {savedPlaceLocationPrompt ? (
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault()
                  saveMarkedPlace()
                }}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white shadow-lg shadow-orange-600/20">
                    <MapPin className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Dialog.Title className="text-lg font-bold">Name this place</Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                      This location can be reused for future timestamps.
                    </Dialog.Description>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="-mr-2 -mt-2 h-9 w-9 shrink-0 rounded-full"
                    aria-label="Close saved place naming dialog"
                    onClick={cancelSavedPlaceLocationPrompt}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <label htmlFor="saved-place-name" className="text-sm font-semibold">Place name</label>
                  <Input
                    id="saved-place-name"
                    autoFocus
                    value={newSavedPlaceName}
                    maxLength={120}
                    placeholder="Hotel"
                    onChange={(event) => {
                      setNewSavedPlaceName(event.target.value)
                      setSavedPlaceMessage("")
                    }}
                  />
                  <p className="text-xs tabular-nums text-slate-500 dark:text-zinc-400">
                    {savedPlaceLocationPrompt.lat.toFixed(5)}, {savedPlaceLocationPrompt.lng.toFixed(5)}
                  </p>
                  {savedPlaceMessage ? (
                    <p className="text-xs font-medium text-red-600 dark:text-red-300" role="alert">
                      {savedPlaceMessage}
                    </p>
                  ) : null}
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={cancelSavedPlaceLocationPrompt}>Cancel</Button>
                  <Button type="submit" className="bg-orange-600 text-white hover:bg-orange-700">Save place</Button>
                </div>
              </form>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={savedPlaceUsePrompt !== null}
        onOpenChange={(open) => {
          if (!open && savedPlaceUsePrompt) {
            cancelSavedPlaceUse()
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[90] bg-slate-950/70 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[91] w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-orange-200/70 bg-white p-5 text-slate-950 shadow-2xl outline-none dark:border-orange-400/25 dark:bg-zinc-950 dark:text-zinc-50">
            {savedPlaceUsePrompt ? (
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white shadow-lg shadow-orange-600/20">
                    <Bookmark className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Dialog.Title className="truncate text-lg font-bold">Add {savedPlaceUsePrompt.place.name}</Dialog.Title>
                    <Dialog.Description className="mt-1 text-sm text-slate-600 dark:text-zinc-400">
                      Choose the timestamp type at {formatDuration(savedPlaceUsePrompt.timestamp)}.
                    </Dialog.Description>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="-mr-2 -mt-2 h-9 w-9 shrink-0 rounded-full"
                    aria-label="Close saved place dialog"
                    onClick={cancelSavedPlaceUse}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    className="h-auto min-h-20 flex-col gap-1.5 bg-orange-600 py-3 text-white hover:bg-orange-700"
                    onClick={() => useSavedPlace("point")}
                  >
                    <MapPin className="h-5 w-5" />
                    <span>Point</span>
                    <span className="text-[11px] font-normal text-white/75">One timestamp</span>
                  </Button>
                  <Button
                    type="button"
                    className="h-auto min-h-20 flex-col gap-1.5 bg-teal-700 py-3 text-white hover:bg-teal-800"
                    onClick={() => useSavedPlace("stop")}
                  >
                    <Pause className="h-5 w-5" />
                    <span>Stop</span>
                    <span className="text-[11px] font-normal text-white/75">Start and end</span>
                  </Button>
                </div>
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div
        ref={splitViewRef}
        className="relative flex min-h-[calc(100vh-73px)] flex-col bg-white xl:grid xl:h-full xl:min-h-0 xl:overflow-hidden"
        style={{
          "--split-view-left": `${editorDefaultSplitPercent}%`,
          gridTemplateColumns: "minmax(0, var(--split-view-left)) minmax(0, 1fr)",
        } as CSSProperties}
      >
      <section
        ref={editorScrollRef}
        className="relative flex min-h-0 min-w-0 flex-col overflow-y-auto border-b border-slate-200 xl:h-full xl:border-b-0 xl:border-r"
      >
        <div
          className="relative aspect-video w-full shrink-0 overflow-hidden bg-black [&_iframe]:absolute [&_iframe]:inset-0"
        >
          <YouTubePlayer
            videoId={video.youtubeId}
            currentTime={currentTime}
            seekToTime={seekRequest?.time}
            seekRequestId={seekRequest?.id}
            isPlaying={isPlaying}
            volume={playbackPreferences.volume}
            isMuted={false}
            showControls
            allowKeyboard
            onReady={(nextDuration) => {
              const resolvedDuration = nextDuration || video.durationSeconds
              updateLocalCreatorVideo(video.id, { durationSeconds: resolvedDuration })
            }}
            onTimeChange={handleVideoTimeChange}
            onPlayingChange={handleEditorPlayingChange}
            onVolumeChange={handleVolumeChange}
          />
          <AutoplayCountdown seconds={resumeCountdown} />
        </div>

        {uploadMessage && (
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600" aria-live="polite">
            {uploadMessage}
          </div>
        )}

        {saveMessage && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900" aria-live="polite">
            {saveMessage}
          </div>
        )}

        <div className="flex flex-col">
          <div className="p-3 lg:p-4">
            <section className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <Button
                  size="sm"
                  className={`h-8 min-w-0 border px-2 font-semibold text-white transition-all duration-200 disabled:opacity-80 ${
                    isPlacingPoint
                      ? "border-amber-100 bg-amber-500 shadow-[0_0_0_2px_rgba(245,158,11,0.25),0_0_16px_rgba(217,119,6,0.45)] hover:bg-amber-600"
                      : "border-transparent bg-orange-600 hover:bg-orange-700"
                  }`}
                  disabled={Boolean(pendingFlightTakeoff) || Boolean(flightAirportPrompt) || isPlacingPoint || isPlacingSavedPlace}
                  onClick={() => addTimestampPoint("point")}
                  aria-pressed={isPlacingPoint}
                  aria-label={isPlacingPoint ? "Point ready for map placement" : "Add point"}
                  title={isPlacingPoint ? "Click the map to place this point" : "Add a point at the current video time"}
                >
                  {isPlacingPoint ? (
                    <span className="mr-2 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.2)]" aria-hidden="true" />
                  ) : (
                    <MapPin className="mr-2 h-4 w-4" />
                  )}
                  <span className="truncate">{isPlacingPoint ? "Place Point" : "Point"}</span>
                  <kbd className="ml-1 hidden text-[10px] font-medium leading-none text-white/55 sm:inline">[Q]</kbd>
                </Button>
                <Button
                  size="sm"
                  className={`h-8 min-w-0 border px-2 font-semibold text-white transition-all duration-200 disabled:opacity-80 ${
                    isRecordingStop
                      ? "border-teal-100 bg-teal-500 shadow-[0_0_0_2px_rgba(45,212,191,0.28),0_0_16px_rgba(20,184,166,0.45)] hover:bg-teal-600"
                      : "border-transparent bg-teal-700 hover:bg-teal-800"
                  }`}
                  disabled={
                    Boolean(pendingFlightTakeoff) ||
                    Boolean(flightAirportPrompt) ||
                    isPlacingSavedPlace ||
                    isRecordingStop &&
                    (!draftPoint ||
                      draftPoint.pointType !== "stop" ||
                      draftPoint.lat === null ||
                      draftPoint.lng === null ||
                      currentTime <= draftPoint.time)
                  }
                  title={
                    isRecordingStop && (!draftPoint || draftPoint.lat === null || draftPoint.lng === null)
                      ? "Click the map to set the stop start"
                      : isRecordingStop && draftPoint && currentTime <= draftPoint.time
                        ? "Wait until the video moves past the stop start time"
                        : isRecordingStop
                          ? "End the stop at the current video time"
                          : "Start recording a stop"
                  }
                  onClick={isRecordingStop ? setStopEndTime : startStopRecording}
                  aria-pressed={isRecordingStop}
                  aria-label={
                    isRecordingStop && (!draftPoint || draftPoint.lat === null || draftPoint.lng === null)
                      ? "Waiting for stop location"
                      : isRecordingStop
                        ? "End stop at current video time"
                        : "Start recording stop"
                  }
                >
                  {!isRecordingStop ? <Pause className="mr-2 h-4 w-4" /> : null}
                  <span className="truncate">
                    {isRecordingStop
                      ? draftPoint?.lat === null || draftPoint?.lng === null
                        ? "Place Stop"
                        : "End Stop"
                      : "Stop"}
                  </span>
                  <kbd className="ml-1 hidden text-[10px] font-medium leading-none text-white/55 sm:inline">[W]</kbd>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={`h-8 min-w-0 border px-2 font-semibold text-white transition-all duration-200 disabled:opacity-80 ${
                    isCapturingFlight
                      ? "border-cyan-100 bg-cyan-500 shadow-[0_0_0_2px_rgba(6,182,212,0.25),0_0_16px_rgba(8,145,178,0.5)] hover:bg-cyan-600"
                      : "border-transparent bg-sky-600 hover:bg-sky-700"
                  }`}
                  disabled={Boolean(draftPoint) || isRecordingStop || isResolvingAirportCode || Boolean(flightAirportPrompt) || isPlacingSavedPlace}
                  onClick={startFlightPoint}
                  aria-pressed={isCapturingFlight}
                  aria-label={pendingFlightTakeoff ? "Record flight landing" : flightAirportPrompt ? `Set flight ${flightAirportPrompt.role}` : "Record flight takeoff"}
                  title={pendingFlightTakeoff ? "Pause and record the landing airport" : "Pause and record the takeoff airport"}
                >
                  {isCapturingFlight ? (
                    <span className="mr-2 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.2)]" aria-hidden="true" />
                  ) : (
                    <Plane className="mr-2 h-4 w-4" />
                  )}
                  <span className="truncate">
                    {pendingFlightTakeoff
                      ? "Land"
                      : flightAirportPrompt?.role === "landing"
                        ? "Set Landing"
                        : flightAirportPrompt?.role === "takeoff"
                          ? "Set Takeoff"
                          : "Flight"}
                  </span>
                  <kbd className="ml-1 hidden text-[10px] font-medium leading-none text-white/60 sm:inline">[E]</kbd>
                </Button>
              </div>
              {renderFlightCapturePanel()}
              {isPlacingSavedPlace ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-3 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-orange-950 shadow-sm dark:border-orange-400/40 dark:bg-orange-500/15 dark:text-orange-100"
                >
                  <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-orange-500 shadow-[0_0_0_4px_rgba(249,115,22,0.18)] dark:bg-orange-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wide">Mark saved place</p>
                    <p className="mt-0.5 text-xs leading-5 opacity-85">Click the map to mark it. Esc to cancel.</p>
                  </div>
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                </div>
              ) : null}
              {isPlacingPoint && draftPoint?.pointType === "point" ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 shadow-sm dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-100"
                >
                  <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.18)] dark:bg-amber-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wide">Point ready</p>
                    <p className="mt-0.5 text-xs leading-5 opacity-85">
                      Click the map to place the point captured at {formatDuration(draftPoint.time)}. Press Esc to cancel.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 border border-amber-300 text-amber-900 hover:bg-amber-100 hover:text-amber-950 dark:border-amber-300/30 dark:text-amber-100 dark:hover:bg-amber-400/20 dark:hover:text-white"
                    onClick={cancelPointEdit}
                    aria-label="Cancel point placement"
                    title="Cancel point placement"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
              {isRecordingStop && draftPoint?.pointType === "stop" ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-3 rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-teal-950 shadow-sm dark:border-teal-400/40 dark:bg-teal-500/15 dark:text-teal-100"
                >
                  <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-teal-500 shadow-[0_0_0_4px_rgba(20,184,166,0.18)] dark:bg-teal-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-wide">
                      {draftPoint.lat === null || draftPoint.lng === null ? "Set stop start" : "Stop in progress"}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 opacity-85">
                      {draftPoint.lat === null || draftPoint.lng === null
                        ? "Click the map to set the stop start."
                        : "Press W or click End Stop when it ends."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 border border-teal-300 text-teal-900 hover:bg-teal-100 hover:text-teal-950 dark:border-teal-300/30 dark:text-teal-100 dark:hover:bg-teal-400/20 dark:hover:text-white"
                    onClick={cancelPointEdit}
                    aria-label="Cancel stop placement"
                    title="Cancel stop placement"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
              {pendingFlightTakeoff && !flightAirportPrompt ? (
                <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-cyan-950 shadow-sm dark:border-cyan-400/40 dark:bg-cyan-500/15 dark:text-cyan-100">
                  <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-cyan-500 shadow-[0_0_0_4px_rgba(6,182,212,0.18)] dark:bg-cyan-400" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold uppercase tracking-wide">
                      Flight in progress from {getFlightAirportCode(pendingFlightTakeoff)}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 opacity-85">
                      Takeoff {formatDuration(pendingFlightTakeoff.time)}. Press E again or click Land when the traveler arrives.
                    </p>
                  </div>
                  <kbd className="shrink-0 rounded border border-cyan-300 bg-white/80 px-2 py-1 text-[11px] font-bold dark:border-cyan-300/30 dark:bg-cyan-950/30">E</kbd>
                </div>
              ) : null}
            </section>

            <section className="mt-3 space-y-2 border-t border-slate-200 pt-4 dark:border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-950 dark:text-zinc-100">Timestamps</h2>
                  <Badge variant="secondary">{displayedRows.length}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    aria-label={isTimestampSortAscending ? "Sort timestamps descending" : "Sort timestamps ascending"}
                    title={isTimestampSortAscending ? "Newest first" : "Oldest first"}
                    onClick={() => setIsTimestampSortAscending((currentValue) => !currentValue)}
                  >
                    <ArrowDownUp className="mr-2 h-4 w-4" />
                    {isTimestampSortAscending ? "Oldest first" : "Newest first"}
                  </Button>
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

              {draftPoint && !draftPoint.id && !isRecordingStop && (
                <div className="w-full rounded-md bg-orange-50 px-3 py-2 text-sm text-orange-900 dark:bg-orange-500/10 dark:text-orange-100">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">Pending point</span>
                    <span>{formatDuration(draftPoint.time)}</span>
                  </div>
                </div>
              )}

              {isLoadingSavedState && sortedPoints.length === 0 ? (
                <div className="space-y-2 py-2" aria-live="polite" aria-label="Loading saved timestamps">
                  {Array.from({ length: 3 }, (_, index) => (
                    <div key={`timestamp-skeleton-${index}`} className="grid grid-cols-[1.5rem_minmax(0,1fr)_2rem_2rem] items-center gap-2 px-2 py-2.5">
                      <Skeleton className="h-5 w-5 rounded-full" />
                      <div className="min-w-0 space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-4/5" />
                      </div>
                      <Skeleton className="h-8 w-8 rounded-md" />
                      <Skeleton className="h-8 w-8 rounded-md" />
                    </div>
                  ))}
                </div>
              ) : sortedPoints.length === 0 ? (
                <p className="py-4 text-sm text-slate-500 dark:text-zinc-400">No points yet.</p>
              ) : (
                <div className="divide-y divide-slate-200 overflow-x-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:divide-white/10 dark:border-white/10 dark:bg-zinc-950/50 dark:shadow-black/20">
                  {displayedRows.map((row, rowIndex) => {
                    const { point, landingPoint } = row
                    const travelSummary = travelSummaryAfterRowKey.get(row.key)
                    const pointNumber = pointNumberById.get(point.id) ?? rowIndex + 1
                    const isSelected = draftPoint?.id === point.id || draftPoint?.id === landingPoint?.id
                    const isCurrentTimestamp =
                      activeTimelinePointId === point.id ||
                      activeTimelinePointId === landingPoint?.id ||
                      Boolean(
                        landingPoint &&
                          currentTime >= point.time &&
                          currentTime <= landingPoint.time,
                      )
                    const timestampName =
                      point.pointType === "stop" && isGeneratedStopName(point.location)
                        ? getDraftLocation("stop", point.time, pointNumber)
                        : getDisplayTimestampName(point)
                    const rowClassName = [
                      "min-w-0 border-l-4 transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.035]",
                      isCurrentTimestamp
                        ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-500/10"
                        : isSelected
                          ? point.pointType === "flight"
                            ? "border-sky-500 bg-sky-50 dark:border-sky-400 dark:bg-sky-500/10"
                            : point.pointType === "stop"
                              ? "border-teal-600 bg-teal-50 dark:border-teal-400 dark:bg-teal-500/10"
                              : "border-orange-500 bg-orange-50 dark:border-orange-400 dark:bg-orange-500/10"
                          : "border-transparent",
                    ].join(" ")
                    const stopEndTime =
                      point.pointType === "stop" && typeof point.stopEndTime === "number"
                        ? point.stopEndTime
                        : null
                    const timestampEndTime =
                      point.pointType === "flight" && landingPoint
                        ? landingPoint.time
                        : stopEndTime
                    const timestampStartLabel = point.pointType === "flight" ? "flight takeoff" : "stop start"
                    const timestampEndLabel = point.pointType === "flight" ? "flight landing" : "stop end"
                    const timestampRange =
                      point.pointType === "flight" && landingPoint
                        ? `${formatDuration(point.time)}-${formatDuration(landingPoint.time)}`
                        : stopEndTime !== null
                          ? `${formatDuration(point.time)}-${formatDuration(stopEndTime)}`
                          : formatDuration(point.time)
                    const timestampDescription =
                      point.pointType === "flight"
                        ? landingPoint
                          ? `Flight ${getFlightAirportCode(point)} -> ${getFlightAirportCode(landingPoint)} · Landed at ${
                              landingPoint.description.trim() || getFlightAirportCode(landingPoint)
                            }`
                          : `Flight in progress from ${getFlightAirportCode(point)}`
                        : point.pointType === "stop"
                          ? timestampName || getDraftLocation("stop", point.time, pointNumber)
                          : `${timestampName ? `${timestampName} - ` : ""}${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`

                    return (
                      <Fragment key={row.key}>
                        <div className={rowClassName}>
                          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_2rem_2rem] items-center gap-2 px-2 py-2.5">
                          <div className="grid min-w-0 grid-cols-[1.5rem_auto_minmax(0,1fr)] items-center gap-2">
                            <button
                              type="button"
                              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold leading-none text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${getTimestampAccentClass(point.pointType)}`}
                              aria-label={`Play timestamp ${pointNumber} from ${formatDuration(point.time)}`}
                              onClick={() => playFromTimestamp(point.time)}
                            >
                              {pointNumber}
                            </button>

                            {timestampEndTime !== null ? (
                              <div
                                className="flex items-center gap-0.5"
                                role="group"
                                aria-label={`${point.pointType === "flight" ? "Flight" : "Stop"} timestamp ${pointNumber}`}
                              >
                                <button
                                  type="button"
                                  className={`whitespace-nowrap rounded-md px-1.5 py-1 text-sm font-semibold transition-colors hover:bg-blue-100 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:hover:bg-blue-500/15 dark:hover:text-blue-200 ${
                                    isCurrentTimestamp
                                      ? "bg-blue-600 text-white dark:bg-blue-500 dark:text-white"
                                      : "text-slate-950 dark:text-zinc-100"
                                  }`}
                                  aria-label={`Play ${timestampStartLabel} at ${formatDuration(point.time)}`}
                                  title={`Play from ${timestampStartLabel}`}
                                  onClick={() => playFromTimestamp(point.time)}
                                >
                                  {formatDuration(point.time)}
                                </button>
                                <span className="text-xs text-slate-400 dark:text-zinc-500" aria-hidden="true">
                                  –
                                </span>
                                <button
                                  type="button"
                                  className={`whitespace-nowrap rounded-md px-1.5 py-1 text-sm font-semibold transition-colors hover:bg-blue-100 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:hover:bg-blue-500/15 dark:hover:text-blue-200 ${
                                    isCurrentTimestamp
                                      ? "bg-blue-600 text-white dark:bg-blue-500 dark:text-white"
                                      : "text-slate-950 dark:text-zinc-100"
                                  }`}
                                  aria-label={`Play ${timestampEndLabel} at ${formatDuration(timestampEndTime)}`}
                                  title={`Play from ${timestampEndLabel}`}
                                  onClick={() => playFromTimestamp(timestampEndTime)}
                                >
                                  {formatDuration(timestampEndTime)}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className={`whitespace-nowrap rounded-md px-1.5 py-1 text-sm font-semibold transition-colors hover:bg-blue-100 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:hover:bg-blue-500/15 dark:hover:text-blue-200 ${
                                  isCurrentTimestamp
                                    ? "bg-blue-600 text-white dark:bg-blue-500 dark:text-white"
                                    : "text-slate-950 dark:text-zinc-100"
                                }`}
                                aria-label={`Play timestamp ${pointNumber} from ${formatDuration(point.time)}`}
                                onClick={() => playFromTimestamp(point.time)}
                              >
                                {timestampRange}
                              </button>
                            )}

                            <button
                              type="button"
                              className="min-w-0 truncate rounded-sm text-left text-xs text-slate-500 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:text-zinc-400 dark:hover:text-zinc-100"
                              aria-label={`Play timestamp ${pointNumber} from ${formatDuration(point.time)}`}
                              onClick={() => playFromTimestamp(point.time)}
                            >
                              {timestampDescription}
                            </button>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:text-blue-300 dark:hover:bg-blue-500/10 dark:hover:text-blue-200"
                            aria-label={`Edit timestamp ${pointNumber}`}
                            onClick={() => beginEditPoint(point, landingPoint)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-300 dark:hover:bg-red-500/10 dark:hover:text-red-200"
                            aria-label={`Delete timestamp ${pointNumber}`}
                            onClick={() => deleteTimestampRow(row)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          </div>
                          {isSelected ? renderTimestampEditPanel() : null}
                        </div>
                        {travelSummary ? (
                          <div
                            role="note"
                            className="min-w-0 bg-slate-50/80 px-3 py-1 text-center text-[10px] leading-4 text-slate-500 dark:bg-white/[0.025] dark:text-zinc-500"
                          >
                            <span className="block truncate">{travelSummary}</span>
                          </div>
                        ) : null}
                      </Fragment>
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

      <section className="relative min-h-[620px] min-w-0 overflow-hidden bg-slate-100 xl:h-full xl:min-h-0">
        <MapboxLocationPicker
          value={
            activeDraftMapPoint?.lat === null || activeDraftMapPoint?.lng === null || !activeDraftMapPoint
              ? null
              : { lat: activeDraftMapPoint.lat, lng: activeDraftMapPoint.lng }
          }
          points={sortedPoints}
          onChange={(location) => {
            if (isPlacingFlightOnMap) {
              saveFlightPointFromMap(location)
              return
            }

            if (draftPoint?.id && draftPoint.pointType === "flight" && draftFlightLandingPoint?.id) {
              placeDraftFlightEndpoint(location)
              return
            }

            if (isPlacingSavedPlace) {
              markSavedPlaceLocation(location)
              return
            }

            savePointFromMap(location)
          }}
          activePointNumber={activePointNumber}
          activePointType={draftPoint?.pointType}
          tripRoute={tripRoute}
          routeShapes={routeShapes}
          routeProgressTime={currentTime}
          liveRouteProgressTimeRef={currentTimeRef}
          isPlaying={isPlaying}
          isPlacementEnabled={isAwaitingMapPlacement || isPlacingSavedPlace || isPlacingFlightOnMap}
          placementSessionKey={
            isPlacingFlightOnMap
              ? `flight:${flightAirportPrompt?.role ?? "none"}:${flightAirportPrompt?.timestamp ?? 0}`
              : draftPoint?.id && draftPoint.pointType === "flight" && draftFlightLandingPoint?.id
                ? `flight-edit:${draftPoint.id}:${activeFlightEditEndpoint}`
                : null
          }
          isRouteShapingDisabled={isAwaitingMapPlacement || isPlacingSavedPlace || isPlacingFlightOnMap}
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
      <SplitViewResizer
        containerRef={splitViewRef}
        defaultValue={editorDefaultSplitPercent}
        min={30}
        max={50}
        label="Resize editor video and map panels"
        className="hidden xl:flex"
      />
      </div>
    </>
  )
}
