"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { useUser } from "@clerk/nextjs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CreatorLoadingState, type CreatorLoadingStep } from "@/components/creator/creator-loading-state"
import { demoCreatorEmails, isCreatorEmail } from "@/lib/creator-access"

interface CreatorAccessGuardProps {
  children: ReactNode
  loadingTitle?: string
  pendingLabel?: string | null
}

export function CreatorAccessGuard({
  children,
  loadingTitle = "Opening creator tools",
  pendingLabel = null,
}: CreatorAccessGuardProps) {
  const { isLoaded, user } = useUser()
  const email = user?.primaryEmailAddress?.emailAddress ?? null
  const loadingSteps: CreatorLoadingStep[] = [
    {
      label: "Checking creator access",
      status: isLoaded ? "complete" : "active",
    },
    ...(pendingLabel
      ? [
          {
            label: pendingLabel,
            status: isLoaded ? "active" : "pending",
          } satisfies CreatorLoadingStep,
        ]
      : []),
  ]

  if (!isLoaded) {
    return (
      <CreatorLoadingState title={loadingTitle} steps={loadingSteps} />
    )
  }

  if (!isCreatorEmail(email)) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle>Creator access required</CardTitle>
          <CardDescription>
            Creator tools should only open for approved travel YouTube creators after manual review.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-amber-900">
          <p>
            Apply as a creator so your team can verify that you own a real travel-focused YouTube channel before
            timestamp editing access is granted.
          </p>
          <div className="flex flex-wrap gap-2">
            {demoCreatorEmails.map((demoEmail) => (
              <Badge key={demoEmail} variant="secondary" className="bg-white text-amber-900">
                Demo access: {demoEmail}
              </Badge>
            ))}
          </div>
          <p>
            This prototype still uses the local allowlist in `lib/creator-access.ts` for final dashboard access after
            approval.
          </p>
          <Link href="/creator/apply">
            <Button>Open Creator Verification Form</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  if (pendingLabel) {
    return <CreatorLoadingState title={loadingTitle} steps={loadingSteps} />
  }

  return <>{children}</>
}
