"use client"

import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { Navigation } from "lucide-react"
import {
  navigationResumeDelayOptions,
  type NavigationPreferences,
  type NavigationResumeDelaySeconds,
} from "@/lib/navigation-preferences"

interface NavigationSettingsSectionProps {
  preferences: NavigationPreferences
  onChange: (updates: Partial<NavigationPreferences>) => void
  tone?: "default" | "dark"
}

export function NavigationSettingsSection({
  preferences,
  onChange,
  tone = "default",
}: NavigationSettingsSectionProps) {
  const isDark = tone === "dark"
  const headingClass = isDark ? "text-white/55" : "text-muted-foreground"
  const itemClass = isDark
    ? "text-white hover:bg-white/10 focus:bg-white/10"
    : "text-popover-foreground hover:bg-accent focus:bg-accent"
  const mutedClass = isDark ? "text-white/55" : "text-muted-foreground"

  return (
    <>
      <div className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${headingClass}`}>
        Navigation
      </div>
      <DropdownMenu.Item
        asChild
        onSelect={(event) => event.preventDefault()}
      >
        <button
          type="button"
          role="switch"
          aria-checked={preferences.autoResumeTracking}
          className={`flex w-full cursor-pointer select-none items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm outline-none transition-colors ${itemClass}`}
          onClick={() =>
            onChange({ autoResumeTracking: !preferences.autoResumeTracking })
          }
        >
          <Navigation className={`h-4 w-4 shrink-0 ${mutedClass}`} />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Auto-resume tracking</span>
            <span className={`mt-0.5 block text-[11px] leading-4 ${mutedClass}`}>
              Return to the traveler after you explore the map
            </span>
          </span>
          <span
            className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
              preferences.autoResumeTracking
                ? "border-emerald-400 bg-emerald-500"
                : isDark
                  ? "border-white/20 bg-white/10"
                  : "border-border bg-muted"
            }`}
            aria-hidden="true"
          >
            <span
              className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full shadow-sm transition-transform ${
                preferences.autoResumeTracking
                  ? "translate-x-4 bg-white"
                  : `translate-x-0.5 ${isDark ? "bg-white/70" : "bg-background"}`
              }`}
            />
          </span>
        </button>
      </DropdownMenu.Item>

      <div className={`px-2.5 pb-1 pt-2 text-[11px] font-medium ${mutedClass}`}>
        Resume after no map input
      </div>
      <DropdownMenu.RadioGroup
        value={String(preferences.resumeDelaySeconds)}
        onValueChange={(value) =>
          onChange({ resumeDelaySeconds: Number(value) as NavigationResumeDelaySeconds })
        }
        className="grid grid-cols-3 gap-1 px-2.5 pb-1"
      >
        {navigationResumeDelayOptions.map((seconds) => {
          const isSelected = preferences.resumeDelaySeconds === seconds

          return (
            <DropdownMenu.RadioItem
              key={seconds}
              value={String(seconds)}
              disabled={!preferences.autoResumeTracking}
              aria-label={`Resume tracking after ${seconds} seconds`}
              onSelect={(event) => event.preventDefault()}
              style={isSelected ? { color: "#03120c" } : undefined}
              className={`cursor-pointer rounded-md border px-2 py-1.5 text-center text-xs font-semibold outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:border-emerald-400 data-[state=checked]:bg-emerald-500 ${
                isDark
                  ? "border-white/15 text-white/70 hover:bg-white/10 focus:bg-white/10"
                  : "border-border text-muted-foreground hover:bg-accent focus:bg-accent"
              }`}
            >
              {seconds} sec
            </DropdownMenu.RadioItem>
          )
        })}
      </DropdownMenu.RadioGroup>
    </>
  )
}
