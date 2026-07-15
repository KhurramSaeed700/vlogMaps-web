import { NextRequest, NextResponse } from "next/server"
import { parseBoundingBox, parseCoordinate } from "@/lib/location-search/query-utils"
import { searchLocations } from "@/lib/location-search/search"
import { checkRateLimit } from "@/lib/rate-limit"

const maxLocationQueryLength = 120

function isCoordinateInRange(coordinate: [number, number] | null) {
  if (!coordinate) {
    return true
  }

  const [lng, lat] = coordinate
  return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90
}

function isBoundingBoxInRange(bbox: [number, number, number, number] | null) {
  if (!bbox) {
    return true
  }

  const [west, south, east, north] = bbox
  return west >= -180 && west <= 180 && east >= -180 && east <= 180 && south >= -90 && south <= 90 && north >= -90 && north <= 90
}

export async function GET(request: NextRequest) {
  const rateLimitResponse = checkRateLimit(request, {
    keyPrefix: "location-search",
    limit: 60,
    windowMs: 60_000,
  })
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  const rawQuery = request.nextUrl.searchParams.get("q")
  const rawProximity = request.nextUrl.searchParams.get("proximity")
  const rawBbox = request.nextUrl.searchParams.get("bbox")
  const query = rawQuery?.trim()
  const proximity = parseCoordinate(rawProximity)
  const bbox = parseBoundingBox(rawBbox)

  if (!query || query.length < 2) {
    return NextResponse.json({ features: [] })
  }

  if (query.length > maxLocationQueryLength) {
    return NextResponse.json({ error: "Search query is too long." }, { status: 400 })
  }

  if ((rawProximity && !proximity) || (rawBbox && !bbox) || !isCoordinateInRange(proximity) || !isBoundingBoxInRange(bbox)) {
    return NextResponse.json({ error: "Invalid location search coordinates." }, { status: 400 })
  }

  let features
  try {
    features = await searchLocations(query, proximity, bbox)
  } catch {
    return NextResponse.json({ error: "Location search is not configured." }, { status: 500 })
  }

  return NextResponse.json(
    { features },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  )
}
