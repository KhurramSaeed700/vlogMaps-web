import type { BoundingBox, Coordinate, LocationSearchResult } from "@/lib/location-search/types"

// Open Location Code constants and recovery rules follow Google's Apache-2.0
// reference implementation: https://github.com/google/open-location-code
const codeAlphabet = "23456789CFGHJMPQRVWX"
const separatorPosition = 8
const pairCodeLength = 10
const maxCodeLength = 15
const pairResolutions = [20, 1, 0.05, 0.0025, 0.000125]
const gridColumns = 4
const gridRows = 5

interface PlusCodeArea {
  south: number
  west: number
  north: number
  east: number
  center: Coordinate
  codeLength: number
}

export interface ParsedPlusCodeQuery {
  code: string
  referenceQuery: string | null
}

function clipLatitude(latitude: number) {
  return Math.min(90, Math.max(-90, latitude))
}

function normalizeLongitude(longitude: number) {
  while (longitude < -180) longitude += 360
  while (longitude >= 180) longitude -= 360
  return longitude
}

function isValidPlusCode(code: string) {
  const normalized = code.toUpperCase()
  const separatorIndex = normalized.indexOf("+")
  if (
    separatorIndex < 0 ||
    separatorIndex !== normalized.lastIndexOf("+") ||
    separatorIndex > separatorPosition ||
    separatorIndex % 2 === 1 ||
    normalized.length - separatorIndex - 1 === 1
  ) {
    return false
  }

  const paddingGroups = normalized.match(/0+/g)
  if (paddingGroups) {
    if (
      separatorIndex < separatorPosition ||
      normalized.startsWith("0") ||
      paddingGroups.length !== 1 ||
      paddingGroups[0].length % 2 === 1 ||
      paddingGroups[0].length > separatorPosition - 2 ||
      !normalized.endsWith("+")
    ) {
      return false
    }
  }

  const digits = normalized.replace("+", "").replace(/0/g, "")
  return digits.length >= 2 && digits.length <= maxCodeLength && [...digits].every((character) => codeAlphabet.includes(character))
}

function isShortPlusCode(code: string) {
  return isValidPlusCode(code) && code.indexOf("+") < separatorPosition
}

function isFullPlusCode(code: string) {
  if (!isValidPlusCode(code) || isShortPlusCode(code)) {
    return false
  }

  const normalized = code.toUpperCase()
  const firstLatitudeValue = codeAlphabet.indexOf(normalized[0]) * codeAlphabet.length
  const firstLongitudeValue = codeAlphabet.indexOf(normalized[1]) * codeAlphabet.length
  return firstLatitudeValue < 180 && firstLongitudeValue < 360
}

function encodePlusCode(latitude: number, longitude: number, requestedLength = pairCodeLength) {
  const codeLength = Math.min(maxCodeLength, Math.max(2, requestedLength))
  let adjustedLatitude = clipLatitude(latitude)
  if (adjustedLatitude === 90) {
    adjustedLatitude -= pairResolutions[Math.min(Math.floor(codeLength / 2), pairResolutions.length) - 1]
  }
  adjustedLatitude += 90
  let adjustedLongitude = normalizeLongitude(longitude) + 180
  let digits = ""

  const pairedLength = Math.min(codeLength, pairCodeLength)
  for (let index = 0; index < pairedLength / 2; index += 1) {
    const resolution = pairResolutions[index]
    const latitudeDigit = Math.min(19, Math.floor(adjustedLatitude / resolution))
    const longitudeDigit = Math.min(19, Math.floor(adjustedLongitude / resolution))
    digits += codeAlphabet[latitudeDigit] + codeAlphabet[longitudeDigit]
    adjustedLatitude -= latitudeDigit * resolution
    adjustedLongitude -= longitudeDigit * resolution
  }

  let latitudeResolution = pairResolutions[pairResolutions.length - 1]
  let longitudeResolution = pairResolutions[pairResolutions.length - 1]
  for (let index = pairCodeLength; index < codeLength; index += 1) {
    latitudeResolution /= gridRows
    longitudeResolution /= gridColumns
    const row = Math.min(gridRows - 1, Math.floor(adjustedLatitude / latitudeResolution))
    const column = Math.min(gridColumns - 1, Math.floor(adjustedLongitude / longitudeResolution))
    digits += codeAlphabet[row * gridColumns + column]
    adjustedLatitude -= row * latitudeResolution
    adjustedLongitude -= column * longitudeResolution
  }

  if (codeLength < separatorPosition) {
    return `${digits}${"0".repeat(separatorPosition - codeLength)}+`
  }
  return `${digits.slice(0, separatorPosition)}+${digits.slice(separatorPosition)}`
}

