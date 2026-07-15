import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { TravelMapLogo } from "@/components/app-shell/travelmap-logo"
import { ThemeToggle } from "@/components/app-shell/theme-toggle"

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
  showThemeToggle?: boolean
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
  pageClassName = "min-h-screen bg-background",
  headerActionsId,
  showThemeToggle = true,
  showIntro = true,
  framedContent = true,
  children,
}: ContentPageShellProps) {
  const resolvedMainClassName = mainClassName ?? `container mx-auto ${maxWidthClassName} px-4 py-12`
  const resolvedContentClassName = framedContent
    ? `rounded-2xl border border-border bg-card p-6 shadow-sm ${contentClassName}`.trim()
    : contentClassName

  return (
    <div className={pageClassName}>
      <header className="border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <TravelMapLogo />
          <div className="flex items-center gap-2">
            {headerActionsId ? <div id={headerActionsId} className="flex items-center gap-2" /> : null}
            {showThemeToggle ? <ThemeToggle /> : null}
            <Link href={backHref} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </Link>
          </div>
        </div>
      </header>

      <main className={resolvedMainClassName}>
        {showIntro && (
          <div className="mb-8 text-center">
            <h1 className="mb-3 text-3xl font-bold text-foreground">{title}</h1>
            <p className="mx-auto max-w-2xl text-muted-foreground">{description}</p>
          </div>
        )}

        <div className={resolvedContentClassName}>{children}</div>
      </main>
    </div>
  )
}
