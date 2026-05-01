import {
  Building2,
  Compass,
  MapPin,
  Mountain,
  UtensilsCrossed,
  Waves,
  type LucideIcon,
} from "lucide-react"

const preferenceStorageKey = "travelmap:home-preference"

export const preferenceOptions = [
  { id: "all", label: "All", icon: Compass },
  { id: "road-trips", label: "Road Trips", icon: MapPin },
  { id: "cities", label: "Cities", icon: Building2 },
  { id: "beaches", label: "Beaches", icon: Waves },
  { id: "mountains", label: "Mountains", icon: Mountain },
  { id: "food", label: "Food", icon: UtensilsCrossed },
] as const satisfies readonly {
  id: string
  label: string
  icon: LucideIcon
}[]

export type PreferenceId = (typeof preferenceOptions)[number]["id"]

export const homeSkeletonCardCount = 10

export function getSavedPreference() {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const savedPreference = window.localStorage.getItem(preferenceStorageKey) as PreferenceId | null
    return savedPreference && preferenceOptions.some((option) => option.id === savedPreference) ? savedPreference : null
  } catch {
    return null
  }
}

export function saveSelectedPreference(preference: PreferenceId) {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(preferenceStorageKey, preference)
  } catch {
    // The page should keep working when browser storage is blocked.
  }
}
