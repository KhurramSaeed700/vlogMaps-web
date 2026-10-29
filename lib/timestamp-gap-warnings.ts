export interface TimestampGapPoint {
  id: string
  time: number
  pointType?: string
  stopEndTime?: number
}

export interface TimestampGapWarning {
  fromId: string
  toId: string
  time: number
  gapSeconds: number
}

// A stop occupies its entire interval; use its end rather than its start when
// checking the transition to the next location. Never mutate the editor state.
export function getTimestampGapWarnings(points: readonly TimestampGapPoint[]): TimestampGapWarning[] {
  const ordered = points.filter(point => Number.isFinite(point.time) && point.time >= 0).slice().sort((a, b) => a.time - b.time)
  const warnings: TimestampGapWarning[] = []
  for (let index = 1; index < ordered.length; index++) {
    const previous = ordered[index - 1], next = ordered[index]
    const end = previous.pointType === "stop" && Number.isFinite(previous.stopEndTime) && previous.stopEndTime! > previous.time
      ? previous.stopEndTime! : previous.time
    const gapSeconds = Math.max(0, next.time - end)
    if (gapSeconds < 1) warnings.push({ fromId: previous.id, toId: next.id, time: next.time, gapSeconds })
  }
  return warnings
}
