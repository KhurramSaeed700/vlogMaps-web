"use client"

import { useCallback, useEffect, useState } from "react"
import {
  defaultPlaybackPreferences,
  isPlaybackPreferencesStorageKey,
  normalizePlaybackPreferences,
  playbackPreferencesChangedEvent,
  readPlaybackPreferences,
  writePlaybackPreferences,
  type PlaybackPreferences,
} from "@/lib/playback-preferences"

export function usePlaybackPreferences() {
  const [preferences, setPreferences] = useState<PlaybackPreferences>(
    defaultPlaybackPreferences,
  )

  useEffect(() => {
    setPreferences(readPlaybackPreferences())

    const handlePreferenceChange = (event: Event) => {
      const customEvent = event as CustomEvent<PlaybackPreferences>
      setPreferences(normalizePlaybackPreferences(customEvent.detail))
    }
    const handleStorageChange = (event: StorageEvent) => {
      if (isPlaybackPreferencesStorageKey(event.key)) {
        setPreferences(readPlaybackPreferences())
      }
    }

    window.addEventListener(playbackPreferencesChangedEvent, handlePreferenceChange)
    window.addEventListener("storage", handleStorageChange)
    return () => {
      window.removeEventListener(playbackPreferencesChangedEvent, handlePreferenceChange)
      window.removeEventListener("storage", handleStorageChange)
    }
  }, [])

  const updatePreferences = useCallback((updates: Partial<PlaybackPreferences>) => {
    setPreferences(writePlaybackPreferences(updates))
  }, [])

  return { preferences, updatePreferences }
}
