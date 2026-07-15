import {
  Building2,
  Compass,
  MapPin,
  Mountain,
  UtensilsCrossed,
  Waves,
  type LucideIcon,
} from "lucide-react"

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
  return null
}

export function saveSelectedPreference(_preference: PreferenceId) {}
