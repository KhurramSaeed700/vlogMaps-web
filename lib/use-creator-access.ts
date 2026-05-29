"use client"

import { useEffect, useMemo, useState } from "react"
import { isCreatorEmail } from "@/lib/creator-access"

interface CreatorAccessResponse {
  approved?: boolean
}

interface CreatorAccessState {
  isApprovedCreator: boolean
  isCheckingCreatorAccess: boolean
}

interface CreatorAccessUser {
  id?: string | null
  primaryEmailAddress?: {
    emailAddress?: string | null
  } | null
}

export function useCreatorAccess({
  isLoaded,
  isSignedIn,
  user,
}: {
  isLoaded: boolean
  isSignedIn?: boolean
  user: CreatorAccessUser | null | undefined
}): CreatorAccessState {
  const email = user?.primaryEmailAddress?.emailAddress ?? null
  const isDemoCreator = useMemo(() => isCreatorEmail(email), [email])
  const [isDatabaseCreator, setIsDatabaseCreator] = useState(false)
  const [isCheckingCreatorAccess, setIsCheckingCreatorAccess] = useState(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn || isDemoCreator) {
      setIsDatabaseCreator(false)
      setIsCheckingCreatorAccess(false)
      return
    }

    let isMounted = true
    setIsCheckingCreatorAccess(true)

    fetch("/api/creator/access", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return { approved: false } satisfies CreatorAccessResponse
        }

        return (await response.json()) as CreatorAccessResponse
      })
      .then((data) => {
        if (isMounted) {
          setIsDatabaseCreator(Boolean(data.approved))
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsDatabaseCreator(false)
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsCheckingCreatorAccess(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [isDemoCreator, isLoaded, isSignedIn, user?.id])

  return {
    isApprovedCreator: Boolean(isLoaded && isSignedIn && (isDemoCreator || isDatabaseCreator)),
    isCheckingCreatorAccess,
  }
}
