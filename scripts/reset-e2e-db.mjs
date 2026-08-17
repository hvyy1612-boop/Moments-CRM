#!/usr/bin/env node
// Reset the database to an empty state before an e2e run so tests are deterministic and never
// collide with a previous run's rows (e.g. a resource already booked at the same time). TRUNCATE
// does not fire row-level DELETE triggers, so the append-only tables truncate cleanly. The e2e
// suite reseeds immediately after. This only runs during `npm run e2e` / `npm run verify`.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const rows = await prisma.$queryRaw`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
`
const tables = rows.map((r) => `"${r.tablename}"`).join(', ')

if (tables) {
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`)
  console.log(`Reset e2e database: truncated ${rows.length} table(s).`)
}

await prisma.$disconnect()
