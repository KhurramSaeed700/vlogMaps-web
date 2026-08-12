export const autoplayCountdownSeconds = 2

export function AutoplayCountdown({ seconds }: { seconds: number | null }) {
  if (seconds === null) {
    return null
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-14 z-20 flex justify-center px-4" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-full bg-slate-950/80 px-4 py-2 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-white/70">Autoplay in</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-600 text-lg font-bold leading-none">
          {Math.max(1, Math.ceil(seconds))}
        </span>
      </div>
    </div>
  )
}
