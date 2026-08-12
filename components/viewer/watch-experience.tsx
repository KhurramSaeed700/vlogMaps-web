"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import Image from "next/image"
import Link from "next/link"
import { ArrowLeft, Pencil, RotateCcw, Settings, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SplitViewResizer } from "@/components/ui/split-view-resizer"
import { MapboxTravelMap } from "@/components/maps/mapbox-travel-map"
import { AutoplayCountdown, autoplayCountdownSeconds } from "@/components/media/autoplay-countdown"
import { YouTubePlayer } from "@/components/media/youtube-player"
import { NavigationSettingsSection } from "@/components/settings/navigation-settings-section"
import { PlaybackSettingsSection } from "@/components/settings/playback-settings-section"
import { formatDuration, type TravelVideo } from "@/lib/demo-data"
import { getFlightRouteKeyframes } from "@/lib/flight-path"
import { getInterpolatedPointAtTime, loadCreatorPoints, type CreatorMapPoint } from "@/lib/creator-points"
import { loadCreatorRouteShapes, type CreatorRouteShapes } from "@/lib/creator-route-shapes"
import { useNavigationPreferences } from "@/lib/use-navigation-preferences"
import { usePlaybackPreferences } from "@/lib/use-playback-preferences"
import type { HydratedTravelVideo } from "@/lib/youtube-client"

interface WatchExperienceProps {
  video: TravelVideo | HydratedTravelVideo
  recommendedVideos?: TravelVideo[]
  viewerCanEdit?: boolean
  editHref?: string | null
}

const watchTimeRenderStepSeconds = 0.25
const emptyRecommendedVideos: TravelVideo[] = []

function getActiveTimestampIndex(points: CreatorMapPoint[], currentTime: number) {
  if (points.length === 0 || currentTime < points[0].time) {
    return -1
  }

  let low = 0
  let high = points.length - 1
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (points[middle].time <= currentTime) {
      low = middle
    } else {
      high = middle - 1
    }
  }

  return low
}

function getWatchTimestampLabel(point: CreatorMapPoint) {
  const location = point.location.trim()
  const description = point.description.trim()
  return location || description || `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`
}

function getWatchTimestampTypeLabel(point: CreatorMapPoint) {
  if (point.pointType === "flight") {
    return point.flightPhase === "landing" ? "Flight landing" : "Flight takeoff"
  }

  return point.pointType === "stop" ? "Stop" : "Point"
}

function getWatchTimestampTheme(point: CreatorMapPoint) {
  if (point.pointType === "flight") {
    return {
      marker: "bg-sky-500 ring-sky-300/25",
      badge: "border-sky-400/20 bg-sky-400/10 text-sky-300",
    }
  }

  if (point.pointType === "stop") {
    return {
      marker: "bg-teal-500 ring-teal-300/25",
      badge: "border-teal-400/20 bg-teal-400/10 text-teal-300",
    }
  }

  return {
    marker: "bg-orange-500 ring-orange-300/25",
    badge: "border-orange-400/20 bg-orange-400/10 text-orange-300",
  }
}

