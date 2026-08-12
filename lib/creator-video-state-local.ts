import { clearCreatorPoints, loadCreatorPoints, saveCreatorPoints } from "@/lib/creator-points"
import { clearCreatorRouteShapes, loadCreatorRouteShapes, saveCreatorRouteShapes } from "@/lib/creator-route-shapes"
import { clearCreatorSavedPlaces, loadCreatorSavedPlaces, saveCreatorSavedPlaces } from "@/lib/creator-saved-places"
import { clearCreatorTripRoute, loadCreatorTripRoute, saveCreatorTripRoute } from "@/lib/creator-trip-route"
import type { CreatorVideoState } from "@/lib/creator-video-state"
import type { VideoKeyframe } from "@/lib/demo-data"

export function loadCreatorVideoStateLocalCache(videoId: string, fallbackPoints: VideoKeyframe[]): CreatorVideoState {
  return {
    points: loadCreatorPoints(videoId, fallbackPoints),
    tripRoute: loadCreatorTripRoute(videoId),
    routeShapes: loadCreatorRouteShapes(videoId),
    savedPlaces: loadCreatorSavedPlaces(videoId),
  }
}

export function saveCreatorVideoStateLocalCache(videoId: string, state: CreatorVideoState) {
  try {
    saveCreatorPoints(videoId, state.points)
    saveCreatorTripRoute(videoId, state.tripRoute)
    saveCreatorRouteShapes(videoId, state.routeShapes)
    saveCreatorSavedPlaces(videoId, state.savedPlaces)
    return true
  } catch {
    return false
  }
}

export function clearCreatorVideoStateLocalCache(videoId: string) {
  const clearers = [clearCreatorPoints, clearCreatorTripRoute, clearCreatorRouteShapes, clearCreatorSavedPlaces]
  for (const clearStorage of clearers) {
    try {
      clearStorage(videoId)
    } catch {
      // Clear every independent cache even if one storage key is unavailable.
    }
  }
}
