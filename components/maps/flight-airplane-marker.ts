import type { RouteCoordinate } from "@/lib/mapbox-directions"

const airplaneSvgPaths = `
  <path d="M32 3c-2.8 0-4.7 3.2-5.1 8.1l-1.2 14.4L7.5 37.1c-1.2.8-1.9 2.1-1.9 3.5v3.8l20-6.4-.8 10.3-7 5.2v3.1l12.3-3.2 1.9 7.3 1.9-7.3 12.3 3.2v-3.1l-7-5.2-.8-10.3 20 6.4v-3.8c0-1.4-.7-2.7-1.9-3.5L38.3 25.5l-1.2-14.4C36.7 6.2 34.8 3 32 3Z" />
`

export function getRouteBearing(start: RouteCoordinate, end: RouteCoordinate) {
  const startLat = (start[1] * Math.PI) / 180
  const endLat = (end[1] * Math.PI) / 180
  const deltaLng = ((end[0] - start[0]) * Math.PI) / 180
  const y = Math.sin(deltaLng) * Math.cos(endLat)
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLng)

  return (Math.atan2(y, x) * 180) / Math.PI
}

export function createFlightAirplaneMarkerElement(size = 62) {
  const element = document.createElement("div")
  element.className = "flight-airplane-marker"
  element.setAttribute("aria-hidden", "true")
  element.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    display: block;
    pointer-events: none;
    user-select: none;
    perspective: 180px;
    transform-style: preserve-3d;
    will-change: transform;
    contain: layout paint style;
  `
  element.innerHTML = `
    <div
      data-flight-airplane-shadow
      style="position:absolute;left:18%;right:18%;bottom:4%;height:18%;border-radius:999px;background:rgba(15,23,42,.32);filter:blur(5px);transform:translateY(5px);"
    ></div>
    <div
      data-flight-airplane-body
      style="position:absolute;inset:0;transform-style:preserve-3d;transform-origin:50% 50%;transition:transform 120ms linear;will-change:transform;"
    >
      <svg viewBox="0 0 64 64" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;transform:translate3d(0,4px,-5px);filter:blur(.35px);opacity:.68;">
        <g fill="#0f172a">${airplaneSvgPaths}</g>
      </svg>
      <svg viewBox="0 0 64 64" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 5px 4px rgba(15,23,42,.34));">
        <defs>
          <linearGradient id="flight-airplane-fuselage" x1="12" y1="8" x2="50" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#ffffff" />
            <stop offset=".5" stop-color="#e2e8f0" />
            <stop offset="1" stop-color="#94a3b8" />
          </linearGradient>
          <linearGradient id="flight-airplane-window" x1="26" y1="8" x2="39" y2="24" gradientUnits="userSpaceOnUse">
            <stop stop-color="#7dd3fc" />
            <stop offset="1" stop-color="#0369a1" />
          </linearGradient>
        </defs>
        <g fill="url(#flight-airplane-fuselage)" stroke="#475569" stroke-width="1.15" stroke-linejoin="round">
          ${airplaneSvgPaths}
        </g>
        <path d="M29.2 12.2c.4-3.4 1.4-5.4 2.8-5.4s2.4 2 2.8 5.4l.5 6.1h-6.6l.5-6.1Z" fill="url(#flight-airplane-window)" stroke="#0c4a6e" stroke-width=".8" />
        <path d="M31.1 20h1.8v34.2h-1.8z" fill="#0284c7" opacity=".9" />
        <path d="M10.5 39.5 26 30.1l-.4 4.6-15.1 5.8v-1Zm43 0L38 30.1l.4 4.6 15.1 5.8v-1Z" fill="#f8fafc" opacity=".9" />
      </svg>
    </div>
  `

  return element
}

export function updateFlightAirplaneMarkerElement(element: HTMLElement, progress: number) {
  const body = element.querySelector<HTMLElement>("[data-flight-airplane-body]")
  const shadow = element.querySelector<HTMLElement>("[data-flight-airplane-shadow]")
  if (!body || !shadow) {
    return
  }

  const clampedProgress = Math.min(Math.max(progress, 0), 1)
  const bank = Math.sin(clampedProgress * Math.PI * 2) * 7
  const lift = Math.sin(clampedProgress * Math.PI) * -3
  body.style.transform = `translate3d(0, ${lift}px, 0) rotateX(48deg) rotateY(${bank}deg)`
  shadow.style.opacity = `${0.4 - Math.sin(clampedProgress * Math.PI) * 0.15}`
  shadow.style.transform = `translateY(${5 - lift * 0.35}px) scale(${1 + Math.sin(clampedProgress * Math.PI) * 0.12})`
}
