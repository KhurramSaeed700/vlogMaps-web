"use client"

import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from "react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { UserButton, useUser } from "@clerk/nextjs"
import Image from "next/image"
import Link from "next/link"
import { Check, ChevronRight, Loader2, Moon, Play, Search, Settings, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { TravelMapLogo } from "@/components/app-shell/travelmap-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { preferenceOptions, type PreferenceId } from "@/components/home/home-preferences"
import { NavigationSettingsSection } from "@/components/settings/navigation-settings-section"
import { PlaybackSettingsSection } from "@/components/settings/playback-settings-section"
import { formatCompactNumber, formatDuration } from "@/lib/demo-data"
import { useCreatorAccess } from "@/lib/use-creator-access"
import { useNavigationPreferences } from "@/lib/use-navigation-preferences"
import { usePlaybackPreferences } from "@/lib/use-playback-preferences"
import {
  extractYouTubeId,
  getYouTubeThumbnailUrl,
  type ResolvedYouTubeMetadata,
} from "@/lib/youtube"

interface YouTubePreviewState {
  videoId: string
  metadata: ResolvedYouTubeMetadata | null
  isLoading: boolean
}

function YouTubeLinkPreview({
  videoId,
  preview,
}: {
  videoId: string
  preview: YouTubePreviewState | null
}) {
  return (
    <div className="pointer-events-none absolute left-0 right-14 top-full z-50 pt-2">
      <div
        aria-label="YouTube video preview"
        className="pointer-events-auto flex w-full overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
      >
        <div className="relative aspect-video w-28 shrink-0 overflow-hidden bg-muted sm:w-36">
          <Image
            src={preview?.metadata?.thumbnail || getYouTubeThumbnailUrl(videoId)}
            alt={preview?.metadata?.title ? `${preview.metadata.title} thumbnail` : "YouTube video thumbnail"}
            fill
            sizes="144px"
            className="object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/15" aria-hidden="true">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/75 text-white shadow-lg">
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            </span>
          </span>
          {preview?.metadata?.durationSeconds ? (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {formatDuration(preview.metadata.durationSeconds)}
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 px-3 py-2.5 sm:px-4 sm:py-3">
          {preview?.isLoading || !preview ? (
            <div className="flex h-full items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading video preview...
            </div>
          ) : (
            <div className="flex h-full min-w-0 flex-col justify-center">
              <p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
                {preview.metadata?.title || "YouTube video"}
              </p>
              {preview.metadata?.creator ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {preview.metadata.creator}
                </p>
              ) : null}
              {preview.metadata?.views !== null && preview.metadata?.views !== undefined ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatCompactNumber(preview.metadata.views)} views
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

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
  const [isCreatorNavigationPending, setIsCreatorNavigationPending] = useState(false)
  const [youtubePreview, setYoutubePreview] = useState<YouTubePreviewState | null>(null)
  const { resolvedTheme, setTheme } = useTheme()
  const { isLoaded, isSignedIn, user } = useUser()
  const { preferences: navigationPreferences, updatePreferences: updateNavigationPreferences } =
    useNavigationPreferences()
  const { preferences: playbackPreferences, updatePreferences: updatePlaybackPreferences } =
    usePlaybackPreferences()
  const { isApprovedCreator, isCheckingCreatorAccess } = useCreatorAccess({
    isLoaded,
    isSignedIn: Boolean(isSignedIn),
    user,
  })
  const isDarkMode = isThemeMounted && resolvedTheme === "dark"
  const creatorCtaHref = isApprovedCreator ? "/creator/dashboard" : "/creator/apply"
  const creatorCtaLabel = isApprovedCreator ? "Creator Dashboard" : "Become a creator"
  const creatorCtaPendingLabel = isApprovedCreator ? "Opening dashboard..." : "Opening creator mode..."
  const creatorCtaAriaLabel = isApprovedCreator ? "Go to creator dashboard" : "Open creator mode"
  const menuItemClass =
    "flex cursor-pointer select-none items-center gap-3 rounded-md px-2.5 py-2 text-sm text-popover-foreground outline-none transition-colors hover:bg-accent focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
  const selectedPreferenceLabel =
    preferenceOptions.find((option) => option.id === selectedPreference)?.label ?? "All"
  const previewVideoId = useMemo(() => extractYouTubeId(youtubeUrl), [youtubeUrl])
  const visiblePreview = youtubePreview?.videoId === previewVideoId ? youtubePreview : null

  useEffect(() => {
    setIsThemeMounted(true)
  }, [])

  useEffect(() => {
    if (!previewVideoId) {
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setYoutubePreview({ videoId: previewVideoId, metadata: null, isLoading: true })

      fetch(`/api/youtube/video/${encodeURIComponent(previewVideoId)}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() as Promise<ResolvedYouTubeMetadata> : null))
        .then((metadata) => {
          if (!controller.signal.aborted) {
            setYoutubePreview({ videoId: previewVideoId, metadata, isLoading: false })
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setYoutubePreview({ videoId: previewVideoId, metadata: null, isLoading: false })
          }
        })
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [previewVideoId])

  const handleCreatorNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    if (isCreatorNavigationPending) {
      event.preventDefault()
      return
    }

    setIsCreatorNavigationPending(true)
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">
        <TravelMapLogo textClassName="text-lg" />

        <div className="relative order-3 w-full sm:order-none sm:mx-auto sm:max-w-2xl">
          <form onSubmit={onSubmit} className="flex w-full items-center">
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

          {previewVideoId && (
            <YouTubeLinkPreview videoId={previewVideoId} preview={visiblePreview} />
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {!isLoaded ? (
            <div className="h-9 w-[72px] sm:h-10" aria-hidden="true" />
          ) : isSignedIn ? (
            <>
              {!isCheckingCreatorAccess && (
                <Link
                  href={creatorCtaHref}
                  className="hidden shrink-0 sm:block"
                  aria-label={creatorCtaAriaLabel}
                  aria-busy={isCreatorNavigationPending}
                  onClick={handleCreatorNavigation}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 min-w-[10.5rem] whitespace-nowrap rounded-full px-5 font-semibold"
                  >
                    {isCreatorNavigationPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        {creatorCtaPendingLabel}
                      </>
                    ) : (
                      creatorCtaLabel
                    )}
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

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 min-w-9 shrink-0 rounded-full border-border bg-background p-0 text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground"
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
                className="z-50 max-h-[calc(100dvh-5rem)] w-[min(calc(100vw-2rem),19rem)] overflow-y-auto rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-xl"
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

                <NavigationSettingsSection
                  preferences={navigationPreferences}
                  onChange={updateNavigationPreferences}
                />

                <DropdownMenu.Separator className="my-2 h-px bg-border" />

                <PlaybackSettingsSection
                  preferences={playbackPreferences}
                  onChange={updatePlaybackPreferences}
                />

                <DropdownMenu.Separator className="my-2 h-px bg-border" />

                <div className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Appearance
                </div>
                <DropdownMenu.Item
                  asChild
                  disabled={!isThemeMounted}
                  onSelect={(event) => {
                    event.preventDefault()
                    setTheme(isDarkMode ? "light" : "dark")
                  }}
                >
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isDarkMode}
                    className="flex w-full cursor-pointer select-none items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm text-popover-foreground outline-none transition-colors hover:bg-accent focus:bg-accent focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                    disabled={!isThemeMounted}
                  >
                    {isDarkMode ? (
                      <Moon className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Sun className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="flex-1">{isDarkMode ? "Dark mode" : "Light mode"}</span>
                    <span
                      className={`relative h-5 w-9 rounded-full border transition-colors ${
                        isDarkMode ? "border-primary bg-primary" : "border-border bg-muted"
                      }`}
                      aria-hidden="true"
                    >
                      <span
                        className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-background shadow-sm transition-transform ${
                          isDarkMode ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </span>
                  </button>
                </DropdownMenu.Item>

                {isLoaded && isSignedIn && !isCheckingCreatorAccess && (
                  <>
                    <DropdownMenu.Separator className="my-2 h-px bg-border" />
                    <DropdownMenu.Item asChild>
                      <Link
                        href={creatorCtaHref}
                        className={menuItemClass}
                        aria-label={creatorCtaAriaLabel}
                        aria-busy={isCreatorNavigationPending}
                        onClick={handleCreatorNavigation}
                      >
                        {isCreatorNavigationPending ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                        ) : (
                          <Settings className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="flex-1">
                          {isCreatorNavigationPending ? creatorCtaPendingLabel : creatorCtaLabel}
                        </span>
                        {!isCreatorNavigationPending && (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Link>
                    </DropdownMenu.Item>
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
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
