type Coordinate = readonly [number, number]

export const tripPreviewCameraMs = 1200
export const tripPreviewCompleteHoldMs = 3000

// Calculated once when the route changes, never inside a playback frame.
export function getTripPreviewTiming(coordinates: readonly Coordinate[], destinationCount: number) {
  let distanceKm = 0
  for (let index = 1; index < coordinates.length; index++) {
    const [lng1, lat1] = coordinates[index - 1]
    const [lng2, lat2] = coordinates[index]
    if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) continue
    const radians = Math.PI / 180
    const a = Math.sin((lat2 - lat1) * radians / 2) ** 2 +
      Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin((lng2 - lng1) * radians / 2) ** 2
    distanceKm += 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))))
  }
  const count = Number.isFinite(destinationCount) ? Math.max(0, destinationCount) : 0
  const animationMs = Math.round(Math.min(45000, Math.max(6000, 5000 + count * 160 + Math.sqrt(distanceKm) * 30)))
  return { animationMs, totalMs: tripPreviewCameraMs + animationMs + tripPreviewCompleteHoldMs }
}
