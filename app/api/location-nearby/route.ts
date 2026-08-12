import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"

interface NominatimReverseResult {
  name?: string
  display_name?: string
  category?: string
  type?: string
  namedetails?: Record<string, string>
  address?: Record<string, string>
}

const nearbyPlaceCategories = new Set([
  "amenity",
  "building",
  "craft",
  "historic",
  "leisure",
  "office",
  "shop",
  "tourism",
])

let reverseLookupQueue = Promise.resolve()
let nextReverseLookupAt = 0

function queueReverseLookup<T>(lookup: () => Promise<T>) {
  const queued = reverseLookupQueue.then(async () => {
    const waitMs = Math.max(0, nextReverseLookupAt - Date.now())
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }

    nextReverseLookupAt = Date.now() + 1_000
    return lookup()
  })
  reverseLookupQueue = queued.then(() => undefined, () => undefined)
  return queued
}

function getNearbyPlaceName(result: NominatimReverseResult) {
  const namedPlace =
    result.name?.trim() ||
    result.namedetails?.name?.trim() ||
    result.address?.amenity?.trim() ||
    result.address?.shop?.trim() ||
    result.address?.tourism?.trim()

  if (namedPlace && (!result.category || nearbyPlaceCategories.has(result.category))) {
    return namedPlace
  }

  return (
    namedPlace ||
    result.address?.building?.trim() ||
    result.address?.road?.trim() ||
    result.address?.pedestrian?.trim() ||
    result.address?.neighbourhood?.trim() ||
    result.address?.suburb?.trim() ||
    result.address?.village?.trim() ||
    result.address?.town?.trim() ||
    result.address?.city?.trim() ||
    null
  )
}

function getLocalityName(result: NominatimReverseResult) {
  return (
    result.address?.city?.trim() ||
    result.address?.town?.trim() ||
    result.address?.village?.trim() ||
    result.address?.municipality?.trim() ||
    result.address?.hamlet?.trim() ||
    result.address?.locality?.trim() ||
    result.address?.borough?.trim() ||
    result.address?.city_district?.trim() ||
    result.address?.suburb?.trim() ||
    result.address?.neighbourhood?.trim() ||
    result.address?.quarter?.trim() ||
    result.address?.residential?.trim() ||
    null
  )
}

export async function GET(request: NextRequest) {
  const rateLimitResponse = checkRateLimit(request, {
    keyPrefix: "location-nearby",
    limit: 20,
    windowMs: 60_000,
  })
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  const lat = Number(request.nextUrl.searchParams.get("lat"))
  const lng = Number(request.nextUrl.searchParams.get("lng"))
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 })
  }

  const url = new URL("https://nominatim.openstreetmap.org/reverse")
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("lat", lat.toFixed(5))
  url.searchParams.set("lon", lng.toFixed(5))
  url.searchParams.set("zoom", "18")
  url.searchParams.set("addressdetails", "1")
  url.searchParams.set("namedetails", "1")
  url.searchParams.set("layer", "address,poi")

  try {
    const result = await queueReverseLookup(async () => {
      const response = await fetch(url, {
        headers: {
          "Accept-Language": "en",
          "User-Agent": "TravelMap creator nearby place lookup",
        },
        next: { revalidate: 86_400 },
      })
      if (!response.ok) {
        throw new Error(`Nearby place lookup failed with ${response.status}`)
      }
      return response.json() as Promise<NominatimReverseResult>
    })

    return NextResponse.json({
      name: getNearbyPlaceName(result),
      locality: getLocalityName(result),
      placeName: result.display_name?.trim() || null,
      source: "OpenStreetMap",
    })
  } catch {
    return NextResponse.json({ name: null, locality: null, placeName: null, source: "OpenStreetMap" })
  }
}
