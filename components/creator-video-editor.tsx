"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Clock3, Crosshair, MapPin, Pause, Play, Save, SkipBack, SkipForward, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { MapboxLocationPicker } from "@/components/mapbox-location-picker"
import { YouTubePlayer } from "@/components/youtube-player"
import type { TravelVideo } from "@/lib/demo-data"
import { formatDuration } from "@/lib/demo-data"
import { loadCreatorPoints, saveCreatorPoints, sortCreatorPoints, type CreatorMapPoint, upsertCreatorPoint } from "@/lib/creator-points"
import { syncVideoRouteMetadata, updateLocalCreatorVideo } from "@/lib/creator-videos"

interface CreatorVideoEditorProps {
  video: TravelVideo
}

interface DraftPoint {
  id?: string
  time: number
  lat: number | null
  lng: number | null
  location: string
  description: string
}

function createDraftPoint(point?: CreatorMapPoint): DraftPoint {
  if (!point) {
    return {
      id: undefined,
      time: 0,
      lat: null,
      lng: null,
      location: "",
      description: "",
    }
  }

  return {
    id: point.id,
    time: point.time,
    lat: point.lat,
    lng: point.lng,
    location: point.location,
    description: point.description,
  }
}

export function CreatorVideoEditor({ video }: CreatorVideoEditorProps) {
  const [points, setPoints] = useState<CreatorMapPoint[]>(() => loadCreatorPoints(video.id, video.keyframes))
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(video.durationSeconds)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(75)
  const [isMuted, setIsMuted] = useState(false)
  const [saveMessage, setSaveMessage] = useState("Saved points are stored locally in this browser.")
  const [draftPoint, setDraftPoint] = useState<DraftPoint | null>(null)
  const [isAwaitingMapPlacement, setIsAwaitingMapPlacement] = useState(false)

  useEffect(() => {
    const nextPoints = loadCreatorPoints(video.id, video.keyframes)
    setPoints(nextPoints)
    setDraftPoint(null)
    setIsAwaitingMapPlacement(false)
    setCurrentTime(0)
    setDuration(video.durationSeconds)
    setIsPlaying(false)
  }, [video.id, video.keyframes])

  const sortedPoints = useMemo(() => sortCreatorPoints(points), [points])

  const persistPoints = (nextPoints: CreatorMapPoint[], message: string) => {
    setPoints(nextPoints)
    saveCreatorPoints(video.id, nextPoints)
    syncVideoRouteMetadata(
      video.id,
      nextPoints.map(({ id, ...point }) => point),
    )
    setSaveMessage(message)
  }

  const getSavedPointFromList = (nextPoints: CreatorMapPoint[], nextDraft: DraftPoint) => {
    if (nextDraft.id) {
      return nextPoints.find((point) => point.id === nextDraft.id) ?? null
    }

    return (
      nextPoints.find(
        (point) => point.time === nextDraft.time && point.lat === nextDraft.lat && point.lng === nextDraft.lng,
      ) ?? null
    )
  }

  const captureTimestamp = () => {
    setIsPlaying(false)
    setDraftPoint({
      id: undefined,
      time: currentTime,
      lat: null,
      lng: null,
      location: `Point at ${formatDuration(currentTime)}`,
      description: "Route point captured from the creator editor.",
    })
    setIsAwaitingMapPlacement(true)
    setSaveMessage("Timestamp captured. Move the map and click where the traveler is.")
  }

  const savePointFromMap = (value: { lat: number; lng: number }) => {
    if (!draftPoint) {
      setSaveMessage("Capture a timestamp or choose an existing point before pinning it on the map.")
      return
    }

    const nextDraft: DraftPoint = {
      ...draftPoint,
      lat: value.lat,
      lng: value.lng,
      location: draftPoint.location.trim() || `Point at ${formatDuration(draftPoint.time)}`,
      description: draftPoint.description.trim() || "Route point captured from the creator editor.",
    }

    const nextPoints = upsertCreatorPoint(video.id, points, {
      ...nextDraft,
      lat: value.lat,
      lng: value.lng,
      location: nextDraft.location,
      description: nextDraft.description,
    })

    persistPoints(nextPoints, `Saved ${formatDuration(nextDraft.time)} at ${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}.`)
    const savedPoint = getSavedPointFromList(nextPoints, nextDraft)
    setDraftPoint(savedPoint ? createDraftPoint(savedPoint) : nextDraft)
    setIsAwaitingMapPlacement(false)
  }

  const saveDraftDetails = () => {
    if (!draftPoint) {
      setSaveMessage("Capture a timestamp or select a saved point first.")
      return
    }

    if (draftPoint.lat === null || draftPoint.lng === null) {
      setSaveMessage("Pin this timestamp on the map before saving its details.")
      return
    }

    const nextPoints = upsertCreatorPoint(video.id, points, {
      ...draftPoint,
      lat: draftPoint.lat,
      lng: draftPoint.lng,
      location: draftPoint.location.trim() || `Stop at ${formatDuration(draftPoint.time)}`,
      description: draftPoint.description.trim() || "Route point captured from the creator editor.",
    })

    persistPoints(nextPoints, `Updated the details for ${formatDuration(draftPoint.time)}.`)
    const savedPoint = getSavedPointFromList(nextPoints, draftPoint)
    if (savedPoint) {
      setDraftPoint(createDraftPoint(savedPoint))
    }
    setIsAwaitingMapPlacement(false)
  }

  const editPoint = (point: CreatorMapPoint) => {
    setIsPlaying(false)
    setCurrentTime(point.time)
    setDraftPoint(createDraftPoint(point))
    setIsAwaitingMapPlacement(true)
    setSaveMessage(`Editing ${point.location}. Move the map and click to adjust its location, or update the details below.`)
  }

  const deletePoint = (id: string) => {
    const nextPoints = points.filter((point) => point.id !== id)
    persistPoints(nextPoints, `Deleted route point. ${nextPoints.length} point${nextPoints.length === 1 ? "" : "s"} remain.`)
    if (draftPoint?.id === id) {
      setDraftPoint(null)
      setIsAwaitingMapPlacement(false)
    }
  }

  const resetDraft = () => {
    setDraftPoint(null)
    setIsAwaitingMapPlacement(false)
    setSaveMessage("Selection cleared. Capture another moment whenever you're ready.")
  }

  const pendingPointLabel = draftPoint ? formatDuration(draftPoint.time) : null
  const selectedCoordinates =
    draftPoint?.lat === null || draftPoint?.lng === null || !draftPoint
      ? "Waiting for map pin"
      : `${draftPoint.lat.toFixed(5)}, ${draftPoint.lng.toFixed(5)}`

  const instructionTitle = draftPoint
    ? isAwaitingMapPlacement
      ? `Timestamp ${formatDuration(draftPoint.time)} is ready to pin.`
      : `Point ${formatDuration(draftPoint.time)} is selected.`
    : "Capture a moment from the video to start a new map point."

  const instructionBody = draftPoint
    ? isAwaitingMapPlacement
      ? "Pause is already handled for you. Move the map on the right, then click the exact location of the traveler."
      : "You can refine its title and notes here, or pick the point again on the map if it needs adjustment."
    : "Use the capture button below the player. That grabs the current timestamp, then the next click on the map saves its coordinates."

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(320px,1fr)_minmax(0,2fr)]">
      <div className="space-y-6">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-slate-950 text-white">
            <CardTitle className="line-clamp-2">{video.title}</CardTitle>
            <CardDescription className="text-slate-300">
              Keep the video on the left, capture the right moment, then pin it on the map.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="aspect-video overflow-hidden bg-black">
              <YouTubePlayer
                videoId={video.youtubeId}
                currentTime={currentTime}
                isPlaying={isPlaying}
                volume={volume}
                isMuted={isMuted}
                showControls
                allowKeyboard
                onReady={(nextDuration) => {
                  const resolvedDuration = nextDuration || video.durationSeconds
                  setDuration(resolvedDuration)
                  updateLocalCreatorVideo(video.id, { durationSeconds: resolvedDuration })
                }}
                onTimeChange={setCurrentTime}
                onPlayingChange={setIsPlaying}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Capture Controls</CardTitle>
            <CardDescription>
              Press capture to pause the video and lock in the current timestamp before placing it on the map.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <Slider value={[currentTime]} max={duration || 1} step={1} onValueChange={(value) => setCurrentTime(value[0])} />
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>{formatDuration(currentTime)}</span>
                <span>{formatDuration(duration)}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setIsPlaying((prev) => !prev)}>
                {isPlaying ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                {isPlaying ? "Pause" : "Play"}
              </Button>
              <Button variant="outline" onClick={() => setCurrentTime((prev) => Math.max(prev - 5, 0))}>
                <SkipBack className="mr-2 h-4 w-4" />
                Back 5s
              </Button>
              <Button variant="outline" onClick={() => setCurrentTime((prev) => Math.min(prev + 5, duration))}>
                <SkipForward className="mr-2 h-4 w-4" />
                Forward 5s
              </Button>
              <Button variant="secondary" onClick={captureTimestamp}>
                <Clock3 className="mr-2 h-4 w-4" />
                Capture Timestamp
              </Button>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>Volume</span>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={100}
                step={1}
                onValueChange={(value) => {
                  setVolume(value[0])
                  setIsMuted(value[0] === 0)
                }}
                className="w-40"
              />
            </div>

            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <Crosshair className="mt-0.5 h-5 w-5 text-orange-500" />
                <div className="space-y-1">
                  <p className="font-medium text-slate-900">{instructionTitle}</p>
                  <p className="text-sm text-slate-600">{instructionBody}</p>
                  <p className="text-xs text-slate-500">{saveMessage}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="timestamp">Selected Timestamp</Label>
                  <Input id="timestamp" value={draftPoint ? formatDuration(draftPoint.time) : "No point selected"} readOnly />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="coordinates">Coordinates</Label>
                  <Input id="coordinates" value={selectedCoordinates} readOnly />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="locationName">Location Label</Label>
                <Input
                  id="locationName"
                  value={draftPoint?.location ?? ""}
                  onChange={(event) =>
                    setDraftPoint((prev) => (prev ? { ...prev, location: event.target.value } : prev))
                  }
                  placeholder="e.g. Sharan Forest Checkpoint"
                  disabled={!draftPoint}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Notes</Label>
                <Textarea
                  id="description"
                  value={draftPoint?.description ?? ""}
                  onChange={(event) =>
                    setDraftPoint((prev) => (prev ? { ...prev, description: event.target.value } : prev))
                  }
                  placeholder="Add context for what is happening at this moment in the trip."
                  rows={3}
                  disabled={!draftPoint}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={saveDraftDetails} disabled={!draftPoint}>
                  <Save className="mr-2 h-4 w-4" />
                  Save Details
                </Button>
                <Button variant="outline" onClick={resetDraft} disabled={!draftPoint}>
                  Clear Selection
                </Button>
                <Link href={`/watch/${video.id}`}>
                  <Button variant="outline">
                    <MapPin className="mr-2 h-4 w-4" />
                    Preview Watch Experience
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Captured Timestamps</CardTitle>
            <CardDescription>
              Every saved point stays in local storage and powers the map route for this video.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {draftPoint && !draftPoint.id && (
                <div className="rounded-2xl border border-dashed border-orange-300 bg-orange-50 p-4">
                  <div className="flex items-center gap-2">
                    <Badge className="border-0 bg-orange-500 text-white">Pending</Badge>
                    <p className="font-medium text-slate-900">{formatDuration(draftPoint.time)}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">Move the map on the right and click the traveler&apos;s location to save the coordinates.</p>
                </div>
              )}

              {sortedPoints.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-6 text-sm text-slate-500">
                  No route points yet. Play the video, press <span className="font-medium text-slate-700">Capture Timestamp</span>, then
                  pin the moment on the map.
                </div>
              ) : (
                <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                  {sortedPoints.map((point, index) => {
                    const isSelected = draftPoint?.id === point.id

                    return (
                      <div
                        key={point.id}
                        className={`rounded-2xl border p-4 transition ${
                          isSelected ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white"
                        }`}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <button type="button" className="flex-1 text-left" onClick={() => editPoint(point)}>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">#{index + 1}</Badge>
                              <p className="font-medium text-slate-900">{point.location}</p>
                              <p className="text-xs text-slate-500">{formatDuration(point.time)}</p>
                            </div>
                            <p className="mt-2 text-sm text-slate-600">{point.description}</p>
                            <p className="mt-2 text-xs text-slate-500">
                              {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                            </p>
                          </button>

                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => editPoint(point)}>
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => deletePoint(point.id)}
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <Card className="overflow-hidden xl:sticky xl:top-24">
          <CardHeader className="border-b bg-slate-950 text-white">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>Map Capture</CardTitle>
                <CardDescription className="text-slate-300">
                  Satellite view is the default. Pan and zoom freely, then click the exact location for the captured moment.
                </CardDescription>
              </div>
              <Badge className="border-0 bg-white/15 text-white">
                {pendingPointLabel ? `Selected ${pendingPointLabel}` : "No timestamp selected"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <MapboxLocationPicker
              value={draftPoint?.lat === null || draftPoint?.lng === null || !draftPoint ? null : { lat: draftPoint.lat, lng: draftPoint.lng }}
              points={sortedPoints}
              onChange={savePointFromMap}
              className="min-h-[520px] h-[58vh] xl:h-[calc(100vh-14rem)]"
              isAwaitingPlacement={isAwaitingMapPlacement}
              selectedTimestampLabel={pendingPointLabel}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
