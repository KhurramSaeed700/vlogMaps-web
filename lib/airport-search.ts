import type { AirportCodeLocation } from "./airport-codes"

type SearchAirport = AirportCodeLocation & { country: string }

export function normalizeAirportSearch(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l").replace(/ø/g, "o").replace(/æ/g, "ae").replace(/ß/g, "ss")
    .replace(/[đð]/g, "d").replace(/þ/g, "th").replace(/œ/g, "oe").replace(/ı/g, "i")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ").trim()
}

function editDistance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + Number(a[i - 1] !== b[j - 1]))
    }
    row = next
  }
  return row[b.length]
}

const catalogIndexes = new WeakMap<SearchAirport[], Array<{ airport: SearchAirport; code: string; city: string; text: string; words: string[] }>>()

export function searchAirports(catalog: SearchAirport[], query: string) {
  let index = catalogIndexes.get(catalog)
  if (!index) {
    index = catalog.map((airport) => {
      const text = normalizeAirportSearch(`${airport.code} ${airport.city} ${airport.name} ${airport.country}`)
      return { airport, code: normalizeAirportSearch(airport.code), city: normalizeAirportSearch(airport.city), text, words: text.split(" ") }
    })
    catalogIndexes.set(catalog, index)
  }
  const normalized = normalizeAirportSearch(query)
  if (!normalized) return catalog.slice(0, 8)
  const terms = normalized.split(" ")
  const results: Array<{ airport: SearchAirport; score: number }> = []
  for (const item of index) {
    let score = item.city === normalized ? 200 : 0
    let matched = true
    for (const term of terms) {
      if (item.code === term) score += 100
      else if (item.city === term) score += 90
      else if (item.city.startsWith(term)) score += 80
      else if (item.words.some((word) => word.startsWith(term))) score += 60
      else if (item.text.includes(term)) score += 30
      else if (term.length >= 4 && item.words.some((word) => {
        const tolerance = term.length >= 7 ? 2 : 1
        return Math.abs(word.length - term.length) <= tolerance && editDistance(term, word) <= tolerance
      })) score += 10
      else { matched = false; break }
    }
    if (matched) results.push({ airport: item.airport, score })
  }
  return results.sort((a, b) => b.score - a.score || a.airport.code.localeCompare(b.airport.code)).slice(0, 8).map((result) => result.airport)
}
