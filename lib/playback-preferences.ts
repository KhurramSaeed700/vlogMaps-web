export interface PlaybackPreferences {
  volume: number
}

export const defaultPlaybackPreferences: PlaybackPreferences = {
  volume: 60,
}

const playbackPreferencesStorageKey = "travelmap.playback-preferences.v1"
export const playbackPreferencesChangedEvent = "travelmap:playback-preferences-changed"

export function normalizePlaybackPreferences(
  preferences?: Partial<PlaybackPreferences> | null,
): PlaybackPreferences {
  const volume = Number(preferences?.volume)

  return {
    volume: Number.isFinite(volume)
      ? Math.min(Math.max(Math.round(volume), 0), 100)
      : defaultPlaybackPreferences.volume,
  }
}

export function readPlaybackPreferences(): PlaybackPreferences {
  if (typeof window === "undefined") {
    return defaultPlaybackPreferences
  }

  try {
    const storedPreferences = window.localStorage.getItem(playbackPreferencesStorageKey)
    return normalizePlaybackPreferences(
      storedPreferences ? JSON.parse(storedPreferences) as Partial<PlaybackPreferences> : null,
    )
  } catch {
    return defaultPlaybackPreferences
  }
}

export function writePlaybackPreferences(
  updates: Partial<PlaybackPreferences>,
): PlaybackPreferences {
  const nextPreferences = normalizePlaybackPreferences({
    ...readPlaybackPreferences(),
    ...updates,
  })

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(playbackPreferencesStorageKey, JSON.stringify(nextPreferences))
    } catch {
      // Keep the preference active for this page when storage is unavailable.
    }

    window.dispatchEvent(
      new CustomEvent<PlaybackPreferences>(playbackPreferencesChangedEvent, {
        detail: nextPreferences,
      }),
    )
  }

  return nextPreferences
}

export function isPlaybackPreferencesStorageKey(key: string | null) {
  return key === playbackPreferencesStorageKey
}
