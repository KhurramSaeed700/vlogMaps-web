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

const approvedCreatorUserIds = new Set<string>()

export function useCreatorAccess({
  isLoaded,
  isSignedIn,
  user,
}: {
  isLoaded: boolean
  isSignedIn?: boolean
  user: CreatorAccessUser | null | undefined
}): CreatorAccessState {
  const initialUserId = isLoaded && isSignedIn ? user?.id ?? null : null
  const [approvedUserId, setApprovedUserId] = useState<string | null>(() =>
    initialUserId && approvedCreatorUserIds.has(initialUserId) ? initialUserId : null,
  )
  const [isCheckingCreatorAccess, setIsCheckingCreatorAccess] = useState(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) {
      setApprovedUserId(null)
      setIsCheckingCreatorAccess(false)
      return
    }

    let isMounted = true
    const checkingUserId = user.id

    if (approvedCreatorUserIds.has(checkingUserId)) {
      setApprovedUserId(checkingUserId)
      setIsCheckingCreatorAccess(false)
      return
    }

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
          if (data.approved === true) {
            approvedCreatorUserIds.add(checkingUserId)
            setApprovedUserId(checkingUserId)
          } else {
            approvedCreatorUserIds.delete(checkingUserId)
            setApprovedUserId(null)
          }
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
