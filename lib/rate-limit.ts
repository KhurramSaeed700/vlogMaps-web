import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

interface RateLimitOptions {
  keyPrefix: string
  limit: number
  windowMs: number
}

const buckets = new Map<string, { count: number; resetAt: number }>()

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const realIp = request.headers.get("x-real-ip")?.trim()
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()

  return forwardedFor || realIp || vercelForwardedFor || "unknown"
}

export function checkRateLimit(request: NextRequest, options: RateLimitOptions) {
  const now = Date.now()
  const ip = getClientIp(request)
  const key = `${options.keyPrefix}:${ip}`
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    })
    return null
  }

  if (bucket.count >= options.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds),
        },
      },
    )
  }

  bucket.count += 1
  return null
}
