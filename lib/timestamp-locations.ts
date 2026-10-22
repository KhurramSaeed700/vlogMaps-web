import type { VideoKeyframe } from "@/lib/demo-data"
import type { CreatorSavedPlace } from "@/lib/creator-saved-places"
import { anonymousRegionMessage, anonymousRegionName, type StopRegionCircle } from "@/lib/stop-regions"

type LocationPoint = Pick<VideoKeyframe, "lat" | "lng" | "location"> & Partial<Pick<VideoKeyframe, "description" | "pointType" | "regionCircle">>
export function timestampLocationLabel(point: LocationPoint) {
  if (point.regionCircle?.anonymous) return anonymousRegionName
  const name = point.location.trim()
  return !name || /^(?:map point|unknown|unnamed|stop point(?: #\d+)?|(?:point|stop|airport) at \d+(?::\d{2}){1,2})$/i.test(name)
    ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : name
}
export function suggestedPlaceKind(point: LocationPoint): "hotel" | "airport" | null {
  if (point.regionCircle?.anonymous) return null
  const text = `${point.location} ${point.description ?? ""}`
  if (point.pointType === "flight") return "airport"
  if (/\b(?:hotel|motel|hostel|resort|lodge|inn|guest\s?house|airbnb|hilton|marriott|hyatt|sheraton|westin|novotel|travelodge)\b/i.test(text)) return "hotel"
  return /\b(?:airport|airfield|aerodrome)\b/i.test(text) && !/\b(?:parking|rental|shuttle|maintenance)\b/i.test(text) ? "airport" : null
}
export function savedPlaceAtLocation(places: readonly CreatorSavedPlace[], point: Pick<LocationPoint, "lat" | "lng">) {
  return places.find(place => Math.abs(place.lat-point.lat) < 0.00005 && Math.abs(place.lng-point.lng) < 0.00005)
}
export function timestampPlaceName(point: LocationPoint) {
  return timestampLocationLabel(point).replace(/^stay (?:at|in)\s+/i, "")
}
export function reusedTimestampLocation(point: LocationPoint, targetType: "point" | "stop", targetRegion?: StopRegionCircle) {
  // An anonymous region must never be converted to a precise ordinary point.
  if (targetType === "point" && point.regionCircle?.anonymous) return null
  const regionCircle = targetType === "stop" ? point.regionCircle?.anonymous ? { ...point.regionCircle } : targetRegion : undefined
  const anonymous = regionCircle?.anonymous
  const name = timestampPlaceName(point)
  return {
    lat: point.lat, lng: point.lng,
    location: anonymous ? anonymousRegionName : targetType === "stop" ? `Stay at ${name}` : name,
    description: anonymous ? anonymousRegionMessage : `Reused location: ${name}`,
    regionCircle,
  }
}
