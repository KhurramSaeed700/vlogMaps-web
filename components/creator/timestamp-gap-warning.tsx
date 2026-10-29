import { TriangleAlert } from "lucide-react"
import { formatDuration } from "@/lib/demo-data"
import type { TimestampGapWarning as Gap } from "@/lib/timestamp-gap-warnings"

export function TimestampGapWarning({ warning }: { warning: Gap }) {
  return <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
    <span>Less than 1s between locations near {formatDuration(warning.time)} can cause sharp, abrupt map motion. Space the timestamps farther apart.</span>
  </p>
}
