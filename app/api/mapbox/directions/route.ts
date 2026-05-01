import { NextRequest, NextResponse } from "next/server"
import { mapboxAccessToken } from "@/lib/mapbox"

interface DirectionsPayload {
  routes?: Array<{
    distance?: number
    duration?: number
  }>
}

export async function GET(request: NextRequest) {
  const start = request.nextUrl.searchParams.get("start")
  const end = request.nextUrl.searchParams.get("end")
  const waypoints = request.nextUrl.searchParams.get("waypoints")
  const profile = request.nextUrl.searchParams.get("profile") || "driving"
  const routePreference = request.nextUrl.searchParams.get("routePreference") || "fastest"

  if (!start || !end) {
    return NextResponse.json({ error: "Missing start or end coordinates." }, { status: 400 })
  }

  const waypointCoordinates = waypoints
    ?.split("|")
    .map((waypoint) => waypoint.trim())
    .filter(Boolean)
    .join(";")
  const coordinates = [start, waypointCoordinates, end].filter(Boolean).join(";")
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}`)
  url.searchParams.set("access_token", process.env.MAPBOX_ACCESS_TOKEN || mapboxAccessToken)
  url.searchParams.set("geometries", "geojson")
  url.searchParams.set("overview", "full")
  url.searchParams.set("steps", "false")
  url.searchParams.set("alternatives", "true")

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

    const payload = (await response.json()) as DirectionsPayload
    if (Array.isArray(payload.routes)) {
      payload.routes.sort((left, right) => {
        if (routePreference === "shortest") {
          const distanceDifference = (left.distance ?? Number.POSITIVE_INFINITY) - (right.distance ?? Number.POSITIVE_INFINITY)
          if (distanceDifference !== 0) {
            return distanceDifference
          }

          return (left.duration ?? Number.POSITIVE_INFINITY) - (right.duration ?? Number.POSITIVE_INFINITY)
        }

        const durationDifference = (left.duration ?? Number.POSITIVE_INFINITY) - (right.duration ?? Number.POSITIVE_INFINITY)
        if (durationDifference !== 0) {
          return durationDifference
        }

        return (left.distance ?? Number.POSITIVE_INFINITY) - (right.distance ?? Number.POSITIVE_INFINITY)
      })
    }

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch {
    return NextResponse.json({ error: "Unable to fetch map directions." }, { status: 500 })
  }
}
