export interface MapConnectionHints {
  effectiveType?: string
  downlink?: number
  rtt?: number
  saveData?: boolean
}

export function getMapPreloadPolicy(connection?: MapConnectionHints, online = true, observed?: { latencyMs: number; samples: number; pending: number }) {
  if (!online || connection?.saveData) {
    return { seconds: 0, samples: 0, delayMs: 2000, maxTargets: 0 }
  }
  if (
    (observed && (observed.latencyMs > 1800 || observed.pending > 48)) ||
    connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g" ||
    (connection?.downlink !== undefined && connection.downlink < 1) ||
    (connection?.rtt !== undefined && connection.rtt > 600)
  ) {
    return { seconds: 6, samples: 2, delayMs: 1800, maxTargets: 3 }
  }
  if (
    (observed && observed.samples >= 4 && observed.latencyMs > 700) ||
    connection?.effectiveType === "3g" ||
    (connection?.downlink !== undefined && connection.downlink < 4)
  ) {
    return { seconds: 12, samples: 4, delayMs: 800, maxTargets: 6 }
  }
  if ((observed && observed.samples >= 8 && observed.latencyMs < 300 && observed.pending < 12) || (connection?.downlink !== undefined && connection.downlink >= 8)) {
    return { seconds: 45, samples: 12, delayMs: 220, maxTargets: 18 }
  }
  // Browsers without connection estimates use a bounded, moderate buffer.
  return { seconds: 20, samples: 6, delayMs: 500, maxTargets: 10 }
}

export function readMapPreloadPolicy(observed?: { latencyMs: number; samples: number; pending: number }) {
  const browser = navigator as Navigator & { connection?: MapConnectionHints }
  return getMapPreloadPolicy(browser.connection, browser.onLine, observed)
}
