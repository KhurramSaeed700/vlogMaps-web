"use client"

import { useEffect, useRef } from "react"

interface YouTubePlayerProps {
  videoId: string
  currentTime: number
  isPlaying: boolean
  volume: number
  isMuted: boolean
  onReady?: (duration: number) => void
  onTimeChange?: (time: number) => void
  onPlayingChange?: (isPlaying: boolean) => void
}

interface YTPlayerInstance {
  destroy: () => void
  getCurrentTime: () => number
  getDuration: () => number
  mute: () => void
  pauseVideo: () => void
  playVideo: () => void
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void
  setVolume: (volume: number) => void
  unMute: () => void
}

interface YTEvent {
  data: number
  target: YTPlayerInstance
}

interface YTNamespace {
  Player: new (
    element: HTMLDivElement,
    options: {
      videoId: string
      playerVars?: Record<string, number | string>
      events?: {
        onReady?: (event: YTEvent) => void
        onStateChange?: (event: YTEvent) => void
      }
    },
  ) => YTPlayerInstance
  PlayerState: {
    PLAYING: number
    PAUSED: number
    ENDED: number
  }
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let youtubeApiLoader: Promise<YTNamespace> | null = null

function loadYouTubeApi() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API can only load in the browser."))
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT)
  }

  if (!youtubeApiLoader) {
    youtubeApiLoader = new Promise<YTNamespace>((resolve) => {
      const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]')

      window.onYouTubeIframeAPIReady = () => {
        if (window.YT) {
          resolve(window.YT)
        }
      }

      if (!existingScript) {
        const script = document.createElement("script")
        script.src = "https://www.youtube.com/iframe_api"
        document.body.appendChild(script)
      }
    })
  }

  return youtubeApiLoader
}

export function YouTubePlayer({
  videoId,
  currentTime,
  isPlaying,
  volume,
  isMuted,
  onReady,
  onTimeChange,
  onPlayingChange,
}: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayerInstance | null>(null)
  const progressIntervalRef = useRef<number | null>(null)
  const onReadyRef = useRef(onReady)
  const onTimeChangeRef = useRef(onTimeChange)
  const onPlayingChangeRef = useRef(onPlayingChange)

  useEffect(() => {
    onReadyRef.current = onReady
    onTimeChangeRef.current = onTimeChange
    onPlayingChangeRef.current = onPlayingChange
  }, [onReady, onPlayingChange, onTimeChange])

  useEffect(() => {
    let isMounted = true

    const clearProgressInterval = () => {
      if (progressIntervalRef.current !== null) {
        window.clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
    }

    const startProgressInterval = () => {
      clearProgressInterval()
      progressIntervalRef.current = window.setInterval(() => {
        const player = playerRef.current
        if (!player) {
          return
        }

        onTimeChangeRef.current?.(Math.floor(player.getCurrentTime()))
      }, 500)
    }

    loadYouTubeApi().then((YT) => {
      if (!containerRef.current || !isMounted) {
        return
      }

      const player = new YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          rel: 0,
        },
        events: {
          onReady: (event) => {
            playerRef.current = event.target
            event.target.setVolume(volume)
            if (isMuted) {
              event.target.mute()
            }
            onReadyRef.current?.(Math.floor(event.target.getDuration()))
            onTimeChangeRef.current?.(Math.floor(event.target.getCurrentTime()))
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              startProgressInterval()
              onPlayingChangeRef.current?.(true)
            }

            if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
              clearProgressInterval()
              onPlayingChangeRef.current?.(false)
              onTimeChangeRef.current?.(Math.floor(event.target.getCurrentTime()))
            }
          },
        },
      })

      playerRef.current = player
    })

    return () => {
      isMounted = false
      clearProgressInterval()
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [videoId])

  useEffect(() => {
    const player = playerRef.current
    if (!player) {
      return
    }

    const liveTime = player.getCurrentTime()
    if (Math.abs(liveTime - currentTime) > 1.5) {
      player.seekTo(currentTime, true)
    }
  }, [currentTime])

  useEffect(() => {
    const player = playerRef.current
    if (!player) {
      return
    }

    if (isPlaying) {
      player.playVideo()
      return
    }

    player.pauseVideo()
  }, [isPlaying])

  useEffect(() => {
    const player = playerRef.current
    if (!player) {
      return
    }

    player.setVolume(volume)
  }, [volume])

  useEffect(() => {
    const player = playerRef.current
    if (!player) {
      return
    }

    if (isMuted) {
      player.mute()
      return
    }

    player.unMute()
  }, [isMuted])

  return <div ref={containerRef} className="h-full w-full" />
}
