import type { LocationSearchResult } from "@/lib/location-search/types"

const US_STATE_ABBREVIATIONS: Record<string, string> = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
  "District of Columbia": "DC",
}

const US_COUNTRY_NAMES = new Set(["united states", "united states of america", "usa", "us"])
const REGION_FEATURE_TYPES = new Set(["region", "state", "administrative"])

function abbreviateStatePart(part: string) {
  const trimmedPart = part.trim()

  for (const [stateName, abbreviation] of Object.entries(US_STATE_ABBREVIATIONS)) {
    if (trimmedPart === stateName) {
      return abbreviation
    }

    if (trimmedPart.startsWith(`${stateName} `)) {
      const suffix = trimmedPart.slice(stateName.length).trim()
      if (/^\d{5}(?:-\d{4})?$/.test(suffix)) {
        return `${abbreviation} ${suffix}`
      }
    }
  }

  return trimmedPart
}

function abbreviateUsPlaceName(placeName: string, resultText: string, isRegionResult: boolean) {
  const parts = placeName.split(",").map((part) => part.trim())
  const countryIndex = parts.findIndex((part) => US_COUNTRY_NAMES.has(part.toLowerCase()))

  if (countryIndex < 1) {
    return placeName
  }

  const stateIndex = countryIndex - 1
  const statePart = parts[stateIndex]
  const isOnlyPrimaryPlaceName = stateIndex === 0 && statePart.toLowerCase() === resultText.toLowerCase()

  if (isOnlyPrimaryPlaceName && !isRegionResult) {
    return parts.join(", ")
  }

  parts[stateIndex] = abbreviateStatePart(statePart)
  return parts.join(", ")
}

export function abbreviateUsStatesInResult(result: LocationSearchResult): LocationSearchResult {
  const featureType = result.feature_type?.toLowerCase() ?? ""
  const isRegionResult = REGION_FEATURE_TYPES.has(featureType)
  const abbreviatedText = isRegionResult
    ? US_STATE_ABBREVIATIONS[result.text] ?? result.text
    : result.text

  return {
    ...result,
    text: abbreviatedText,
    place_name: abbreviateUsPlaceName(result.place_name, result.text, isRegionResult),
  }
}
