import { PrismaClient } from '@prisma/client'

const MUTATIONS = new Set(['update', 'updateMany', 'delete', 'deleteMany', 'upsert'])

function createPrisma() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],

    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
  }).$extends({
    query: {

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
