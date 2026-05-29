import { auth, currentUser } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getPrisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const creatorProfileStatuses = ["approved", "verified", "active"]
const creatorUserTypes = ["creator", "admin"]

export async function GET() {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ approved: false }, { status: 401 })
  }

  const prisma = getPrisma()
  if (!prisma) {
    return NextResponse.json({ approved: false, configured: false })
  }

  const clerkUser = await currentUser()
  const email = clerkUser?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { clerkUserId: userId },
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
      ],
    },
    select: {
      userType: true,
      creatorProfiles: {
        select: {
          verificationStatus: true,
        },
      },
      creatorApplications: {
        where: {
          status: {
            in: creatorProfileStatuses,
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
  const hasCreatorType = Boolean(userType && creatorUserTypes.includes(userType))
  const hasApprovedProfile = Boolean(
    user?.creatorProfiles.some((profile) => {
      const status = profile.verificationStatus?.toLowerCase()
      return Boolean(status && creatorProfileStatuses.includes(status))
    }),
  )
  const hasApprovedApplication = Boolean(user?.creatorApplications.length)

  return NextResponse.json({
    approved: hasCreatorType || hasApprovedProfile || hasApprovedApplication,
    configured: true,
  })
}
