import "server-only"

import airports from "@/public/airport-search.json"
import { searchAirports } from "@/lib/airport-search"
import { getAirportSearchQuery } from "@/lib/location-search/ranking"
import { getExplicitCountryCode } from "@/lib/location-search/query-utils"
import type { LocationSearchContext, LocationSearchResult } from "@/lib/location-search/types"

const countryCatalogs = new Map<string, typeof airports>()

export function searchAirportCatalog(context: LocationSearchContext): LocationSearchResult[] {
  const query = getAirportSearchQuery(context.query)
  if (!query) return []
  let catalog = airports
  if (context.countryCode) {
    catalog = countryCatalogs.get(context.countryCode) ?? airports.filter(airport => getExplicitCountryCode(airport.country) === context.countryCode)
    countryCatalogs.set(context.countryCode, catalog)
  }
  return searchAirports(catalog, query)
    .map(airport => ({
      id: `airport:${airport.code}`,
      text: `${airport.name} (${airport.code})`,
      place_name: `${airport.name} (${airport.code}), ${airport.city}, ${airport.country}`,
      center: [airport.lng, airport.lat],
      source: "airport-catalog",
      feature_type: "airport",
      categories: ["airport"],
      address: { place: airport.city, countryCode: getExplicitCountryCode(airport.country) ?? undefined },
    }))
}
