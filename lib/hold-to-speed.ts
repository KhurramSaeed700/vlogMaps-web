interface SpeedPlayer {
  getPlaybackRate?: () => number
  getAvailablePlaybackRates?: () => number[]
  setPlaybackRate?: (rate: number) => void
  playVideo: () => void
  pauseVideo: () => void
}

export function createHoldToSpeed({ getPlayer, isPlaying, onPlayingChange, onActiveChange, onTap, schedule, clear }: {
  getPlayer: () => SpeedPlayer | null
  isPlaying: () => boolean
  onPlayingChange: (playing: boolean) => void
  onActiveChange: (active: boolean) => void
  onTap: () => void
  schedule: (callback: () => void, delay: number) => number
  clear: (timer: number) => void
}) {
  let timer: number | null = null
  let down = false, held = false
  let activePlayer: SpeedPlayer | null = null
  let previousRate = 1, wasPlaying = false
  const end = (tap: boolean) => {
    if (!down) return
    down = false
    if (timer !== null) clear(timer)
    timer = null
    const player = activePlayer
    activePlayer = null
    if (player) {
      try { player.setPlaybackRate?.(previousRate) } catch { /* Player may have been destroyed. */ }
      if (!wasPlaying) {
        try { player.pauseVideo() } catch { /* Player may have been destroyed. */ }
        onPlayingChange(false)
      }
      onActiveChange(false)
    } else if (tap && !held) onTap()
    held = false
  }
  return {
    press() {
      if (down || !getPlayer()) return
      down = true
      wasPlaying = isPlaying()
      timer = schedule(() => {
        timer = null; held = true
        const player = getPlayer()
        if (!down || !player?.setPlaybackRate) return
        try {
          if (player.getAvailablePlaybackRates && !player.getAvailablePlaybackRates().includes(2)) return
          previousRate = player.getPlaybackRate?.() ?? 1
          activePlayer = player
          player.setPlaybackRate(2)
          player.playVideo()
          onPlayingChange(true)
          onActiveChange(true)
        } catch { end(false) }
      }, 250)
    },
    release: () => end(true),
    cancel: () => end(false),
  }
}
