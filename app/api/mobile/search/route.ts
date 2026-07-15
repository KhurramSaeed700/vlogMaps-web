import { mobileApiError, mobileJson, mobileOptions } from "@/lib/mobile-api-response"
import { listPublishedMobileVideos } from "@/lib/mobile-viewer"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() || ""
  if (!query) {
    return mobileJson({ videos: [] })
  }
  if (query.length > 100) {
    return mobileJson({ error: "Search query is too long." }, 400)
  }

  try {
    return mobileJson({ videos: await listPublishedMobileVideos(query) })
  } catch (error) {
    return mobileApiError(error)
  }
}

export function OPTIONS() {
  return mobileOptions()
}