const WatchTimestampList = memo(function WatchTimestampList({
  points,
  activeIndex,
  onSelect,
}: {
  points: CreatorMapPoint[]
  activeIndex: number
  onSelect: (time: number) => void
}) {
  return (
    <section
      aria-label="Video timestamps"
      className="flex min-h-0 max-h-[38dvh] flex-col border-t border-white/10 bg-[linear-gradient(180deg,#09090b_0%,#050506_100%)] lg:max-h-none lg:flex-1"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 pb-12">
        {points.length > 0 ? (
          points.map((point, index) => {
            const isActive = index === activeIndex
            const theme = getWatchTimestampTheme(point)
            const timeLabel =
              point.pointType === "stop" &&
              typeof point.stopEndTime === "number" &&
              point.stopEndTime > point.time
                ? `${formatDuration(point.time)}–${formatDuration(point.stopEndTime)}`
                : formatDuration(point.time)

            return (
              <button
                key={point.id}
                type="button"
                aria-current={isActive ? "true" : undefined}
                aria-label={`Play timestamp ${index + 1}, ${getWatchTimestampLabel(point)}, at ${formatDuration(point.time)}`}
                onClick={() => onSelect(point.time)}
                className={`group relative mb-1 grid min-h-9 w-full scroll-mb-12 grid-cols-[1.5rem_minmax(5.25rem,auto)_minmax(0,1fr)_auto] items-center gap-x-2 overflow-hidden rounded-lg border px-2 py-1.5 text-left shadow-sm transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                  isActive
                    ? "border-blue-400/30 bg-[linear-gradient(90deg,rgba(37,99,235,0.2),rgba(30,41,59,0.46))] shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
                    : "border-white/[0.065] bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.06]"
                }`}
              >
                {isActive ? (
                  <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-r-full bg-blue-400" aria-hidden="true" />
                ) : null}
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white ring-[3px] ${theme.marker}`}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className={`whitespace-nowrap text-[11px] font-semibold tabular-nums ${isActive ? "text-blue-100" : "text-white/90"}`}>
                  {timeLabel}
                </span>
                <span className={`min-w-0 truncate text-[11px] font-medium ${isActive ? "text-white" : "text-white/75 group-hover:text-white/95"}`}>
                  {getWatchTimestampLabel(point)}
                </span>
                <span className={`inline-flex rounded-full border px-1.5 py-px text-[7px] font-semibold uppercase tracking-[0.1em] ${theme.badge}`}>
                  {getWatchTimestampTypeLabel(point)}
                </span>
              </button>
            )
          })
        ) : (
          <p className="px-4 py-6 text-center text-xs text-white/45">No timestamps have been added yet.</p>
        )}
      </div>
    </section>
  )
})

function WatchRecommendations({
  videos,
  onReplay,
}: {
  videos: TravelVideo[]
  onReplay: () => void
}) {
  const visibleVideos = videos.slice(0, 4)

  return (
    <section
      aria-label="Recommended videos"
      className="absolute inset-0 z-20 overflow-y-auto bg-[radial-gradient(circle_at_50%_0%,rgba(249,115,22,0.18),transparent_42%),linear-gradient(180deg,rgba(3,7,18,0.99),#000)] p-3 text-white sm:p-4"
    >
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center">
        <div className="mb-2.5 flex items-center justify-between gap-3 sm:mb-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-300/80 sm:text-xs">
              Journey complete
            </p>
            <h2 className="text-base font-semibold sm:text-lg">Watch next</h2>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReplay}
            className="h-8 shrink-0 gap-1.5 border-white/20 bg-black/30 px-2.5 text-xs text-white hover:bg-white/15 hover:text-white sm:h-9 sm:px-3"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Replay
          </Button>
        </div>

        {visibleVideos.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {visibleVideos.map((recommendedVideo) => (
              <Link
                key={recommendedVideo.id}
                href={`/watch/${recommendedVideo.id}`}
                className="group min-w-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.06] text-left transition hover:border-white/25 hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              >
                <div className="relative aspect-video overflow-hidden bg-slate-900">
                  <Image
                    src={recommendedVideo.thumbnail || "/placeholder.svg"}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 22vw, 50vw"
                    className="object-cover transition duration-300 group-hover:scale-[1.03]"
                  />
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-medium sm:text-[10px]">
                    {formatDuration(recommendedVideo.durationSeconds)}
                  </span>
                </div>
                <div className="p-2 sm:p-2.5">
                  <h3 className="line-clamp-1 text-[11px] font-semibold leading-4 sm:text-xs">
                    {recommendedVideo.title}
                  </h3>
                  <p className="mt-0.5 truncate text-[9px] text-white/55 sm:text-[10px]">
                    {recommendedVideo.creator}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.05] p-5 text-center">
            <p className="text-sm text-white/65">No more journeys are available yet.</p>
            <Link
              href="/"
              className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-orange-600 px-4 text-xs font-semibold text-white transition hover:bg-orange-500"
            >
              Browse journeys
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}

export function WatchExperience({
  video,
  recommendedVideos = emptyRecommendedVideos,
  viewerCanEdit = false,
  editHref = null,
}: WatchExperienceProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const splitViewRef = useRef<HTMLDivElement>(null)
  const feedbackTimeoutRef = useRef<number | null>(null)
  const currentTimeRef = useRef(0)
  const renderedCurrentTimeRef = useRef(0)
  const [routePoints, setRoutePoints] = useState<CreatorMapPoint[]>(() => loadCreatorPoints(video.id, video.keyframes))
  const [routeShapes, setRouteShapes] = useState<CreatorRouteShapes>(() => video.routeShapes ?? loadCreatorRouteShapes(video.id))
  const [isPlaying, setIsPlaying] = useState(false)
  const [autoplayCountdown, setAutoplayCountdown] = useState<number | null>(autoplayCountdownSeconds)
  const [hasEnded, setHasEnded] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [seekRequest, setSeekRequest] = useState<{ id: number; time: number } | null>(null)
  const [isSharing, setIsSharing] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const { preferences: navigationPreferences, updatePreferences: updateNavigationPreferences } =
    useNavigationPreferences()
  const { preferences: playbackPreferences, updatePreferences: updatePlaybackPreferences } =
    usePlaybackPreferences()
  const handleVolumeChange = useCallback((volume: number) => {
    updatePlaybackPreferences({ volume })
  }, [updatePlaybackPreferences])

  useEffect(() => {
    setRoutePoints(loadCreatorPoints(video.id, video.keyframes))
    setRouteShapes(video.routeShapes ?? loadCreatorRouteShapes(video.id))
    currentTimeRef.current = 0
    renderedCurrentTimeRef.current = 0
    setCurrentTime(0)
    setSeekRequest(null)
    setHasEnded(false)
    setIsPlaying(false)
    setAutoplayCountdown(autoplayCountdownSeconds)
  }, [video.id, video.keyframes, video.routeShapes])

  useEffect(() => {
    if (autoplayCountdown === null) {
      return
    }

    const timer = window.setTimeout(() => {
      if (autoplayCountdown <= 1) {
        setAutoplayCountdown(null)
        setIsPlaying(true)
        return
      }

      setAutoplayCountdown(autoplayCountdown - 1)
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [autoplayCountdown])

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

  const mapRoutePoints = useMemo(() => getFlightRouteKeyframes(routePoints), [routePoints])
  const currentLocation = useMemo(() => {
    return getInterpolatedPointAtTime(mapRoutePoints, currentTime)
  }, [currentTime, mapRoutePoints])
  const activeTimestampIndex = useMemo(
    () => getActiveTimestampIndex(routePoints, currentTime),
    [currentTime, routePoints],
  )

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

  const jumpToKeyframe = useCallback((time: number) => {
    setAutoplayCountdown(null)
    setHasEnded(false)
    commitCurrentTime(time, true)
    setSeekRequest((currentRequest) => ({
      id: (currentRequest?.id ?? 0) + 1,
      time,
    }))
    setIsPlaying(true)
  }, [commitCurrentTime])

  const handlePlayingChange = useCallback((nextIsPlaying: boolean) => {
    if (nextIsPlaying) {
      setAutoplayCountdown(null)
    }
    setIsPlaying(nextIsPlaying)
    if (nextIsPlaying) {
      setHasEnded(false)
    }
  }, [])

  const handleVideoEnded = useCallback(() => {
    setAutoplayCountdown(null)
    setIsPlaying(false)
    setHasEnded(true)
  }, [])

  const replayVideo = useCallback(() => {
    setAutoplayCountdown(null)
    setHasEnded(false)
    commitCurrentTime(0, true)
    setSeekRequest((currentRequest) => ({
      id: (currentRequest?.id ?? 0) + 1,
      time: 0,
    }))
    setIsPlaying(true)
  }, [commitCurrentTime])

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
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Open navigation settings"
                  title="Navigation settings"
                  className="h-9 w-9 text-white hover:bg-white/20 sm:h-10 sm:w-10 [&_svg]:size-5"
                >
                  <Settings className="h-5 w-5" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="z-[70] max-h-[calc(100dvh-4rem)] w-[min(calc(100vw-2rem),20rem)] overflow-y-auto rounded-lg border border-white/15 bg-slate-950 p-2 text-white shadow-2xl"
                >
                  <div className="px-2.5 pb-2 pt-1">
                    <p className="text-sm font-semibold text-white">Navigation settings</p>
                    <p className="mt-0.5 text-xs text-white/55">Control how the map returns to your journey.</p>
                  </div>
                  <NavigationSettingsSection
                    preferences={navigationPreferences}
                    onChange={updateNavigationPreferences}
                    tone="dark"
                  />
                  <DropdownMenu.Separator className="my-2 h-px bg-white/10" />
                  <PlaybackSettingsSection
                    preferences={playbackPreferences}
                    onChange={updatePlaybackPreferences}
                    tone="dark"
                  />
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
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

      <div
        ref={splitViewRef}
        className="relative flex min-h-0 w-full flex-1 flex-col lg:grid"
        style={{
          "--split-view-left": "50%",
          gridTemplateColumns: "minmax(0, var(--split-view-left)) minmax(0, 1fr)",
        } as CSSProperties}
      >
        <div className="relative z-10 flex min-h-0 shrink-0 flex-col overflow-hidden bg-black lg:h-full">
          <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-gray-950">
            <YouTubePlayer
              videoId={video.youtubeId}
              currentTime={currentTime}
              seekToTime={seekRequest?.time}
              seekRequestId={seekRequest?.id}
              isPlaying={isPlaying}
              volume={playbackPreferences.volume}
              isMuted={false}
              showControls
              allowWatchKeyboardControls
              onTimeChange={commitCurrentTime}
              onPlayingChange={handlePlayingChange}
              onVolumeChange={handleVolumeChange}
              onEnded={handleVideoEnded}
            />
            <AutoplayCountdown seconds={autoplayCountdown} />
            {hasEnded ? (
              <WatchRecommendations videos={recommendedVideos} onReplay={replayVideo} />
            ) : null}
          </div>
          <WatchTimestampList
            points={routePoints}
            activeIndex={activeTimestampIndex}
            onSelect={jumpToKeyframe}
          />
        </div>

        <div className="relative z-0 min-h-0 flex-1 overflow-hidden lg:h-full">
          <MapboxTravelMap
            keyframes={mapRoutePoints}
            markerKeyframes={routePoints}
            routeShapes={routeShapes}
            currentKeyframe={currentLocation}
            liveCurrentTimeRef={currentTimeRef}
            isPlaying={isPlaying}
            isJourneyComplete={hasEnded}
            followZoomPreferenceKey={video.id}
            autoResumeTracking={navigationPreferences.autoResumeTracking}
            trackingResumeDelayMs={navigationPreferences.resumeDelaySeconds * 1000}
            onLocationClick={(keyframe) => jumpToKeyframe(keyframe.time)}
            className="h-full w-full"
          />
        </div>

        <SplitViewResizer
          containerRef={splitViewRef}
          defaultValue={50}
          min={35}
          max={65}
          label="Resize video and map panels"
          className="hidden lg:flex [&>span:first-child]:opacity-40 [&>span:last-child]:opacity-100"
        />
      </div>
    </div>
  )
}
