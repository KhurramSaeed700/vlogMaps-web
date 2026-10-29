import type { CreatorMapPoint } from "@/lib/creator-points"

type PendingStop = {
  id?: string
  time: number
  lat: number | null
  lng: number | null
  pointType: CreatorMapPoint["pointType"]
  location: string
  description: string
  regionCircle?: CreatorMapPoint["regionCircle"]
}

// Preview a placed, open stop without committing an unfinished timestamp. The
// array remains stable while playback advances; closing/cancelling uses the
// existing editor persistence and undo flows.
export function getStopRoutePreviewPoints(
  points: CreatorMapPoint[],
  draft: PendingStop | null,
  recording: boolean,
): CreatorMapPoint[] {
  if (!recording || draft?.pointType !== "stop" || draft.lat === null || draft.lng === null ||
    !Number.isFinite(draft.lat) || !Number.isFinite(draft.lng) || !Number.isFinite(draft.time)) return points
  const preview: CreatorMapPoint = {
    id: draft.id ?? "pending:stop-route",
    time: draft.time,
    lat: draft.lat,
    lng: draft.lng,
    pointType: "stop",
    location: draft.location,
    description: draft.description,
    regionCircle: draft.regionCircle,
  }
  return [...points.filter(point => point.id !== preview.id), preview].sort((a, b) => a.time - b.time)
}
