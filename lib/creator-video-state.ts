import type { CreatorMapPoint } from "@/lib/creator-points"
import type { CreatorRouteShapes } from "@/lib/creator-route-shapes"
import type { CreatorSavedPlace } from "@/lib/creator-saved-places"
import type { CreatorTripRoute } from "@/lib/creator-trip-route"

export interface CreatorVideoState {
  points: CreatorMapPoint[]
  tripRoute: CreatorTripRoute
  routeShapes: CreatorRouteShapes
  savedPlaces: CreatorSavedPlace[]
}

export interface CreatorVideoStateResponse {
  configured: boolean
  state: CreatorVideoState | null
  updatedAt?: string | null
}

