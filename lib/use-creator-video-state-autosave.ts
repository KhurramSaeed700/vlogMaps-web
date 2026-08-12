"use client"

import { useCallback, useEffect, useRef } from "react"
import type { CreatorVideoState } from "@/lib/creator-video-state"
import { saveCreatorVideoState } from "@/lib/creator-video-state-client"
import {
  clearCreatorVideoStateLocalCache,
  saveCreatorVideoStateLocalCache,
} from "@/lib/creator-video-state-local"
import {
  clearPendingCreatorVideoState,
  loadPendingCreatorVideoState,
  savePendingCreatorVideoState,
} from "@/lib/creator-video-state-outbox"

export type CreatorAutosaveStatus = "saved" | "pending" | "retrying" | "local-error"

interface CreatorVideoStateAutosaveOptions {
  videoId: string
  onStatusChange: (status: CreatorAutosaveStatus) => void
}

interface NetworkInformationLike extends EventTarget {
  effectiveType?: string
  saveData?: boolean
}

const minimumRetryDelayMs = 2_000
const maximumRetryDelayMs = 60_000

function getNetworkInformation() {
  if (typeof navigator === "undefined") {
    return null
  }

  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection ?? null
}

function getAutosaveDelayMs() {
  const connection = getNetworkInformation()
  if (connection?.saveData || connection?.effectiveType === "slow-2g") {
    return 5_000
  }

  if (connection?.effectiveType === "2g") {
    return 3_500
  }

  if (connection?.effectiveType === "3g") {
    return 1_800
  }

  return 900
}

export function useCreatorVideoStateAutosave({ videoId, onStatusChange }: CreatorVideoStateAutosaveOptions) {
  const saveTimerRef = useRef<number | null>(null)
  const saveInFlightRef = useRef(false)
  const retryDelayRef = useRef(minimumRetryDelayMs)
  const flushPendingSaveRef = useRef<() => void>(() => undefined)
  const statusChangeRef = useRef(onStatusChange)

  useEffect(() => {
    statusChangeRef.current = onStatusChange
  }, [onStatusChange])

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
  }, [])

  const schedulePendingSave = useCallback((delayMs = getAutosaveDelayMs()) => {
    if (typeof window === "undefined") {
      return
    }

    clearSaveTimer()
    if (!navigator.onLine) {
      statusChangeRef.current("pending")
      return
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      flushPendingSaveRef.current()
    }, Math.max(0, delayMs))
  }, [clearSaveTimer])

  const flushPendingSave = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.onLine) {
      statusChangeRef.current("pending")
      return
    }

    if (saveInFlightRef.current) {
      schedulePendingSave(250)
      return
    }

    const pendingState = loadPendingCreatorVideoState(videoId)
    if (!pendingState) {
      statusChangeRef.current("saved")
      return
    }

    saveInFlightRef.current = true
    try {
      const response = await saveCreatorVideoState(videoId, pendingState.state)
      if (response?.configured && response.saved) {
        retryDelayRef.current = minimumRetryDelayMs
        const clearedLatestRevision = clearPendingCreatorVideoState(videoId, pendingState.revision)
        if (clearedLatestRevision) {
          clearCreatorVideoStateLocalCache(videoId)
          statusChangeRef.current("saved")
        } else {
          schedulePendingSave(100)
        }
        return
      }

      statusChangeRef.current("retrying")
      schedulePendingSave(retryDelayRef.current)
      retryDelayRef.current = Math.min(retryDelayRef.current * 2, maximumRetryDelayMs)
    } catch {
      statusChangeRef.current("retrying")
      schedulePendingSave(retryDelayRef.current)
      retryDelayRef.current = Math.min(retryDelayRef.current * 2, maximumRetryDelayMs)
    } finally {
      saveInFlightRef.current = false
    }
  }, [schedulePendingSave, videoId])

  useEffect(() => {
    flushPendingSaveRef.current = () => {
      void flushPendingSave()
    }
  }, [flushPendingSave])

  useEffect(() => {
    retryDelayRef.current = minimumRetryDelayMs
    schedulePendingSave(0)

    const handleOnline = () => {
      retryDelayRef.current = minimumRetryDelayMs
      schedulePendingSave(0)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearSaveTimer()
        flushPendingSaveRef.current()
      }
    }
    const handlePageHide = () => {
      clearSaveTimer()
      flushPendingSaveRef.current()
    }
    const connection = getNetworkInformation()

    window.addEventListener("online", handleOnline)
    window.addEventListener("pagehide", handlePageHide)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    connection?.addEventListener("change", handleOnline)

    return () => {
      clearSaveTimer()
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("pagehide", handlePageHide)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      connection?.removeEventListener("change", handleOnline)
    }
  }, [clearSaveTimer, schedulePendingSave, videoId])

  const saveState = useCallback((state: CreatorVideoState) => {
    const pendingState = savePendingCreatorVideoState(videoId, state)
    const localStateSaved = saveCreatorVideoStateLocalCache(videoId, state)

    if (!pendingState) {
      statusChangeRef.current("local-error")
      return false
    }

    statusChangeRef.current(localStateSaved ? "pending" : "local-error")
    schedulePendingSave()
    return true
  }, [schedulePendingSave, videoId])

  return {
    saveState,
    schedulePendingSave,
  }
}
