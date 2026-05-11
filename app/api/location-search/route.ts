import { NextRequest, NextResponse } from "next/server"
import { parseBoundingBox, parseCoordinate } from "@/lib/location-search/query-utils"
import { searchLocations } from "@/lib/location-search/search"

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim()
  const proximity = parseCoordinate(request.nextUrl.searchParams.get("proximity"))
  const bbox = parseBoundingBox(request.nextUrl.searchParams.get("bbox"))

  if (!query || query.length < 2) {
    return NextResponse.json({ features: [] })
  }

  const features = await searchLocations(query, proximity, bbox)

  return NextResponse.json(
    { features },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  )
}
