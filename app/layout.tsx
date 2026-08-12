import type React from "react"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/app-shell/theme-provider"
import { ClerkProviderWrapper } from "@/components/auth/clerk-provider-wrapper"
import { Toaster } from "@/components/ui/sonner"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "TravelMap - Interactive Travel Videos",
  description: "Watch travel videos with interactive maps that follow the journey",
    generator: 'v0.app'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-background text-foreground`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <ClerkProviderWrapper>{children}</ClerkProviderWrapper>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
