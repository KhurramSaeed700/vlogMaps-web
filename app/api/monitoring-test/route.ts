import { flush } from "@sentry/nextjs"
import { NextResponse } from "next/server"
import { reportServerFailure } from "@/lib/monitoring/server"

export async function POST() {
  if (process.env.NODE_ENV !== "development") return new NextResponse(null, { status: 404 })
  const { requestId, eventId } = reportServerFailure(new Error("VlogMaps server monitoring verification"), "monitoring.server_verification")
  await flush(5000)
  return NextResponse.json({ requestId, eventId }, { status: 503, headers: { "X-Request-Id": requestId } })
}
