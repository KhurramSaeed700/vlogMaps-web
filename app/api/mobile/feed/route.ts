import { mobileApiError, mobileJson, mobileOptions } from "@/lib/mobile-api-response"
import { listPublishedMobileVideos } from "@/lib/mobile-viewer"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return mobileJson({ videos: await listPublishedMobileVideos() })
  } catch (error) {
    return mobileApiError(error)
  }
}

export function OPTIONS() {
  return mobileOptions()
}
