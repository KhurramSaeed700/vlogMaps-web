"use client"

import { useEffect, useRef, useState } from "react"

interface YouTubePlayerProps {
  videoId: string
  currentTime: number
  seekToTime?: number | null
  seekRequestId?: number
  isPlaying: boolean
  volume: number
  isMuted: boolean
  autoPlay?: boolean
  showControls?: boolean
  allowKeyboard?: boolean
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

interface PendingSeek {
  targetTime: number
  shouldResume: boolean
  startedAt: number
}

interface SeekFeedback {
  direction: "backward" | "forward"
  label: string
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

function shouldIgnorePlayerShortcut(target: EventTarget | null) {
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

function clampVideoTime(time: number, duration: number) {
  const upperBound = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY
  return Math.min(Math.max(time, 0), upperBound)
}

export function YouTubePlayer({
  videoId,
  currentTime: _currentTime,
  seekToTime = null,
  seekRequestId,
  isPlaying,
  volume,
  isMuted,
  autoPlay = false,
  showControls = false,
  allowKeyboard = false,
  onReady,
  onTimeChange,
  onPlayingChange,
}: YouTubePlayerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [seekFeedback, setSeekFeedback] = useState<SeekFeedback | null>(null)
  const playerRef = useRef<YTPlayerInstance | null>(null)
  const progressIntervalRef = useRef<number | null>(null)
  const pauseCommitTimeoutRef = useRef<number | null>(null)
  const seekFeedbackTimeoutRef = useRef<number | null>(null)
  const seekHoldDelayTimeoutRef = useRef<number | null>(null)
  const seekHoldIntervalRef = useRef<number | null>(null)
  const activeSeekHoldKeyRef = useRef<"KeyJ" | "KeyL" | null>(null)
  const onReadyRef = useRef(onReady)
  const onTimeChangeRef = useRef(onTimeChange)
  const onPlayingChangeRef = useRef(onPlayingChange)
  const isPlayingRef = useRef(isPlaying)
  const isMutedRef = useRef(isMuted)
  const volumeRef = useRef(volume)
  const pendingSeekRef = useRef<PendingSeek | null>(null)
  const seekPollTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    if (!allowKeyboard) {
      return
    }

    let restoreFocusTimeout: number | null = null
    let attachedIframe: HTMLIFrameElement | null = null

    const restorePageFocus = () => {
      if (restoreFocusTimeout !== null) {
        window.clearTimeout(restoreFocusTimeout)
      }

      restoreFocusTimeout = window.setTimeout(() => {
        restoreFocusTimeout = null
        const iframe = wrapperRef.current?.querySelector("iframe")
        if (document.activeElement === iframe) {
          iframe?.blur()
          window.focus()
          wrapperRef.current?.focus()
        }
      }, 300)
    }

    const handleWindowBlur = () => {
      restoreFocusTimeout = window.setTimeout(() => {
        restoreFocusTimeout = null
        const iframe = wrapperRef.current?.querySelector("iframe")
        if (document.activeElement === iframe) {
          iframe?.blur()
          window.focus()
          wrapperRef.current?.focus()
        }
      }, 300)
    }

    const attachIframeFocusHandler = () => {
      const iframe = wrapperRef.current?.querySelector("iframe")
      if (iframe === attachedIframe) {
        return
      }

      attachedIframe?.removeEventListener("focus", restorePageFocus)
      attachedIframe = iframe ?? null
      attachedIframe?.addEventListener("focus", restorePageFocus)
    }

    attachIframeFocusHandler()
    const observer = new MutationObserver(attachIframeFocusHandler)
    if (wrapperRef.current) {
      observer.observe(wrapperRef.current, { childList: true, subtree: true })
    }

    window.addEventListener("blur", handleWindowBlur)

    return () => {
      if (restoreFocusTimeout !== null) {
        window.clearTimeout(restoreFocusTimeout)
      }

      attachedIframe?.removeEventListener("focus", restorePageFocus)
      observer.disconnect()
      window.removeEventListener("blur", handleWindowBlur)
    }
  }, [allowKeyboard])

  useEffect(() => {
    onReadyRef.current = onReady
    onTimeChangeRef.current = onTimeChange
    onPlayingChangeRef.current = onPlayingChange
    isPlayingRef.current = isPlaying
    isMutedRef.current = isMuted
    volumeRef.current = volume
  }, [isMuted, isPlaying, onReady, onPlayingChange, onTimeChange, volume])

