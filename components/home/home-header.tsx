import type { FormEvent } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { TravelMapLogo } from "@/components/app-shell/travelmap-logo"
import { ThemeToggle } from "@/components/app-shell/theme-toggle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface HomeHeaderProps {
  isPending: boolean
  launcherError: string | null
  youtubeUrl: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onYoutubeUrlChange: (value: string) => void
}

export function HomeHeader({
  isPending,
  launcherError,
  youtubeUrl,
  onSubmit,
  onYoutubeUrlChange,
}: HomeHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">
        <TravelMapLogo textClassName="text-lg" />

        <form onSubmit={onSubmit} className="order-3 flex w-full items-center sm:order-none sm:mx-auto sm:max-w-2xl">
          <Input
            value={youtubeUrl}
            onChange={(event) => onYoutubeUrlChange(event.target.value)}
            placeholder="Paste YouTube video link"
            className="h-11 rounded-l-full rounded-r-none px-4 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <Button
            type="submit"
            size="icon"
            disabled={isPending}
            aria-label="Launch YouTube video"
            className="h-11 w-14 rounded-l-none rounded-r-full border border-l-0 bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Search className="h-4 w-4" />
          </Button>
        </form>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />

          <Link href="/creator/apply" className="hidden md:block">
            <Button variant="outline" className="rounded-full">
              Become a creator
            </Button>
          </Link>

          <Link href="/auth/login" className="hidden sm:block">
            <Button variant="ghost" className="rounded-full">
              Sign In
            </Button>
          </Link>
        </div>
      </div>

      {launcherError && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-100">
          {launcherError}
        </div>
      )}
    </header>
  )
}
