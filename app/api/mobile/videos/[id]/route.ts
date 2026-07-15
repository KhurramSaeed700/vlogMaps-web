import { mobileApiError, mobileJson, mobileOptions } from "@/lib/mobile-api-response"
import { getPublishedMobileVideo } from "@/lib/mobile-viewer"

export const dynamic = "force-dynamic"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const video = await getPublishedMobileVideo((await context.params).id)
    return video ? mobileJson({ video }) : mobileJson({ error: "Video not found." }, 404)
  } catch (error) {
    return mobileApiError(error)
  }
}

export function OPTIONS() {
  return mobileOptions()
}
