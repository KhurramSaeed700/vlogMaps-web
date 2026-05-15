"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Share2 } from "lucide-react"
import { ThemeToggle } from "@/components/app-shell/theme-toggle"
import { Button } from "@/components/ui/button"
import { MapboxTravelMap } from "@/components/maps/mapbox-travel-map"
import { YouTubePlayer } from "@/components/media/youtube-player"
import type { TravelVideo } from "@/lib/demo-data"
import { getInterpolatedPointAtTime, loadCreatorPoints, type CreatorMapPoint } from "@/lib/creator-points"
import { loadCreatorRouteShapes, type CreatorRouteShapes } from "@/lib/creator-route-shapes"
import type { HydratedTravelVideo } from "@/lib/youtube-client"

interface WatchExperienceProps {
  video: TravelVideo | HydratedTravelVideo
}

export function WatchExperience({ video }: WatchExperienceProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const feedbackTimeoutRef = useRef<number | null>(null)
  const [routePoints, setRoutePoints] = useState<CreatorMapPoint[]>(() => loadCreatorPoints(video.id, video.keyframes))
  const [routeShapes, setRouteShapes] = useState<CreatorRouteShapes>(() => video.routeShapes ?? loadCreatorRouteShapes(video.id))
  const [isPlaying, setIsPlaying] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [seekRequest, setSeekRequest] = useState<{ id: number; time: number } | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  useEffect(() => {
    setRoutePoints(loadCreatorPoints(video.id, video.keyframes))
    setRouteShapes(video.routeShapes ?? loadCreatorRouteShapes(video.id))
    setCurrentTime(0)
    setSeekRequest(null)
  }, [video.id, video.keyframes, video.routeShapes])

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current !== null) {
        window.clearTimeout(feedbackTimeoutRef.current)
      }
    }
  }, [])

  const currentLocation = useMemo(() => {
    return getInterpolatedPointAtTime(routePoints, currentTime)
  }, [currentTime, routePoints])

  const showFeedback = (message: string) => {
    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current)
    }

    setFeedbackMessage(message)
    feedbackTimeoutRef.current = window.setTimeout(() => {
      feedbackTimeoutRef.current = null
      setFeedbackMessage(null)
    }, 1800)
  }

  const jumpToKeyframe = (time: number) => {
    setCurrentTime(time)
    setSeekRequest((currentRequest) => ({
      id: (currentRequest?.id ?? 0) + 1,
      time,
    }))
    setIsPlaying(true)
  }

  const shareVideo = async () => {
    if (isSharing || typeof window === "undefined") {
      return
    }

    const shareUrl = window.location.href
    const shareData = {
      title: `${video.title} | TravelMap`,
      text: `Watch ${video.title} on TravelMap.`,
      url: shareUrl,
    }

    setIsSharing(true)
    try {
      if (navigator.share) {
        await navigator.share(shareData)
        showFeedback("Shared")
        return
      }

      await navigator.clipboard.writeText(shareUrl)
      showFeedback("Link copied")
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return
      }

      showFeedback("Unable to share")
    } finally {
      setIsSharing(false)
    }
  }

  return (
    <div ref={wrapperRef} className="flex h-[100dvh] flex-col overflow-hidden bg-black text-white">
      <header className="absolute left-0 right-0 top-0 z-50 bg-black/75 p-2.5 backdrop-blur-sm sm:p-3 xl:p-4">
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center">
            <Link href="/">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Back to home"
                className="h-9 w-9 text-white hover:bg-white/20 sm:h-10 sm:w-10 [&_svg]:size-5"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <span className="ml-1.5 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70 sm:ml-2 sm:px-2.5 sm:py-1 sm:text-[11px]">
              Watch Page
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Share video"
              title="Share video"
              disabled={isSharing}
              className="h-9 w-9 text-white hover:bg-white/20 sm:h-10 sm:w-10 [&_svg]:size-5"
              onClick={shareVideo}
            >
              <Share2 className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {feedbackMessage && (
        <div
          role="status"
          className="absolute left-1/2 top-14 z-[60] -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-950 shadow-lg sm:top-16"
        >
          {feedbackMessage}
        </div>
      )}

      <div className="flex min-h-0 w-full flex-1 flex-col pt-14 sm:pt-16 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:pt-0 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="relative z-10 shrink-0 overflow-hidden bg-black lg:h-full lg:min-h-0">
          <div className="relative aspect-video w-full overflow-hidden bg-gray-950 lg:h-full lg:aspect-auto">
            <YouTubePlayer
              videoId={video.youtubeId}
              currentTime={currentTime}
              seekToTime={seekRequest?.time}
              seekRequestId={seekRequest?.id}
              isPlaying={isPlaying}
              volume={60}
              isMuted={false}
              autoPlay
              showControls
              allowWatchKeyboardControls
              onTimeChange={(time) => setCurrentTime(time)}
              onPlayingChange={setIsPlaying}
            />
          </div>
        </div>

        <div className="relative z-0 min-h-0 flex-1 overflow-hidden lg:h-full">
          <MapboxTravelMap
            keyframes={routePoints}
            routeShapes={routeShapes}
            currentKeyframe={currentLocation}
            isPlaying={isPlaying}
            followZoomPreferenceKey={video.id}
            onLocationClick={(keyframe) => jumpToKeyframe(keyframe.time)}
            className="h-full w-full"
          />
        </div>
      </div>
    </div>
  )
}
