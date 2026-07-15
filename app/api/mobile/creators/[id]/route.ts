import { mobileApiError, mobileJson, mobileOptions } from "@/lib/mobile-api-response"
import { getPublishedMobileCreator } from "@/lib/mobile-viewer"

export const dynamic = "force-dynamic"

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const result = await getPublishedMobileCreator((await context.params).id)
    return result ? mobileJson(result) : mobileJson({ error: "Creator not found." }, 404)
  } catch (error) {
    return mobileApiError(error)
  }
}

export function OPTIONS() {
  return mobileOptions()
}
