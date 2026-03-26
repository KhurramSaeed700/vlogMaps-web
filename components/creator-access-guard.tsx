"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { useUser } from "@clerk/nextjs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { demoCreatorEmails, isCreatorEmail } from "@/lib/creator-access"

interface CreatorAccessGuardProps {
  children: ReactNode
}

export function CreatorAccessGuard({ children }: CreatorAccessGuardProps) {
  const { isLoaded, user } = useUser()
  const email = user?.primaryEmailAddress?.emailAddress ?? null

  if (!isLoaded) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-gray-500">Checking creator access...</CardContent>
      </Card>
    )
  }

  if (!isCreatorEmail(email)) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle>Creator access required</CardTitle>
          <CardDescription>
            This editor is locked to demo creator accounts so the authoring flow stays scoped and testable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-amber-900">
          <div className="flex flex-wrap gap-2">
            {demoCreatorEmails.map((demoEmail) => (
              <Badge key={demoEmail} variant="secondary" className="bg-white text-amber-900">
                {demoEmail}
              </Badge>
            ))}
          </div>
          <p>Sign in with one of the demo creator emails above, or update the allowlist in `lib/creator-access.ts` for your own test account.</p>
          <Link href="/creator/apply">
            <Button>Go to Creator Application</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  return <>{children}</>
}
