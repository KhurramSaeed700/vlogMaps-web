import type { BoundingBox, Coordinate, CountryCode, LocationSearchContext, ParsedAddress } from "@/lib/location-search/types"

const pakistanAddressVariants: Array<[RegExp, string]> = [
  [/\bsayedan\b/gi, "Syedan"],
  [/\bsyedan\b/gi, "Sayedan"],
  [/\bsaydan\b/gi, "Syedan"],
  [/\bsaidan\b/gi, "Syedan"],
  [/\baskari\s*10\b/gi, "Askari X"],
  [/\baskari\s*x\b/gi, "Askari 10"],
  [/\bpindi\b/gi, "Rawalpindi"],
]

export function parseCoordinate(value: string | null): Coordinate | null {
  if (!value) {
    return null
  }

  const [lng, lat] = value.split(",").map((part) => Number(part))
  return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
}

const locationCoordinateQueryPattern = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:,|\s)\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*$/

/**
 * Parses coordinates copied from mapping apps. The common latitude, longitude
 * order wins when both values could be valid latitudes; an unambiguous
 * longitude-first pair (for example 120, 30) is also accepted.
 */
export function parseLocationCoordinateQuery(value: string): Coordinate | null {
  const match = locationCoordinateQueryPattern.exec(value)
  if (!match) {
    return null
  }

  const first = Number(match[1])
  const second = Number(match[2])
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return null
  }

  if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
    return [second, first]
  }

  if (Math.abs(first) <= 180 && Math.abs(second) <= 90) {
    return [first, second]
  }

  return null
}

function formatCoordinate(value: number) {
  return value.toFixed(6).replace(/\.?0+$/, "")
}

export function getCoordinateSearchResult(query: string) {
  const center = parseLocationCoordinateQuery(query)
  if (!center) {
    return null
  }

  const [lng, lat] = center
  const label = `${formatCoordinate(lat)}, ${formatCoordinate(lng)}`
  return {
    id: `coordinates:${lat}:${lng}`,
    place_name: label,
    text: "Coordinates",
    center,
    source: "coordinates" as const,
    relevance: 1,
  }
}

export function parseBoundingBox(value: string | null): BoundingBox | null {
  if (!value) {
    return null
  }

  const values = value.split(",").map((part) => Number(part))
  if (values.length !== 4 || values.some((part) => !Number.isFinite(part))) {
    return null
  }

  return values as BoundingBox
}

export function isPakistanCoordinate(coordinate: Coordinate | null) {
  if (!coordinate) {
    return false
  }

  const [lng, lat] = coordinate
  return lng >= 60 && lng <= 78 && lat >= 23 && lat <= 38
}

export function getCountryCodeFromCoordinate(coordinate: Coordinate | null): CountryCode | null {
  return isPakistanCoordinate(coordinate) ? "pk" : null
}

export function isValidCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  )
}

export function compactParts(parts: Array<string | number | undefined | null>) {
  const seen = new Set<string>()
  return parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .filter((part) => {
      const key = normalizeSearchText(part)
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
}

export function isInsideBoundingBox(coordinate: Coordinate, bbox: BoundingBox | null) {
  if (!bbox) {
    return false
  }

  const [lng, lat] = coordinate
  const [west, south, east, north] = bbox
  return lng >= west && lng <= east && lat >= south && lat <= north
}

export function distanceKm(left: Coordinate, right: Coordinate) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const earthRadiusKm = 6371
  const dLat = toRadians(right[1] - left[1])
  const dLng = toRadians(right[0] - left[0])
  const lat1 = toRadians(left[1])
  const lat2 = toRadians(right[1])
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function levenshteinDistance(left: string, right: string) {
  if (left === right) {
    return 0
  }

  if (!left) {
    return right.length
  }

  if (!right) {
    return left.length
  }

  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const currentRow = [leftIndex + 1]

    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      currentRow.push(
        Math.min(
          currentRow[rightIndex] + 1,
          previousRow[rightIndex + 1] + 1,
          previousRow[rightIndex] + (left[leftIndex] === right[rightIndex] ? 0 : 1),
        ),
      )
    }

    previousRow.splice(0, previousRow.length, ...currentRow)
  }

  return previousRow[right.length]
}

