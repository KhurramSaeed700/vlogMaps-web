import type { BoundingBox, Coordinate, CountryCode, LocationSearchContext, LocationSearchResult } from "@/lib/location-search/types"
import { compactParts, getQueryVariants, isLikelyCompleteAddress, isValidCoordinate } from "@/lib/location-search/query-utils"
import { fetchLocationSearchJson } from "@/lib/location-search/providers/fetch-json"

interface PhotonFeature {
  geometry?: {
    coordinates?: unknown
  }
  properties?: {
    osm_id?: string | number
    osm_type?: string
    name?: string
    street?: string
    housenumber?: string
    postcode?: string
    district?: string
    city?: string
    state?: string
    country?: string
  }
}

interface PhotonResponse {
  features?: PhotonFeature[]
}

interface NominatimResult {
  place_id?: number
  osm_id?: number
  osm_type?: string
  display_name?: string
  name?: string
  lat?: string
  lon?: string
  boundingbox?: [string, string, string, string]
}

async function fetchPhotonResults(query: string, proximity: Coordinate | null) {
  const url = new URL("https://photon.komoot.io/api/")
  url.searchParams.set("q", query)
  url.searchParams.set("limit", "8")
  url.searchParams.set("lang", "en")

  if (proximity) {
    url.searchParams.set("lon", String(proximity[0]))
    url.searchParams.set("lat", String(proximity[1]))
  }

  const payload = await fetchLocationSearchJson<PhotonResponse>(url)
  if (!payload) {
    return [] as LocationSearchResult[]
  }

  return (payload.features ?? []).flatMap((feature, index) => {
    const center = feature.geometry?.coordinates
    if (!isValidCoordinate(center)) {
      return []
    }

    const props = feature.properties ?? {}
    const name = props.name || props.street || "Unnamed place"
    const houseAndStreet = compactParts([props.housenumber, props.street]).join(" ")
    const label = compactParts([
      name,
      houseAndStreet && houseAndStreet !== name ? houseAndStreet : undefined,
      props.district,
      props.city,
      props.state,
      props.country,
    ]).join(", ")

    return [
      {
        id: `photon:${props.osm_type ?? "feature"}:${props.osm_id ?? index}`,
        place_name: label,
        text: name,
        center,
        source: "photon" as const,
      },
    ]
  })
}

async function fetchNominatimResults(query: string, countryCode: CountryCode | null, bbox: BoundingBox | null) {
  const url = new URL("https://nominatim.openstreetmap.org/search")
  url.searchParams.set("q", query)
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("addressdetails", "1")
  url.searchParams.set("limit", "8")
  url.searchParams.set("dedupe", "1")

  if (countryCode) {
    url.searchParams.set("countrycodes", countryCode)
  }

  if (bbox) {
    const [west, south, east, north] = bbox
    url.searchParams.set("viewbox", [west, north, east, south].join(","))
    url.searchParams.set("bounded", "0")
  }

  const payload = await fetchLocationSearchJson<NominatimResult[]>(url, {
    "User-Agent": "TravelMap local creator map search",
  })
  if (!payload) {
    return [] as LocationSearchResult[]
  }

  return payload.flatMap((result, index) => {
    const lat = Number(result.lat)
    const lon = Number(result.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return []
    }

    const bboxResult = result.boundingbox
      ? ([
          Number(result.boundingbox[2]),
          Number(result.boundingbox[0]),
          Number(result.boundingbox[3]),
          Number(result.boundingbox[1]),
        ] as BoundingBox)
      : undefined

    return [
      {
        id: `nominatim:${result.osm_type ?? "place"}:${result.osm_id ?? result.place_id ?? index}`,
        place_name: result.display_name || result.name || "Unnamed place",
        text: result.name || result.display_name?.split(",")[0] || "Unnamed place",
        center: [lon, lat] as Coordinate,
        bbox: bboxResult?.every((value) => Number.isFinite(value)) ? bboxResult : undefined,
        source: "nominatim" as const,
      },
    ]
  })
}

export async function fetchPrimaryOpenStreetMapResults(context: LocationSearchContext) {
  const shouldUseNominatim = isLikelyCompleteAddress(context.query)
  const [photonResults, nominatimResults] = await Promise.all([
    fetchPhotonResults(context.query, context.proximity),
    shouldUseNominatim ? fetchNominatimResults(context.query, context.countryCode, context.bbox) : Promise.resolve([] as LocationSearchResult[]),
  ])

  return [...photonResults, ...nominatimResults]
}

export async function fetchFallbackOpenStreetMapResults(context: LocationSearchContext) {
  const variants = getQueryVariants(context).filter((variant) => variant.toLowerCase() !== context.query.toLowerCase()).slice(0, 5)
  const shouldUseNominatimFallback = context.query.trim().length >= 4
  const results = await Promise.all(
    [
      shouldUseNominatimFallback
        ? fetchNominatimResults(context.query, context.countryCode, context.bbox)
        : Promise.resolve([] as LocationSearchResult[]),
      ...variants.flatMap((variant) => [
        fetchPhotonResults(variant, context.proximity),
        isLikelyCompleteAddress(variant)
          ? fetchNominatimResults(variant, context.countryCode, context.bbox)
          : Promise.resolve([] as LocationSearchResult[]),
      ]),
    ],
  )

  return results.flat()
}
