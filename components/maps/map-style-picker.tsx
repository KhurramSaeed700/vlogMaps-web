"use client"

import * as Menu from "@radix-ui/react-dropdown-menu"
import { Map, Mountain, Satellite } from "lucide-react"
import { Button } from "@/components/ui/button"

const styles = [
  { id: "satellite", label: "Satellite", Icon: Satellite },
  { id: "streets", label: "Streets", Icon: Map },
  { id: "terrain", label: "Terrain", Icon: Mountain },
] as const

type MapStyle = typeof styles[number]["id"]

export function MapStylePicker({ value, onChange }: { value: MapStyle; onChange: (value: MapStyle) => void }) {
  const selected = styles.find(style => style.id === value) ?? styles[1]
  return <Menu.Root>
    <Menu.Trigger asChild>
      <Button type="button" variant="ghost" size="icon"
        aria-label={`Map style: ${selected.label}`} title={`Map style: ${selected.label}`}
        className="h-[42px] w-[42px] shrink-0 rounded-xl border border-white/15 bg-slate-950/85 text-white shadow-lg backdrop-blur-md hover:bg-slate-800 hover:text-white">
        <selected.Icon className="h-5 w-5" aria-hidden="true" />
      </Button>
    </Menu.Trigger>
    <Menu.Portal>
      <Menu.Content align="end" sideOffset={8} collisionPadding={8}
        className="z-50 rounded-xl border border-white/15 bg-slate-950/95 p-2 text-white shadow-xl backdrop-blur-md">
        <Menu.Label className="px-1 pb-2 text-xs font-medium text-white/65">Map style</Menu.Label>
        <Menu.RadioGroup value={value} onValueChange={next => {
          if (styles.some(style => style.id === next)) onChange(next as MapStyle)
        }} className="flex gap-1">
          {styles.map(({ id, label, Icon }) => <Menu.RadioItem key={id} value={id}
            className="flex w-20 cursor-pointer flex-col items-center gap-2 rounded-lg border border-transparent px-2 py-3 text-xs text-white/70 outline-none focus:bg-white/10 focus:text-white data-[state=checked]:border-emerald-400/60 data-[state=checked]:bg-emerald-400/15 data-[state=checked]:text-emerald-200">
            <Icon className="h-6 w-6" aria-hidden="true" />{label}
          </Menu.RadioItem>)}
        </Menu.RadioGroup>
      </Menu.Content>
    </Menu.Portal>
  </Menu.Root>
}
