"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Heart,
  Layers,
  MapPin,
  Play,
  Settings,
  Share2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MapboxTravelMap } from "@/components/mapbox-travel-map"
import { YouTubePlayer } from "@/components/youtube-player"
import { formatDuration, type TravelVideo } from "@/lib/demo-data"
import { getInterpolatedPointAtTime, loadCreatorPoints, type CreatorMapPoint } from "@/lib/creator-points"
import type { HydratedTravelVideo } from "@/lib/youtube-client"

interface WatchExperienceProps {
  video: TravelVideo | HydratedTravelVideo
}

export function WatchExperience({ video }: WatchExperienceProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [routePoints, setRoutePoints] = useState<CreatorMapPoint[]>(() => loadCreatorPoints(video.id, video.keyframes))
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(video.durationSeconds)
  const [viewMode, setViewMode] = useState<"split" | "map-focus" | "video-focus">("split")

  useEffect(() => {
    setRoutePoints(loadCreatorPoints(video.id, video.keyframes))
  }, [video.id, video.keyframes])

  const currentLocation = useMemo(() => {
    return getInterpolatedPointAtTime(routePoints, currentTime)
  }, [currentTime, routePoints])
  const isMapVisible = viewMode !== "video-focus"

  const jumpToKeyframe = (time: number) => {
    setCurrentTime(time)
  }

  return (
    <div ref={wrapperRef} className="flex h-screen flex-col overflow-hidden bg-black text-white">
      <header className="absolute left-0 right-0 top-0 z-50 bg-black/80 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center">
            <Link href="/">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
              <Heart className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
              <Share2 className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="absolute right-4 top-20 z-40 flex flex-col gap-2">
        <Button
          variant={viewMode === "split" ? "default" : "secondary"}
          size="sm"
          onClick={() => setViewMode("split")}
          className="text-xs"
        >
          <Layers className="mr-1 h-4 w-4" />
          Split
        </Button>
        <Button
          variant={viewMode === "map-focus" ? "default" : "secondary"}
          size="sm"
          onClick={() => setViewMode("map-focus")}
          className="text-xs"
        >
          <MapPin className="mr-1 h-4 w-4" />
          Map
        </Button>
        <Button
          variant={viewMode === "video-focus" ? "default" : "secondary"}
          size="sm"
          onClick={() => setViewMode("video-focus")}
          className="text-xs"
        >
          <Play className="mr-1 h-4 w-4" />
          Video
        </Button>
      </div>

      <div className="flex h-full min-h-0 flex-1 pt-20">
        <div
          className={`relative bg-black ${
            viewMode === "split" ? "w-1/2" : viewMode === "video-focus" ? "w-full" : "w-80"
          } ${viewMode === "map-focus" ? "absolute right-4 top-20 z-30 h-56 rounded-xl shadow-2xl md:w-96" : "h-full min-h-0"}`}
        >
          <div className="relative h-full w-full overflow-hidden bg-gray-950">
            <YouTubePlayer
              videoId={video.youtubeId}
              currentTime={currentTime}
              isPlaying={isPlaying}
              volume={75}
              isMuted={false}
              showControls
              allowKeyboard
              onReady={(nextDuration) => setDuration(nextDuration || video.durationSeconds)}
              onTimeChange={(time) => setCurrentTime(time)}
              onPlayingChange={setIsPlaying}
            />

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

            <div className="pointer-events-none absolute inset-x-4 bottom-4 flex items-end justify-between">
              <Badge variant="secondary" className="border-0 bg-black/55 text-white shadow-md backdrop-blur-sm">
                {currentLocation.location}
              </Badge>
              <Badge variant="secondary" className="border-0 bg-black/55 text-white shadow-md backdrop-blur-sm">
                {formatDuration(currentTime)} / {formatDuration(duration)}
              </Badge>
            </div>
          </div>
        </div>

        {isMapVisible ? (
          <div className={`relative min-h-0 ${viewMode === "split" ? "w-1/2" : "w-full"}`}>
            <MapboxTravelMap
              keyframes={routePoints}
              currentKeyframe={currentLocation}
              onLocationClick={(keyframe) => jumpToKeyframe(keyframe.time)}
              className="h-full w-full"
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
