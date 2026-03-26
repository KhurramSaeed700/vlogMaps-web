"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Heart,
  Layers,
  MapPin,
  Maximize,
  Minimize,
  Pause,
  Play,
  Settings,
  Share2,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { MapboxTravelMap } from "@/components/mapbox-travel-map"
import { YouTubePlayer } from "@/components/youtube-player"
import { formatCompactNumber, formatDuration, type TravelVideo } from "@/lib/demo-data"
import { getInterpolatedPointAtTime, loadCreatorPoints, sortCreatorPoints, type CreatorMapPoint } from "@/lib/creator-points"

interface WatchExperienceProps {
  video: TravelVideo
}

export function WatchExperience({ video }: WatchExperienceProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [routePoints, setRoutePoints] = useState<CreatorMapPoint[]>(() => loadCreatorPoints(video.id, video.keyframes))
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(video.durationSeconds)
  const [volume, setVolume] = useState(75)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewMode, setViewMode] = useState<"split" | "map-focus" | "video-focus">("split")

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === wrapperRef.current)
    }

    document.addEventListener("fullscreenchange", syncFullscreenState)
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState)
  }, [])

  useEffect(() => {
    setRoutePoints(loadCreatorPoints(video.id, video.keyframes))
  }, [video.id, video.keyframes])

  const currentLocation = useMemo(() => {
    return getInterpolatedPointAtTime(routePoints, currentTime)
  }, [currentTime, routePoints])

  const jumpBy = (seconds: number) => {
    setCurrentTime((prev) => Math.min(Math.max(prev + seconds, 0), duration))
  }

  const jumpToKeyframe = (time: number) => {
    setCurrentTime(time)
  }

  const toggleFullscreen = async () => {
    if (!wrapperRef.current) {
      return
    }

    if (document.fullscreenElement === wrapperRef.current) {
      await document.exitFullscreen()
      return
    }

    await wrapperRef.current.requestFullscreen()
  }

  return (
    <div ref={wrapperRef} className="min-h-screen bg-black text-white">
      <header className="absolute left-0 right-0 top-0 z-50 bg-black/80 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-semibold">{video.title}</h1>
              <p className="text-sm text-gray-300">
                by {video.creator} - {formatCompactNumber(video.views)} views - {formatCompactNumber(video.likes)} likes
              </p>
            </div>
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

      <div className="flex h-screen pt-20">
        <div
          className={`relative bg-black ${
            viewMode === "split" ? "w-1/2" : viewMode === "video-focus" ? "w-full" : "w-80"
          } ${viewMode === "map-focus" ? "absolute right-4 top-20 z-30 h-56 rounded-xl shadow-2xl md:w-96" : "h-full"}`}
        >
          <div className="relative h-full w-full overflow-hidden bg-gray-950">
            <YouTubePlayer
              videoId={video.youtubeId}
              currentTime={currentTime}
              isPlaying={isPlaying}
              volume={volume}
              isMuted={isMuted}
              onReady={(nextDuration) => setDuration(nextDuration || video.durationSeconds)}
              onTimeChange={(time) => setCurrentTime(time)}
              onPlayingChange={setIsPlaying}
            />

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

            <div className="absolute bottom-0 left-0 right-0 space-y-4 p-4">
              <div className="space-y-2">
                <Slider
                  value={[currentTime]}
                  max={duration}
                  step={1}
                  onValueChange={(value) => setCurrentTime(value[0])}
                  className="w-full [&>span:first-child]:h-1 [&>span:first-child]:bg-white/30 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:border-0 [&_[role=slider]]:bg-red-500 [&>span:first-child_span]:bg-red-500"
                />
                <div className="flex justify-between text-xs text-white">
                  <span>{formatDuration(currentTime)}</span>
                  <span>{formatDuration(duration)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsPlaying((prev) => !prev)}
                    className="text-white hover:bg-white/20"
                  >
                    {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                  </Button>

                  <Button variant="ghost" size="icon" onClick={() => jumpBy(-10)} className="text-white hover:bg-white/20">
                    <SkipBack className="h-5 w-5" />
                  </Button>

                  <Button variant="ghost" size="icon" onClick={() => jumpBy(10)} className="text-white hover:bg-white/20">
                    <SkipForward className="h-5 w-5" />
                  </Button>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsMuted((prev) => !prev)}
                      className="text-white hover:bg-white/20"
                    >
                      {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                    </Button>
                    <Slider
                      value={[isMuted ? 0 : volume]}
                      max={100}
                      step={1}
                      onValueChange={(value) => {
                        setIsMuted(value[0] === 0)
                        setVolume(value[0])
                      }}
                      className="w-20 [&>span:first-child]:h-1 [&>span:first-child]:bg-white/30 [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_[role=slider]]:border-0 [&_[role=slider]]:bg-white [&>span:first-child_span]:bg-white"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="border-0 bg-white/10 text-white">
                    {currentLocation.location}
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="text-white hover:bg-white/20">
                    {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`relative ${
            viewMode === "split" ? "w-1/2" : viewMode === "map-focus" ? "w-full" : "w-0 overflow-hidden"
          }`}
        >
          <MapboxTravelMap
            keyframes={routePoints}
            currentKeyframe={currentLocation}
            onLocationClick={(keyframe) => jumpToKeyframe(keyframe.time)}
            className="h-full w-full"
          />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-4 backdrop-blur-sm">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white">Journey points</p>
            <p className="text-xs text-gray-400">{video.description}</p>
          </div>
          <a
            href={video.creatorChannelUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-300 transition hover:text-blue-200"
          >
            Visit creator channel
          </a>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto">
          {sortCreatorPoints(routePoints).map((keyframe) => (
            <Button
              key={`${video.id}-${keyframe.time}`}
              variant={Math.abs(currentLocation.time - keyframe.time) < 2 ? "default" : "ghost"}
              size="sm"
              onClick={() => jumpToKeyframe(keyframe.time)}
              className="whitespace-nowrap text-xs"
            >
              <MapPin className="mr-1 h-3 w-3" />
              {keyframe.location}
              <span className="ml-2 text-xs opacity-70">{formatDuration(keyframe.time)}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
