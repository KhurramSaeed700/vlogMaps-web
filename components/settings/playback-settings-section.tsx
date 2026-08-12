"use client"

import * as SliderPrimitive from "@radix-ui/react-slider"
import { Volume2 } from "lucide-react"
import type { PlaybackPreferences } from "@/lib/playback-preferences"

interface PlaybackSettingsSectionProps {
  preferences: PlaybackPreferences
  onChange: (updates: Partial<PlaybackPreferences>) => void
  tone?: "default" | "dark"
}

export function PlaybackSettingsSection({
  preferences,
  onChange,
  tone = "default",
}: PlaybackSettingsSectionProps) {
  const isDark = tone === "dark"
  const headingClass = isDark ? "text-white/55" : "text-muted-foreground"
  const labelClass = isDark ? "text-white" : "text-popover-foreground"
  const mutedClass = isDark ? "text-white/55" : "text-muted-foreground"

  return (
    <div className="pb-1">
      <div className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${headingClass}`}>
        Playback
      </div>
      <div className="px-2.5 py-2">
        <div className="mb-2 flex items-center gap-2">
          <Volume2 className={`h-4 w-4 shrink-0 ${mutedClass}`} aria-hidden="true" />
          <label htmlFor="travelmap-video-volume" className={`flex-1 text-sm font-medium ${labelClass}`}>
            Video volume
          </label>
          <span className={`min-w-9 text-right text-xs tabular-nums ${mutedClass}`}>
            {preferences.volume}%
          </span>
        </div>
        <SliderPrimitive.Root
          id="travelmap-video-volume"
          aria-label="Video volume"
          min={0}
          max={100}
          step={5}
          value={[preferences.volume]}
          onValueChange={([volume]) => onChange({ volume })}
          className="relative flex h-5 w-full touch-none select-none items-center"
        >
          <SliderPrimitive.Track
            className={`relative h-1.5 w-full grow overflow-hidden rounded-full ${
              isDark ? "bg-white/15" : "bg-muted"
            }`}
          >
            <SliderPrimitive.Range className="absolute h-full bg-emerald-500" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            className={`block h-4 w-4 rounded-full border-2 border-emerald-500 shadow outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 ${
              isDark
                ? "bg-white focus-visible:ring-offset-slate-950"
                : "bg-background focus-visible:ring-offset-popover"
            }`}
          />
        </SliderPrimitive.Root>
      </div>
    </div>
  )
}
