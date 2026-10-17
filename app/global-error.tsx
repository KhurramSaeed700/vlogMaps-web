"use client"

import { ErrorFallback } from "@/components/monitoring/error-fallback"

export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body><ErrorFallback {...props} /></body></html>
}
