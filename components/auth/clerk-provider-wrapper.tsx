"use client"

import type React from "react"
import { ClerkProvider } from "@clerk/nextjs"
import { usePathname } from "next/navigation"

interface ClerkProviderWrapperProps {
  children: React.ReactNode
}

export function ClerkProviderWrapper({ children }: ClerkProviderWrapperProps) {
  const pathname = usePathname()
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
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
          colorBackground: "#08080a",
          colorText: "#fafafa",
          colorTextSecondary: "#a1a1aa",
          colorInputBackground: "#26262b",
          colorInputText: "#fafafa",
          borderRadius: "0.75rem",
        },
        elements: {
          rootBox: "w-full",
          cardBox: "w-full border border-white/10 bg-[#0b0b0d] shadow-2xl shadow-black/30",
          card: "w-full bg-transparent shadow-none",
          headerTitle: "text-white",
          headerSubtitle: "text-zinc-400",
          socialButtonsBlockButton:
            "border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]",
          dividerLine: "bg-white/10",
          dividerText: "text-zinc-400",
          formFieldLabel: "text-white",
          formFieldInput:
            "border-0 bg-zinc-800 text-white placeholder:text-zinc-500 focus:ring-2 focus:ring-red-500",
          formButtonPrimary: "bg-red-600 text-white hover:bg-red-700",
          footerActionText: "text-zinc-400",
          footerActionLink: "text-red-400 hover:text-red-300",
          footerPages: "hidden",
          footerPagesLink: "hidden",
          footerPagesLinkBox: "hidden",
          identityPreviewText: "text-white",
          formResendCodeLink: "text-red-400",
        },
      }}
    >
      {children}
    </ClientClerkProvider>
  )
}
