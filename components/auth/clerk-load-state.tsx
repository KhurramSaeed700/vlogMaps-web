"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, Loader2, RefreshCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface ClerkLoadStateProps {
  mode: "sign-in" | "sign-up"
}

function getHostedClerkUrl(mode: ClerkLoadStateProps["mode"]) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

  if (!publishableKey || typeof window === "undefined") {
    return null
  }

  try {
    const encodedHost = publishableKey.replace(/^pk_(test|live)_/, "")
    const frontendHost = window.atob(encodedHost).replace(/\$$/, "")
    const path = mode === "sign-in" ? "sign-in" : "sign-up"

    return `https://${frontendHost}/${path}`
  } catch {
    return null
  }
}

export function ClerkLoadState({ mode }: ClerkLoadStateProps) {
  const [hasTimedOut, setHasTimedOut] = useState(false)
  const hostedClerkUrl = useMemo(() => getHostedClerkUrl(mode), [mode])
  const label = mode === "sign-in" ? "sign in" : "sign up"

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setHasTimedOut(true)
    }, 6000)

    const handleScriptError = (event: Event) => {
      const target = event.target

      if (target instanceof HTMLScriptElement && target.src.includes("clerk")) {
        setHasTimedOut(true)
      }
    }

    window.addEventListener("error", handleScriptError, true)

    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener("error", handleScriptError, true)
    }
  }, [])

  if (!hasTimedOut) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <span>Loading {label}...</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="space-y-4 p-5 text-sm text-amber-900">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-amber-700" />
          <div className="space-y-1">
            <p className="font-medium text-amber-950">Can&apos;t load {label}.</p>
            <p>Try again or open Clerk directly.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" className="bg-white" onClick={() => window.location.reload()}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Retry
          </Button>
          {hostedClerkUrl && (
            <Button type="button" asChild>
              <a href={hostedClerkUrl}>
                Open Clerk
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
