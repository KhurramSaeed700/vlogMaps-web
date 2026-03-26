"use client"

import type React from "react"

import { RedirectToSignIn, useUser } from "@clerk/nextjs"

interface AuthWrapperProps {
  children: React.ReactNode
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const { isLoaded, isSignedIn } = useUser()

  if (!isLoaded) {
    return null
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />
  }

  return <>{children}</>
}
