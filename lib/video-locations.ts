export const maxVideoLocationSummaries = 40

export function summarizeVideoLocations(
  locations: Iterable<string>,
  limit = maxVideoLocationSummaries,
) {
  const summaries: string[] = []
  const seen = new Set<string>()
  const boundedLimit = Math.max(0, Math.floor(limit))

  for (const value of locations) {
    const location = value.trim().replace(/\s+/g, " ")
    if (!location) {
      continue
    }

    const normalizedLocation = location.toLowerCase()
    if (seen.has(normalizedLocation)) {
      continue
    }

    seen.add(normalizedLocation)
    summaries.push(location)

    if (summaries.length >= boundedLimit) {
      break
    }
  }

  return summaries
}

export function summarizeKeyframeLocations(
  keyframes: ReadonlyArray<{ location: string }>,
) {
  return summarizeVideoLocations(keyframes.map((point) => point.location))
}
