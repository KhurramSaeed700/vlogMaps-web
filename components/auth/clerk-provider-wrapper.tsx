"use client"

import type React from "react"
import { ClerkProvider } from "@clerk/nextjs"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"

interface ClerkProviderWrapperProps {
  children: React.ReactNode
}

export function ClerkProviderWrapper({ children }: ClerkProviderWrapperProps) {
  const pathname = usePathname()
  const { resolvedTheme } = useTheme()
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  const isDark = resolvedTheme === "dark"
  const needsClerk = pathname === "/" || pathname.startsWith("/auth") || pathname.startsWith("/creator")

  if (!needsClerk) {
    return <>{children}</>
  }

  if (!publishableKey) {
    throw new Error("Missing Publishable Key")
  }

  const ClientClerkProvider = ClerkProvider as unknown as React.ComponentType<{
    children: React.ReactNode
    publishableKey: string
    appearance?: {
      baseTheme?: undefined
      variables?: Record<string, string>
      elements?: Record<string, string>
    }
  }>

  return (
    <ClientClerkProvider
      publishableKey={publishableKey}
      appearance={{
        baseTheme: undefined,
        variables: {
          colorPrimary: "#dc2626",
          colorBackground: isDark ? "#09090b" : "#ffffff",
          colorText: isDark ? "#fafafa" : "#020617",
          colorTextSecondary: isDark ? "#a1a1aa" : "#64748b",
          colorInputBackground: isDark ? "#18181b" : "#ffffff",
          colorInputText: isDark ? "#fafafa" : "#020617",
        },
        elements: {
          cardBox: "border border-border shadow-sm",
          formButtonPrimary: "bg-red-600 hover:bg-red-700",
        },
      }}
    >
      {children}
    </ClientClerkProvider>
  )
}
