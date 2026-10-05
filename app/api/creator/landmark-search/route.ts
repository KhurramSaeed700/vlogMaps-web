import { createHash } from "node:crypto"
import { CreatorAuthorizationError, requireApprovedCreator } from "@/lib/server-creator-auth"
import { parseLandmarkResults, type LandmarkResult } from "@/lib/landmark-search"

export const runtime = "nodejs"
const maxBodyBytes = 3_000_000
// Best-effort instance-local limits. Configure Google Cloud quotas for a global spending guardrail.
const requests = new Map<string, { count: number; expires: number }>()
const cache = new Map<string, { results: LandmarkResult[]; expires: number }>()

export async function POST(request: Request) {
  try {
    const creator = await requireApprovedCreator()
    const key = process.env.GOOGLE_CLOUD_VISION_API_KEY
    if (!key) return Response.json({ error: "Automatic recognition is not configured. Set GOOGLE_CLOUD_VISION_API_KEY on the server, or use Google Lens below." }, { status: 503 })
    if (Number(request.headers.get("content-length")) > maxBodyBytes) {
      return Response.json({ error: "Image is too large." }, { status: 413 })
    }
    const reader = request.body?.getReader()
    if (!reader) return Response.json({ error: "An image is required." }, { status: 400 })
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBodyBytes) {
        await reader.cancel()
        return Response.json({ error: "Image is too large." }, { status: 413 })
      }
      chunks.push(value)
    }
    let payload
    try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) } catch {
      return Response.json({ error: "Invalid image request." }, { status: 400 })
    }
    const image = payload?.image
    if (typeof image !== "string" || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image)) {
      return Response.json({ error: "Provide a JPEG screenshot." }, { status: 400 })
    }
    const content = image.slice(image.indexOf(",") + 1)
    const bytes = Buffer.from(content, "base64")
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      return Response.json({ error: "Invalid JPEG image." }, { status: 400 })
    }
    const now = Date.now()
    for (const [id, item] of requests) if (item.expires <= now) requests.delete(id)
    for (const [id, item] of cache) if (item.expires <= now) cache.delete(id)
    const hash = createHash("sha256").update(creator.userId).update(bytes.toString("base64")).digest("hex")
    const cached = cache.get(hash)
    if (cached) return Response.json({ results: cached.results }, { headers: { "Cache-Control": "no-store" } })
    const usage = requests.get(creator.userId) ?? { count: 0, expires: now + 3_600_000 }
    if (usage.count >= 20) return Response.json({ error: "Recognition limit reached (20 searches per hour). Use Google Lens or try later." }, { status: 429 })
    usage.count++
    requests.set(creator.userId, usage)
    const response = await fetch("https://vision.googleapis.com/v1/images:annotate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
      body: JSON.stringify({ requests: [{ image: { content }, features: [{ type: "LANDMARK_DETECTION", maxResults: 5 }] }] }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    })
    if (!response.ok) return Response.json({ error: "Google recognition is unavailable. Check the server API key, billing, and Vision API access, or use Google Lens." }, { status: 502 })
    const data = await response.json()
    if (data.responses?.[0]?.error) return Response.json({ error: "Google could not analyze this image. Try another frame or Google Lens." }, { status: 502 })
    const results = parseLandmarkResults(data.responses?.[0]?.landmarkAnnotations)
    if (cache.size >= 100) cache.delete(cache.keys().next().value!)
    cache.set(hash, { results, expires: now + 3_600_000 })
    return Response.json({ results }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof CreatorAuthorizationError) return Response.json({ error: error.message }, { status: error.status })
    return Response.json({ error: "Recognition failed or timed out. Try again or use Google Lens." }, { status: 500 })
  }
}
