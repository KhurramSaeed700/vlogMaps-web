interface YTPlayerInstance {
  destroy: () => void
  getDuration: () => number
}

interface YTEvent {
  target: YTPlayerInstance
}

interface YTNamespace {
  Player: new (
    element: HTMLDivElement,
    options: {
      videoId: string
      height?: string
      width?: string
      playerVars?: Record<string, number | string>
      events?: {
        onReady?: (event: YTEvent) => void
      }
    },
  ) => YTPlayerInstance
}

type YouTubeWindow = Window &
  typeof globalThis & {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }

let youtubeApiLoader: Promise<YTNamespace> | null = null

function getYouTubeWindow() {
  return window as YouTubeWindow
}

export function loadYouTubeIframeApi() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube iframe API can only load in the browser."))
  }

  const youtubeWindow = getYouTubeWindow()
  if (youtubeWindow.YT?.Player) {
    return Promise.resolve(youtubeWindow.YT)
  }

  if (!youtubeApiLoader) {
    youtubeApiLoader = new Promise<YTNamespace>((resolve) => {
      const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]')

      const previousReadyCallback = youtubeWindow.onYouTubeIframeAPIReady
      youtubeWindow.onYouTubeIframeAPIReady = () => {
        previousReadyCallback?.()
        if (youtubeWindow.YT) {
          resolve(youtubeWindow.YT)
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

export async function resolveYouTubeDuration(videoId: string, timeoutMs = 9000) {
  const YT = await loadYouTubeIframeApi()
  const container = document.createElement("div")
  container.style.position = "fixed"
  container.style.left = "-9999px"
  container.style.top = "0"
  container.style.width = "1px"
  container.style.height = "1px"
  container.style.pointerEvents = "none"
  container.setAttribute("aria-hidden", "true")
  document.body.appendChild(container)

  let player: YTPlayerInstance | null = null
  let pollTimeout: ReturnType<typeof setTimeout> | null = null
  let timeout: ReturnType<typeof setTimeout> | null = null

  const cleanup = () => {
    if (pollTimeout) {
      clearTimeout(pollTimeout)
    }
    if (timeout) {
      clearTimeout(timeout)
    }
    player?.destroy()
    container.remove()
  }

  return new Promise<number | null>((resolve) => {
    const finish = (duration: number | null) => {
      cleanup()
      resolve(duration)
    }

    const readDuration = () => {
      const duration = player?.getDuration() ?? 0
      if (Number.isFinite(duration) && duration > 0) {
        finish(Math.floor(duration))
        return
      }

      pollTimeout = setTimeout(readDuration, 250)
    }

    timeout = setTimeout(() => finish(null), timeoutMs)

    player = new YT.Player(container, {
      videoId,
      height: "1",
      width: "1",
      playerVars: {
        controls: 0,
        disablekb: 1,
        playsinline: 1,
        rel: 0,
      },
      events: {
        onReady: readDuration,
      },
    })
  })
}
