import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { TravelMapLogo } from "@/components/app-shell/travelmap-logo"

interface ContentPageShellProps {
  title: string
  description: string
  backHref?: string
  backLabel?: string
  maxWidthClassName?: string
  mainClassName?: string
  contentClassName?: string
  pageClassName?: string
  headerActionsId?: string
  showIntro?: boolean
  framedContent?: boolean
  children: ReactNode
}

export function ContentPageShell({
  title,
  description,
  backHref = "/",
  backLabel = "Back",
  maxWidthClassName = "max-w-4xl",
  mainClassName,
  contentClassName = "",
  pageClassName = "min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50",
  headerActionsId,
  showIntro = true,
  framedContent = true,
  children,
}: ContentPageShellProps) {
  const resolvedMainClassName = mainClassName ?? `container mx-auto ${maxWidthClassName} px-4 py-12`
  const resolvedContentClassName = framedContent
    ? `rounded-2xl border bg-white p-6 shadow-sm ${contentClassName}`.trim()
    : contentClassName

  return (
    <div className={pageClassName}>
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <TravelMapLogo />
          <div className="flex items-center gap-2">
            {headerActionsId ? <div id={headerActionsId} className="flex items-center gap-2" /> : null}
            <Link href={backHref} className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900">
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Link>
          </div>
        </div>
      </header>

      <main className={resolvedMainClassName}>
        {showIntro && (
          <div className="mb-8 text-center">
            <h1 className="mb-3 text-3xl font-bold text-gray-900">{title}</h1>
            <p className="mx-auto max-w-2xl text-gray-600">{description}</p>
          </div>
        )}

        <div className={resolvedContentClassName}>{children}</div>
      </main>
    </div>
  )
}
