"use client"

import { useCallback, useEffect, useState } from "react"
import {
  defaultNavigationPreferences,
  isNavigationPreferencesStorageKey,
  navigationPreferencesChangedEvent,
  normalizeNavigationPreferences,
  readNavigationPreferences,
  writeNavigationPreferences,
  type NavigationPreferences,
} from "@/lib/navigation-preferences"

export function useNavigationPreferences() {
  const [preferences, setPreferences] = useState<NavigationPreferences>(
    defaultNavigationPreferences,
  )

  useEffect(() => {
    setPreferences(readNavigationPreferences())

    const handlePreferenceChange = (event: Event) => {
      const customEvent = event as CustomEvent<NavigationPreferences>
      setPreferences(normalizeNavigationPreferences(customEvent.detail))
    }
    const handleStorageChange = (event: StorageEvent) => {
      if (isNavigationPreferencesStorageKey(event.key)) {
        setPreferences(readNavigationPreferences())
      }
    }

    window.addEventListener(navigationPreferencesChangedEvent, handlePreferenceChange)
    window.addEventListener("storage", handleStorageChange)
    return () => {
      window.removeEventListener(navigationPreferencesChangedEvent, handlePreferenceChange)
      window.removeEventListener("storage", handleStorageChange)
    }
  }, [])

  const updatePreferences = useCallback((updates: Partial<NavigationPreferences>) => {
    setPreferences(writeNavigationPreferences(updates))
  }, [])

  return { preferences, updatePreferences }
}
