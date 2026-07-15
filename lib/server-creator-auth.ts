import "server-only"

import { auth, currentUser } from "@clerk/nextjs/server"
import { getPrisma } from "@/lib/prisma"
import { isCreatorEmail } from "@/lib/creator-access"

const approvedCreatorProfileStatuses = ["approved", "verified", "active"]
const approvedCreatorUserTypes = ["creator", "admin"]

export class CreatorAuthorizationError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "CreatorAuthorizationError"
    this.status = status
  }
}

export interface ApprovedCreator {
  userId: string
  databaseUserId: string | null
  ownerUserIds: string[]
  isAdmin: boolean
  isDemoCreator: boolean
}

export async function requireApprovedCreator(): Promise<ApprovedCreator> {
  const { userId } = await auth()
  if (!userId) {
    throw new CreatorAuthorizationError(401, "Unauthorized")
  }

  const prisma = getPrisma()
  const clerkUser = await currentUser()
  const email = clerkUser?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null
  const isDemoCreator = isCreatorEmail(email)

  if (!prisma) {
    if (isDemoCreator) {
      return {
        userId,
        databaseUserId: null,
        ownerUserIds: [userId],
        isAdmin: false,
        isDemoCreator,
      }
    }

    throw new CreatorAuthorizationError(503, "Creator database is not configured.")
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { clerkUserId: userId },
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
      ],
    },
    select: {
      id: true,
      userType: true,
      creatorProfiles: {
        select: {
          verificationStatus: true,
        },
      },
      creatorApplications: {
        where: {
          status: {
            in: approvedCreatorProfileStatuses,
          },
        },
        select: {
          id: true,
        },
        take: 1,
      },
    },
  })

  const userType = user?.userType?.toLowerCase()
  const isAdmin = userType === "admin"
  const hasCreatorType = Boolean(userType && approvedCreatorUserTypes.includes(userType))
  const hasApprovedProfile = Boolean(
    user?.creatorProfiles.some((profile) => {
      const status = profile.verificationStatus?.toLowerCase()
      return Boolean(status && approvedCreatorProfileStatuses.includes(status))
    }),
  )
  const hasApprovedApplication = Boolean(user?.creatorApplications.length)

  if (!isDemoCreator && !hasCreatorType && !hasApprovedProfile && !hasApprovedApplication) {
    throw new CreatorAuthorizationError(403, "Creator access required.")
  }

  return {
    userId,
    databaseUserId: user?.id ?? null,
    ownerUserIds: [...new Set([userId, user?.id].filter((value): value is string => Boolean(value)))],
    isAdmin,
    isDemoCreator,
  }
}
