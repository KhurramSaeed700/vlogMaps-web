import "server-only"

import { getServerMapboxAccessToken } from "@/lib/mapbox-server"
import type { Coordinate, LocationSearchContext, LocationSearchResult, LocationSearchSource } from "@/lib/location-search/types"
import { compactParts, getQueryVariants, isValidCoordinate } from "@/lib/location-search/query-utils"
import { fetchLocationSearchJson } from "@/lib/location-search/providers/fetch-json"

interface MapboxFeature {
  id?: string
  geometry?: {
    coordinates?: unknown
  }
  properties?: {
    mapbox_id?: string
    name?: string
    feature_type?: string
    full_address?: string
    place_formatted?: string
    address?: string
    relevance?: number
    context?: Record<string, { name?: string; address_number?: string; street_name?: string; country_code?: string; country_code_alpha_2?: string }>
  }
}

interface MapboxResponse {
  features?: MapboxFeature[]
}

// Geocoding v6 does not accept poi; Search Box supports POIs as well.
const geocodingTypes = "country,region,postcode,district,place,locality,neighborhood,street,address"
const searchBoxTypes = "country,region,postcode,district,place,locality,neighborhood,street,address,poi"

function mapMapboxFeature(feature: MapboxFeature, source: LocationSearchSource): LocationSearchResult[] {
  const center = feature.geometry?.coordinates
  if (!isValidCoordinate(center)) {
    return []
  }

  const props = feature.properties ?? {}
  const name = props.name || props.address || "Unnamed place"
  const placeName = props.full_address || compactParts([name, props.place_formatted]).join(", ") || name

  return [
    {
      id: `${source}:${props.mapbox_id ?? feature.id ?? placeName}:${center.join(",")}`,
      place_name: placeName,
      text: name,
      center: center as Coordinate,
      source,
      feature_type: props.feature_type,
      relevance: props.relevance,
      address: {
        street: props.context?.street?.name || props.context?.address?.street_name,
        houseNumber: props.context?.address?.address_number,
        postcode: props.context?.postcode?.name,
        place: props.context?.place?.name || props.context?.locality?.name,
        countryCode: props.context?.country?.country_code || props.context?.country?.country_code_alpha_2,
      },
    },
  ]
}

async function fetchMapboxFeatureCollection(url: URL, source: LocationSearchSource) {
  const payload = await fetchLocationSearchJson<MapboxResponse>(url)
  if (!payload) {
    return [] as LocationSearchResult[]
  }

  return (payload.features ?? []).flatMap((feature) => mapMapboxFeature(feature, source))
}

async function fetchMapboxGeocoding(query: string, context: LocationSearchContext) {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward")
  url.searchParams.set("q", query)
  url.searchParams.set("access_token", getServerMapboxAccessToken())
  url.searchParams.set("limit", "8")
  url.searchParams.set("types", geocodingTypes)
  url.searchParams.set("autocomplete", "true")

  if (context.proximity) {
    url.searchParams.set("proximity", context.proximity.map((value) => value.toFixed(6)).join(","))
  }

  if (context.countryCode) {
    url.searchParams.set("country", context.countryCode.toUpperCase())
  }

  return fetchMapboxFeatureCollection(url, "mapbox")
}

async function fetchMapboxStructuredAddress(context: LocationSearchContext) {
  const { parsedAddress } = context
  if (!parsedAddress.primary || !parsedAddress.street || !parsedAddress.houseNumber || !parsedAddress.place) {
    return [] as LocationSearchResult[]
  }

  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward")
  url.searchParams.set("street", parsedAddress.street)
  url.searchParams.set("address_number", parsedAddress.houseNumber)
  url.searchParams.set("place", parsedAddress.place)
  url.searchParams.set("access_token", getServerMapboxAccessToken())
  url.searchParams.set("limit", "5")
  url.searchParams.set("types", geocodingTypes)
  url.searchParams.set("autocomplete", "false")

  if (parsedAddress.postcode) {
    url.searchParams.set("postcode", parsedAddress.postcode)
  }

  if (context.countryCode) {
    url.searchParams.set("country", context.countryCode.toUpperCase())
  }

  if (context.proximity) {
    url.searchParams.set("proximity", context.proximity.map((value) => value.toFixed(6)).join(","))
  }

  return fetchMapboxFeatureCollection(url, "mapbox-structured")
}

async function fetchMapboxSearchBoxForward(query: string, context: LocationSearchContext) {
  const url = new URL("https://api.mapbox.com/search/searchbox/v1/forward")
  url.searchParams.set("q", query)
  url.searchParams.set("access_token", getServerMapboxAccessToken())
  url.searchParams.set("limit", "8")
  url.searchParams.set("types", searchBoxTypes)
  url.searchParams.set("auto_complete", "true")

  if (context.proximity) {
    url.searchParams.set("proximity", context.proximity.map((value) => value.toFixed(6)).join(","))
  }

  if (context.countryCode) {
    url.searchParams.set("country", context.countryCode.toUpperCase())
  }

  return fetchMapboxFeatureCollection(url, "mapbox-searchbox")
}

export async function fetchPrimaryMapboxResults(context: LocationSearchContext) {
  const [geocodingResults, structuredResults, searchBoxResults] = await Promise.all([
    fetchMapboxGeocoding(context.query, context),
    fetchMapboxStructuredAddress(context),
    fetchMapboxSearchBoxForward(context.query, context),
  ])

  return [...structuredResults, ...searchBoxResults, ...geocodingResults]
}

export async function fetchFallbackMapboxResults(context: LocationSearchContext) {
  const variants = getQueryVariants(context).filter((variant) => variant.toLowerCase() !== context.query.toLowerCase()).slice(0, 2)
  const results = await Promise.all(
    variants.flatMap((variant) => [fetchMapboxGeocoding(variant, context), fetchMapboxSearchBoxForward(variant, context)]),
  )

  return results.flat()
}