  const clearProgressInterval = () => {
    if (progressIntervalRef.current !== null) {
      window.clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
  }

  const clearSeekPollTimeout = () => {
    if (seekPollTimeoutRef.current !== null) {
      window.clearTimeout(seekPollTimeoutRef.current)
      seekPollTimeoutRef.current = null
    }
  }

  const clearPauseCommitTimeout = () => {
    if (pauseCommitTimeoutRef.current !== null) {
      window.clearTimeout(pauseCommitTimeoutRef.current)
      pauseCommitTimeoutRef.current = null
    }
  }

  const clearSeekFeedbackTimeout = () => {
    if (seekFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(seekFeedbackTimeoutRef.current)
      seekFeedbackTimeoutRef.current = null
    }
  }

  const clearSeekHoldTimers = () => {
    if (seekHoldDelayTimeoutRef.current !== null) {
      window.clearTimeout(seekHoldDelayTimeoutRef.current)
      seekHoldDelayTimeoutRef.current = null
    }

    if (seekHoldIntervalRef.current !== null) {
      window.clearInterval(seekHoldIntervalRef.current)
      seekHoldIntervalRef.current = null
    }

    activeSeekHoldKeyRef.current = null
  }

  const showSeekFeedback = (direction: SeekFeedback["direction"]) => {
    clearSeekFeedbackTimeout()
    setSeekFeedback({
      direction,
      label: direction === "backward" ? "-10s" : "+10s",
    })
    seekFeedbackTimeoutRef.current = window.setTimeout(() => {
      seekFeedbackTimeoutRef.current = null
      setSeekFeedback(null)
    }, 750)
  }

  const emitCurrentTime = () => {
    const player = playerRef.current
    if (!player || pendingSeekRef.current) {
      return
    }

    onTimeChangeRef.current?.(player.getCurrentTime())
  }

  const startProgressInterval = () => {
    clearProgressInterval()
    progressIntervalRef.current = window.setInterval(() => {
      emitCurrentTime()
    }, 100)
  }

  const finishPendingSeek = (player: YTPlayerInstance) => {
    const pendingSeek = pendingSeekRef.current
    if (!pendingSeek) {
      return
    }

    pendingSeekRef.current = null
    clearSeekPollTimeout()
    clearPauseCommitTimeout()
    const liveTime = player.getCurrentTime()
    const reportedTime = Math.abs(liveTime - pendingSeek.targetTime) <= 0.75 ? liveTime : pendingSeek.targetTime
    onTimeChangeRef.current?.(reportedTime)

    if (pendingSeek.shouldResume && isPlayingRef.current) {
      if (Math.abs(liveTime - pendingSeek.targetTime) > 0.75) {
        player.seekTo(pendingSeek.targetTime, true)
      }
      player.playVideo()
      return
    }

    player.pauseVideo()
  }

  const waitForPendingSeek = (player: YTPlayerInstance) => {
    const pendingSeek = pendingSeekRef.current
    if (!pendingSeek) {
      return
    }

    const liveTime = player.getCurrentTime()
    const isAtTarget = Math.abs(liveTime - pendingSeek.targetTime) <= 0.75
    const hasWaitedLongEnough = window.performance.now() - pendingSeek.startedAt > 5000

    if (isAtTarget || hasWaitedLongEnough) {
      finishPendingSeek(player)
      return
    }

    clearSeekPollTimeout()
    seekPollTimeoutRef.current = window.setTimeout(() => waitForPendingSeek(player), 80)
  }

  const beginPendingSeek = (player: YTPlayerInstance, targetTime: number) => {
    clearProgressInterval()
    clearSeekPollTimeout()
    clearPauseCommitTimeout()
    pendingSeekRef.current = {
      targetTime,
      shouldResume: isPlayingRef.current,
      startedAt: window.performance.now(),
    }

    player.pauseVideo()
    player.seekTo(targetTime, true)
    waitForPendingSeek(player)
  }

  const seekByKeyboardOffset = (keyCode: "KeyJ" | "KeyL") => {
    const player = playerRef.current
    if (!player) {
      return
    }

    const pendingSeek = pendingSeekRef.current
    const currentTime = pendingSeek?.targetTime ?? player.getCurrentTime()
    const seekOffset = keyCode === "KeyJ" ? -10 : 10
    beginPendingSeek(player, clampVideoTime(currentTime + seekOffset, player.getDuration()))
    showSeekFeedback(keyCode === "KeyJ" ? "backward" : "forward")
  }

  useEffect(() => {
    if (!allowKeyboard) {
      return
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        !["KeyJ", "KeyK", "KeyL"].includes(event.code) ||
        event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        shouldIgnorePlayerShortcut(event.target)
      ) {
        return
      }

      event.preventDefault()

      if (event.code === "KeyJ" || event.code === "KeyL") {
        if (event.repeat || activeSeekHoldKeyRef.current === event.code) {
          return
        }

        const keyCode = event.code
        activeSeekHoldKeyRef.current = keyCode
        seekByKeyboardOffset(keyCode)
        seekHoldDelayTimeoutRef.current = window.setTimeout(() => {
          seekHoldDelayTimeoutRef.current = null
          seekHoldIntervalRef.current = window.setInterval(() => {
            seekByKeyboardOffset(keyCode)
          }, 220)
        }, 500)
        return
      }

      if (event.repeat) {
        return
      }

      const nextIsPlaying = !isPlayingRef.current
      onPlayingChangeRef.current?.(nextIsPlaying)

      const player = playerRef.current
      if (!player || pendingSeekRef.current) {
        return
      }

      if (nextIsPlaying) {
        player.playVideo()
        return
      }

      player.pauseVideo()
    }

    const handleKeyUp = (event: globalThis.KeyboardEvent) => {
      if (event.code === activeSeekHoldKeyRef.current) {
        clearSeekHoldTimers()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    document.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", clearSeekHoldTimers)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", clearSeekHoldTimers)
      clearSeekHoldTimers()
    }
  }, [allowKeyboard])

