export const navigationResumeDelayOptions = [3, 5, 10] as const

export type NavigationResumeDelaySeconds = (typeof navigationResumeDelayOptions)[number]

export interface NavigationPreferences {
  autoResumeTracking: boolean
  resumeDelaySeconds: NavigationResumeDelaySeconds
}

export const defaultNavigationPreferences: NavigationPreferences = {
  autoResumeTracking: true,
  resumeDelaySeconds: 5,
}

export const navigationPreferencesChangedEvent = "travelmap:navigation-preferences-changed"

const navigationPreferencesStorageKey = "travelmap-navigation-preferences-v1"

function isNavigationResumeDelaySeconds(value: unknown): value is NavigationResumeDelaySeconds {
  return navigationResumeDelayOptions.includes(value as NavigationResumeDelaySeconds)
}

export function normalizeNavigationPreferences(value: unknown): NavigationPreferences {
  if (!value || typeof value !== "object") {
    return defaultNavigationPreferences
  }

  const candidate = value as Partial<NavigationPreferences>
  return {
    autoResumeTracking:
      typeof candidate.autoResumeTracking === "boolean"
        ? candidate.autoResumeTracking
        : defaultNavigationPreferences.autoResumeTracking,
    resumeDelaySeconds: isNavigationResumeDelaySeconds(candidate.resumeDelaySeconds)
      ? candidate.resumeDelaySeconds
      : defaultNavigationPreferences.resumeDelaySeconds,
  }
}

export function readNavigationPreferences(): NavigationPreferences {
  if (typeof window === "undefined") {
    return defaultNavigationPreferences
  }

  try {
    const storedValue = window.localStorage.getItem(navigationPreferencesStorageKey)
    return storedValue
      ? normalizeNavigationPreferences(JSON.parse(storedValue))
      : defaultNavigationPreferences
  } catch {
    return defaultNavigationPreferences
  }
}

export function writeNavigationPreferences(
  updates: Partial<NavigationPreferences>,
): NavigationPreferences {
  const nextPreferences = normalizeNavigationPreferences({
    ...readNavigationPreferences(),
    ...updates,
  })

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        navigationPreferencesStorageKey,
        JSON.stringify(nextPreferences),
      )
    } catch {
      // The preference still applies for this page even if storage is unavailable.
    }

    window.dispatchEvent(
      new CustomEvent<NavigationPreferences>(navigationPreferencesChangedEvent, {
        detail: nextPreferences,
      }),
    )
  }

  return nextPreferences
}

export function isNavigationPreferencesStorageKey(key: string | null) {
  return key === navigationPreferencesStorageKey
}
