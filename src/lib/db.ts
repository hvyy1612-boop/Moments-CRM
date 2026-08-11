import { PrismaClient } from '@prisma/client'

/**
 * Prisma client singleton.
 *
 * Next.js hot-reload in development would otherwise create a new client on every reload and
 * exhaust database connections, so the instance is cached on globalThis outside production.
 * All database access goes through Prisma's query builder — no raw SQL concatenation (SEC-A03).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
