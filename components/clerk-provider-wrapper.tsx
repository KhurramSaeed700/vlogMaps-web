"use client"

import type React from "react"
import { ClerkProvider } from "@clerk/nextjs"

interface ClerkProviderWrapperProps {
  children: React.ReactNode
}

export function ClerkProviderWrapper({ children }: ClerkProviderWrapperProps) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

  if (!publishableKey) {
    throw new Error("Missing Publishable Key")
  }

  const ClientClerkProvider = ClerkProvider as unknown as React.ComponentType<{
    children: React.ReactNode
    publishableKey: string
    appearance?: {
      baseTheme?: undefined
      variables?: {
        colorPrimary?: string
      }
    }
  }>

  return (
    <ClientClerkProvider
      publishableKey={publishableKey}
      appearance={{
        baseTheme: undefined,
        variables: {
          colorPrimary: "#2563eb",
        },
      }}
    >
      {children}
    </ClientClerkProvider>
  )
}
