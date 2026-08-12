import type { RouteCoordinate } from "@/lib/mapbox-directions"

interface FlightAirplaneMarkerParts {
  body: HTMLElement
  shadow: HTMLElement
}

const flightAirplaneMarkerParts = new WeakMap<HTMLElement, FlightAirplaneMarkerParts>()
let flightAirplaneMarkerId = 0

export const flightAirplaneMarkerScale = 1.5
export const flightPathLineWidth = 3
export const flightPathOutlineWidth = 5

export function applyFlightAirplaneMarkerSize(element: HTMLElement, travelerMarkerSize: number) {
  const size = travelerMarkerSize * flightAirplaneMarkerScale
  element.style.width = `${size}px`
  element.style.height = `${size}px`
}

export function getRouteBearing(start: RouteCoordinate, end: RouteCoordinate) {
  const startLat = (start[1] * Math.PI) / 180
  const endLat = (end[1] * Math.PI) / 180
  const rawDeltaLng = ((end[0] - start[0]) * Math.PI) / 180
  const deltaLng = Math.atan2(Math.sin(rawDeltaLng), Math.cos(rawDeltaLng))
  const y = Math.sin(deltaLng) * Math.cos(endLat)
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLng)

  return (Math.atan2(y, x) * 180) / Math.PI
}

export function getRouteBearingAtProgress(
  coordinates: RouteCoordinate[],
  cumulativeDistances: number[],
  totalDistance: number,
  progress: number,
) {
  if (coordinates.length < 2 || cumulativeDistances.length !== coordinates.length) {
    return null
  }

  const targetDistance = Math.min(Math.max(progress, 0), 1) * Math.max(totalDistance, 0)
  let low = 1
  let high = cumulativeDistances.length - 1

  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (cumulativeDistances[middle] < targetDistance) {
      low = middle + 1
    } else {
      high = middle
    }
  }

  const nextIndex = low
  const previousIndex = Math.max(0, nextIndex - 1)
  return getRouteBearing(coordinates[previousIndex], coordinates[nextIndex])
}

export function createFlightAirplaneMarkerElement(travelerMarkerSize = 20) {
  const element = document.createElement("div")
  const markerId = `flight-airplane-${flightAirplaneMarkerId++}`
  element.className = "flight-airplane-marker"
  element.setAttribute("aria-hidden", "true")
  element.style.cssText = `
    display: block;
    pointer-events: none;
    user-select: none;
    will-change: transform;
    contain: layout paint style;
  `
  applyFlightAirplaneMarkerSize(element, travelerMarkerSize)
  element.innerHTML = `
    <div
      data-flight-airplane-shadow
      style="position:absolute;left:24%;right:24%;bottom:5%;height:12%;border-radius:999px;background:rgba(2,6,23,.3);filter:blur(4px);transform:translate3d(0,3px,0);transform-origin:center;will-change:transform,opacity;"
    ></div>
    <div
      data-flight-airplane-body
      style="position:absolute;inset:0;transform-origin:50% 52%;will-change:transform;"
    >
      <svg viewBox="0 0 72 72" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 2px 1px rgba(15,23,42,.42)) drop-shadow(0 5px 5px rgba(15,23,42,.2));">
        <defs>
          <linearGradient id="${markerId}-wing" x1="8" y1="27" x2="63" y2="48" gradientUnits="userSpaceOnUse">
            <stop stop-color="#dbeafe" />
            <stop offset=".48" stop-color="#ffffff" />
            <stop offset="1" stop-color="#bfdbfe" />
          </linearGradient>
          <linearGradient id="${markerId}-body" x1="29" y1="5" x2="43" y2="67" gradientUnits="userSpaceOnUse">
            <stop stop-color="#ffffff" />
            <stop offset=".55" stop-color="#f8fafc" />
            <stop offset="1" stop-color="#cbd5e1" />
          </linearGradient>
          <linearGradient id="${markerId}-cockpit" x1="32" y1="8" x2="40" y2="21" gradientUnits="userSpaceOnUse">
            <stop stop-color="#67e8f9" />
            <stop offset="1" stop-color="#0369a1" />
          </linearGradient>
        </defs>
        <path
          d="M31.7 27.2 8.9 40.8c-1.8 1.1-2.9 3-2.9 5.1v2.5l26.6-7.5 6.8.1L66 48.4v-2.5c0-2.1-1.1-4-2.9-5.1L40.3 27.2Z"
          fill="url(#${markerId}-wing)"
          stroke="#334155"
          stroke-width="1.35"
          stroke-linejoin="round"
        />
        <path
          d="m32.8 51.4-12 8.2v3.1l13.5-3.5h3.4l13.5 3.5v-3.1l-12-8.2Z"
          fill="url(#${markerId}-wing)"
          stroke="#334155"
          stroke-width="1.2"
          stroke-linejoin="round"
        />
        <path
          d="M36 4.5c-3.3 0-5.2 4.7-5.2 11.2l1.5 37.5 1.4 11.9c.3 2.9 4.3 2.9 4.6 0l1.4-11.9 1.5-37.5C41.2 9.2 39.3 4.5 36 4.5Z"
          fill="url(#${markerId}-body)"
          stroke="#334155"
          stroke-width="1.45"
          stroke-linejoin="round"
        />
        <path d="M32.7 17.5c.4-5.4 1.6-8.8 3.3-8.8s2.9 3.4 3.3 8.8l.1 2.7h-6.8Z" fill="url(#${markerId}-cockpit)" stroke="#075985" stroke-width=".85" />
        <path d="M32 29.2h8l-.3 7.3h-7.4Z" fill="#0284c7" />
        <path d="M32.5 40.3h7l-.2 5.2h-6.6Z" fill="#0ea5e9" opacity=".9" />
        <path d="M8.2 43.9 31.9 31l.2 4.2L7 46.3c.1-.9.5-1.7 1.2-2.4Zm55.6 0L40.1 31l-.2 4.2L65 46.3c-.1-.9-.5-1.7-1.2-2.4Z" fill="#38bdf8" opacity=".78" />
        <circle cx="7.8" cy="46.3" r="1.45" fill="#ef4444" stroke="#fff" stroke-width=".7" />
        <circle cx="64.2" cy="46.3" r="1.45" fill="#22c55e" stroke="#fff" stroke-width=".7" />
        <path d="M35.2 22.5h1.6v37.3h-1.6z" fill="#ffffff" opacity=".7" />
      </svg>
    </div>
  `

  const body = element.querySelector<HTMLElement>("[data-flight-airplane-body]")
  const shadow = element.querySelector<HTMLElement>("[data-flight-airplane-shadow]")
  if (body && shadow) {
    flightAirplaneMarkerParts.set(element, { body, shadow })
  }

  return element
}

export function updateFlightAirplaneMarkerElement(element: HTMLElement, progress: number) {
  const markerParts = flightAirplaneMarkerParts.get(element)
  if (!markerParts) {
    return
  }

  const clampedProgress = Math.min(Math.max(progress, 0), 1)
  const flightArc = Math.sin(clampedProgress * Math.PI)
  const bank = Math.sin(clampedProgress * Math.PI * 2) * 1.6
  const lift = flightArc * -2
  markerParts.body.style.transform = `translate3d(0, ${lift}px, 0) skewX(${bank}deg)`
  markerParts.shadow.style.opacity = `${0.34 - flightArc * 0.13}`
  markerParts.shadow.style.transform = `translate3d(0, ${3 - lift * 0.25}px, 0) scale(${1 + flightArc * 0.14})`
}
