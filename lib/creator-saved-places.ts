export interface CreatorSavedPlace {
  id: string
  name: string
  lat: number
  lng: number
}

function savedPlacesStorageKey(videoId: string) {
  return `travelmap:creator-saved-places:${videoId}`
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isSavedPlace(value: unknown): value is CreatorSavedPlace {
  if (!value || typeof value !== "object") {
    return false
  }

  const place = value as Partial<CreatorSavedPlace>
  return (
    typeof place.id === "string" &&
    Boolean(place.id.trim()) &&
    typeof place.name === "string" &&
    Boolean(place.name.trim()) &&
    isFiniteNumber(place.lat) &&
    place.lat >= -90 &&
    place.lat <= 90 &&
    isFiniteNumber(place.lng) &&
    place.lng >= -180 &&
    place.lng <= 180
  )
}

export function loadCreatorSavedPlaces(videoId: string): CreatorSavedPlace[] {
  if (typeof window === "undefined") {
    return []
  }

  try {
    const rawPlaces = window.localStorage.getItem(savedPlacesStorageKey(videoId))
    const parsedPlaces = rawPlaces ? (JSON.parse(rawPlaces) as unknown) : null
    return Array.isArray(parsedPlaces) ? parsedPlaces.filter(isSavedPlace) : []
  } catch {
    window.localStorage.removeItem(savedPlacesStorageKey(videoId))
    return []
  }
}

export function saveCreatorSavedPlaces(videoId: string, places: CreatorSavedPlace[]) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(savedPlacesStorageKey(videoId), JSON.stringify(places))
}

export function clearCreatorSavedPlaces(videoId: string) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.removeItem(savedPlacesStorageKey(videoId))
}
