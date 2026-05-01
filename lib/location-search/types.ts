export type Coordinate = [number, number]
export type BoundingBox = [number, number, number, number]
export type CountryCode = "pk"

export type LocationSearchSource = "mapbox" | "mapbox-structured" | "mapbox-searchbox" | "photon" | "nominatim"

export interface ParsedAddress {
  raw: string
  parts: string[]
  primary: string | null
  place: string | null
  postcode: string | null
  countryCode: CountryCode | null
}

export interface LocationSearchContext {
  query: string
  proximity: Coordinate | null
  bbox: BoundingBox | null
  countryCode: CountryCode | null
  parsedAddress: ParsedAddress
}

export interface LocationSearchResult {
  id: string
  place_name: string
  text: string
  center: Coordinate
  bbox?: BoundingBox
  source: LocationSearchSource
  relevance?: number
}
