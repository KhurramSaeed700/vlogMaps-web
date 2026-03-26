export function extractYouTubeId(input: string) {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  const directIdMatch = trimmed.match(/^[a-zA-Z0-9_-]{11}$/)
  if (directIdMatch) {
    return directIdMatch[0]
  }

  try {
    const url = new URL(trimmed)

    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.split("/").filter(Boolean)[0]
      return id && id.length === 11 ? id : null
    }

    if (url.hostname.includes("youtube.com")) {
      const fromQuery = url.searchParams.get("v")
      if (fromQuery && fromQuery.length === 11) {
        return fromQuery
      }

      const pathParts = url.pathname.split("/").filter(Boolean)
      const embedLikeId = pathParts[pathParts.length - 1]
      if (embedLikeId && embedLikeId.length === 11) {
        return embedLikeId
      }
    }
  } catch {
    return null
  }

  return null
}

export function getYouTubeThumbnailUrl(videoId: string) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}
