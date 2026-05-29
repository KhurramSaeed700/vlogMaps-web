"use client"

import { useEffect, useState, type FormEvent } from "react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { UserButton, useUser } from "@clerk/nextjs"
import Link from "next/link"
import { Check, ChevronRight, Moon, Search, Settings, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { TravelMapLogo } from "@/components/app-shell/travelmap-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { preferenceOptions, type PreferenceId } from "@/components/home/home-preferences"
import { useCreatorAccess } from "@/lib/use-creator-access"

interface HomeHeaderProps {
  isPending: boolean
  launcherError: string | null
  selectedPreference: PreferenceId
  youtubeUrl: string
  onPreferenceChange: (preference: PreferenceId) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onYoutubeUrlChange: (value: string) => void
}

export function HomeHeader({
  isPending,
  launcherError,
  selectedPreference,
  youtubeUrl,
  onPreferenceChange,
  onSubmit,
  onYoutubeUrlChange,
}: HomeHeaderProps) {
  const [isThemeMounted, setIsThemeMounted] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const { isLoaded, isSignedIn, user } = useUser()
  const { isApprovedCreator, isCheckingCreatorAccess } = useCreatorAccess({
    isLoaded,
    isSignedIn: Boolean(isSignedIn),
    user,
  })
  const creatorCtaHref = isApprovedCreator ? "/creator/dashboard" : "/creator/apply"
  const creatorCtaLabel = isApprovedCreator ? "Creator Dashboard" : "Become a creator"
  const creatorCtaAriaLabel = isApprovedCreator ? "Go to creator dashboard" : "Open creator mode"
  const menuItemClass =
    "flex cursor-pointer select-none items-center gap-3 rounded-md px-2.5 py-2 text-sm text-popover-foreground outline-none transition-colors hover:bg-accent focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
  const selectedPreferenceLabel =
    preferenceOptions.find((option) => option.id === selectedPreference)?.label ?? "All"

  useEffect(() => {
    setIsThemeMounted(true)
  }, [])

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
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-full border-border bg-background text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground sm:h-10 sm:w-10"
                aria-label="Open settings menu"
                title="Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={10}
                className="z-50 w-[min(calc(100vw-2rem),19rem)] rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-xl"
              >
                <div className="px-2.5 pb-2 pt-1">
                  <p className="text-sm font-semibold text-foreground">Settings</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Preference: {selectedPreferenceLabel}</p>
                </div>

                <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  User preferences
                </div>
                {preferenceOptions.map((option) => {
                  const Icon = option.icon
                  const isSelected = selectedPreference === option.id

                  return (
                    <DropdownMenu.Item
                      key={option.id}
                      className={menuItemClass}
                      onSelect={() => onPreferenceChange(option.id)}
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{option.label}</span>
                      {isSelected && <Check className="h-4 w-4" />}
                    </DropdownMenu.Item>
                  )
                })}

                <DropdownMenu.Separator className="my-2 h-px bg-border" />

                <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Appearance
                </div>
                <DropdownMenu.Item
                  className={menuItemClass}
                  disabled={!isThemeMounted}
                  onSelect={() => setTheme("light")}
                >
                  <Sun className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">Light mode</span>
                  {isThemeMounted && resolvedTheme === "light" && <Check className="h-4 w-4" />}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={menuItemClass}
                  disabled={!isThemeMounted}
                  onSelect={() => setTheme("dark")}
                >
                  <Moon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">Dark mode</span>
                  {isThemeMounted && resolvedTheme === "dark" && <Check className="h-4 w-4" />}
                </DropdownMenu.Item>

                {isLoaded && isSignedIn && !isCheckingCreatorAccess && (
                  <>
                    <DropdownMenu.Separator className="my-2 h-px bg-border" />
                    <DropdownMenu.Item asChild>
                      <Link href={creatorCtaHref} className={menuItemClass} aria-label={creatorCtaAriaLabel}>
                        <Settings className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1">{creatorCtaLabel}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    </DropdownMenu.Item>
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          {!isLoaded ? (
            <div className="h-9 w-[72px] sm:h-10" aria-hidden="true" />
          ) : isSignedIn ? (
            <>
              {!isCheckingCreatorAccess && (
                <Link href={creatorCtaHref} className="hidden sm:block" aria-label={creatorCtaAriaLabel}>
                  <Button variant="outline" size="sm" className="rounded-full px-4 font-semibold">
                    {creatorCtaLabel}
                  </Button>
                </Link>
              )}
              <UserButton
                signInUrl="/auth/login"
                appearance={{
                  elements: {
                    avatarBox: "h-9 w-9",
                  },
                }}
              />
            </>
          ) : (
            <Link href="/auth/login" className="block">
              <Button variant="ghost" size="sm" className="rounded-full px-3 sm:h-10 sm:px-4">
                Sign In
              </Button>
            </Link>
          )}
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
