"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Pencil, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MapboxTravelMap } from "@/components/maps/mapbox-travel-map"
import { YouTubePlayer } from "@/components/media/youtube-player"
import type { TravelVideo } from "@/lib/demo-data"
import { getInterpolatedPointAtTime, loadCreatorPoints, type CreatorMapPoint } from "@/lib/creator-points"
import { loadCreatorRouteShapes, type CreatorRouteShapes } from "@/lib/creator-route-shapes"
import type { HydratedTravelVideo } from "@/lib/youtube-client"

interface WatchExperienceProps {
  video: TravelVideo | HydratedTravelVideo
  viewerCanEdit?: boolean
  editHref?: string | null
}

const watchTimeRenderStepSeconds = 0.25

export function WatchExperience({ video, viewerCanEdit = false, editHref = null }: WatchExperienceProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const feedbackTimeoutRef = useRef<number | null>(null)
  const currentTimeRef = useRef(0)
  const renderedCurrentTimeRef = useRef(0)
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
    currentTimeRef.current = 0
    renderedCurrentTimeRef.current = 0
    setCurrentTime(0)
    setSeekRequest(null)
  }, [video.id, video.keyframes, video.routeShapes])

  const commitCurrentTime = useCallback((time: number, force = false) => {
    if (!Number.isFinite(time)) {
      return
    }

    currentTimeRef.current = time
    if (force || Math.abs(time - renderedCurrentTimeRef.current) >= watchTimeRenderStepSeconds) {
      renderedCurrentTimeRef.current = time
      setCurrentTime(time)
    }
  }, [])

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
    commitCurrentTime(time, true)
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
      <header className="relative z-50 shrink-0 bg-black/75 p-1.5 backdrop-blur-sm sm:p-2">
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
            {viewerCanEdit && editHref && (
              <Link href={editHref}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 px-2.5 text-white hover:bg-white/20 sm:h-10 sm:px-3"
                  aria-label="Edit this video"
                  title="Edit this video"
                >
                  <Pencil className="h-4 w-4" />
                  <span className="hidden text-xs font-semibold sm:inline">Edit</span>
                </Button>
              </Link>
            )}
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
          className="absolute left-1/2 top-12 z-[60] -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-950 shadow-lg sm:top-14"
        >
          {feedbackMessage}
        </div>
      )}

      <div className="flex min-h-0 w-full flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] 2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
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
              onTimeChange={commitCurrentTime}
              onPlayingChange={setIsPlaying}
            />
          </div>
        </div>

        <div className="relative z-0 min-h-0 flex-1 overflow-hidden lg:h-full">
          <MapboxTravelMap
            keyframes={routePoints}
            routeShapes={routeShapes}
            currentKeyframe={currentLocation}
            liveCurrentTimeRef={currentTimeRef}
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
