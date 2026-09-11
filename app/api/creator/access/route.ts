import { NextResponse } from "next/server"
import { CreatorAuthorizationError, requireApprovedCreator } from "@/lib/server-creator-auth"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await requireApprovedCreator()
    return NextResponse.json({ approved: true, configured: true })
  } catch (error) {
    if (error instanceof CreatorAuthorizationError) {
      return NextResponse.json(
        { approved: false, configured: error.status !== 503 },
        { status: error.status },
      )
    }
    return NextResponse.json({ approved: false, error: "Creator access is temporarily unavailable." }, { status: 503 })
  }
}
