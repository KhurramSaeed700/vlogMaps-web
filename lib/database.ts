import "server-only"

import { neon, type NeonQueryFunction } from "@neondatabase/serverless"

let sqlClient: NeonQueryFunction<false, false> | null = null

export function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.NEON_DATABASE_URL ||
    null
  )
}

export function isDatabaseConfigured() {
  return Boolean(getDatabaseUrl())
}

export function getSqlClient() {
  const databaseUrl = getDatabaseUrl()
  if (!databaseUrl) {
    return null
  }

  if (!sqlClient) {
    sqlClient = neon(databaseUrl)
  }

  return sqlClient
}