function stripAddressNoise(value: string) {
  return value
    .replace(/\s+(?:#|suite\s+|ste\s+|unit\s+|apt\s*)[a-z0-9-]+\b/gi, " ")
    .replace(/["'`\\]/g, " ")
    .replace(/\b\d{4,6}\b/g, " ")
    .replace(/\bpakistan\b/gi, " ")
    .replace(/\s*,\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function applyPakistanVariants(value: string) {
  const variants = new Set<string>()
  pakistanAddressVariants.forEach(([pattern, replacement]) => {
    if (pattern.test(value)) {
      variants.add(value.replace(pattern, replacement))
    }
    pattern.lastIndex = 0
  })
  return [...variants]
}

export function parseCopiedAddress(rawQuery: string): ParsedAddress {
  const raw = rawQuery.replace(/["'`\\]/g, " ").replace(/\s+/g, " ").trim()
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  const countryPart = parts.find((part) => /\b(?:pakistan|united states(?: of america)?|usa|u\.s\.a\.)\b/i.test(part))
  const postcode = parts.map((part) => part.match(/\b\d{4,6}(?:-\d{4})?\b/)?.[0]).find(Boolean) ?? null
  const usefulParts = parts.filter((part) => part !== countryPart && part !== postcode)

  return {
    raw,
    parts,
    primary: usefulParts[0] ?? null,
    place: usefulParts[1] ?? null,
    postcode,
    countryCode: countryPart ? (/pakistan/i.test(countryPart) ? "pk" : "us") : null,
  }
}

export function createSearchContext(query: string, proximity: Coordinate | null, bbox: BoundingBox | null): LocationSearchContext {
  const parsedAddress = parseCopiedAddress(query)
  return {
    query,
    proximity,
    bbox,
    countryCode: parsedAddress.countryCode ?? getCountryCodeFromCoordinate(proximity),
    parsedAddress,
  }
}

export function getQueryVariants(context: LocationSearchContext) {
  const { query, parsedAddress } = context
  const variants = new Set<string>()
  const cleanedQuery = stripAddressNoise(query)

  variants.add(query.trim())
  if (cleanedQuery) {
    variants.add(cleanedQuery)
  }

  if (parsedAddress.primary && parsedAddress.place) {
    variants.add(`${parsedAddress.primary} ${parsedAddress.place}`)
    variants.add(`${parsedAddress.primary}, ${parsedAddress.place}`)
  }

  if (parsedAddress.primary) {
    variants.add(parsedAddress.primary)
  }

  ;[...variants].forEach((variant) => {
    applyPakistanVariants(variant).forEach((nextVariant) => variants.add(nextVariant))
  })

  getTypoTolerantQueries(cleanedQuery || query).forEach((variant) => variants.add(variant))

  return [...variants]
    .map((variant) => variant.replace(/\s+/g, " ").trim())
    .filter((variant, index, list) => variant.length >= 2 && list.findIndex((item) => normalizeSearchText(item) === normalizeSearchText(variant)) === index)
    .slice(0, 8)
}

export function getTypoTolerantQueries(query: string) {
  const normalizedQuery = query.replace(/\s+/g, " ").trim()
  const tokens = normalizedQuery.split(" ")
  const variants = new Set<string>()

  tokens.forEach((token, tokenIndex) => {
    const cleanToken = token.replace(/[^a-z0-9]/gi, "")
    if (cleanToken.length < 4 || cleanToken.length > 8) {
      return
    }

    for (let insertAt = 2; insertAt < Math.min(cleanToken.length, 5); insertAt += 1) {
      const nextTokens = [...tokens]
      nextTokens[tokenIndex] = `${cleanToken.slice(0, insertAt)}a${cleanToken.slice(insertAt)}`
      variants.add(nextTokens.join(" "))
    }
  })

  return [...variants].filter((variant) => normalizeSearchText(variant) !== normalizeSearchText(normalizedQuery)).slice(0, 3)
}

export function isLikelyCompleteAddress(query: string) {
  return query.includes(",") || /\b\d{4,6}\b/.test(query) || query.trim().split(/\s+/).length >= 3
}

export function isPastedPostalAddress(query: string) {
  const parsedAddress = parseCopiedAddress(query)
  return Boolean(parsedAddress.primary && /\d/.test(parsedAddress.primary) && parsedAddress.place && (parsedAddress.postcode || parsedAddress.parts.length >= 3))
}
