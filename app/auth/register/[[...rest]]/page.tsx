"use client"

import { SignUp, useUser } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { ClerkLoadState } from "@/components/auth/clerk-load-state"
import { TravelMapLogo } from "@/components/app-shell/travelmap-logo"
import { ThemeToggle } from "@/components/app-shell/theme-toggle"
import { isCreatorEmail } from "@/lib/creator-access"

export default function RegisterPage() {
  const router = useRouter()
  const { isLoaded, isSignedIn, user } = useUser()
  const email = user?.primaryEmailAddress?.emailAddress ?? null
  const continueHref = isCreatorEmail(email) ? "/creator/dashboard" : "/"

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return
    }

    router.replace(continueHref)
  }, [continueHref, isLoaded, isSignedIn, router])

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-4 text-center">
          <TravelMapLogo className="justify-center" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Create account</h1>
        </div>

        {!isLoaded ? (
          <ClerkLoadState mode="sign-up" />
        ) : !isSignedIn ? (
          <div className="flex justify-center">
            <SignUp path="/auth/register" routing="path" signInUrl="/auth/login" />
          </div>
        ) : (
          <Link href={continueHref} className="block">
            <Button className="h-11 w-full">Continue</Button>
          </Link>
        )}
      </div>
    </div>
  )
}
