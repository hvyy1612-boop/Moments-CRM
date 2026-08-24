import { PrismaClient } from '@prisma/client'

/**
 * Prisma client singleton with an application layer guard that makes ActivityLog and SignInLog
 * insert-only (BR-L01, ADR-0003). The database triggers are the real guarantee; this stops a
 * mutation earlier with a clearer error. All access goes through Prisma, never raw SQL string
 * building (SEC-A03).
 */
const MUTATIONS = new Set(['update', 'updateMany', 'delete', 'deleteMany', 'upsert'])

function createPrisma() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  }).$extends({
    query: {
      // Application-layer guard mirroring the database triggers: these tables are insert-only.
      // The DB triggers are the real guarantee; this stops a mutation earlier with a clearer error.
      auditLog: {
        $allOperations({ operation, args, query }) {
          if (MUTATIONS.has(operation)) {
            throw new Error('AuditLog is insert-only')
          }
          return query(args)
        },
      },
      signInLog: {
        $allOperations({ operation, args, query }) {
          if (MUTATIONS.has(operation)) {
            throw new Error('SignInLog is insert-only')
          }
          return query(args)
        },
      },
    },
  })
}

type ExtendedPrisma = ReturnType<typeof createPrisma>

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrisma }

export const prisma: ExtendedPrisma = globalForPrisma.prisma ?? createPrisma()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
