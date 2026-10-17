"use client"

import { memo, useId, useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createInstantWatchVideo } from "@/lib/creator-videos"

export const WatchVideoSearch = memo(function WatchVideoSearch() {
  const router = useRouter()
  const errorId = useId()
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const launchVideo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    try {
      const video = createInstantWatchVideo({ youtubeUrl: youtubeUrl.trim() })
      startTransition(() => router.push(`/watch/${video.id}`))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Paste a valid YouTube link.")
    }
  }

  return (
    <div className="order-3 w-full min-w-0 sm:order-none sm:mx-auto sm:max-w-2xl sm:flex-1">
      <form role="search" aria-label="Open a YouTube video" onSubmit={launchVideo} className="flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 focus-within:border-white/50 focus-within:ring-2 focus-within:ring-white/15">
        <Search className="h-4 w-4 shrink-0 text-white/60" aria-hidden="true" />
        <Input
          value={youtubeUrl}
          onChange={(event) => { setYoutubeUrl(event.target.value); setError(null) }}
          placeholder="Paste a YouTube link"
          aria-label="Search with a YouTube video link"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-base text-white shadow-none placeholder:text-white/50 focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-sm"
        />
        <Button type="submit" size="icon" variant="ghost" disabled={isPending} aria-label="Launch YouTube video" className="h-8 w-8 shrink-0 rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </form>
      {error && <p id={errorId} role="alert" className="mt-1 px-1 text-xs text-red-300">{error}</p>}
    </div>
  )
})
