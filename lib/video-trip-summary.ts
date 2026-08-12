import type { VideoKeyframe } from "@/lib/demo-data"

const earthRadiusKm = 6371

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180
}

function getCoordinateDistanceKm(left: VideoKeyframe, right: VideoKeyframe) {
  const latitudeDelta = degreesToRadians(right.lat - left.lat)
  const longitudeDelta = degreesToRadians(right.lng - left.lng)
  const leftLatitude = degreesToRadians(left.lat)
  const rightLatitude = degreesToRadians(right.lat)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

export function getVideoTravelDistanceKm(keyframes: VideoKeyframe[]) {
  return keyframes.slice(1).reduce((totalDistance, keyframe, index) => {
    return totalDistance + getCoordinateDistanceKm(keyframes[index], keyframe)
  }, 0)
}

export function formatTravelDistance(distanceKm: number) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return "0 km"
  }

  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`
  }

  const roundedDistance = distanceKm < 100 ? Math.round(distanceKm * 10) / 10 : Math.round(distanceKm)
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(roundedDistance)} km`
}

export function formatVideoReleaseDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "Unknown date"
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}
