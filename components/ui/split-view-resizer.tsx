"use client"

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react"
import { GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"

interface SplitViewResizerProps {
  containerRef: RefObject<HTMLElement | null>
  defaultValue: number
  min: number
  max: number
  label: string
  className?: string
  cssVariable?: `--${string}`
}

function clampSplit(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function SplitViewResizer({
  containerRef,
  defaultValue,
  min,
  max,
  label,
  className,
  cssVariable = "--split-view-left",
}: SplitViewResizerProps) {
  const [value, setValue] = useState(() => clampSplit(defaultValue, min, max))
  const [isDragging, setIsDragging] = useState(false)
  const previousBodyCursorRef = useRef("")
  const previousBodyUserSelectRef = useRef("")

  const updateValue = useCallback(
    (nextValue: number) => {
      const clampedValue = clampSplit(nextValue, min, max)
      containerRef.current?.style.setProperty(cssVariable, `${clampedValue}%`)
      setValue(clampedValue)
    },
    [containerRef, cssVariable, max, min],
  )

  const updateValueFromPointer = useCallback(
    (clientX: number) => {
      const container = containerRef.current
      if (!container) {
        return
      }

      const bounds = container.getBoundingClientRect()
      if (bounds.width <= 0) {
        return
      }

      updateValue(((clientX - bounds.left) / bounds.width) * 100)
    },
    [containerRef, updateValue],
  )

  useEffect(() => {
    updateValue(defaultValue)
  }, [defaultValue, updateValue])

  useEffect(() => {
    if (!isDragging) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => updateValueFromPointer(event.clientX)
    const handlePointerUp = () => setIsDragging(false)
    previousBodyCursorRef.current = document.body.style.cursor
    previousBodyUserSelectRef.current = document.body.style.userSelect
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp, { once: true })

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      document.body.style.cursor = previousBodyCursorRef.current
      document.body.style.userSelect = previousBodyUserSelectRef.current
    }
  }, [isDragging, updateValueFromPointer])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    updateValueFromPointer(event.clientX)
    setIsDragging(true)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keyboardStep = 2
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      updateValue(value - keyboardStep)
    } else if (event.key === "ArrowRight") {
      event.preventDefault()
      updateValue(value + keyboardStep)
    } else if (event.key === "Home") {
      event.preventDefault()
      updateValue(min)
    } else if (event.key === "End") {
      event.preventDefault()
      updateValue(max)
    }
  }

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`Video ${Math.round(value)} percent, map ${Math.round(100 - value)} percent`}
      tabIndex={0}
      data-dragging={isDragging}
      title="Drag to resize. Double-click to reset."
      className={cn(
        "group absolute inset-y-0 z-40 w-4 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center outline-none",
        "focus-visible:ring-2 focus-visible:ring-blue-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
        className,
      )}
      style={{ left: `var(${cssVariable})` }}
      onPointerDown={handlePointerDown}
      onDoubleClick={() => updateValue(defaultValue)}
      onKeyDown={handleKeyDown}
    >
      <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-blue-400/70 opacity-0 shadow-[0_0_10px_rgba(96,165,250,0.45)] transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[dragging=true]:opacity-100" />
      <span className="pointer-events-none relative flex h-12 w-5 items-center justify-center rounded-full border border-white/15 bg-zinc-950/90 text-zinc-300 opacity-0 shadow-lg shadow-black/35 backdrop-blur transition-all duration-150 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[dragging=true]:scale-100 group-data-[dragging=true]:border-blue-400/60 group-data-[dragging=true]:text-blue-300 group-data-[dragging=true]:opacity-100">
        <GripVertical className="h-4 w-4" />
      </span>
    </div>
  )
}
