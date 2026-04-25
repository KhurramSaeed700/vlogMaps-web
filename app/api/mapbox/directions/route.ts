import { NextRequest, NextResponse } from "next/server"
import { mapboxAccessToken } from "@/lib/mapbox"

export async function GET(request: NextRequest) {
  const start = request.nextUrl.searchParams.get("start")
  const end = request.nextUrl.searchParams.get("end")
  const profile = request.nextUrl.searchParams.get("profile") || "driving"

  if (!start || !end) {
    return NextResponse.json({ error: "Missing start or end coordinates." }, { status: 400 })
  }

  const coordinates = `${start};${end}`
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}`)
  url.searchParams.set("access_token", process.env.MAPBOX_ACCESS_TOKEN || mapboxAccessToken)
  url.searchParams.set("geometries", "geojson")
  url.searchParams.set("overview", "full")
  url.searchParams.set("steps", "false")

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
      next: {
        revalidate: 3600,
      },
    })

    if (!response.ok) {
      return NextResponse.json({ error: "Mapbox directions request failed." }, { status: response.status })
    }

    const payload = await response.json()
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch {
    return NextResponse.json({ error: "Unable to fetch map directions." }, { status: 500 })
  }
}
