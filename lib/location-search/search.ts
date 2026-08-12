import type { BoundingBox, Coordinate, LocationSearchResult } from "@/lib/location-search/types"
import { createSearchContext, getQueryVariants } from "@/lib/location-search/query-utils"
import { dedupeResults, hasStrongLocalMatch, hasStrongTextMatch, sortResults } from "@/lib/location-search/ranking"
import { fetchFallbackMapboxResults, fetchPrimaryMapboxResults } from "@/lib/location-search/providers/mapbox"
import { fetchFallbackOpenStreetMapResults, fetchPrimaryOpenStreetMapResults } from "@/lib/location-search/providers/openstreetmap"
import { abbreviateUsStatesInResult } from "@/lib/location-search/us-state-abbreviations"

export async function searchLocations(query: string, proximity: Coordinate | null, bbox: BoundingBox | null) {
  const context = createSearchContext(query, proximity, bbox)
  const rankingQueries = getQueryVariants(context)

  const [mapboxResults, openStreetMapResults] = await Promise.all([
    fetchPrimaryMapboxResults(context),
    fetchPrimaryOpenStreetMapResults(context),
  ])

  const primaryResults = [...mapboxResults, ...openStreetMapResults]
  const needsFallback =
    !hasStrongLocalMatch(query, primaryResults, proximity, bbox, context.countryCode) && !hasStrongTextMatch(rankingQueries, primaryResults)
  const fallbackResults = needsFallback
    ? await Promise.all([
        fetchFallbackMapboxResults(context),
        fetchFallbackOpenStreetMapResults(context),
      ])
    : ([] as LocationSearchResult[][])

  return dedupeResults(
    sortResults(
      [...primaryResults, ...fallbackResults.flat()],
      rankingQueries,
      proximity,
      bbox,
      context.countryCode,
    ),
  ).slice(0, 10).map(abbreviateUsStatesInResult)
}
