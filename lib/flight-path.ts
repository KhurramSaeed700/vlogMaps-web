import type { VideoKeyframe } from "@/lib/demo-data"

export interface CompletedFlightPair<T extends VideoKeyframe = VideoKeyframe> {
  flightId: string
  takeoff: T
  landing: T
}

export function getCompletedFlightPairs<T extends VideoKeyframe>(keyframes: T[]) {
  const takeoffsByFlightId = new Map<string, T>()
  const pairs: CompletedFlightPair<T>[] = []

  for (const keyframe of keyframes) {
    if (
      keyframe.pointType !== "flight" ||
      !keyframe.flightId ||
      !keyframe.flightPhase
    ) {
      continue
    }

    if (keyframe.flightPhase === "takeoff") {
      takeoffsByFlightId.set(keyframe.flightId, keyframe)
      continue
    }

    const takeoff = takeoffsByFlightId.get(keyframe.flightId)
    if (!takeoff || keyframe.time <= takeoff.time) {
      continue
    }

    pairs.push({
      flightId: keyframe.flightId,
      takeoff,
      landing: keyframe,
    })
  }

  return pairs.sort((left, right) => left.takeoff.time - right.takeoff.time)
}

export function getFlightRouteKeyframes<T extends VideoKeyframe>(keyframes: T[]) {
  const sortedKeyframes = [...keyframes].sort((left, right) => left.time - right.time)
  const completedFlights = getCompletedFlightPairs(sortedKeyframes)
  if (completedFlights.length === 0) {
    return sortedKeyframes
  }

  return sortedKeyframes.filter((keyframe) => {
    for (const flight of completedFlights) {
      if (keyframe.time <= flight.takeoff.time || keyframe.time >= flight.landing.time) {
        continue
      }

      if (
        keyframe.pointType === "flight" &&
        keyframe.flightId === flight.flightId
      ) {
        continue
      }

      return false
    }

    return true
  })
}
