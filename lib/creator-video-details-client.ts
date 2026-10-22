import type { YouTubeVideoDetails } from "@/lib/youtube-video-details"

const cache = new Map<string, YouTubeVideoDetails & { fetchedAt: number }>()
const inFlight = new Map<string, Promise<YouTubeVideoDetails[]>>()
const cacheKey = "travelmap:youtube-video-details:v1:"
const freshForMs = 15 * 60 * 1000

function read(id: string) {
  if (!cache.has(id)) {
    try {
      const value = JSON.parse(window.localStorage.getItem(cacheKey + id) || "null")
      if (value?.youtubeId === id && Number.isFinite(value.fetchedAt) && (value.durationSeconds === null || Number.isFinite(value.durationSeconds) && value.durationSeconds > 0) && (value.views === null || Number.isFinite(value.views) && value.views >= 0)) cache.set(id, value)
    } catch { /* Storage can be disabled. */ }
  }
  return cache.get(id)
}
function remember(item: YouTubeVideoDetails) {
  const old = read(item.youtubeId)
  if (!item.durationSeconds && item.views === null) return
  const value = { ...item, durationSeconds: item.durationSeconds || old?.durationSeconds || null, views: item.views ?? old?.views ?? null, fetchedAt: Date.now() }
  cache.set(item.youtubeId, value)
  try { window.localStorage.setItem(cacheKey + item.youtubeId, JSON.stringify(value)) } catch { /* Use memory cache. */ }
}
const pause = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms))

export async function fetchCreatorVideoDetails(ids: string[]): Promise<YouTubeVideoDetails[]> {
  const unique = [...new Set(ids)]
  const missing = unique.filter(id => { const value = read(id); return !value?.durationSeconds || Date.now() - value.fetchedAt > freshForMs })
  for (let offset = 0; offset < missing.length; offset += 50) {
    const batch = missing.slice(offset, offset + 50)
    const key = [...batch].sort().join(',')
    let work = inFlight.get(key)
    if (!work) {
      work = (async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          let retryDelay = 1000 * (attempt + 1)
          try {
            const response = await fetch('/api/creator/video-details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: batch }), signal: AbortSignal.timeout(45000), cache: 'no-store' })
            if (response.status === 401 || response.status === 403) return []
            if (response.status === 429) retryDelay = Math.min(60000, Math.max(retryDelay, Number(response.headers?.get('Retry-After') || 0) * 1000))
            if (!response.ok) throw new Error('Metadata temporarily unavailable')
            const body = await response.json() as { items: YouTubeVideoDetails[]; retryable?: boolean }
            body.items.forEach(remember)
            if (!body.retryable) return body.items
          } catch { /* Retry transient failures; do not cache a failed lookup. */ }
          if (attempt < 2) await pause(retryDelay)
        }
        return []
      })().finally(() => inFlight.delete(key))
      inFlight.set(key, work)
    }
    await work
  }
  return unique.map(id => read(id) ?? { youtubeId: id, durationSeconds: null, views: null })
}

export function rememberPlayerDuration(youtubeId: string, durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return
  remember({ youtubeId, durationSeconds, views: null })
  // Save the actual player duration independently of timestamp autosave.
  void (async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch('/api/creator/video-details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [youtubeId], observedDurations: { [youtubeId]: durationSeconds } }), keepalive: true, signal: AbortSignal.timeout(45000) })
        if (response.ok || response.status === 401 || response.status === 403) return
      } catch { /* Keep the local duration and retry cloud persistence. */ }
      if (attempt < 2) await pause(1000 * (attempt + 1))
    }
  })()
}