  useEffect(() => {
    let isMounted = true

    loadYouTubeApi().then((YT) => {
      if (!containerRef.current || !isMounted) {
        return
      }

      const player = new YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          controls: showControls ? 1 : 0,
          disablekb: allowKeyboard ? 0 : 1,
          autoplay: autoPlay ? 1 : 0,
          mute: isMuted ? 1 : 0,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (event) => {
            playerRef.current = event.target
            event.target.setVolume(volumeRef.current)
            if (isMutedRef.current) {
              event.target.mute()
            }
            onReadyRef.current?.(Math.floor(event.target.getDuration()))
            emitCurrentTime()
            if (autoPlay || isPlayingRef.current) {
              event.target.playVideo()
            }
          },
          onStateChange: (event) => {
            const pendingSeek = pendingSeekRef.current
            if (pendingSeek) {
              clearProgressInterval()
              clearPauseCommitTimeout()

              if (event.data === YT.PlayerState.PLAYING) {
                const liveTime = event.target.getCurrentTime()
                if (Math.abs(liveTime - pendingSeek.targetTime) <= 0.75) {
                  finishPendingSeek(event.target)
                  return
                }

                event.target.pauseVideo()
              }

              if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
                waitForPendingSeek(event.target)
              }

              return
            }

            if (event.data === YT.PlayerState.PLAYING) {
              clearPauseCommitTimeout()
              startProgressInterval()
              onPlayingChangeRef.current?.(true)
            }

            if (event.data === YT.PlayerState.ENDED) {
              clearProgressInterval()
              clearPauseCommitTimeout()
              onPlayingChangeRef.current?.(false)
              onTimeChangeRef.current?.(event.target.getCurrentTime())
            }

            if (event.data === YT.PlayerState.PAUSED) {
              clearProgressInterval()
              clearPauseCommitTimeout()
              pauseCommitTimeoutRef.current = window.setTimeout(() => {
                pauseCommitTimeoutRef.current = null
                if (!pendingSeekRef.current) {
                  onPlayingChangeRef.current?.(false)
                  onTimeChangeRef.current?.(event.target.getCurrentTime())
                }
              }, 250)
            }
          },
        },
      })

      playerRef.current = player
    })

    return () => {
      isMounted = false
      clearProgressInterval()
      clearSeekPollTimeout()
      clearPauseCommitTimeout()
      clearSeekFeedbackTimeout()
      clearSeekHoldTimers()
      pendingSeekRef.current = null
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [allowKeyboard, autoPlay, showControls, videoId])

  useEffect(() => {
    const player = playerRef.current
    if (!player || seekRequestId === undefined || seekToTime === null || seekToTime === undefined || !Number.isFinite(seekToTime)) {
      return
    }

    const liveTime = player.getCurrentTime()
    if (Math.abs(liveTime - seekToTime) > 0.75) {
      beginPendingSeek(player, seekToTime)
    }
  }, [seekRequestId, seekToTime])

  useEffect(() => {
    const player = playerRef.current
    if (!player) {
      return
    }

    if (pendingSeekRef.current) {
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

  return (
    <div ref={wrapperRef} tabIndex={-1} className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {seekFeedback && (
        <div
          aria-live="polite"
          className={`pointer-events-none absolute top-1/2 z-10 flex -translate-y-1/2 items-center rounded-full bg-black/65 px-4 py-2 text-sm font-semibold text-white shadow-lg ring-1 ring-white/15 backdrop-blur-sm ${
            seekFeedback.direction === "backward" ? "left-8" : "right-8"
          }`}
        >
          {seekFeedback.label}
        </div>
      )}
    </div>
  )
}
