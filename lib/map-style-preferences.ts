export const mapStyles = ["satellite", "streets", "terrain"] as const
export type MapStyle = (typeof mapStyles)[number]
export const defaultMapStyle: MapStyle = "streets"
export const mapStyleStorageKey = "travelmap.default-map-style.v1"
export const mapStyleChangedEvent = "travelmap:default-map-style-changed"

export function isMapStyle(value: unknown): value is MapStyle {
  return mapStyles.some(style => style === value)
}

export function readDefaultMapStyle(): MapStyle {
  if (typeof window === "undefined") return defaultMapStyle
  try {
    const value = window.localStorage.getItem(mapStyleStorageKey)
    return isMapStyle(value) ? value : defaultMapStyle
  } catch { return defaultMapStyle }
}

export function writeDefaultMapStyle(style: MapStyle) {
  if (!isMapStyle(style) || typeof window === "undefined") return
  try { window.localStorage.setItem(mapStyleStorageKey, style) } catch { /* Still apply in this tab. */ }
  window.dispatchEvent(new CustomEvent(mapStyleChangedEvent, { detail: style }))
}
