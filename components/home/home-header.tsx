import type { FormEvent } from "react"
import Link from "next/link"
import { UserButton } from "@clerk/nextjs"
import { Search } from "lucide-react"
import { TravelMapLogo } from "@/components/app-shell/travelmap-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface HomeHeaderProps {
  creatorCta: {
    href: string
    label: string
  }
  isLoaded: boolean
  isPending: boolean
  isSignedIn: boolean | undefined
  launcherError: string | null
  youtubeUrl: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onYoutubeUrlChange: (value: string) => void
}

export function HomeHeader({
  creatorCta,
  isLoaded,
  isPending,
  isSignedIn,
  launcherError,
  youtubeUrl,
  onSubmit,
  onYoutubeUrlChange,
}: HomeHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-4 px-4 py-3">
        <TravelMapLogo textClassName="text-lg" />

        <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-2xl items-center">
          <Input
            value={youtubeUrl}
            onChange={(event) => onYoutubeUrlChange(event.target.value)}
            placeholder="Paste YouTube video link"
            className="h-11 rounded-l-full rounded-r-none border-slate-300 bg-white px-4 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <Button
            type="submit"
            size="icon"
            disabled={isPending}
            className="h-11 w-14 rounded-l-none rounded-r-full border border-l-0 border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            <Search className="h-4 w-4" />
          </Button>
        </form>

        <div className="flex items-center gap-2">
          <Link href={creatorCta.href} className="hidden md:block">
            <Button variant="outline" className="rounded-full">
              {creatorCta.label}
            </Button>
          </Link>

          {isLoaded && isSignedIn ? (
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  avatarBox: "h-9 w-9",
                },
              }}
            />
          ) : (
            <Link href="/auth/login" className="hidden sm:block">
              <Button variant="ghost" className="rounded-full">
                Sign In
              </Button>
            </Link>
          )}
        </div>
      </div>

      {launcherError && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          {launcherError}
        </div>
      )}
    </header>
  )
}
