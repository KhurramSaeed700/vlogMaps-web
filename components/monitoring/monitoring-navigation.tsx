"use client"

import * as Sentry from "@sentry/nextjs"
import { usePathname } from "next/navigation"
import { useEffect } from "react"
import { diagnosticEvent } from "@/lib/monitoring/diagnostics"

export function MonitoringNavigation() {
  const pathname = usePathname()
  useEffect(() => {
    const page = pathname.startsWith("/watch/") ? "watch" : pathname.startsWith("/creator/") ? "creator" : "public"
    Sentry.setTag("page", page)
    Sentry.setContext("viewport", { width: window.innerWidth, height: window.innerHeight })
    diagnosticEvent("navigation", { page, path: pathname })
  }, [pathname])
  useEffect(() => {
    const online = () => diagnosticEvent("network.online")
    const offline = () => diagnosticEvent("network.offline")
    const visibility = () => diagnosticEvent("page.visibility", { state: document.visibilityState })
    window.addEventListener("online", online)
    window.addEventListener("offline", offline)
    document.addEventListener("visibilitychange", visibility)
    return () => {
      window.removeEventListener("online", online)
      window.removeEventListener("offline", offline)
      document.removeEventListener("visibilitychange", visibility)
    }
  }, [])
  return null
}
