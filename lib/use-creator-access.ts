"use client"

import { useEffect, useState } from "react"

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
  const [approvedUserId, setApprovedUserId] = useState<string | null>(null)
  const [isCheckingCreatorAccess, setIsCheckingCreatorAccess] = useState(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) {
      setApprovedUserId(null)
      setIsCheckingCreatorAccess(false)
      return
    }

    let isMounted = true
    const checkingUserId = user.id
    setApprovedUserId(null)
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
          setApprovedUserId(data.approved === true ? checkingUserId : null)
        }
      })
      .catch(() => {
        if (isMounted) {
          setApprovedUserId(null)
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
  }, [isLoaded, isSignedIn, user?.id])

  return {
    isApprovedCreator: Boolean(isLoaded && isSignedIn && user?.id && approvedUserId === user.id),
    isCheckingCreatorAccess,
  }
}
