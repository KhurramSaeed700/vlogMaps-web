import type { BoundingBox, Coordinate, CountryCode, LocationSearchResult } from "@/lib/location-search/types"
import { distanceKm, isInsideBoundingBox, isPakistanCoordinate, levenshteinDistance, normalizeSearchText } from "@/lib/location-search/query-utils"

export function getTextMatchScore(query: string, result: LocationSearchResult) {
  const normalizedQuery = normalizeSearchText(query)
  const normalizedText = normalizeSearchText(result.text)
  const normalizedPlaceName = normalizeSearchText(result.place_name)

  if (!normalizedQuery) {
    return 0
  }

  if (normalizedText === normalizedQuery) {
    return 95
  }

  if (normalizedPlaceName === normalizedQuery) {
    return 90
  }

  if (normalizedText.startsWith(`${normalizedQuery} `)) {
    return 88
  }

  if (normalizedPlaceName.split(" ").includes(normalizedQuery)) {
    return 82
  }

  if (normalizedText.startsWith(normalizedQuery)) {
    return 70
  }

  if (normalizedPlaceName.includes(normalizedQuery)) {
    return 62
  }

  const queryTokens = normalizedQuery.split(" ").filter(Boolean)
  const placeTokens = normalizedPlaceName.split(" ").filter(Boolean)
  const matchedTokens = queryTokens.filter((queryToken) =>
    placeTokens.some((placeToken) => placeToken === queryToken || placeToken.startsWith(queryToken) || levenshteinDistance(queryToken, placeToken) <= 1),
  )

  if (queryTokens.length > 0 && matchedTokens.length === queryTokens.length) {
    return 58
  }

  if (queryTokens.length > 1 && matchedTokens.length >= Math.ceil(queryTokens.length * 0.66)) {
    return 44
  }

  const bestTokenDistance = placeTokens
    .filter((token) => token.length >= Math.min(3, normalizedQuery.length))
    .reduce((bestDistance, token) => Math.min(bestDistance, levenshteinDistance(normalizedQuery, token)), Number.POSITIVE_INFINITY)

  if (bestTokenDistance <= 1) {
    return 38
  }

  if (normalizedQuery.length >= 5 && bestTokenDistance <= 2) {
    return 26
  }

  return 0
}

function getBestTextMatchScore(queries: string[], result: LocationSearchResult) {
  return Math.max(...queries.map((query) => getTextMatchScore(query, result)))
}

const geographicFeatureScores: Record<string, number> = {
  country: 150,
  region: 140,
  state: 140,
  province: 140,
  place: 130,
  city: 130,
  town: 125,
  municipality: 125,
  village: 120,
  county: 115,
  district: 110,
  locality: 110,
  borough: 105,
  suburb: 100,
  neighborhood: 95,
  quarter: 90,
}

function getExactGeographicMatchScore(queries: string[], result: LocationSearchResult) {
  const featureType = normalizeSearchText(result.feature_type ?? "")
  const featureScore = geographicFeatureScores[featureType] ?? 0
  if (!featureScore) {
    return 0
  }

  const normalizedText = normalizeSearchText(result.text)
  return queries.some((query) => normalizeSearchText(query) === normalizedText) ? featureScore : 0
}

function getSourceScore(result: LocationSearchResult) {
  if (result.source === "mapbox-structured") {
    return 46
  }

  if (result.source === "mapbox-searchbox") {
    return 40
  }

  if (result.source === "mapbox") {
    return 36
  }

  if (result.source === "photon") {
    return 26
  }

  return 20
}

export function getResultScore(
  result: LocationSearchResult,
  query: string | string[],
  proximity: Coordinate | null,
  bbox: BoundingBox | null,
  countryCode: CountryCode | null,
) {
  const queries = Array.isArray(query) ? query : [query]
  const sourceScore = getSourceScore(result)
  const bboxScore = isInsideBoundingBox(result.center, bbox) ? 34 : 0
  const countryScore = countryCode === "pk" && isPakistanCoordinate(result.center) ? 30 : 0
  const textScore = getBestTextMatchScore(queries, result)
  const exactGeographicMatchScore = getExactGeographicMatchScore(queries, result)
  const relevanceScore = typeof result.relevance === "number" ? result.relevance * 18 : 0
  const distanceScore = proximity
    ? (() => {
        const distance = distanceKm(result.center, proximity)
        if (distance <= 10) {
          return 36
        }

        if (distance <= 50) {
          return 28
        }

        if (distance <= 250) {
          return 18
        }

        if (distance <= 1000) {
          return 8
        }

        return 0
      })()
    : 0

  return sourceScore + textScore + exactGeographicMatchScore + bboxScore + countryScore + distanceScore + relevanceScore
}

export function sortResults(
  results: LocationSearchResult[],
  query: string | string[],
  proximity: Coordinate | null,
  bbox: BoundingBox | null,
  countryCode: CountryCode | null,
) {
  return results.sort((left, right) => {
    const leftScore = getResultScore(left, query, proximity, bbox, countryCode)
    const rightScore = getResultScore(right, query, proximity, bbox, countryCode)

    if (leftScore !== rightScore) {
      return rightScore - leftScore
    }

    if (!proximity) {
      return 0
    }

    return distanceKm(left.center, proximity) - distanceKm(right.center, proximity)
  })
}

export function dedupeResults(results: LocationSearchResult[]) {
  const seen = new Set<string>()
  return results.filter((result) => {
    const normalizedFeatureType = normalizeSearchText(result.feature_type ?? "")
    const geographicGroup =
      normalizedFeatureType === "country"
        ? "country"
        : ["region", "state", "province"].includes(normalizedFeatureType)
          ? "region"
          : ["place", "city", "town", "municipality", "village", "locality"].includes(normalizedFeatureType)
            ? "place"
            : ["borough", "suburb", "neighborhood", "quarter"].includes(normalizedFeatureType)
              ? "neighborhood"
              : null
    const key = geographicGroup
      ? `${geographicGroup}:${normalizeSearchText(result.place_name)}`
      : `${normalizeSearchText(result.text)}:${result.center[0].toFixed(4)},${result.center[1].toFixed(4)}`
    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

export function hasStrongLocalMatch(
  query: string,
  results: LocationSearchResult[],
  proximity: Coordinate | null,
  bbox: BoundingBox | null,
  countryCode: CountryCode | null,
) {
  return results.some((result) => {
    const countryMatch = countryCode === "pk" && isPakistanCoordinate(result.center)
    const localMatch = isInsideBoundingBox(result.center, bbox)
    const closeMatch = proximity ? distanceKm(result.center, proximity) <= 250 : false
    return countryMatch && (localMatch || closeMatch) && getTextMatchScore(query, result) >= 35
  })
}

export function hasStrongTextMatch(query: string | string[], results: LocationSearchResult[]) {
  const queries = Array.isArray(query) ? query : [query]
  return results.some((result) => Math.max(...queries.map((candidate) => getTextMatchScore(candidate, result))) >= 58)
}
