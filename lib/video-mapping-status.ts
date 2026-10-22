import type { TravelVideo } from "@/lib/demo-data"

export type VideoMappingStatus = "not-mapped" | "mapping" | "mapped" | "checking"

export function getVideoMappingStatus(video: Pick<TravelVideo, "keyframes" | "durationSeconds">): VideoMappingStatus {
  if (!video.keyframes.length) return "not-mapped"
  // Unknown duration cannot establish that the mapping has reached the end.
  if (!Number.isFinite(video.durationSeconds) || video.durationSeconds <= 0) return "checking"
  const lastTime = video.keyframes.reduce((latest, point) => Math.max(latest,
    Number.isFinite(point.time) ? point.time : 0,
    Number.isFinite(point.stopEndTime) ? point.stopEndTime! : 0), 0)
  return lastTime >= Math.max(0, video.durationSeconds - 300) ? "mapped" : "mapping"
}
