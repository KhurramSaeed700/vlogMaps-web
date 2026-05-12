import "server-only"

import { PrismaClient } from "@prisma/client"
import { PrismaNeon } from "@prisma/adapter-neon"
import { getDatabaseUrl } from "@/lib/database"

type GlobalWithPrisma = typeof globalThis & {
  travelMapPrisma?: PrismaClient
}

export function getPrisma() {
  const databaseUrl = getDatabaseUrl()
  if (!databaseUrl) {
    return null
  }

  const globalForPrisma = globalThis as GlobalWithPrisma
  if (!globalForPrisma.travelMapPrisma) {
    const adapter = new PrismaNeon({ connectionString: databaseUrl })
    globalForPrisma.travelMapPrisma = new PrismaClient({ adapter })
  }

  return globalForPrisma.travelMapPrisma
}
