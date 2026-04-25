import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, MapPin } from "lucide-react"

interface ContentPageShellProps {
  title: string
  description: string
  backHref?: string
  backLabel?: string
  maxWidthClassName?: string
  contentClassName?: string
  children: ReactNode
}

export function ContentPageShell({
  title,
  description,
  backHref = "/",
  backLabel = "Back",
  maxWidthClassName = "max-w-4xl",
  contentClassName = "",
  children,
}: ContentPageShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link href={backHref} className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900">
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
          <Link href="/" className="flex items-center gap-2">
            <MapPin className="h-7 w-7 text-blue-600" />
            <span className="text-xl font-bold text-gray-900">TravelMap</span>
          </Link>
        </div>
      </header>

      <main className={`container mx-auto ${maxWidthClassName} px-4 py-12`}>
        <div className="mb-8 text-center">
          <h1 className="mb-3 text-3xl font-bold text-gray-900">{title}</h1>
          <p className="mx-auto max-w-2xl text-gray-600">{description}</p>
        </div>

        <div className={`rounded-2xl border bg-white p-6 shadow-sm ${contentClassName}`.trim()}>{children}</div>
      </main>
    </div>
  )
}
