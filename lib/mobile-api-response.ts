import { NextResponse } from "next/server"
import { MobileViewerUnavailableError } from "@/lib/mobile-viewer"

const publicHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
}

export function mobileJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: publicHeaders })
}

export function mobileOptions() {
  return new NextResponse(null, { status: 204, headers: publicHeaders })
}

export function mobileApiError(error: unknown) {
  if (error instanceof MobileViewerUnavailableError) {
    return mobileJson({ error: error.message }, 503)
  }

  console.error("Mobile viewer API error", error)
  return mobileJson({ error: "Unable to load published travel videos." }, 500)
}
