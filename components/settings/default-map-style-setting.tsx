"use client"

import { useId } from "react"
import { Map, Mountain, Satellite } from "lucide-react"
import { useMapStylePreference } from "@/lib/use-map-style-preference"

const choices = [
  { value: "satellite", label: "Satellite", Icon: Satellite },
  { value: "streets", label: "Streets", Icon: Map },
  { value: "terrain", label: "Terrain", Icon: Mountain },
] as const

export function DefaultMapStyleSetting({ tone = "default" }: { tone?: "default" | "dark" }) {
  const { style, saveDefaultStyle } = useMapStylePreference()
  const name = useId()
  const dark = tone === "dark"
  return <fieldset className="px-2.5 pb-2 pt-3" onKeyDown={event => event.stopPropagation()}>
    <legend className={`text-sm font-medium ${dark ? "text-white" : "text-popover-foreground"}`}>Default map style</legend>
    <div className="grid grid-cols-3 gap-1.5">
      {choices.map(({ value, label, Icon }) => <label key={value} className="min-w-0 cursor-pointer">
        <input type="radio" name={name} value={value} checked={style === value} onChange={() => saveDefaultStyle(value)} className="peer sr-only" />
        <span className={`flex flex-col items-center gap-2 rounded-lg border border-transparent px-1 py-3 text-xs transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400 ${dark ? "text-white/65 hover:bg-white/5 peer-checked:border-emerald-400/60 peer-checked:bg-emerald-400/15 peer-checked:text-emerald-200" : "text-muted-foreground hover:bg-accent peer-checked:border-emerald-500/50 peer-checked:bg-emerald-500/10 peer-checked:text-emerald-700 dark:peer-checked:text-emerald-300"}`}><Icon className="h-5 w-5" aria-hidden="true" />{label}</span>
      </label>)}
    </div>
  </fieldset>
}
