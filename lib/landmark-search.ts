export interface LandmarkResult {
  name: string
  score: number
  lat: number
  lng: number
}

export function parseLandmarkResults(value: unknown): LandmarkResult[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const lat = entry?.locations?.[0]?.latLng?.latitude
    const lng = entry?.locations?.[0]?.latLng?.longitude
    if (typeof entry?.description !== "string" || !entry.description.trim() ||
      typeof entry.score !== "number" || !Number.isFinite(entry.score) || entry.score < 0.5 || entry.score > 1 ||
      typeof lat !== "number" || !Number.isFinite(lat) || Math.abs(lat) > 90 ||
      typeof lng !== "number" || !Number.isFinite(lng) || Math.abs(lng) > 180) return []
    return [{ name: entry.description, score: entry.score, lat, lng }]
  }).sort((a, b) => b.score - a.score).slice(0, 5)
}
