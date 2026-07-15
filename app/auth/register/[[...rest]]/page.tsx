"use client"

import { SignUp, useUser } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { AuthPageShell } from "@/components/auth/auth-page-shell"
import { ClerkLoadState } from "@/components/auth/clerk-load-state"
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
    <AuthPageShell
      eyebrow="Join TravelMap"
      title="Create your account"
      description="Start building timestamped travel routes that move with every video."
    >
      {!isLoaded ? (
        <ClerkLoadState mode="sign-up" />
      ) : !isSignedIn ? (
        <SignUp path="/auth/register" routing="path" signInUrl="/auth/login" />
      ) : (
        <Link href={continueHref} className="block">
          <Button className="h-11 w-full bg-red-600 text-white hover:bg-red-700">Continue</Button>
        </Link>
      )}
    </AuthPageShell>
  )
}
