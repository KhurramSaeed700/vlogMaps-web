import Link from "next/link"
import { MapPin } from "lucide-react"
import { cn } from "@/lib/utils"

interface TravelMapLogoProps {
  href?: string
  className?: string
  markClassName?: string
  textClassName?: string
}

export function TravelMapLogo({
  href = "/",
  className,
  markClassName,
  textClassName,
}: TravelMapLogoProps) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-3 whitespace-nowrap", className)}>
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white",
          markClassName,
        )}
      >
        <MapPin className="h-4 w-4" />
      </span>
      <span className={cn("text-xl font-semibold tracking-tight text-slate-950", textClassName)}>TravelMap</span>
    </Link>
  )
}
