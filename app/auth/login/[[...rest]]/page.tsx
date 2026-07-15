"use client"

import { SignIn, useUser } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { AuthPageShell } from "@/components/auth/auth-page-shell"
import { ClerkLoadState } from "@/components/auth/clerk-load-state"
import { isCreatorEmail } from "@/lib/creator-access"

export default function LoginPage() {
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
    <AuthPageShell
      eyebrow="Welcome back"
      title="Sign in to TravelMap"
      description="Pick up your creator dashboard, saved routes, and interactive travel stories."
    >
      {!isLoaded ? (
        <ClerkLoadState mode="sign-in" />
      ) : !isSignedIn ? (
        <SignIn path="/auth/login" routing="path" signUpUrl="/auth/register" />
      ) : (
        <Link href={continueHref} className="block">
          <Button className="h-11 w-full bg-red-600 text-white hover:bg-red-700">Continue</Button>
        </Link>
      )}
    </AuthPageShell>
  )
}
