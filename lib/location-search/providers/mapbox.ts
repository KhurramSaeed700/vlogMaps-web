import { mapboxAccessToken } from "@/lib/mapbox"
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
  }
}

interface MapboxResponse {
  features?: MapboxFeature[]
}

const mapboxServerAccessToken = process.env.MAPBOX_ACCESS_TOKEN || mapboxAccessToken
const mapboxTypes = "country,region,postcode,district,place,locality,neighborhood,street,address,poi"

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
      relevance: props.relevance,
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
  url.searchParams.set("access_token", mapboxServerAccessToken)
  url.searchParams.set("limit", "8")
  url.searchParams.set("types", mapboxTypes)
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
  if (!parsedAddress.primary || !parsedAddress.place) {
    return [] as LocationSearchResult[]
  }

  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward")
  url.searchParams.set("address_line1", parsedAddress.primary)
  url.searchParams.set("place", parsedAddress.place)
  url.searchParams.set("access_token", mapboxServerAccessToken)
  url.searchParams.set("limit", "5")
  url.searchParams.set("types", mapboxTypes)
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
  url.searchParams.set("access_token", mapboxServerAccessToken)
  url.searchParams.set("limit", "8")
  url.searchParams.set("types", mapboxTypes)
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
  const variants = getQueryVariants(context).filter((variant) => variant.toLowerCase() !== context.query.toLowerCase()).slice(0, 5)
  const results = await Promise.all(
    variants.flatMap((variant) => [fetchMapboxGeocoding(variant, context), fetchMapboxSearchBoxForward(variant, context)]),
  )

  return results.flat()
}