function decodePlusCode(code: string): PlusCodeArea {
  if (!isFullPlusCode(code)) {
    throw new Error(`Invalid full Plus Code: ${code}`)
  }

  const digits = code.toUpperCase().replace("+", "").replace(/0/g, "")
  const pairedLength = Math.min(digits.length, pairCodeLength)
  let south = -90
  let west = -180
  let latitudeResolution = 20
  let longitudeResolution = 20

  for (let index = 0; index < pairedLength; index += 2) {
    latitudeResolution = pairResolutions[index / 2]
    longitudeResolution = latitudeResolution
    south += codeAlphabet.indexOf(digits[index]) * latitudeResolution
    west += codeAlphabet.indexOf(digits[index + 1]) * longitudeResolution
  }

  for (let index = pairCodeLength; index < digits.length; index += 1) {
    const digit = codeAlphabet.indexOf(digits[index])
    latitudeResolution /= gridRows
    longitudeResolution /= gridColumns
    south += Math.floor(digit / gridColumns) * latitudeResolution
    west += (digit % gridColumns) * longitudeResolution
  }

  const north = Math.min(90, south + latitudeResolution)
  const east = Math.min(180, west + longitudeResolution)
  return {
    south,
    west,
    north,
    east,
    center: [(west + east) / 2, (south + north) / 2],
    codeLength: digits.length,
  }
}

function recoverNearestPlusCode(shortCode: string, reference: Coordinate) {
  if (!isShortPlusCode(shortCode)) {
    if (isFullPlusCode(shortCode)) return shortCode.toUpperCase()
    throw new Error(`Invalid short Plus Code: ${shortCode}`)
  }

  const [referenceLongitude, referenceLatitude] = [normalizeLongitude(reference[0]), clipLatitude(reference[1])]
  const normalized = shortCode.toUpperCase()
  const paddingLength = separatorPosition - normalized.indexOf("+")
  const resolution = 20 ** (2 - paddingLength / 2)
  const halfResolution = resolution / 2
  const referencePrefix = encodePlusCode(referenceLatitude, referenceLongitude).slice(0, paddingLength)
  const recoveredArea = decodePlusCode(referencePrefix + normalized)
  let [longitude, latitude] = recoveredArea.center

  if (referenceLatitude + halfResolution < latitude && latitude - resolution >= -90) latitude -= resolution
  else if (referenceLatitude - halfResolution > latitude && latitude + resolution <= 90) latitude += resolution

  if (referenceLongitude + halfResolution < longitude) longitude -= resolution
  else if (referenceLongitude - halfResolution > longitude) longitude += resolution

  return encodePlusCode(latitude, longitude, recoveredArea.codeLength)
}

export function parsePlusCodeQuery(query: string): ParsedPlusCodeQuery | null {
  const match = /^\s*([23456789CFGHJMPQRVWX0]{2,8}\+[23456789CFGHJMPQRVWX]{0,7})(?:\s*,?\s+(.+?))?\s*$/i.exec(query)
  if (!match) return null

  const code = match[1].toUpperCase()
  if (!isValidPlusCode(code)) return null
  return { code, referenceQuery: match[2]?.trim() || null }
}

export function getPlusCodeSearchResult(parsed: ParsedPlusCodeQuery, reference: Coordinate | null): LocationSearchResult | null {
  let fullCode = parsed.code
  if (isShortPlusCode(fullCode)) {
    if (!reference) return null
    fullCode = recoverNearestPlusCode(fullCode, reference)
  } else if (!isFullPlusCode(fullCode)) {
    return null
  }

  const area = decodePlusCode(fullCode)
  const bbox: BoundingBox = [area.west, area.south, area.east, area.north]
  const referenceLabel = parsed.referenceQuery ? `, ${parsed.referenceQuery}` : ""
  return {
    id: `plus-code:${fullCode}`,
    place_name: `${parsed.code}${referenceLabel}`,
    text: parsed.code,
    center: area.center,
    bbox,
    source: "plus-code",
    relevance: 1,
  }
}
