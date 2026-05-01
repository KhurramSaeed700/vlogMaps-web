interface LocationSearchRequestInit extends RequestInit {
  next?: {
    revalidate?: number
  }
}

export async function fetchLocationSearchJson<T>(url: URL, headers: HeadersInit = {}, timeoutMs = 4500) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        ...headers,
      },
      next: {
        revalidate: 3600,
      },
      signal: controller.signal,
    } as LocationSearchRequestInit)

    if (!response.ok) {
      return null
    }

    return (await response.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
