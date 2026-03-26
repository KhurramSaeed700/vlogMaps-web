"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Clock3, MapPin, Pause, Play, Plus, Save, SkipBack, SkipForward, Trash2 } from "lucide-react"
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
  const [saveMessage, setSaveMessage] = useState("Saved points are stored locally for this demo.")
  const [draftPoint, setDraftPoint] = useState<DraftPoint>(() => createDraftPoint(loadCreatorPoints(video.id, video.keyframes)[0]))

  useEffect(() => {
    const nextPoints = loadCreatorPoints(video.id, video.keyframes)
    setPoints(nextPoints)
    setDraftPoint(createDraftPoint(nextPoints[0]))
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

  const captureTimestamp = () => {
    setIsPlaying(false)
    setDraftPoint((prev) => ({
      ...prev,
      time: currentTime,
      location: prev.location || `Stop at ${formatDuration(currentTime)}`,
    }))
    setSaveMessage("Timestamp captured. Place the map marker and save the point.")
  }

  const saveDraftPoint = () => {
    if (draftPoint.lat === null || draftPoint.lng === null) {
      setSaveMessage("Pick a spot on the map before saving.")
      return
    }

    const lat = draftPoint.lat
    const lng = draftPoint.lng

    const nextPoints = upsertCreatorPoint(video.id, points, {
      ...draftPoint,
      lat,
      lng,
      location: draftPoint.location.trim() || `Stop at ${formatDuration(draftPoint.time)}`,
      description: draftPoint.description.trim() || "Route point captured from the creator dashboard.",
    })

    persistPoints(nextPoints, `Saved ${nextPoints.length} route point${nextPoints.length === 1 ? "" : "s"} for this video.`)
    const savedPoint = nextPoints.find((point) => point.time === draftPoint.time && point.lat === draftPoint.lat && point.lng === draftPoint.lng)
    if (savedPoint) {
      setDraftPoint(createDraftPoint(savedPoint))
    }
  }

  const editPoint = (point: CreatorMapPoint) => {
    setIsPlaying(false)
    setCurrentTime(point.time)
    setDraftPoint(createDraftPoint(point))
    setSaveMessage(`Editing ${point.location}. Adjust the timestamp, marker, or copy and save again.`)
  }

  const deletePoint = (id: string) => {
    const nextPoints = points.filter((point) => point.id !== id)
    persistPoints(nextPoints, `Deleted route point. ${nextPoints.length} point${nextPoints.length === 1 ? "" : "s"} remain.`)
    if (draftPoint.id === id && nextPoints[0]) {
      setDraftPoint(createDraftPoint(nextPoints[0]))
    } else if (draftPoint.id === id) {
      setDraftPoint(createDraftPoint())
    }
  }

  const resetDraft = () => {
    setDraftPoint({
      id: undefined,
      time: currentTime,
      lat: null,
      lng: null,
      location: "",
      description: "",
    })
    setSaveMessage("Started a fresh route point draft.")
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.9fr]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-gray-950 text-white">
            <CardTitle>{video.title}</CardTitle>
            <CardDescription className="text-gray-300">
              Pause, scrub, or jump through the video, then capture the right moment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="overflow-hidden rounded-2xl bg-black">
              <div className="aspect-video w-full">
                <YouTubePlayer
                  videoId={video.youtubeId}
                  currentTime={currentTime}
                  isPlaying={isPlaying}
                  volume={volume}
                  isMuted={isMuted}
                  onReady={(nextDuration) => {
                    const resolvedDuration = nextDuration || video.durationSeconds
                    setDuration(resolvedDuration)
                    updateLocalCreatorVideo(video.id, { durationSeconds: resolvedDuration })
                  }}
                  onTimeChange={setCurrentTime}
                  onPlayingChange={setIsPlaying}
                />
              </div>
            </div>

            <div className="space-y-3">
              <Slider value={[currentTime]} max={duration} step={1} onValueChange={(value) => setCurrentTime(value[0])} />
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>{formatDuration(currentTime)}</span>
                <span>{formatDuration(duration)}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
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
                Pause and Capture
              </Button>
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-500">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Route Point Editor</CardTitle>
            <CardDescription>
              Capture a timestamp, click the map to place the stop, then save it to the video route.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="timestamp">Timestamp</Label>
                <Input
                  id="timestamp"
                  value={formatDuration(draftPoint.time)}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value)
                    if (!Number.isNaN(nextValue)) {
                      setDraftPoint((prev) => ({ ...prev, time: nextValue }))
                    }
                  }}
                  readOnly
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="locationName">Location Name</Label>
                <Input
                  id="locationName"
                  value={draftPoint.location}
                  onChange={(event) => setDraftPoint((prev) => ({ ...prev, location: event.target.value }))}
                  placeholder="e.g. Times Square"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Notes</Label>
              <Textarea
                id="description"
                value={draftPoint.description}
                onChange={(event) => setDraftPoint((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Why this moment matters in the trip."
                rows={3}
              />
            </div>

            <div className="space-y-2 text-xs text-gray-500">
              <p>
                Coordinates:{" "}
                {draftPoint.lat === null || draftPoint.lng === null
                  ? "Pick a location on the map"
                  : `${draftPoint.lat.toFixed(4)}, ${draftPoint.lng.toFixed(4)}`}
              </p>
              <p>{saveMessage}</p>
            </div>

            <div className="h-72">
              <MapboxLocationPicker
                value={draftPoint.lat === null || draftPoint.lng === null ? null : { lat: draftPoint.lat, lng: draftPoint.lng }}
                points={sortedPoints}
                onChange={(value) => setDraftPoint((prev) => ({ ...prev, ...value }))}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={saveDraftPoint}>
                <Save className="mr-2 h-4 w-4" />
                Save Point
              </Button>
              <Button variant="outline" onClick={resetDraft}>
                <Plus className="mr-2 h-4 w-4" />
                New Point
              </Button>
              <Link href={`/watch/${video.id}`}>
                <Button variant="outline">
                  <MapPin className="mr-2 h-4 w-4" />
                  Preview Watch Experience
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saved Route Points</CardTitle>
          <CardDescription>
            These points are persisted in local storage for the signed-in creator and will drive the watch map.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sortedPoints.map((point, index) => (
              <div key={point.id} className="flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">#{index + 1}</Badge>
                    <p className="font-medium text-gray-900">{point.location}</p>
                    <p className="text-xs text-gray-500">{formatDuration(point.time)}</p>
                  </div>
                  <p className="text-sm text-gray-600">{point.description}</p>
                  <p className="text-xs text-gray-500">
                    {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => editPoint(point)}>
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => deletePoint(point.id)}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
