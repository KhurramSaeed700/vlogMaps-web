"use client"

import { useEffect, useId, useMemo, useRef, useState, type ComponentProps } from "react"
import { Input } from "@/components/ui/input"
import { airportSearchOptions, registerAirportCodeLocation } from "@/lib/airport-codes"
import { searchAirports } from "@/lib/airport-search"

let airportCatalogPromise: Promise<typeof airportSearchOptions> | null = null

export function AirportSearchInput({ onChange, ...props }: ComponentProps<typeof Input>) {
  const [query, setQuery] = useState("")
  const [focused, setFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listId = useId()
  const [catalog, setCatalog] = useState(airportSearchOptions)
  useEffect(() => {
    if (!focused) return
    let active = true
    airportCatalogPromise ??= fetch("/airport-search.json").then((response) => {
      if (!response.ok) throw new Error("Airport catalog unavailable")
      return response.json() as Promise<typeof airportSearchOptions>
    }).catch(() => { airportCatalogPromise = null; return airportSearchOptions })
    void airportCatalogPromise.then((airports) => { if (active) setCatalog(airports) })
    return () => { active = false }
  }, [focused])
  const normalizedQuery = query.trim().toLowerCase()
  const matches = useMemo(() => searchAirports(catalog, normalizedQuery), [catalog, normalizedQuery])
  const selectedIndex = Math.min(activeIndex, Math.max(0, matches.length - 1))
  useEffect(() => {
    if (focused) optionRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex, focused, matches])

  const selectAirport = (airport: typeof airportSearchOptions[number]) => {
    const input = inputRef.current
    if (!input) return
    registerAirportCodeLocation(airport)
    input.value = airport.code
    onChange?.({ target: input, currentTarget: input } as React.ChangeEvent<HTMLInputElement>)
    setQuery(airport.code)
    setFocused(false)
  }

  return (
    <div className="relative">
      <Input
        {...props}
        ref={inputRef}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={focused && matches.length > 0}
        aria-controls={focused && matches.length > 0 ? listId : undefined}
        aria-activedescendant={focused && matches.length > 0 ? `${listId}-${selectedIndex}` : undefined}
        value={focused ? query : props.value}
        placeholder="Search city, airport or code"
        onFocus={(event) => { setFocused(true); setActiveIndex(0); setQuery(String(props.value ?? "")); props.onFocus?.(event) }}
        onBlur={(event) => { setFocused(false); props.onBlur?.(event) }}
        onChange={(event) => { setFocused(true); setActiveIndex(0); setQuery(event.target.value); onChange?.(event) }}
        onKeyDown={(event) => {
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && matches.length > 0) {
            event.preventDefault()
            event.stopPropagation()
            setFocused(true)
            setActiveIndex(!focused ? (event.key === "ArrowDown" ? 0 : matches.length - 1) : (selectedIndex + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length)
            return
          }
          if (event.key === "Enter" && focused && matches[selectedIndex]) {
            event.preventDefault()
            event.stopPropagation()
            selectAirport(matches[selectedIndex])
            return
          }
          if (event.key === "Escape") { event.preventDefault(); setFocused(false); event.currentTarget.blur(); event.stopPropagation(); return }
          props.onKeyDown?.(event)
        }}
      />
      {focused && matches.length > 0 && (
        <div id={listId} role="listbox" className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
          {matches.map((airport, index) => (
            <button key={airport.code} id={`${listId}-${index}`} role="option" aria-selected={selectedIndex === index} tabIndex={-1}
              ref={(element) => { optionRefs.current[index] = element }}
              type="button" className={`block w-full rounded-md p-2 text-left hover:bg-accent focus-visible:bg-accent ${selectedIndex === index ? "bg-accent text-accent-foreground" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                selectAirport(airport)
              }}>
              <span className="block text-sm font-semibold">{airport.code} · {airport.city}, {airport.country}</span>
              <span className="block text-xs text-muted-foreground">{airport.name}</span>
            </button>
          ))}
        </div>
      )}
      {focused && normalizedQuery && matches.length === 0 && (
        <div role="status" className="absolute inset-x-0 top-full z-50 mt-1 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-xl">
          No airports found. Check the city spelling or try an airport name or code.
        </div>
      )}
    </div>
  )
}
