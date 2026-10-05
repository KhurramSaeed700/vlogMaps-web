import type { BoundingBox, Coordinate, CountryCode, LocationSearchResult } from "@/lib/location-search/types"
import { distanceKm, isInsideBoundingBox, levenshteinDistance, normalizeSearchText, parseCopiedAddress } from "@/lib/location-search/query-utils"

const streetWords = new Set(["street", "st", "road", "rd", "avenue", "ave", "rue", "via", "calle", "ul", "ulica", "strasse", "platz", "the", "of", "de", "la", "le"])
const aliases: Record<string, string> = { st: "street", rd: "road", ave: "avenue", av: "avenue", blvd: "boulevard", str: "strasse", ul: "ulica" }
const words = (value: string) => normalizeSearchText(value).split(" ").filter(Boolean).map((word) => aliases[word] ?? word)
const numeric = (value: string) => /^\d+$/.test(value)

function tokenMatch(query: string, candidate: string, prefix: boolean) {
  if (query === candidate) return 1
  // Building numbers/postcodes must never fuzzy-match other numbers.
  if (/\d/.test(query) || /\d/.test(candidate)) return 0
  if (prefix && query.length >= 3 && candidate.startsWith(query)) return 0.85
  if (query.length < 5 || Math.abs(query.length - candidate.length) > 2) return 0
  const distance = levenshteinDistance(query, candidate)
  return distance <= (query.length >= 9 ? 2 : 1) ? 0.75 : 0
}

function coverage(query: string, candidate: string) {
  const queryWords = words(query)
  const candidateText = normalizeSearchText(candidate)
  const candidateWords = words(candidate)
  if (!queryWords.length || !candidateWords.length) return 0
  // Preserve unspaced scripts and match names embedded in provider labels.
  if (queryWords.length === 1 && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u.test(queryWords[0]) && queryWords[0].length >= 2 && candidateText.includes(queryWords[0])) return 1
  let total = 0, matched = 0
  for (const [index, token] of queryWords.entries()) {
    const weight = numeric(token) ? 0.25 : streetWords.has(token) ? 0.35 : Math.min(2, 1 + token.length / 12)
    total += weight
    matched += weight * Math.max(0, ...candidateWords.map((candidateToken) => tokenMatch(token, candidateToken, index === queryWords.length - 1)))
  }
  return matched / total
}

export function getTextMatchScore(query: string, result: LocationSearchResult) {
  const parsed = parseCopiedAddress(query)
  const textQuery = parsed.countryCode ? parsed.parts.slice(0, -1).join(" ") : query
  const normalizedQuery = normalizeSearchText(textQuery)
  const normalizedText = normalizeSearchText(result.text)
  const normalizedPlace = normalizeSearchText(result.place_name)
  if (!normalizedQuery) return 0
  if (normalizedText === normalizedQuery) return 100
  if (normalizedPlace === normalizedQuery) return 98
  if (normalizedText.startsWith(normalizedQuery + " ")) return 94
  const match = coverage(textQuery, result.text + " " + result.place_name)
  // Score the ORIGINAL query; fallback variants must not erase its city/street.
  return match >= 0.99 ? 90 : match >= 0.8 ? 65 + (match - 0.8) * 100 : match * 65
}

const geographicTypes = new Set(["country", "region", "state", "province", "place", "city", "town", "municipality", "village", "county", "district", "locality", "borough", "suburb", "neighborhood", "quarter"])

export function getResultScore(result: LocationSearchResult, query: string | string[], proximity: Coordinate | null, bbox: BoundingBox | null, countryCode: CountryCode | null) {
  const original = Array.isArray(query) ? query[0] ?? "" : query
  const parsed = parseCopiedAddress(original)
  const textScore = getTextMatchScore(original, result)
  let score = textScore * 10
  const address = result.address
  const label = result.text + " " + result.place_name
  if (parsed.street) {
    const match = coverage(parsed.street, address?.street || label)
    score += match >= 0.85 ? 160 : match < 0.5 ? -300 : -100
  }
  if (parsed.place) {
    const match = coverage(parsed.place, address?.place || label)
    score += match >= 0.85 ? 100 : -120
  }
  if (parsed.postcode) {
    const postcode = normalizeSearchText(parsed.postcode).replace(/ /g, "")
    if (address?.postcode) score += normalizeSearchText(address.postcode).replace(/ /g, "") === postcode ? 150 : -250
    else if (normalizeSearchText(label).replace(/ /g, "").includes(postcode)) score += 100
  }
  if (parsed.houseNumber && address?.houseNumber) {
    const wanted = words(parsed.houseNumber), actual = words(address.houseNumber)
    score += wanted.some((number) => actual.includes(number)) ? 60 : -100
  }
  if (countryCode && address?.countryCode) score += countryCode === address.countryCode.toLowerCase() ? 60 : -500
  if (textScore === 100 && geographicTypes.has(result.feature_type ?? "")) score += 30
  // Geography/provider quality only break similarly relevant matches.
  if (textScore >= 50) {
    if (isInsideBoundingBox(result.center, bbox)) score += 3
    if (proximity) score += 8 / (1 + distanceKm(result.center, proximity) / 25)
    score += Math.max(0, Math.min(1, result.relevance ?? 0)) * 2
    score += result.source.startsWith("mapbox") ? 1 : 0
  }
  return score
}

export function sortResults(results: LocationSearchResult[], query: string | string[], proximity: Coordinate | null, bbox: BoundingBox | null, countryCode: CountryCode | null) {
  // Compute scores once, not repeatedly inside the comparator.
  const original = Array.isArray(query) ? query[0] ?? "" : query
  const ranked = results.map((result, index) => ({ result, index, score: getResultScore(result, query, proximity, bbox, countryCode), textScore: getTextMatchScore(original, result) }))
  const bestScore = Math.max(0, ...ranked.map(({ score }) => score))
  const hasGoodMatch = bestScore >= 750
  return ranked.filter(({ textScore, score }) => textScore > 0 && (!hasGoodMatch || (textScore >= 30 && score >= bestScore - 400)))
    .sort((a, b) => b.score - a.score || a.index - b.index).map(({ result }) => result)
}

export function dedupeResults(results: LocationSearchResult[]) {
  const seenIds = new Set<string>()
  const accepted: LocationSearchResult[] = []
  for (const result of results) {
    const osmId = /^(?:photon|nominatim):(.+)$/.exec(result.id)?.[1]
    if (osmId && seenIds.has(osmId)) continue
    if (accepted.some((other) => normalizeSearchText(other.text) === normalizeSearchText(result.text) && distanceKm(other.center, result.center) < 0.15)) continue
    if (osmId) seenIds.add(osmId)
    accepted.push(result)
  }
  return accepted
}

export function hasStrongLocalMatch(query: string, results: LocationSearchResult[], proximity: Coordinate | null, bbox: BoundingBox | null, countryCode: CountryCode | null) {
  return results.some((result) => (!countryCode || !result.address?.countryCode || result.address.countryCode.toLowerCase() === countryCode) &&
    (isInsideBoundingBox(result.center, bbox) || (proximity && distanceKm(result.center, proximity) <= 50)) && getTextMatchScore(query, result) >= 85)
}

export function hasStrongTextMatch(query: string | string[], results: LocationSearchResult[]) {
  const original = Array.isArray(query) ? query[0] ?? "" : query
  const parsed = parseCopiedAddress(original)
  return results.some((result) => getTextMatchScore(original, result) >= 85 &&
    getResultScore(result, original, null, null, parsed.countryCode) >= 850)
}
